import { describe, expect, it } from "vitest";
import { STANDARD } from "@/features/fretboard/tuning";
import { DEFAULT_SHAPE } from "@/lib/music";
import { sanitizeFretboard } from "./fretboard";

describe("saved neck", () => {
  it("falls back to the defaults on damaged data", () => {
    const neck = sanitizeFretboard({
      strings: [1, 2] as number[],
      shape: { root: 0, kind: "scale", id: "nope" },
      frets: 99,
      display: "x" as never,
    });
    expect(neck.strings).toEqual(STANDARD);
    expect(neck.shape).toEqual(DEFAULT_SHAPE);
    expect(neck.frets).toBe(24);
    expect(neck.display).toBe("degrees");
    expect(neck.enabled).toBe(false);
  });

  it("keeps the position inside the neck", () => {
    const neck = sanitizeFretboard({ frets: 12, windowSpan: 5, windowFrom: 11 });
    expect(neck.windowFrom).toBe(8);
  });

  it("keeps a seven-string tuning and a chord", () => {
    const strings = [35, 40, 45, 50, 55, 59, 64];
    const neck = sanitizeFretboard({ strings, shape: { root: 2, kind: "chord", id: "min7" } });
    expect(neck.strings).toEqual(strings);
    expect(neck.shape.id).toBe("min7");
  });
});
