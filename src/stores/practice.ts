import { create } from "zustand";
import { BPM } from "@/features/practice/tempo";
import { clamp } from "@/lib/time";

interface PracticeState {
  /** Tempo of the open track at its original speed; null until set. Saved in the project. */
  bpm: number | null;
  /** Loop repetitions played since the loop or the speed trainer last changed */
  repetitions: number;
  /** Times (performance.now) of the recent taps of "tap tempo" */
  taps: number[];
  setBpm: (bpm: number | null) => void;
  addTap: (time: number) => void;
  countRepetition: () => void;
  resetRepetitions: () => void;
}

const MAX_TAPS = 8;

/** Practice state of the open track: tempo and the repetition counter. */
export const usePracticeStore = create<PracticeState>((set, get) => ({
  bpm: null,
  repetitions: 0,
  taps: [],
  setBpm: (bpm) =>
    set({ bpm: bpm === null ? null : Math.round(clamp(bpm, BPM.min, BPM.max) * 10) / 10 }),
  addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
  countRepetition: () => set({ repetitions: get().repetitions + 1 }),
  resetRepetitions: () => set({ repetitions: 0 }),
}));
