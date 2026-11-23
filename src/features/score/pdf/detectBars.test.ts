import { describe, expect, it } from "vitest";
import { detectBars } from "./detectBars";

/** A white page we draw lines on. */
function page(width: number, height: number) {
  const gray = new Uint8ClampedArray(width * height).fill(255);
  const hLine = (y: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) gray[y * width + x] = 0;
  };
  const vLine = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) gray[y * width + x] = 0;
  };
  /** A staff of `count` lines `gap` apart from `top`, from x0 to x1. Returns its bottom. */
  const staff = (top: number, count: number, gap: number, x0: number, x1: number) => {
    for (let i = 0; i < count; i++) hLine(top + i * gap, x0, x1);
    return top + (count - 1) * gap;
  };
  return { gray, hLine, vLine, staff };
}

describe("detectBars", () => {
  it("finds the bars of a tab system, left to right", () => {
    const p = page(400, 200);
    const bottom = p.staff(50, 6, 8, 20, 380);
    for (const x of [20, 110, 200, 290, 380]) p.vLine(x, 50, bottom);
    const bars = detectBars(p.gray, 400, 200);
    expect(bars).toHaveLength(4);
    expect(bars[0]?.x).toBeCloseTo(20 / 400, 2);
    expect(bars[1]?.x).toBeCloseTo(110 / 400, 2);
    expect(bars[3]?.w).toBeCloseTo(90 / 400, 2);
  });

  it("joins notation and tab staves into one system and reads systems top to bottom", () => {
    const p = page(400, 400);
    for (const top of [40, 220]) {
      const notationBottom = p.staff(top, 5, 8, 20, 380);
      const tabTop = notationBottom + 30;
      const tabBottom = p.staff(tabTop, 6, 8, 20, 380);
      // System bracket at the left edge, barlines across both staves
      p.vLine(20, top, tabBottom);
      for (const x of [200, 380]) p.vLine(x, top, tabBottom);
    }
    const bars = detectBars(p.gray, 400, 400);
    expect(bars).toHaveLength(4);
    // Each bar covers both staves of its system
    expect((bars[0]?.h ?? 0) * 400).toBeGreaterThan(100);
    expect(bars[2]?.y).toBeGreaterThan(bars[0]?.y ?? 1);
  });

  it("does not take a note stem crossing one staff for a barline", () => {
    const p = page(400, 300);
    const notationBottom = p.staff(40, 5, 8, 20, 380);
    const tabBottom = p.staff(notationBottom + 30, 6, 8, 20, 380);
    p.vLine(20, 40, tabBottom);
    p.vLine(380, 40, tabBottom);
    // A long stem across the notation staff only
    p.vLine(150, 30, notationBottom + 5);
    expect(detectBars(p.gray, 400, 300)).toHaveLength(1);
  });

  it("steps over beams and tuplet brackets as long as staff lines (JTC Exercise 03)", () => {
    const p = page(400, 300);
    const top = 60;
    const notationBottom = p.staff(top, 5, 10, 20, 380);
    const tabBottom = p.staff(notationBottom + 30, 6, 10, 20, 380);
    // A beam over the staff, a beam between two of its lines and a bracket under it: long,
    // but starting and stopping with the notes, not with the staff
    p.hLine(top - 9, 50, 350);
    p.hLine(top + 25, 50, 350);
    p.hLine(notationBottom + 12, 50, 350);
    p.vLine(20, top, tabBottom);
    for (const x of [200, 380]) p.vLine(x, top, tabBottom);
    const bars = detectBars(p.gray, 400, 300);
    expect(bars).toHaveLength(2);
    // Both bars hold the notation and the tab
    expect((bars[0]?.h ?? 0) * 300).toBeGreaterThan(tabBottom - top);
  });

  it("finds nothing on a page of text", () => {
    const p = page(200, 200);
    for (let y = 20; y < 180; y += 12) p.hLine(y, 20, 60);
    expect(detectBars(p.gray, 200, 200)).toEqual([]);
  });
});
