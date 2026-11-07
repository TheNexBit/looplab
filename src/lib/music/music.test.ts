import { describe, expect, it } from "vitest";
import { resizeTuning, STANDARD, stringLabels } from "@/features/fretboard/tuning";
import { midiName, midiToFrequency, noteName, parseMidiNote, pitchClass, resolveShape } from ".";

describe("music theory", () => {
  it("names notes and pitches", () => {
    expect(pitchClass(-1)).toBe(11);
    expect(noteName(3, "flat")).toBe("E♭");
    expect(midiName(40)).toBe("E2");
    expect(parseMidiNote("Bb3")).toBe(58);
    expect(midiToFrequency(69)).toBeCloseTo(440);
  });

  it("resolves a scale into its degrees from the root", () => {
    const shape = resolveShape({ root: 9, kind: "scale", id: "minor-pentatonic" });
    expect(shape?.intervals).toEqual([0, 3, 5, 7, 10]);
    // A minor pentatonic: C is the minor third
    expect(shape?.degrees.get(0)).toBe(shape?.labels[1]);
    expect(resolveShape({ root: 0, kind: "scale", id: "no-such-scale" })).toBeNull();
  });

  it("tunes the neck lowest string first", () => {
    expect(stringLabels(STANDARD)).toHaveLength(6);
    // A seventh string goes a fourth below the sixth: B1
    expect(resizeTuning(STANDARD, 7)[0]).toBe(35);
  });
});
