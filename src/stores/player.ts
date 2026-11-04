import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { fetchPeaks, type Peaks } from "@/features/waveform/peaks";
import { type AppError, commands, type PlaybackStatus, type TrackInfo } from "@/lib/bindings";
import { clamp } from "@/lib/time";
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
  open: (path: string) => Promise<void>;
  reportError: (path: string, error: AppError) => void;
  dismissError: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  applyStatus: (status: PlaybackStatus) => void;
}

/** Playhead position in seconds, interpolated between engine updates. */
export function currentPosition(state: PlayerState = usePlayerStore.getState()): number {
  const duration = state.track?.duration ?? 0;
  const elapsed = state.playing ? (performance.now() - state.anchorTime) / 1000 : 0;
  return clamp(state.anchorPosition + elapsed, 0, duration);
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
      set({ track, peaks, load: { kind: "idle" } });
      anchor(0, false);
      useViewStore.getState().reset(track.duration);
    },

    reportError: (path, error) => set({ load: { kind: "error", path, error } }),
    dismissError: () => set({ load: { kind: "idle" } }),

    togglePlay: () => {
      const { track, playing } = get();
      if (!track) return;
      const position = currentPosition();
      // Playing again from the very end starts over, like the engine does
      const from = !playing && position >= track.duration - 0.01 ? 0 : position;
      anchor(from, !playing);
      if (!playing) useViewStore.getState().setFollow(true);
      void (playing ? commands.pause() : commands.play()).then((r) => {
        if (r.status === "error") fail(r.error);
      });
    },

    seek: (seconds) => {
      const { track } = get();
      if (!track) return;
      const position = clamp(seconds, 0, track.duration);
      anchor(position);
      useViewStore.getState().setFollow(true);
      void commands.seek(position).then((r) => {
        if (r.status === "error") fail(r.error);
      });
    },

    seekBy: (delta) => get().seek(currentPosition() + delta),

    applyStatus: (status) => {
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
  };
});
