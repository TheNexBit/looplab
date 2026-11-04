import { describe, expect, it } from "vitest";
import { clampView, MIN_SPAN, zoomWindow } from "./view";

describe("clampView", () => {
  it("keeps the window inside the track", () => {
    expect(clampView({ start: -5, span: 10 }, 100)).toEqual({ start: 0, span: 10 });
    expect(clampView({ start: 95, span: 10 }, 100)).toEqual({ start: 90, span: 10 });
  });

  it("limits the zoom", () => {
    expect(clampView({ start: 0, span: 0.001 }, 100).span).toBe(MIN_SPAN);
    expect(clampView({ start: 0, span: 500 }, 100)).toEqual({ start: 0, span: 100 });
  });
});

describe("zoomWindow", () => {
  it("keeps the anchor at the same place on screen", () => {
    const zoomed = zoomWindow({ start: 10, span: 20 }, 0.5, 15, 100);
    expect(zoomed).toEqual({ start: 12.5, span: 10 });
    // 15 s was at 25% of the window before and still is
    expect((15 - zoomed.start) / zoomed.span).toBeCloseTo(0.25);
  });
});
