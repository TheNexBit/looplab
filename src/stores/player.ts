import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { CENTS, SEMITONES, SPEED } from "@/features/player/limits";
import { countInSeconds } from "@/features/practice/tempo";
import { fetchPeaks, type Peaks } from "@/features/waveform/peaks";
import {
  type AppError,
  commands,
  type PlaybackStatus,
  type TrackInfo,
  type TrackLoading,
} from "@/lib/bindings";
import { clamp } from "@/lib/time";
import { advanceInLoop, loopWait, restartAt, useLoopStore } from "./loop";
import { clickTempoMap } from "./practice";
import { useSettingsStore } from "./settings";
import { useViewStore } from "./view";

/** After a local action, ignore engine updates that may predate it. */
const HOLD_MS = 150;
/** Bigger corrections snap; smaller ones are blended in so the playhead never jitters. */
const SNAP_SECONDS = 0.25;
const BLEND = 0.2;

/** The open track; `duration` and `ready` are always numbers here (JSON turns NaN into null). */
export type Track = Omit<TrackInfo, "duration" | "ready"> & { duration: number; ready: number };

/**
 * While a track loads, how often the waveform is fetched again: every second for a song,
 * every five for a three-hour lesson (its waveform data is ~65 MB).
 */
const peaksRefreshMs = (duration: number) => clamp((duration / 3600) * 1700, 1000, 5000);

type LoadState =
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
  /** Progress of the background loading of the open track */
  applyLoading: (event: TrackLoading) => void;
  setSpeed: (speed: number) => void;
  setPitch: (semitones: number, cents: number) => void;
}

/**
 * Where the playhead is, interpolated between engine updates (speed and loop included),
 * and how long it still has to wait (track-time seconds) for a count-in or a loop gap.
 */
function predict(state: PlayerState): { position: number; wait: number } {
  const duration = state.track?.duration ?? 0;
  const played = state.playing ? ((performance.now() - state.anchorTime) / 1000) * state.speed : 0;
  // The anchor lies in the future while a count-in plays before playback
  const before = Math.max(0, -played);
  const elapsed = Math.max(0, played);
  const loop = useLoopStore.getState();
  const region = loop.region();
  // The count-in before each repetition is heard as part of the gap (in the meter where the
  // loop restarts)
  const options = {
    ...loop,
    gap: loop.gap + countInNow(region ? restartAt(region, loop.leadIn) : 0),
  };
  return {
    position: clamp(advanceInLoop(state.anchorPosition, elapsed, region, options), 0, duration),
    wait: before > 0 ? before : loopWait(state.anchorPosition, elapsed, region, options),
  };
}

/** Playhead position in seconds, interpolated between engine updates (speed and loop included). */
export function currentPosition(state: PlayerState = usePlayerStore.getState()): number {
  return predict(state).position;
}

/**
 * What the video follows: the playhead, and whether the music is actually moving. During a
 * count-in or the gap between repetitions playback is on but the music waits: the picture
 * must wait too, for `wait` more (real) seconds.
 */
export function playbackClock(state: PlayerState = usePlayerStore.getState()) {
  const { position, wait } = predict(state);
  return {
    position,
    playing: state.playing && wait === 0,
    speed: state.speed,
    wait: state.playing ? wait / state.speed : 0,
  };
}

/**
 * Seconds of count-in before `from`, at the track's original speed, with the current settings:
 * in the tempo and meter in force where playback starts.
 */
function countInNow(from = 0): number {
  const { countIn, countInBars } = useSettingsStore.getState();
  return countInSeconds(countIn ? countInBars : 0, clickTempoMap(), from);
}

let playsOnFromHere: () => boolean = () => false;

/**
 * Set mode registers itself here: while it is on, Play resumes where the music paused instead
 * of going back to the start point ("return to start" is for practising, not for a set).
 */
export function setPlaysOnFromHere(check: () => boolean) {
  playsOnFromHere = check;
}

/** Length of the open track in seconds, 0 when none is open. */
export const trackDuration = () => usePlayerStore.getState().track?.duration ?? 0;

/** Pushes speed and pitch to the engine (also after a track change, in case it was restarted). */
function sendTempoAndPitch({ speed, semitones, cents }: PlayerState) {
  void commands.setSpeed(speed);
  void commands.setPitch(semitones + cents / 100);
}

let loadToken = 0;
let peaksFetchedAt = 0;
let peaksInFlight = false;

