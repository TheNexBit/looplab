import { describe, expect, it } from "vitest";
import { nearestWithin } from "./snap";

describe("magnet", () => {
  it("sticks to the closest point within reach", () => {
    expect(nearestWithin(10.04, [5, 10, 10.1], 0.2)).toBe(10);
    expect(nearestWithin(10.08, [5, 10, 10.1], 0.2)).toBe(10.1);
  });

  it("leaves the time alone when nothing is close", () => {
    expect(nearestWithin(7, [5, 10], 0.5)).toBe(7);
  });
});
