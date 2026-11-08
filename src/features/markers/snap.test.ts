import { describe, expect, it } from "vitest";
import { nearestWithin, snapTime } from "./snap";
import { useSnapHoldStore } from "./snapHold";

describe("magnet", () => {
  it("sticks to the closest point within reach", () => {
    expect(nearestWithin(10.04, [5, 10, 10.1], 0.2)).toBe(10);
    expect(nearestWithin(10.08, [5, 10, 10.1], 0.2)).toBe(10.1);
  });

  it("leaves the time alone when nothing is close", () => {
    expect(nearestWithin(7, [5, 10], 0.5)).toBe(7);
  });

  it("is suspended while Shift is held, as in Reaper", () => {
    useSnapHoldStore.setState({ shift: true });
    // With Shift down the time is left alone before anything on screen is even looked at
    expect(snapTime(12.345, {} as HTMLElement)).toBe(12.345);
    useSnapHoldStore.setState({ shift: false });
  });
});
