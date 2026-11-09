/**
 * What one cell of the grid does. `note` is a strum, `accent` a stronger one,
 * `rest` a silence you play through. Direction (down/up) is *derived* from where
 * the cell sits, never stored — one less thing to keep in step with the grid.
 */
export type RhythmStep = "rest" | "note" | "accent";

/**
 * The pick direction of a cell: down on the pulse, up on the off, alternating within each
 * beat of `perBeat` clicks and starting again down at every beat — alternate picking as a
 * guitarist counts it, so a triplet reads down-up-down and the next beat starts down.
 */
export function strumDirection(tickInBar: number, perBeat: number): "down" | "up" {
  return (tickInBar % Math.max(1, perBeat)) % 2 === 0 ? "down" : "up";
}

/** Grows or shrinks a pattern to `total` cells, padding the new ones with rests. */
export function fitSteps(steps: RhythmStep[], total: number): RhythmStep[] {
  const next: RhythmStep[] = [];
  for (let index = 0; index < total; index += 1) next.push(steps[index] ?? "rest");
  return next;
}

/** A clean slate: accent every bar's downbeat, rest everything else. */
function freshSteps(perBar: number, total: number): RhythmStep[] {
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
