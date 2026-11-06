import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { CENTS, SEMITONES, SPEED } from "@/features/player/limits";
import { countInSeconds } from "@/features/practice/tempo";
import { fetchPeaks, type Peaks } from "@/features/waveform/peaks";
import { type AppError, commands, type PlaybackStatus, type TrackInfo } from "@/lib/bindings";
import { clamp } from "@/lib/time";
import { advanceInLoop, restartAt, useLoopStore } from "./loop";
import { usePracticeStore } from "./practice";
import { useSettingsStore } from "./settings";
import { useViewStore } from "./view";

/** After a local action, ignore engine updates that may predate it. */
const HOLD_MS = 150;
/** Bigger corrections snap; smaller ones are blended in so the playhead never jitters. */
const SNAP_SECONDS = 0.25;
const BLEND = 0.2;

/** The open track; `duration` is always a number here (JSON turns NaN into null). */
export type Track = Omit<TrackInfo, "duration"> & { duration: number };

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; path: string; progress: number }
  | { kind: "error"; path: string; error: AppError };

interface PlayerState {
  load: LoadState;
  track: Track | null;
  peaks: Peaks | null;
  playing: boolean;
  /** Playhead = anchorPosition + time elapsed since anchorTime while playing */
  anchorPosition: number;
  anchorTime: number;
  holdUntil: number;
  /** 1 = original speed */
  speed: number;
  semitones: number;
  cents: number;
  /**
   * Start point, like Reaper's edit cursor: the last place clicked or jumped to, or where
   * playback last started. With "return to start" on, stopping goes back here.
   */
  cue: number;
  /** Loop repetitions the engine has started (only grows): the speed trainer counts them */
  loops: number;
  open: (path: string) => Promise<void>;
  reportError: (path: string, error: AppError) => void;
  dismissError: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  applyStatus: (status: PlaybackStatus) => void;
  setSpeed: (speed: number) => void;
  setPitch: (semitones: number, cents: number) => void;
}

/** Playhead position in seconds, interpolated between engine updates (speed and loop included). */
export function currentPosition(state: PlayerState = usePlayerStore.getState()): number {
  const duration = state.track?.duration ?? 0;
  // The anchor lies in the future while a count-in plays before playback
  const elapsed = state.playing
    ? Math.max(0, ((performance.now() - state.anchorTime) / 1000) * state.speed)
    : 0;
  const loop = useLoopStore.getState();
  // The count-in before each repetition is heard as part of the gap
  const options = { ...loop, gap: loop.gap + countInNow() };
  return clamp(advanceInLoop(state.anchorPosition, elapsed, loop.region(), options), 0, duration);
}

/** Seconds of count-in, at the track's original speed, with the current settings. */
export function countInNow(): number {
  return countInSeconds(useSettingsStore.getState().countIn, usePracticeStore.getState().bpm);
}

/** Length of the open track in seconds, 0 when none is open. */
export const trackDuration = () => usePlayerStore.getState().track?.duration ?? 0;

/** Pushes speed and pitch to the engine (also after a track change, in case it was restarted). */
function sendTempoAndPitch({ speed, semitones, cents }: PlayerState) {
  void commands.setSpeed(speed);
  void commands.setPitch(semitones + cents / 100);
}

let loadToken = 0;

