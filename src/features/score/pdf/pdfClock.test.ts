import { describe, expect, it } from "vitest";
import type { PdfBar } from "@/stores/score";
import { mergeBars, PdfClock, removeBar, splitBar } from "./pdfClock";

const bar = (x: number, page = 0, y = 0.1): PdfBar => ({ page, x, y, w: 0.2, h: 0.1 });
const bars = [bar(0.1), bar(0.3), bar(0.5), bar(0.1, 1)];

describe("PdfClock", () => {
  it("shares the time evenly between two sync points", () => {
    const clock = new PdfClock(bars, [
      { bar: 0, occurrence: 0, position: 0, time: 2 },
      { bar: 3, occurrence: 0, position: 1, time: 10 },
    ]);
    expect(clock.barTime(1)).toBeCloseTo(4);
    expect(clock.barAt(7)).toEqual({ index: 2, position: 0.5 });
  });
});

describe("bar fixes", () => {
  const sync = [
    { bar: 0, occurrence: 0, position: 0, time: 1 },
    { bar: 2, occurrence: 0, position: 0, time: 5 },
  ];

  it("splits a bar and moves later points on by one", () => {
    const fixed = splitBar(bars, sync, 1, 0.5);
    expect(fixed?.bars).toHaveLength(5);
    expect(fixed?.bars[1]?.w).toBeCloseTo(0.1);
    expect(fixed?.bars[2]?.x).toBeCloseTo(0.4);
    expect(fixed?.sync[1]?.bar).toBe(3);
  });

  it("merges a bar with the next on the same row only", () => {
    const fixed = mergeBars(bars, sync, 1);
    expect(fixed?.bars).toHaveLength(3);
    expect(fixed?.bars[1]?.w).toBeCloseTo(0.4);
    expect(fixed?.sync.map((p) => p.bar)).toEqual([0]);
    expect(mergeBars(bars, sync, 2)).toBeNull();
  });

  it("removes a bar that is not one", () => {
    const fixed = removeBar(bars, sync, 1);
    expect(fixed?.bars).toHaveLength(3);
    expect(fixed?.sync[1]?.bar).toBe(1);
  });
});
