import { beforeEach, describe, expect, it } from "vitest";
import {
  advanceInLoop,
  loopWait,
  normalizeRegion,
  resizedRegion,
  restartAt,
  shiftedRegion,
  useLoopStore,
} from "./loop";

const options = { enabled: true, leadIn: 0, gap: 0 };

describe("normalizeRegion", () => {
  it("orders and clamps the ends", () => {
    expect(normalizeRegion(8, 2, 5)).toEqual({ start: 2, end: 5 });
  });

  it("rejects regions that are too short", () => {
    expect(normalizeRegion(1, 1.01, 10)).toBeNull();
  });
});

describe("advanceInLoop", () => {
  const region = { start: 10, end: 14 };

  it("moves freely before the loop end", () => {
    expect(advanceInLoop(11, 2, region, options)).toBe(13);
  });

  it("wraps back to the start at the end", () => {
    expect(advanceInLoop(13, 2, region, options)).toBe(11);
    expect(advanceInLoop(13, 6, region, options)).toBe(11); // 1 + one full 4 s lap
  });

  it("starts each lap at the lead-in", () => {
    expect(restartAt(region, 3)).toBe(7);
    expect(advanceInLoop(13, 2, region, { ...options, leadIn: 3 })).toBe(8);
  });

  it("waits at the restart point during the gap", () => {
    const withGap = { ...options, gap: 2 };
    expect(advanceInLoop(13, 2, region, withGap)).toBe(10); // 1 s into the 2 s gap
    expect(advanceInLoop(13, 4, region, withGap)).toBe(11);
  });

  it("says how long is left to wait in the gap", () => {
    const withGap = { ...options, gap: 2 };
    expect(loopWait(13, 0.5, region, withGap)).toBe(0); // still playing
    expect(loopWait(13, 1.5, region, withGap)).toBe(1.5); // 0.5 s into the 2 s gap
    expect(loopWait(13, 4, region, withGap)).toBe(0); // the next lap is playing
    expect(loopWait(13, 2, region, options)).toBe(0); // no gap at all
  });

  it("ignores the loop when disabled or already past it", () => {
    expect(advanceInLoop(13, 2, region, { ...options, enabled: false })).toBe(15);
    expect(advanceInLoop(15, 1, region, options)).toBe(16);
  });
});

describe("loop store", () => {
  beforeEach(() => useLoopStore.getState().clear());

  it("needs both ends before the loop is active", () => {
    const loop = useLoopStore.getState();
    loop.setStart(5, 60);
    expect(useLoopStore.getState().region()).toBeNull();
    loop.setEnd(9, 60);
    expect(useLoopStore.getState().region()).toEqual({ start: 5, end: 9 });
    expect(useLoopStore.getState().enabled).toBe(true);
  });

  it("toggles only an existing loop", () => {
    useLoopStore.getState().toggle();
    expect(useLoopStore.getState().enabled).toBe(false);
  });
});

describe("moving and resizing the loop", () => {
  const phrase = { start: 10, end: 14 };

  it("moves by its own length, to the next or the previous phrase", () => {
    expect(shiftedRegion(phrase, 1, 60)).toEqual({ start: 14, end: 18 });
    expect(shiftedRegion(phrase, -1, 60)).toEqual({ start: 6, end: 10 });
  });

  it("stops at the ends of the track, and says when it cannot move", () => {
    expect(shiftedRegion({ start: 2, end: 6 }, -1, 60)).toEqual({ start: 0, end: 4 });
    expect(shiftedRegion({ start: 0, end: 4 }, -1, 60)).toBeNull();
    expect(shiftedRegion({ start: 55, end: 59 }, 1, 60)).toEqual({ start: 56, end: 60 });
  });

  it("doubles and halves from the same start, inside the track", () => {
    expect(resizedRegion(phrase, 2, 60)).toEqual({ start: 10, end: 18 });
    expect(resizedRegion(phrase, 0.5, 60)).toEqual({ start: 10, end: 12 });
    expect(resizedRegion({ start: 50, end: 58 }, 2, 60)).toEqual({ start: 50, end: 60 });
    expect(resizedRegion({ start: 50, end: 60 }, 2, 60)).toBeNull();
  });
});
