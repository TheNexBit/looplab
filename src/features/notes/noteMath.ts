/** Range and resolution of the levels sent by the `spectrum` command (see spectrum.rs). */
export const LOWEST_NOTE = 21;
export const HIGHEST_NOTE = 108;
export const NOTE_COUNT = HIGHEST_NOTE - LOWEST_NOTE + 1;
export const POINTS_PER_NOTE = 5;
export const FLOOR_DB = -100;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const pitchClass = (midi: number) => NAMES[((midi % 12) + 12) % 12] ?? "C";

/** "C#4", with middle C = C4 as in Reaper and most DAWs. */
export const noteName = (midi: number) => `${pitchClass(midi)}${Math.floor(midi / 12) - 1}`;

export const isBlack = (midi: number) => pitchClass(midi).length > 1;

/** MIDI note of point `index` of the levels (the middle point of each group is on the note). */
export const noteOfPoint = (index: number) =>
  LOWEST_NOTE + (index - (POINTS_PER_NOTE - 1) / 2) / POINTS_PER_NOTE;

/** Level of each key: the loudest of its points. Missing values count as silence. */
export function keyLevels(levels: (number | null)[]): number[] {
  return Array.from({ length: NOTE_COUNT }, (_, key) => {
    let best = FLOOR_DB;
    for (let p = 0; p < POINTS_PER_NOTE; p++) {
      const value = levels[key * POINTS_PER_NOTE + p];
      if (typeof value === "number" && value > best) best = value;
    }
    return best;
  });
}

/** How far below the loudest key a peak may be and still count as a note. */
export const NOTE_RANGE_DB = 24;

/**
 * The strongest notes: keys louder than both neighbours and within `NOTE_RANGE_DB` of the
 * loudest one, at most `limit`, returned low to high as MIDI numbers.
 */
export function strongestNotes(keys: number[], limit = 6): number[] {
  const top = Math.max(...keys);
  if (top <= FLOOR_DB) return [];
  const peaks = keys
    .map((level, i) => ({ level, midi: LOWEST_NOTE + i }))
    .filter(
      ({ level }, i) =>
        level > top - NOTE_RANGE_DB &&
        level >= (keys[i - 1] ?? FLOOR_DB) &&
        level > (keys[i + 1] ?? FLOOR_DB),
    );
  return peaks
    .sort((a, b) => b.level - a.level)
    .slice(0, limit)
    .map((p) => p.midi)
    .sort((a, b) => a - b);
}

/**
 * Horizontal span of a piano key in semitone units from the left edge of A0's column:
 * white keys widen into the half of each neighbouring black key, as on a real keyboard.
 */
export function keySpan(midi: number): { left: number; right: number } {
  const index = midi - LOWEST_NOTE;
  if (isBlack(midi)) return { left: index, right: index + 1 };
  const left = index + (midi > LOWEST_NOTE && isBlack(midi - 1) ? -0.5 : 0);
  const right = index + 1 + (midi < HIGHEST_NOTE && isBlack(midi + 1) ? 0.5 : 0);
  return { left, right };
}
