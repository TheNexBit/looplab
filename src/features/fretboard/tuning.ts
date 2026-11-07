import { type Accidental, midiName, noteName, pitchClass } from "@/lib/music";

/**
 * A tuning is just the pitch of each open string, lowest first.
 *
 * Absolute MIDI notes rather than pitch classes, because a fret adds a semitone
 * to a *pitch*: without the octave, a seven-string's low B and its B string
 * would be the same string.
 *
 * Nothing here assumes six of them. The count is whatever the array is long, so
 * a seven-string, an eight-string and a bass are the same feature rather than
 * three special cases.
 */
export interface Tuning {
  id: string;
  name: string;
  strings: number[];
}

export const MIN_STRINGS = 4;
export const MAX_STRINGS = 8;

/** E2 A2 D3 G3 B3 E4 — the tuning everything else is described as a change to. */
export const STANDARD: number[] = [40, 45, 50, 55, 59, 64];

export const TUNINGS: Tuning[] = [
  { id: "standard", name: "Standard (E A D G B E)", strings: STANDARD },
  { id: "drop-d", name: "Drop D", strings: [38, 45, 50, 55, 59, 64] },
  { id: "half-down", name: "Half step down (E♭)", strings: [39, 44, 49, 54, 58, 63] },
  { id: "full-down", name: "Whole step down (D)", strings: [38, 43, 48, 53, 57, 62] },
  { id: "dadgad", name: "DADGAD", strings: [38, 45, 50, 55, 57, 62] },
  { id: "open-g", name: "Open G", strings: [38, 43, 50, 55, 59, 62] },
  { id: "open-d", name: "Open D", strings: [38, 45, 50, 54, 57, 62] },
  { id: "seven-b", name: "7-string (B standard)", strings: [35, 40, 45, 50, 55, 59, 64] },
  { id: "eight-f", name: "8-string (F♯ standard)", strings: [30, 35, 40, 45, 50, 55, 59, 64] },
  { id: "bass-4", name: "Bass, 4-string", strings: [28, 33, 38, 43] },
  { id: "bass-5", name: "Bass, 5-string", strings: [23, 28, 33, 38, 43] },
];

/** The id a hand-edited tuning takes. Never one of the presets. */
export const CUSTOM_ID = "custom";

export function findTuning(id: string): Tuning | null {
  return TUNINGS.find((tuning) => tuning.id === id) ?? null;
}

/** "E A D G B E" — how a tuning is said out loud, low string first. */
export function tuningLabel(strings: number[], accidental: Accidental = "sharp"): string {
  return strings.map((midi) => noteName(pitchClass(midi), accidental)).join(" ");
}

/** With octaves, for the editor, where the octave is the thing being set. */
export function stringLabels(strings: number[], accidental: Accidental = "sharp"): string[] {
  return strings.map((midi) => midiName(midi, accidental));
}

/**
 * Grows or shrinks a tuning to `count` strings.
 *
 * A string added at the bottom goes a fourth below the current lowest, which is
 * how every extended-range instrument is actually tuned — and is a far better
 * starting point to edit from than a repeated note.
 */
export function resizeTuning(strings: number[], count: number): number[] {
  const next = [...strings];
  while (next.length > count) next.shift();
  while (next.length < count) next.unshift((next[0] ?? 40) - 5);
  return next;
}

/** True when these strings are not one of the presets, note for note. */
export function isCustom(strings: number[]): boolean {
  return !TUNINGS.some(
    (tuning) =>
      tuning.strings.length === strings.length &&
      tuning.strings.every((midi, index) => midi === strings[index]),
  );
}
