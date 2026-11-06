import { create } from "zustand";
import { type BeatGrid, BPM } from "@/features/practice/tempo";
import { clamp } from "@/lib/time";

interface PracticeState {
  /** Tempo of the open track at its original speed; null until set. Saved in the project. */
  bpm: number | null;
  /** Seconds: a moment on the first beat of a bar, where the grid lines up. Saved in the project. */
  beatOffset: number | null;
  /** Loop repetitions played since the loop or the speed trainer last changed */
  repetitions: number;
  /** Times (performance.now) of the recent taps of "tap tempo" */
  taps: number[];
  setBpm: (bpm: number | null) => void;
  setBeatOffset: (seconds: number | null) => void;
  addTap: (time: number) => void;
  countRepetition: () => void;
  resetRepetitions: () => void;
}

const MAX_TAPS = 8;

/** The beat grid of the open track, or null while its tempo is unknown. */
export function currentGrid(): BeatGrid | null {
  const { bpm, beatOffset } = usePracticeStore.getState();
  return bpm ? { bpm, offset: beatOffset ?? 0 } : null;
}

/** Practice state of the open track: tempo and the repetition counter. */
export const usePracticeStore = create<PracticeState>((set, get) => ({
  bpm: null,
  beatOffset: null,
  repetitions: 0,
  taps: [],
  setBpm: (bpm) =>
    set({ bpm: bpm === null ? null : Math.round(clamp(bpm, BPM.min, BPM.max) * 10) / 10 }),
  setBeatOffset: (beatOffset) => set({ beatOffset }),
  addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
  countRepetition: () => set({ repetitions: get().repetitions + 1 }),
  resetRepetitions: () => set({ repetitions: 0 }),
}));
