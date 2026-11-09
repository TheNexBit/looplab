import { describe, expect, it } from "vitest";
import {
  defaultPattern,
  feltBeatSpans,
  fitPattern,
  isValidGrouping,
  nextBeatState,
} from "./beatGrid";

describe("beat grid", () => {
  it("splits a bar into its felt beats", () => {
    expect(feltBeatSpans(7, [2, 2, 3])).toEqual([
      { first: 0, size: 2 },
      { first: 2, size: 2 },
      { first: 4, size: 3 },
    ]);
    expect(feltBeatSpans(3, null)).toEqual([
      { first: 0, size: 1 },
      { first: 1, size: 1 },
      { first: 2, size: 1 },
    ]);
  });

  it("accepts only groupings that add up to the bar", () => {
    expect(isValidGrouping([2, 2, 3], 7)).toBe(true);
    expect(isValidGrouping([2, 2, 2], 7)).toBe(false);
    expect(isValidGrouping("2+2+3", 7)).toBe(false);
  });

  it("keeps the accent pattern the length of the bar", () => {
    expect(defaultPattern(3)).toEqual(["accent", "normal", "normal"]);
    expect(fitPattern(["accent", "muted"], 4)).toEqual(["accent", "muted", "normal", "normal"]);
    expect(fitPattern(["accent", "muted", "normal"], 2)).toEqual(["accent", "muted"]);
    expect(nextBeatState("muted")).toBe("accent");
  });
});
