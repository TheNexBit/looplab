import type { BeatState, TimeSignature } from "./types";

/**
 * Bounds on a hand-built numerator. Two is the smallest bar worth clicking; the upper end
 * only stops a slip turning into a thousand-beat bar (13, 15 are real repertoire).
 */
export const BEATS_MIN = 2;
export const BEATS_MAX = 32;

/**
 * Meters worth offering ready-grouped, named the way they are counted: the groupings that
 * carry a repertoire, not every partition of the numerator.
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
 * The felt beats of a bar, each with the pulses it spans: 7/8 as 2+2+3 gives three beats
 * starting on pulses 0, 2 and 4; without a grouping every pulse is a beat. The one place the
 * bar is split into beats: the pads, the dial's pulse and the screen flash all read it.
 */
export function feltBeatSpans(
  beats: number,
  grouping: number[] | null,
): { first: number; size: number }[] {
  const sizes = grouping ?? Array.from({ length: beats }, () => 1);
  let first = 0;
  return sizes.map((size) => {
    const beat = { first, size };
    first += size;
    return beat;
  });
}

/** Even halves: no swing at all. */
export const SWING_STRAIGHT = 0.5;
/** The classic jazz eighth: the pair falls 2:1, as if written as triplets. */
export const SWING_TRIPLET = 2 / 3;
/** A hard shuffle — a dotted eighth against a sixteenth, 3:1. */
export const SWING_MAX = 0.75;

const BEAT_STATE_ORDER: BeatState[] = ["accent", "normal", "muted"];

/** The state after this one, cycling. What a click on a beat does. */
export function nextBeatState(state: BeatState): BeatState {
  const index = BEAT_STATE_ORDER.indexOf(state);
  return BEAT_STATE_ORDER[(index + 1) % BEAT_STATE_ORDER.length] as BeatState;
}

/**
 * A pattern of exactly `beats` entries. Growing keeps what the player set and fills the new
 * beats with `normal`; shrinking truncates, so 4/4 → 3/4 → 4/4 loses the fourth beat's state
 * rather than resurrecting a stale one.
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
