import { describe, expect, it } from "vitest";
import {
  FLOOR_DB,
  keyLevels,
  keySpan,
  NOTE_COUNT,
  noteName,
  noteOfPoint,
  POINTS_PER_NOTE,
  strongestNotes,
} from "./noteMath";

describe("note names", () => {
  it("uses C4 for middle C", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(69)).toBe("A4");
    expect(noteName(21)).toBe("A0");
    expect(noteName(61)).toBe("C#4");
  });

  it("puts the middle point of each group on the note", () => {
    expect(noteOfPoint(2)).toBe(21);
    expect(noteOfPoint(POINTS_PER_NOTE * 48 + 2)).toBe(69);
  });
});

describe("keyLevels and strongestNotes", () => {
  const levels = (peaks: Record<number, number>) => {
    const keys = Array(NOTE_COUNT * POINTS_PER_NOTE).fill(-90);
    for (const [midi, db] of Object.entries(peaks)) {
      keys[(Number(midi) - 21) * POINTS_PER_NOTE + 2] = db;
    }
    return keys;
  };

  it("finds the loud keys, low to high", () => {
    const keys = keyLevels(levels({ 45: -10, 52: -14, 57: -12, 64: -50 }));
    expect(strongestNotes(keys)).toEqual([45, 52, 57]);
  });

  it("is empty in silence", () => {
    expect(strongestNotes(keyLevels(Array(10).fill(null)))).toEqual([]);
    expect(keyLevels([])[0]).toBe(FLOOR_DB);
  });
});

describe("keySpan", () => {
  it("lays white keys out like a piano octave", () => {
    // C4 … B4: white widths 1.5, 2, 1.5, 1.5, 2, 2, 1.5 semitones, filling the octave
    const whites = [60, 62, 64, 65, 67, 69, 71].map((midi) => keySpan(midi));
    expect(whites.map((s) => s.right - s.left)).toEqual([1.5, 2, 1.5, 1.5, 2, 2, 1.5]);
    expect(whites[0]?.left).toBe(60 - 21);
    expect(whites[6]?.right).toBe(72 - 21);
    expect(keySpan(61)).toEqual({ left: 40, right: 41 });
  });
});