export const usePlayerStore = create<PlayerState>((set, get) => {
  /**
   * Restarts the prediction at `position`. `wait` (track-time seconds) delays it: the
   * playhead stays there that long, as during a count-in or the gap between repetitions.
   */
  const anchor = (position: number, playing = get().playing, wait = 0) => {
    const now = performance.now();
    const start = now + (wait / get().speed) * 1000;
    set({ playing, anchorPosition: position, anchorTime: start, holdUntil: now + HOLD_MS });
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
      const track: Track = {
        ...result.data,
        duration: result.data.duration ?? 0,
        ready: result.data.ready ?? 0,
      };
      peaksFetchedAt = performance.now();
      set({ track, peaks, load: { kind: "idle" }, cue: 0 });
      anchor(0, false);
      // The engine forgets the loop on a new track; speed and pitch carry over
      useLoopStore.getState().clear();
      sendTempoAndPitch(get());
      useViewStore
        .getState()
        .reset(track.duration, useSettingsStore.getState().openView === "whole");
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
        // The playhead stops exactly where the music is, so the user sees where they got to
        anchor(currentPosition(), false);
        void commands.pause().then(report);
        return;
      }

      // Play starts where the playhead is or, with "return to start point", from the start point
      // (the dashed line: where play last started or the user last clicked), like Reaper; only
      // at the very end of the track does it start over (from the loop, if one is active)
      const loop = useLoopStore.getState();
      const region = loop.enabled ? loop.region() : null;
      const here = currentPosition();
      const position = useSettingsStore.getState().returnToStart && !playsOnFromHere() ? cue : here;
      const from =
        position >= track.duration - 0.01
          ? region
            ? restartAt(region, loop.leadIn)
            : 0
          : position;
      // The engine counts in first: the playhead waits that long
      anchor(from, true, countInNow(from));
      set({ cue: from });
      useViewStore.getState().resumeFollow();
      // The engine is moved to the start point first when the playhead was left elsewhere
      if (Math.abs(from - here) > 1e-3) {
        void commands.seek(from).then((r) => {
          report(r);
          if (get().playing) void commands.play().then(report);
        });
      } else {
        void commands.play().then(report);
      }
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

    applyLoading: (event) => {
      const { track } = get();
      if (!track || track.path !== event.path || track.complete) return;
      const ready = event.ready ?? 0;
      if (!event.done) {
        set({ track: { ...track, ready } });
        // The waveform fills in as the audio arrives, without flooding the IPC channel
        const now = performance.now();
        if (!peaksInFlight && now - peaksFetchedAt >= peaksRefreshMs(track.duration)) {
          peaksInFlight = true;
          peaksFetchedAt = now;
          const token = loadToken;
          void fetchPeaks().then((peaks) => {
            peaksInFlight = false;
            if (token === loadToken && !get().track?.complete) set({ peaks });
          });
        }
        return;
      }
      const duration = event.duration ?? track.duration;
      const token = loadToken;
      set({ track: { ...track, ready: duration, duration, complete: true } });
      useViewStore.getState().setDuration(duration);
      void fetchPeaks().then((peaks) => {
        if (token === loadToken) set({ peaks });
      });
      // Stopped early (damaged file): what was loaded stays playable, the banner says why
      if (event.error && event.error !== "cancelled") {
        set({
          load: { kind: "error", path: track.path, error: { kind: event.error, detail: "" } },
        });
      }
    },

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
      const { position: predicted, wait } = predict(state);
      const error = reported - predicted;
      // Waiting for a count-in or a gap: the engine reports the same still point. Keep
      // the wait instead of re-anchoring, which would let the playhead run ahead and jump back
      if (wait > 0 && Math.abs(error) <= SNAP_SECONDS) {
        if (!state.playing) set({ playing: true });
        return;
      }
      const position = Math.abs(error) > SNAP_SECONDS ? reported : predicted + error * BLEND;
      set({ playing: true, anchorPosition: position, anchorTime: performance.now() });
    },

    setSpeed: (value) => {
      const speed = Math.round(clamp(value, SPEED.min, SPEED.max) * 100) / 100;
      if (speed === get().speed) return;
      // Re-anchor first, so the time already played keeps its old speed; a wait under way
      // (count-in, gap) is kept in track time and then lasts as the new speed says
      const { position, wait } = predict(get());
      set({ speed });
      anchor(position, get().playing, wait);
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
