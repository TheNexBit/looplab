import { create } from "zustand";
import { fitSteps, type RhythmStep } from "@/features/metronome/rhythmPattern";
import type { ExercisesRequest } from "@/lib/bindings";
import { readStored, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";

/** Limits of the exercise settings, for the − / + keys and for stored values. */
export const EXERCISE_LIMITS = {
  trainerFrom: { min: 20, max: 400, step: 1 },
  trainerTo: { min: 20, max: 400, step: 1 },
  trainerStep: { min: 1, max: 20, step: 1 },
  trainerEvery: { min: 1, max: 16, step: 1 },
  gapLead: { min: 0, max: 8, step: 1 },
  gapPlay: { min: 1, max: 16, step: 1 },
  gapSilent: { min: 1, max: 16, step: 1 },
  muteChance: { min: 0.05, max: 0.9, step: 0.05 },
  rhythmBars: { min: 1, max: 2, step: 1 },
  rhythmTestEvery: { min: 0, max: 8, step: 1 },
} as const;
type NumberKey = keyof typeof EXERCISE_LIMITS;

/** Most cells a rhythm can have (the engine's `MAX_STEPS`). */
export const MAX_RHYTHM_CELLS = 128;
/** Subdivisions a rhythm is written in: eighths, triplets, sixteenths of the pulse. */
export const RHYTHM_SUBDIVISIONS = [2, 3, 4] as const;

export interface ExerciseSetup {
  trainer: boolean;
  trainerFrom: number;
  trainerTo: number;
  trainerStep: number;
  trainerEvery: number;
  gap: boolean;
  gapLead: number;
  gapPlay: number;
  gapSilent: number;
  gapGrow: boolean;
  mute: boolean;
  muteChance: number;
  rhythm: boolean;
  rhythmBars: number;
  rhythmSteps: RhythmStep[];
  rhythmTestEvery: number;
  rhythmGuide: boolean;
}

const DEFAULTS: ExerciseSetup = {
  trainer: false,
  trainerFrom: 80,
  trainerTo: 120,
  trainerStep: 4,
  trainerEvery: 4,
  gap: false,
  gapLead: 2,
  gapPlay: 4,
  gapSilent: 2,
  gapGrow: false,
  mute: false,
  muteChance: 0.3,
  rhythm: false,
  rhythmBars: 1,
  rhythmSteps: [],
  rhythmTestEvery: 0,
  rhythmGuide: true,
};
const KEY = "looplab.metronomeExercises";

const isStep = (value: unknown): value is RhythmStep =>
  value === "rest" || value === "note" || value === "accent";

export function sanitizeExercises(value: Partial<ExerciseSetup>): ExerciseSetup {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof ExerciseSetup)[]) {
    const v = value[key];
    if (typeof v === "boolean" && typeof DEFAULTS[key] === "boolean") {
      (result as Record<string, unknown>)[key] = v;
    } else if (typeof v === "number" && Number.isFinite(v) && key in EXERCISE_LIMITS) {
      const { min, max } = EXERCISE_LIMITS[key as NumberKey];
      (result as Record<string, unknown>)[key] = clamp(v, min, max);
    }
  }
  result.rhythmSteps = Array.isArray(value.rhythmSteps)
    ? value.rhythmSteps.filter(isStep).slice(0, MAX_RHYTHM_CELLS)
    : [];
  return result;
}

function load(): ExerciseSetup {
  const stored = readStored(KEY);
  return stored && typeof stored === "object"
    ? sanitizeExercises(stored as Partial<ExerciseSetup>)
    : DEFAULTS;
}

interface ExercisesState extends ExerciseSetup {
  update: (patch: Partial<ExerciseSetup>) => void;
  /** Rest → note → accent → rest, like a tap on a cell in MetroFlow */
  cycleStep: (index: number, cells: number) => void;
}

/** The metronome's exercises (kept on this PC); `metronomeEngine.ts` sends them to the engine. */
export const useExercisesStore = create<ExercisesState>((set, get) => ({
  ...load(),
  update: (patch) => {
    set(sanitizeExercises({ ...get(), ...patch }));
    const { update: _u, cycleStep: _c, ...setup } = get();
    writeStored(KEY, setup);
  },
  cycleStep: (index, cells) => {
    const steps = fitSteps(get().rhythmSteps, cells);
    const order: RhythmStep[] = ["rest", "note", "accent"];
    const step = steps[index];
    if (step === undefined) return;
    steps[index] = order[(order.indexOf(step) + 1) % order.length] ?? "rest";
    get().update({ rhythmSteps: steps });
  },
}));

/** Cells of a rhythm over the current bar: pulses × clicks per pulse × bars. */
export const rhythmCells = (beats: number, subdivision: number, bars: number) =>
  beats * subdivision * bars;

/** Whether a rhythm can be written over this bar. */
export const rhythmFits = (beats: number, subdivision: number, bars: number) =>
  (RHYTHM_SUBDIVISIONS as readonly number[]).includes(subdivision) &&
  rhythmCells(beats, subdivision, bars) <= MAX_RHYTHM_CELLS;

/** Tempo of a bar under the speed trainer (MetroFlow's rule, as the engine applies it). */
export function trainerBpmAt(setup: ExerciseSetup, bar: number): number {
  const steps = Math.floor(Math.max(0, bar) / Math.max(1, setup.trainerEvery));
  const moved = steps * setup.trainerStep;
  return setup.trainerTo >= setup.trainerFrom
    ? Math.min(setup.trainerFrom + moved, setup.trainerTo)
    : Math.max(setup.trainerFrom - moved, setup.trainerTo);
}

/** Whether a bar is silent under the gap trainer (as the engine decides it). */
export function gapSilentAt(setup: ExerciseSetup, bar: number): boolean {
  if (bar < setup.gapLead) return false;
  let left = bar - setup.gapLead;
  let cycle = 0;
  for (;;) {
    const silent = setup.gapGrow ? Math.min(32, setup.gapSilent + cycle) : setup.gapSilent;
    const length = setup.gapPlay + silent;
    if (left < length) return left >= setup.gapPlay;
    left -= length;
    cycle += 1;
    if (!setup.gapGrow) {
      left %= length;
    }
  }
}

/** What the engine gets: only the exercises that are on, the rhythm fitted to the bar. */
export function exercisesRequest(
  setup: ExerciseSetup,
  beats: number,
  subdivision: number,
): ExercisesRequest {
  const cells = rhythmCells(beats, subdivision, setup.rhythmBars);
  return {
    trainer: setup.trainer
      ? {
          fromBpm: setup.trainerFrom,
          toBpm: setup.trainerTo,
          stepBpm: setup.trainerStep,
          everyBars: setup.trainerEvery,
        }
      : null,
    gap: setup.gap
      ? {
          leadBars: setup.gapLead,
          playBars: setup.gapPlay,
          silentBars: setup.gapSilent,
          grow: setup.gapGrow,
        }
      : null,
    muteChance: setup.mute ? setup.muteChance : 0,
    rhythm:
      setup.rhythm && rhythmFits(beats, subdivision, setup.rhythmBars)
        ? {
            steps: fitSteps(setup.rhythmSteps, cells),
            bars: setup.rhythmBars,
            testEvery: setup.rhythmTestEvery,
            guide: setup.rhythmGuide,
          }
        : null,
  };
}
