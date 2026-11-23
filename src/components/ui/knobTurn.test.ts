import { describe, expect, it } from "vitest";
import { shareOf, valueAt } from "./knobTurn";

describe("knob turn", () => {
  it("puts a centered knob's default straight up whatever the range", () => {
    expect(shareOf(1, 0.25, 2, 1)).toBe(0.5);
    expect(shareOf(0.25, 0.25, 2, 1)).toBe(0);
    expect(shareOf(2, 0.25, 2, 1)).toBe(1);
    expect(valueAt(0.5, 0.25, 2, 1)).toBe(1);
    expect(valueAt(0.75, 0.25, 2, 1)).toBeCloseTo(1.5);
  });

  it("spreads a plain knob evenly from its minimum", () => {
    expect(shareOf(0.6, 0, 1, null)).toBeCloseTo(0.6);
    expect(valueAt(0.25, 0, 1, null)).toBe(0.25);
  });
});
