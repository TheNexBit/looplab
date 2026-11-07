import { SUBDIVISIONS, ticksPerBar } from "./beatGrid";
import type { SubdivisionId, TimeSignature } from "./types";

/**
 * What one cell of the grid does. `note` is a strum, `accent` a stronger one,
 * `rest` a silence you play through. Direction (down/up) is *derived* from where
 * the cell sits, never stored — one less thing to keep in step with the grid.
 */
export type RhythmStep = "rest" | "note" | "accent";

const ORDER: RhythmStep[] = ["rest", "note", "accent"];

/** The state after this one, cycling. What a tap on a cell does. */
export function nextRhythmStep(step: RhythmStep): RhythmStep {
  return ORDER[(ORDER.indexOf(step) + 1) % ORDER.length] ?? "rest";
}

/**
 * Grid resolutions worth training rests on. Quarters are left out: a bar of
 * quarter-note rests is just a slower click, not a rhythm to read.
 */
export const RHYTHM_SUBDIVISIONS: SubdivisionId[] = ["eighth", "sixteenth", "triplet"];

export const BARS_MIN = 1;
export const BARS_MAX = 2;
/** Audible repetitions between muted ones. 0 turns the self-test off. */
export const TEST_MAX = 8;

/** Cells in one bar at this resolution — one per subdivision tick. */
export function stepsPerBar(sig: TimeSignature, subdivision: SubdivisionId): number {
  return ticksPerBar(sig, subdivision);
}

/** Cells across the whole pattern. */
export function totalSteps(sig: TimeSignature, subdivision: SubdivisionId, bars: number): number {
  return stepsPerBar(sig, subdivision) * bars;
}

export type StrumDirection = "down" | "up";

/**
 * The pick direction a cell is strummed with: down on the pulse, up on the off,
 * alternating within each beat and resetting at every beat. This is alternate
 * picking as a guitarist counts it — down on 1, up on the &, down on the next e,
 * and so on — so a triplet reads down-up-down and the next beat starts down again.
 */
export function strumDirection(tickInBar: number, subdivision: SubdivisionId): StrumDirection {
  const per = SUBDIVISIONS[subdivision].ticksPerBeat;
  return (tickInBar % per) % 2 === 0 ? "down" : "up";
}

export interface RhythmLoopPos {
  /** 0-based bar within the pattern, 0 … bars-1. */
  barOfPattern: number;
  /** 0-based repetition of the whole pattern since the run began. */
  loopIndex: number;
  /** True when this repetition is the muted "play it from memory" one. */
  muted: boolean;
}

/**
 * Where a bar falls in the looping pattern, and whether this repetition is the
 * silenced test. Pure, and the only place the arithmetic lives: the gate that
 * silences and the cursor that the panel draws both read it, so what is heard
 * and what is shown can never drift apart.
 *
 * `testEvery` audible repetitions play, then one is muted; `0` turns it off.
 */
export function loopPositionAt(
  barsSinceStart: number,
  bars: number,
  testEvery: number,
): RhythmLoopPos {
  const loopIndex = Math.floor(barsSinceStart / bars);
  const barOfPattern = ((barsSinceStart % bars) + bars) % bars;
  const muted = testEvery > 0 && loopIndex % (testEvery + 1) === testEvery;
  return { barOfPattern, loopIndex, muted };
}

/** Grows or shrinks a pattern to `total` cells, padding the new ones with rests. */
export function fitSteps(steps: RhythmStep[], total: number): RhythmStep[] {
  const next: RhythmStep[] = [];
  for (let index = 0; index < total; index += 1) next.push(steps[index] ?? "rest");
  return next;
}

/** A clean slate: accent every bar's downbeat, rest everything else. */
export function freshSteps(perBar: number, total: number): RhythmStep[] {
  return Array.from({ length: total }, (_, index) => (index % perBar === 0 ? "accent" : "rest"));
}

/**
 * The default the grid opens on: the ubiquitous down–down-up–up-down-up strum,
 * accent on one. Only meaningful at 4/4 eighths (8 cells); any other length
 * falls back to a bare accented downbeat.
 */
export function defaultSteps(perBar: number, total: number): RhythmStep[] {
  const groove: RhythmStep[] = ["accent", "rest", "note", "note", "rest", "note", "note", "note"];
  if (total !== groove.length) return freshSteps(perBar, total);
  return [...groove];
}

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

interface DifficultyProfile {
  /** p(note) on a beat pulse. */
  onBeat: number;
  /** p(note) on the strong off — the '&' of a group of four. */
  strong: number;
  /** p(note) on the weak offs — the e and the a. */
  weak: number;
  /** p(the downbeat is a rest — an anticipation the player feels but does not strike). */
  syncopateDownbeat: number;
  /** p(a note landing on a beat is an accent). */
  accent: number;
}

/**
 * Difficulty is not a density dial but a *feel*: how far the rhythm strays off
 * the beat. Easy keeps notes on the pulse and its strong halves; hard fills the
 * weak sixteenths and lets the downbeat drop out for an anticipated feel.
 */
const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { onBeat: 0.92, strong: 0.4, weak: 0.06, syncopateDownbeat: 0, accent: 0.55 },
  medium: { onBeat: 0.78, strong: 0.62, weak: 0.32, syncopateDownbeat: 0.12, accent: 0.4 },
  hard: { onBeat: 0.62, strong: 0.72, weak: 0.6, syncopateDownbeat: 0.32, accent: 0.34 },
};

/** Where a cell sits within its beat, which decides how likely it is to sound. */
function classifyInBeat(tickInBeat: number, ticksPerBeat: number): "beat" | "strong" | "weak" {
  if (tickInBeat === 0) return "beat";
  if (ticksPerBeat === 4 && tickInBeat === 2) return "strong";
  return "weak";
}

interface GenerateOptions {
  perBar: number;
  bars: number;
  ticksPerBeat: number;
  difficulty: Difficulty;
  /** Injectable for tests; defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * A random pattern at a difficulty, over the given grid.
 *
 * Position drives probability — beats sound more often than their offs — so the
 * result reads as a rhythm rather than as noise. Two guarantees keep it
 * playable: the downbeat is a note unless syncopation deliberately rests it, and
 * no bar is left completely silent.
 */
export function generatePattern({
  perBar,
  bars,
  ticksPerBeat,
  difficulty,
  rng = Math.random,
}: GenerateOptions): RhythmStep[] {
  const profile = PROFILES[difficulty];
  const total = perBar * bars;
  const steps: RhythmStep[] = [];

  for (let index = 0; index < total; index += 1) {
    const tickInBar = index % perBar;
    const tickInBeat = tickInBar % ticksPerBeat;

    if (tickInBar === 0) {
      steps.push(rng() < profile.syncopateDownbeat ? "rest" : "accent");
      continue;
    }

    const cls = classifyInBeat(tickInBeat, ticksPerBeat);
    const prob = cls === "beat" ? profile.onBeat : cls === "strong" ? profile.strong : profile.weak;

    if (rng() < prob) {
      steps.push(cls === "beat" && rng() < profile.accent ? "accent" : "note");
    } else {
      steps.push("rest");
    }
  }

  // A bar of pure rests is not an exercise; give it back its downbeat.
  for (let bar = 0; bar < bars; bar += 1) {
    const from = bar * perBar;
    if (steps.slice(from, from + perBar).every((step) => step === "rest")) {
      steps[from] = "accent";
    }
  }

  return steps;
}
