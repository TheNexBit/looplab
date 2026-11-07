/**
 * Pitch classes and note names.
 *
 * A pitch class is 0–11 with C = 0: an octave-less note. Everything the
 * fretboard highlights is a pitch class, because a scale lights up every
 * instance of its notes on the neck and not one particular octave.
 *
 * Absolute pitch is kept as **MIDI numbers** (C4 = 60), which is what a tuning
 * needs: a string is a specific pitch, and a fret adds a semitone to it.
 */

export type PitchClass = number;

export const OCTAVE = 12;

export type Accidental = "sharp" | "flat";

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** Wraps any integer into 0–11, including negatives. */
export function pitchClass(value: number): PitchClass {
  return ((Math.round(value) % OCTAVE) + OCTAVE) % OCTAVE;
}

export function noteName(pc: PitchClass, accidental: Accidental = "sharp"): string {
  const names = accidental === "flat" ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClass(pc)] ?? "C";
}

/** Scientific pitch: MIDI 60 is C4, so the low E of a guitar is E2. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / OCTAVE) - 1;
}

export function midiName(midi: number, accidental: Accidental = "sharp"): string {
  return `${noteName(pitchClass(midi), accidental)}${octaveOf(midi)}`;
}

const NOTE_LETTERS: Record<string, PitchClass> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * Reads "E2", "A#3", "Bb1", "F♯4" — what a tuning editor is typed into.
 *
 * Deliberately forgiving about which sharp sign is used and about case, because
 * this is a field a player types into with one hand. It is *not* forgiving about
 * a missing octave: a tuning is absolute pitch, and defaulting the octave would
 * silently retune the instrument by a few semitones.
 */
export function parseMidiNote(text: string): number | null {
  const match = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(-?\d+)\s*$/.exec(text);
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  const base = NOTE_LETTERS[(letter ?? "").toLowerCase()];
  if (base === undefined) return null;
  const shift = accidental === "#" || accidental === "♯" ? 1 : accidental ? -1 : 0;
  const midi = (Number(octave) + 1) * OCTAVE + base + shift;
  // Outside this the note is not a string anything is tuned to, and a typo like
  // "E22" should read as a mistake rather than as an inaudible instruction.
  return midi >= 0 && midi <= 127 ? midi : null;
}

/**
 * Equal-tempered frequency of a MIDI note. A4 (69) is 440 Hz, the tuning
 * reference the whole system is pinned to; every other pitch is that many
 * twelfths of an octave away.
 */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Every root a player picks from, in chromatic order with both spellings. */
export const ROOT_CHOICES: { pc: PitchClass; label: string }[] = SHARP_NAMES.map((sharp, pc) => ({
  pc,
  label: sharp === FLAT_NAMES[pc] ? sharp : `${sharp}/${FLAT_NAMES[pc]}`,
}));

/** Semitones from `root` up to `pc`, always 0–11. */
export function intervalFrom(root: PitchClass, pc: PitchClass): number {
  return pitchClass(pc - root);
}
