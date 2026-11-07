import { OCTAVE, type PitchClass, pitchClass } from "./notes";

/**
 * What each interval is *called*, which is the whole reason the fretboard
 * colours degrees rather than printing note names.
 *
 * A player learning a shape needs to see where the third and the seventh are.
 * "C♯" tells them that only after arithmetic they should not be doing while
 * playing; "3" tells them immediately, and the same shape moved five frets says
 * the same thing.
 *
 * Intervals above an octave are kept unreduced so a ninth reads as a ninth. Only
 * the pitch class is reduced, and only when it reaches the neck.
 */
const BASE_LABELS: Record<number, string> = {
  0: "R",
  1: "♭2",
  2: "2",
  3: "♭3",
  4: "3",
  5: "4",
  6: "♭5",
  7: "5",
  8: "♭6",
  9: "6",
  10: "♭7",
  11: "7",
  13: "♭9",
  14: "9",
  15: "♯9",
  17: "11",
  18: "♯11",
  20: "♭13",
  21: "13",
};

export function intervalLabel(interval: number): string {
  return BASE_LABELS[interval] ?? `${interval}`;
}

/**
 * Interval names read in the context of the scale they belong to.
 *
 * Two of them are genuinely ambiguous, and getting them wrong makes a diagram
 * teach the wrong thing:
 *
 * - **6 semitones** is a ♭5 in the blues and in locrian, but a ♯4 in lydian.
 *   The tell is what else is in the scale: a raised fourth sits *next to* a
 *   perfect fifth, while a flat fifth replaces one.
 * - **8 semitones** is a ♭6 in aeolian, but a ♯5 in the altered scale — again
 *   told apart by whether a perfect fifth is present to be flattened.
 *
 * So both are decided from the scale as a whole rather than from a lookup.
 */
export function scaleDegreeLabels(intervals: number[]): string[] {
  const has = new Set(intervals.map((interval) => pitchClass(interval)));
  const raisedFourth = has.has(7) && !has.has(5);
  const raisedFifth = !has.has(7);

  return intervals.map((interval) => {
    if (interval === 6 && raisedFourth) return "♯4";
    if (interval === 8 && raisedFifth) return "♯5";
    return intervalLabel(interval);
  });
}

/**
 * The notes a set of intervals lands on, each with the name of its degree.
 *
 * The one thing the fretboard actually consumes: it asks "is this pitch class in
 * the shape, and what is it called". Reducing to pitch classes here is what lets
 * a ninth and a second light up the same fret while still being *called* a ninth.
 */
export function degreeMap(
  root: PitchClass,
  intervals: number[],
  labels: string[],
): Map<PitchClass, string> {
  const map = new Map<PitchClass, string>();
  intervals.forEach((interval, index) => {
    const pc = pitchClass(root + interval);
    // First one wins: an extension written as both 2 and 9 keeps the name the
    // chord gave it, and a duplicate never overwrites the root.
    if (!map.has(pc)) map.set(pc, labels[index] ?? intervalLabel(interval));
  });
  return map;
}

/** Semitones between two intervals, useful for laying shapes out. */
export function reduceToOctave(interval: number): number {
  return ((interval % OCTAVE) + OCTAVE) % OCTAVE;
}
