import { create } from "zustand";
import { clamp } from "@/lib/time";

/** One step of the practice playlist: a saved loop, played `repeats` times. */
export interface PlaylistStepData {
  loopId: string;
  repeats: number;
}

/** Times a step can be played. */
export const REPEATS = { min: 1, max: 32, step: 1, default: 4 } as const;

interface PlaylistState {
  steps: PlaylistStepData[];
  /** Index of the step being played, `null` while the playlist is not running */
  current: number | null;
  /** Times the current step has been played so far (1 during its first pass) */
  pass: number;
  add: (loopId: string) => void;
  remove: (index: number) => void;
  setRepeats: (index: number, repeats: number) => void;
  /** Moves a step one place up (`-1`) or down (`1`) */
  move: (index: number, by: -1 | 1) => void;
  /** Puts back the playlist of a project (stopped) */
  replace: (steps: PlaylistStepData[]) => void;
  /** Steps whose loop no longer exists are dropped */
  keepLoops: (ids: readonly string[]) => void;
  setProgress: (current: number | null, pass: number) => void;
}

const clampRepeats = (repeats: number) => Math.round(clamp(repeats, REPEATS.min, REPEATS.max));

/**
 * Practice playlist of the open track: saved loops in order, each played a number of
 * times, then the next one (`features/practice/playlist.ts` runs it). Saved in the project.
 */
export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  steps: [],
  current: null,
  pass: 0,
  add: (loopId) => set({ steps: [...get().steps, { loopId, repeats: REPEATS.default }] }),
  remove: (index) => set({ steps: get().steps.filter((_, i) => i !== index), current: null }),
  setRepeats: (index, repeats) =>
    set({
      steps: get().steps.map((step, i) =>
        i === index ? { ...step, repeats: clampRepeats(repeats) } : step,
      ),
    }),
  move: (index, by) => {
    const steps = [...get().steps];
    const to = index + by;
    const step = steps[index];
    if (!step || to < 0 || to >= steps.length) return;
    steps.splice(index, 1);
    steps.splice(to, 0, step);
    set({ steps, current: null });
  },
  replace: (steps) =>
    set({
      steps: steps.map((step) => ({ ...step, repeats: clampRepeats(step.repeats) })),
      current: null,
      pass: 0,
    }),
  keepLoops: (ids) => {
    const steps = get().steps.filter((step) => ids.includes(step.loopId));
    if (steps.length !== get().steps.length) set({ steps, current: null });
  },
  setProgress: (current, pass) => set({ current, pass }),
}));
