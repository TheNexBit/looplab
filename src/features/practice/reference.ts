/**
 * Reference notes to tune a guitar or a bass by ear: the open strings of each tuning, and
 * their pitch from the chosen A (440 Hz unless the record is slightly off).
 */

export const INSTRUMENTS = ["guitar", "bass"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** Open strings in standard tuning, lowest first, as MIDI notes (E2 A2 D3 G3 B3 E4; E1 A1 D2 G2). */
const STANDARD: Record<Instrument, readonly number[]> = {
  guitar: [40, 45, 50, 55, 59, 64],
  bass: [28, 33, 38, 43],
};

/**
 * Tunings and how many semitones each string goes down from standard, lowest string first
 * (the bass uses the first four). Names in `t.practice.referenceTunings`.
 */
export const REFERENCE_TUNINGS = {
  standard: [0, 0, 0, 0, 0, 0],
  eFlat: [1, 1, 1, 1, 1, 1],
  dropD: [2, 0, 0, 0, 0, 0],
  d: [2, 2, 2, 2, 2, 2],
  dropCSharp: [3, 1, 1, 1, 1, 1],
  dropC: [4, 2, 2, 2, 2, 2],
} as const satisfies Record<string, readonly number[]>;
export type ReferenceTuning = keyof typeof REFERENCE_TUNINGS;
export const REFERENCE_TUNING_IDS = Object.keys(REFERENCE_TUNINGS) as ReferenceTuning[];

/** The A the other notes are tuned from, in Hz. */
export const REFERENCE_PITCH = { min: 415, max: 466, step: 1, default: 440 } as const;
/** MIDI number of that A (A4). */
const A4 = 69;

/** Italian note names, with flats as guitarists name lowered tunings (Mi♭, La♭…). */
const NAMES = ["Do", "Re♭", "Re", "Mi♭", "Mi", "Fa", "Sol♭", "Sol", "La♭", "La", "Si♭", "Si"];

export const noteHz = (midi: number, a4: number) => a4 * 2 ** ((midi - A4) / 12);
export const italianName = (midi: number) => NAMES[((midi % 12) + 12) % 12] ?? "Do";

/** Open strings of `instrument` in `tuning`, lowest first. */
export function openStrings(instrument: Instrument, tuning: ReferenceTuning): number[] {
  const down = REFERENCE_TUNINGS[tuning];
  return STANDARD[instrument].map((midi, index) => midi - (down[index] ?? 0));
}

/** "La 440", the note most tuners start from, at the chosen pitch. */
export const A_NOTE = A4;
