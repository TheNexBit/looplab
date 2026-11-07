/**
 * The scales worth having on a neck, grouped the way a guitarist reaches for
 * them.
 *
 * Not every set of intervals that has a name — a list that tries to be complete
 * is a list nobody scrolls to the bottom of. These are the ones that carry
 * repertoire: the seven modes everything is built from, the pentatonics that
 * most playing actually happens inside, and the four or five altered sounds you
 * meet the first time a chord refuses to fit.
 */
export interface ScaleDef {
  id: string;
  name: string;
  /** Semitones above the root, ascending, starting at 0. */
  intervals: number[];
  group: string;
}

export const SCALES: ScaleDef[] = [
  { id: "ionian", name: "Ionian (major)", intervals: [0, 2, 4, 5, 7, 9, 11], group: "Modes" },
  { id: "dorian", name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], group: "Modes" },
  { id: "phrygian", name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], group: "Modes" },
  { id: "lydian", name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11], group: "Modes" },
  { id: "mixolydian", name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10], group: "Modes" },
  { id: "aeolian", name: "Aeolian (minor)", intervals: [0, 2, 3, 5, 7, 8, 10], group: "Modes" },
  { id: "locrian", name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10], group: "Modes" },

  {
    id: "major-pentatonic",
    name: "Major pentatonic",
    intervals: [0, 2, 4, 7, 9],
    group: "Pentatonic & blues",
  },
  {
    id: "minor-pentatonic",
    name: "Minor pentatonic",
    intervals: [0, 3, 5, 7, 10],
    group: "Pentatonic & blues",
  },
  {
    id: "minor-blues",
    name: "Minor blues",
    intervals: [0, 3, 5, 6, 7, 10],
    group: "Pentatonic & blues",
  },
  {
    id: "major-blues",
    name: "Major blues",
    intervals: [0, 2, 3, 4, 7, 9],
    group: "Pentatonic & blues",
  },

  {
    id: "harmonic-minor",
    name: "Harmonic minor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    group: "Minor & altered",
  },
  {
    id: "phrygian-dominant",
    name: "Phrygian dominant",
    intervals: [0, 1, 4, 5, 7, 8, 10],
    group: "Minor & altered",
  },
  {
    id: "melodic-minor",
    name: "Melodic minor",
    intervals: [0, 2, 3, 5, 7, 9, 11],
    group: "Minor & altered",
  },
  {
    id: "lydian-dominant",
    name: "Lydian dominant",
    intervals: [0, 2, 4, 6, 7, 9, 10],
    group: "Minor & altered",
  },
  {
    id: "altered",
    name: "Altered (super locrian)",
    intervals: [0, 1, 3, 4, 6, 8, 10],
    group: "Minor & altered",
  },

  { id: "whole-tone", name: "Whole tone", intervals: [0, 2, 4, 6, 8, 10], group: "Symmetric" },
  {
    id: "diminished",
    name: "Diminished (half–whole)",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    group: "Symmetric",
  },
  {
    id: "chromatic",
    name: "Chromatic",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    group: "Symmetric",
  },
];

export function findScale(id: string): ScaleDef | null {
  return SCALES.find((scale) => scale.id === id) ?? null;
}

/** The groups in the order they should be offered, derived from the list. */
export function scaleGroups(): string[] {
  return [...new Set(SCALES.map((scale) => scale.group))];
}
