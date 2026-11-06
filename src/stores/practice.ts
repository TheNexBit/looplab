import { create } from "zustand";
import { BEAT_UNITS, BEATS_PER_BAR, type BeatGrid, BPM } from "@/features/practice/tempo";
import { clamp } from "@/lib/time";

interface PracticeState {
  /** Tempo of the open track at its original speed; null until set. Saved in the project. */
  bpm: number | null;
  /** Seconds: a moment on the first beat of a bar, where the grid lines up. Saved in the project. */
  beatOffset: number | null;
  /** Time signature, e.g. 7/8: beats in a bar and note value of a beat. Saved in the project. */
  beatsPerBar: number;
  beatUnit: number;
  /** Loop repetitions played since the loop or the speed trainer last changed */
  repetitions: number;
  /** Times (performance.now) of the recent taps of "tap tempo" */
  taps: number[];
  setBpm: (bpm: number | null) => void;
  setBeatOffset: (seconds: number | null) => void;
  setTimeSignature: (beatsPerBar: number, beatUnit: number) => void;
  addTap: (time: number) => void;
  countRepetition: () => void;
  resetRepetitions: () => void;
}

const MAX_TAPS = 8;

/** The beat grid of the open track, or null while its tempo is unknown. */
export function currentGrid(): BeatGrid | null {
  const { bpm, beatOffset, beatsPerBar, beatUnit } = usePracticeStore.getState();
  return bpm ? { bpm, offset: beatOffset ?? 0, beatsPerBar, beatUnit } : null;
}

/** Practice state of the open track: tempo and the repetition counter. */
export const usePracticeStore = create<PracticeState>((set, get) => ({
  bpm: null,
  beatOffset: null,
  beatsPerBar: BEATS_PER_BAR.default,
  beatUnit: 4,
  repetitions: 0,
  taps: [],
  setBpm: (bpm) =>
    set({ bpm: bpm === null ? null : Math.round(clamp(bpm, BPM.min, BPM.max) * 10) / 10 }),
  setBeatOffset: (beatOffset) => set({ beatOffset }),
  setTimeSignature: (beatsPerBar, beatUnit) =>
    set({
      beatsPerBar: Math.round(clamp(beatsPerBar, BEATS_PER_BAR.min, BEATS_PER_BAR.max)),
      beatUnit: (BEAT_UNITS as readonly number[]).includes(beatUnit) ? beatUnit : 4,
    }),
  addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
  countRepetition: () => set({ repetitions: get().repetitions + 1 }),
  resetRepetitions: () => set({ repetitions: 0 }),
}));