export const usePlayerStore = create<PlayerState>((set, get) => {
  const anchor = (position: number, playing = get().playing) => {
    const now = performance.now();
    set({ playing, anchorPosition: position, anchorTime: now, holdUntil: now + HOLD_MS });
  };

  const fail = (error: AppError) => {
    const path = get().track?.path ?? "";
    set({ load: { kind: "error", path, error } });
  };

  return {
    load: { kind: "idle" },
    track: null,
    peaks: null,
    playing: false,
    anchorPosition: 0,
    anchorTime: 0,
    holdUntil: 0,
    speed: SPEED.default,
    semitones: SEMITONES.default,
    cents: CENTS.default,
    cue: 0,
    loops: 0,

    open: async (path) => {
      const token = ++loadToken;
      set({ load: { kind: "loading", path, progress: 0 } });
      const progress = new Channel<number | null>();
      progress.onmessage = (value) => {
        if (token === loadToken && value !== null) {
          set({ load: { kind: "loading", path, progress: value } });
        }
      };

      const result = await commands.openFile(path, progress);
      if (token !== loadToken) return;
      if (result.status === "error") {
        set({ load: { kind: "error", path, error: result.error } });
        return;
      }
      const peaks = await fetchPeaks();
      if (token !== loadToken) return;
      const track: Track = { ...result.data, duration: result.data.duration ?? 0 };
      set({ track, peaks, load: { kind: "idle" }, cue: 0 });
      anchor(0, false);
      // The engine forgets the loop on a new track; speed and pitch carry over
      useLoopStore.getState().clear();
      sendTempoAndPitch(get());
      useViewStore.getState().reset(track.duration);
    },

    reportError: (path, error) => set({ load: { kind: "error", path, error } }),
    dismissError: () => set({ load: { kind: "idle" } }),

    togglePlay: () => {
      const { track, playing, cue } = get();
      if (!track) return;
      const report = (r: { status: string; error?: AppError }) => {
        if (r.status === "error" && r.error) fail(r.error);
      };

      if (playing) {
        // Like Reaper: stopping goes back to the start point, ready to play the same passage again
        if (useSettingsStore.getState().returnToStart) {
          anchor(cue, false);
          void commands.pause().then(report);
          void commands.seek(cue).then(report);
        } else {
          anchor(currentPosition(), false);
          void commands.pause().then(report);
        }
        return;
      }

      // Play starts where the playhead is; only at the very end of the track does it start
      // over (from the loop, if one is active), like the engine does
      const loop = useLoopStore.getState();
      const region = loop.enabled ? loop.region() : null;
      const position = currentPosition();
      const from =
        position >= track.duration - 0.01
          ? region
            ? restartAt(region, loop.leadIn)
            : 0
          : position;
      anchor(from, true);
      set({ cue: from });
      // The engine counts in first: the playhead waits, and engine reports are ignored meanwhile
      const delayMs = (countInNow() / get().speed) * 1000;
      if (delayMs > 0) {
        const start = performance.now() + delayMs;
        set({ anchorTime: start, holdUntil: start + HOLD_MS });
      }
      useViewStore.getState().resumeFollow();
      void commands.play().then(report);
    },

    seek: (seconds) => {
      const { track } = get();
      if (!track) return;
      const position = clamp(seconds, 0, track.duration);
      anchor(position);
      set({ cue: position });
      useViewStore.getState().resumeFollow();
      void commands.seek(position).then((r) => {
        if (r.status === "error") fail(r.error);
      });
    },

    seekBy: (delta) => get().seek(currentPosition() + delta),

    applyStatus: (status) => {
      if (status.loops !== get().loops) set({ loops: status.loops });
      const state = get();
      if (!state.track || performance.now() < state.holdUntil) return;
      if (status.deviceLost) {
        if (state.load.kind !== "error") fail({ kind: "audioDevice", detail: "device lost" });
        set({ playing: false });
        return;
      }
      const reported = status.position ?? 0;
      if (!status.playing) {
        if (state.playing || state.anchorPosition !== reported) {
          set({ playing: false, anchorPosition: reported, anchorTime: performance.now() });
        }
        return;
      }
      const predicted = currentPosition(state);
      const error = reported - predicted;
      const position = Math.abs(error) > SNAP_SECONDS ? reported : predicted + error * BLEND;
      set({ playing: true, anchorPosition: position, anchorTime: performance.now() });
    },

    setSpeed: (value) => {
      const speed = Math.round(clamp(value, SPEED.min, SPEED.max) * 100) / 100;
      if (speed === get().speed) return;
      // Re-anchor first, so the time already played keeps its old speed
      anchor(currentPosition());
      set({ speed });
      sendTempoAndPitch(get());
    },

    setPitch: (semitones, cents) => {
      set({
        semitones: Math.round(clamp(semitones, SEMITONES.min, SEMITONES.max)),
        cents: Math.round(clamp(cents, CENTS.min, CENTS.max)),
      });
      sendTempoAndPitch(get());
    },
  };
});
