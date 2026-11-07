import type { BeatState, BeatUnit, SubdivisionDef, SubdivisionId, TimeSignature } from "./types";

export const SUBDIVISIONS: Record<SubdivisionId, SubdivisionDef> = {
  quarter: { id: "quarter", label: "Quarters", ticksPerBeat: 1 },
  eighth: { id: "eighth", label: "Eighths", ticksPerBeat: 2 },
  triplet: { id: "triplet", label: "Triplets", ticksPerBeat: 3 },
  sixteenth: { id: "sixteenth", label: "Sixteenths", ticksPerBeat: 4 },
};

export const SUBDIVISION_ORDER: SubdivisionId[] = ["quarter", "eighth", "triplet", "sixteenth"];

export const TIME_SIGNATURES: TimeSignature[] = [
  { beats: 2, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 4, unit: 4 },
  { beats: 5, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 7, unit: 8 },
  { beats: 12, unit: 8 },
];

/** Denominators a custom meter can take, in the order the editor offers them. */
export const BEAT_UNITS: BeatUnit[] = [2, 4, 8];

/**
 * Bounds on a hand-built numerator. Two is the smallest bar worth clicking; the
 * upper end is generous rather than principled — long odd bars (13, 15) are real
 * repertoire, so the cap only exists to stop a typo turning into a thousand-beat
 * bar, not to police what is musical.
 */
export const BEATS_MIN = 2;
export const BEATS_MAX = 32;

export function formatTimeSignature(sig: TimeSignature): string {
  const base = `${sig.beats}/${sig.unit}`;
  return sig.grouping ? `${base} (${sig.grouping.join("+")})` : base;
}

/**
 * Meters worth offering ready-grouped, named the way they are counted.
 *
 * These are the groupings that carry a repertoire — not every arithmetic
 * partition of the numerator. 7/8 as 3+2+2 exists, but a player who wants it
 * knows it by name, whereas everyone meeting 7/8 for the first time meets
 * 2+2+3.
 */
export const MIXED_METERS: TimeSignature[] = [
  { beats: 5, unit: 8, grouping: [3, 2] },
  { beats: 5, unit: 8, grouping: [2, 3] },
  { beats: 7, unit: 8, grouping: [2, 2, 3] },
  { beats: 7, unit: 8, grouping: [3, 2, 2] },
  { beats: 8, unit: 8, grouping: [3, 3, 2] },
  { beats: 9, unit: 8, grouping: [2, 2, 2, 3] },
  { beats: 11, unit: 8, grouping: [3, 2, 3, 3] },
];

/** True when the entries describe the bar they claim to. */
export function isValidGrouping(grouping: unknown, beats: number): grouping is number[] {
  return (
    Array.isArray(grouping) &&
    grouping.length > 0 &&
    grouping.every((n) => Number.isInteger(n) && n >= 1) &&
    grouping.reduce((sum: number, n: number) => sum + n, 0) === beats
  );
}

/**
 * How many *felt* beats the bar has — the length a beat pattern must be.
 *
 * Under a grouping this is the number of groups, not the number of pulses: the
 * player accents 1, 3 and 5 of a 2+2+3 bar by accenting three beats, not by
 * finding the right three of seven.
 */
export function beatsInBar(sig: TimeSignature): number {
  return sig.grouping ? sig.grouping.length : sig.beats;
}

/** Pulse index each group begins on: 2+2+3 starts groups at 0, 2 and 4. */
export function groupStarts(grouping: number[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const size of grouping) {
    starts.push(at);
    at += size;
  }
  return starts;
}

/** Which group a pulse falls in, and whether it is the one that opens it. */
export function groupAt(
  grouping: number[],
  pulseInBar: number,
): { index: number; isStart: boolean } {
  let at = 0;
  for (let index = 0; index < grouping.length; index += 1) {
    const size = grouping[index] as number;
    if (pulseInBar < at + size) return { index, isStart: pulseInBar === at };
    at += size;
  }
  // Past the end only if the grouping and the meter disagree, which
  // `isValidGrouping` exists to prevent. Fall back to the last group rather
  // than returning something that would index a pattern out of bounds.
  return { index: grouping.length - 1, isStart: false };
}

/**
 * Seconds between two beats.
 *
 * BPM means beats per minute and nothing else: the denominator says *which note
 * value* gets the beat, not how fast it goes. So 120 clicks 120 times a minute
 * in 5/4 and in 7/8 alike, and changing the meter re-groups the accents without
 * touching the speed.
 *
 * This is why `unit` is not a parameter — it deliberately cannot affect the
 * answer.
 */
export function beatDuration(bpm: number): number {
  return 60 / bpm;
}

