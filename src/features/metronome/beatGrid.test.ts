import { describe, expect, it } from "vitest";
import {
  barDuration,
  beatsInBar,
  crossSpacing,
  defaultPattern,
  fitPattern,
  groupAt,
  groupStarts,
  isValidGrouping,
  nextBeatState,
  SWING_TRIPLET,
  swungTickDuration,
  ticksPerBar,
} from "./beatGrid";

const sevenEight = { beats: 7, unit: 8, grouping: [2, 2, 3] } as const;

describe("beat grid", () => {
  it("groups an additive meter without changing the bar", () => {
    const sig = { ...sevenEight, grouping: [...sevenEight.grouping] };
    expect(beatsInBar(sig)).toBe(3);
    expect(groupStarts(sig.grouping)).toEqual([0, 2, 4]);
    expect(groupAt(sig.grouping, 4)).toEqual({ index: 2, isStart: true });
    expect(groupAt(sig.grouping, 5)).toEqual({ index: 2, isStart: false });
    expect(barDuration(120, sig)).toBeCloseTo(3.5);
  });

  it("accepts only groupings that add up to the bar", () => {
    expect(isValidGrouping([2, 2, 3], 7)).toBe(true);
    expect(isValidGrouping([2, 2, 2], 7)).toBe(false);
    expect(isValidGrouping("2+2+3", 7)).toBe(false);
  });

  it("swings a pair without changing its length", () => {
    const first = swungTickDuration(120, "eighth", SWING_TRIPLET, 0);
    const second = swungTickDuration(120, "eighth", SWING_TRIPLET, 1);
    expect(first + second).toBeCloseTo(0.5);
    expect(first / second).toBeCloseTo(2);
    // Triplets have no pairs to swing
    expect(swungTickDuration(120, "triplet", SWING_TRIPLET, 0)).toBeCloseTo(0.5 / 3);
  });

  it("counts clicks and cross pulses across the bar", () => {
    expect(ticksPerBar({ beats: 4, unit: 4 }, "sixteenth")).toBe(16);
    // Three against four at 120: three pulses in a two-second bar
    expect(crossSpacing(120, { beats: 4, unit: 4 }, 3)).toBeCloseTo(2 / 3);
  });

  it("keeps the accent pattern the length of the bar", () => {
    expect(defaultPattern(3)).toEqual(["accent", "normal", "normal"]);
    expect(fitPattern(["accent", "muted"], 4)).toEqual(["accent", "muted", "normal", "normal"]);
    expect(fitPattern(["accent", "muted", "normal"], 2)).toEqual(["accent", "muted"]);
    expect(nextBeatState("muted")).toBe("accent");
  });
});
