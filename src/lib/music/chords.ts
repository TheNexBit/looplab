/**
 * Chords as interval sets, from triads up to the extensions.
 *
 * Intervals above an octave stay unreduced — a ninth is 14, not 2 — so the neck
 * can label it a ninth while still lighting the same fret a second would. That
 * distinction is the entire difference between a diagram that teaches and one
 * that just shows dots.
 */
export interface ChordDef {
  id: string;
  /** How it is written after the root: "m7", "maj7", "7♯9". */
  symbol: string;
  name: string;
  intervals: number[];
  group: string;
}

export const CHORDS: ChordDef[] = [
  { id: "maj", symbol: "", name: "Major", intervals: [0, 4, 7], group: "Triads" },
  { id: "min", symbol: "m", name: "Minor", intervals: [0, 3, 7], group: "Triads" },
  { id: "dim", symbol: "°", name: "Diminished", intervals: [0, 3, 6], group: "Triads" },
  { id: "aug", symbol: "+", name: "Augmented", intervals: [0, 4, 8], group: "Triads" },
  { id: "sus2", symbol: "sus2", name: "Suspended 2nd", intervals: [0, 2, 7], group: "Triads" },
  { id: "sus4", symbol: "sus4", name: "Suspended 4th", intervals: [0, 5, 7], group: "Triads" },

  { id: "maj7", symbol: "maj7", name: "Major 7th", intervals: [0, 4, 7, 11], group: "Sevenths" },
  { id: "dom7", symbol: "7", name: "Dominant 7th", intervals: [0, 4, 7, 10], group: "Sevenths" },
  { id: "min7", symbol: "m7", name: "Minor 7th", intervals: [0, 3, 7, 10], group: "Sevenths" },
  {
    id: "min7b5",
    symbol: "m7♭5",
    name: "Half-diminished",
    intervals: [0, 3, 6, 10],
    group: "Sevenths",
  },
  { id: "dim7", symbol: "°7", name: "Diminished 7th", intervals: [0, 3, 6, 9], group: "Sevenths" },
  {
    id: "minmaj7",
    symbol: "m(maj7)",
    name: "Minor major 7th",
    intervals: [0, 3, 7, 11],
    group: "Sevenths",
  },
  {
    id: "7sus4",
    symbol: "7sus4",
    name: "Dominant 7 sus4",
    intervals: [0, 5, 7, 10],
    group: "Sevenths",
  },

  { id: "maj6", symbol: "6", name: "Major 6th", intervals: [0, 4, 7, 9], group: "Sixths & ninths" },
  {
    id: "min6",
    symbol: "m6",
    name: "Minor 6th",
    intervals: [0, 3, 7, 9],
    group: "Sixths & ninths",
  },
  {
    id: "maj9",
    symbol: "maj9",
    name: "Major 9th",
    intervals: [0, 4, 7, 11, 14],
    group: "Sixths & ninths",
  },
  {
    id: "dom9",
    symbol: "9",
    name: "Dominant 9th",
    intervals: [0, 4, 7, 10, 14],
    group: "Sixths & ninths",
  },
  {
    id: "min9",
    symbol: "m9",
    name: "Minor 9th",
    intervals: [0, 3, 7, 10, 14],
    group: "Sixths & ninths",
  },
  {
    id: "add9",
    symbol: "add9",
    name: "Added 9th",
    intervals: [0, 4, 7, 14],
    group: "Sixths & ninths",
  },

  {
    id: "dom11",
    symbol: "11",
    name: "Dominant 11th",
    intervals: [0, 7, 10, 14, 17],
    group: "Extended & altered",
  },
  {
    id: "dom13",
    symbol: "13",
    name: "Dominant 13th",
    intervals: [0, 4, 7, 10, 14, 21],
    group: "Extended & altered",
  },
  {
    id: "dom7b9",
    symbol: "7♭9",
    name: "Dominant 7♭9",
    intervals: [0, 4, 7, 10, 13],
    group: "Extended & altered",
  },
  {
    id: "dom7s9",
    symbol: "7♯9",
    name: "Dominant 7♯9",
    intervals: [0, 4, 7, 10, 15],
    group: "Extended & altered",
  },
  {
    id: "dom7s5",
    symbol: "7♯5",
    name: "Dominant 7♯5",
    intervals: [0, 4, 8, 10],
    group: "Extended & altered",
  },
  {
    id: "dom7b5",
    symbol: "7♭5",
    name: "Dominant 7♭5",
    intervals: [0, 4, 6, 10],
    group: "Extended & altered",
  },
];

export function findChord(id: string): ChordDef | null {
  return CHORDS.find((chord) => chord.id === id) ?? null;
}

/** "A", "Cm7", "F♯7♯9" — the root and the symbol, which is how it is read. */
export function chordName(rootLabel: string, chord: ChordDef): string {
  return `${rootLabel}${chord.symbol}`;
}