/** Seconds between two clicks, once the beat is split by the active subdivision. */
export function tickDuration(bpm: number, subdivision: SubdivisionId): number {
  return beatDuration(bpm) / SUBDIVISIONS[subdivision].ticksPerBeat;
}

/** Even halves: no swing at all. */
export const SWING_STRAIGHT = 0.5;
/** The classic jazz eighth: the pair falls 2:1, as if written as triplets. */
export const SWING_TRIPLET = 2 / 3;
/** A hard shuffle — a dotted eighth against a sixteenth, 3:1. */
export const SWING_MAX = 0.75;

/**
 * Whether this subdivision has pairs to swing at all.
 *
 * Swing lengthens the first of every *two* clicks at the second's expense, so
 * it needs an even number of them in a beat. Quarters have nothing to lengthen,
 * and triplets are already the destination — swinging them would be asking for
 * a triplet feel on top of a triplet feel.
 */
export function canSwing(subdivision: SubdivisionId): boolean {
  return SUBDIVISIONS[subdivision].ticksPerBeat % 2 === 0;
}

export function clampSwing(swing: number): number {
  return Math.min(SWING_MAX, Math.max(SWING_STRAIGHT, swing));
}

/**
 * Seconds *this particular click* lasts, once swing has had its say.
 *
 * `swing` is the share of a pair given to the first click: 0.5 is even, 2/3 is
 * the jazz eighth, 0.75 a hard shuffle. The pair keeps its total length, so the
 * beat, the bar and the tempo are all exactly what they were — only the
 * placement inside the pair moves. That is what makes swing safe to apply in
 * the middle of everything else: no other grid has to be told about it.
 *
 * Pairs never straddle a bar line, because a bar holds `beats × 2` or
 * `beats × 4` clicks in the swingable subdivisions and both are even.
 */
export function swungTickDuration(
  bpm: number,
  subdivision: SubdivisionId,
  swing: number,
  tickInBar: number,
): number {
  const even = tickDuration(bpm, subdivision);
  if (swing === SWING_STRAIGHT || !canSwing(subdivision)) return even;

  const pair = even * 2;
  const share = clampSwing(swing);
  return tickInBar % 2 === 0 ? pair * share : pair * (1 - share);
}

export function ticksPerBar(sig: TimeSignature, subdivision: SubdivisionId): number {
  return sig.beats * SUBDIVISIONS[subdivision].ticksPerBeat;
}

/** Seconds a whole bar lasts. The meter groups beats; it never rescales them. */
export function barDuration(bpm: number, sig: TimeSignature): number {
  return beatDuration(bpm) * sig.beats;
}

/** What a cross rhythm can be set to, against the bar. */
export const CROSS_RHYTHMS: number[] = [2, 3, 4, 5, 6, 7];

/**
 * Ceiling on a hand-typed cross rhythm. Past a dozen-odd pulses in a bar the two
 * grids stop being heard as a polyrhythm and start being heard as a buzz, so the
 * cap is where the feature stops being useful, not where it stops being possible.
 */
export const CROSS_MIN = 2;
export const CROSS_MAX = 16;

/**
 * Seconds between two clicks of a cross rhythm.
 *
 * The bar is divided, not the beat: `n` pulses spread evenly across the whole
 * bar. That is the difference between three-against-four and triplets — a
 * subdivision nests inside the beat and stays in phase with it, while a cross
 * rhythm meets the beat only at the bar line.
 */
export function crossSpacing(bpm: number, sig: TimeSignature, cross: number): number {
  return barDuration(bpm, sig) / cross;
}

export const BEAT_STATE_ORDER: BeatState[] = ["accent", "normal", "muted"];

/** The state after this one, cycling. What a click on a beat does. */
export function nextBeatState(state: BeatState): BeatState {
  const index = BEAT_STATE_ORDER.indexOf(state);
  return BEAT_STATE_ORDER[(index + 1) % BEAT_STATE_ORDER.length] as BeatState;
}

/**
 * A pattern of exactly `beats` entries.
 *
 * Growing keeps what the player already set and fills the new beats with
 * `normal`; shrinking truncates. Going 4/4 → 3/4 → 4/4 therefore loses the
 * fourth beat's state rather than silently resurrecting a stale one.
 */
export function fitPattern(pattern: BeatState[], beats: number): BeatState[] {
  const next: BeatState[] = [];
  for (let index = 0; index < beats; index += 1) {
    next.push(pattern[index] ?? "normal");
  }
  return next;
}

/** The default for a fresh bar: accent the downbeat, play the rest. */
export function defaultPattern(beats: number): BeatState[] {
  return Array.from({ length: beats }, (_, index) => (index === 0 ? "accent" : "normal"));
}
