import { beforeEach, describe, expect, it } from "vitest";
import { clampView, MIN_SPAN, useViewStore, zoomWindow } from "./view";

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

describe("following the playhead", () => {
  beforeEach(() => useViewStore.getState().reset(300));

  it("keeps the playhead in the middle once it passes it", () => {
    useViewStore.getState().followPlayhead(40);
    expect(useViewStore.getState().start).toBe(25); // 30 s window centred on 40 s
  });

  it("pauses after a manual scroll instead of switching off", () => {
    const view = useViewStore.getState();
    view.scrollTo(100);
    view.followPlayhead(40);
    expect(useViewStore.getState().start).toBe(100); // the user's scroll is respected
    useViewStore.setState({ manualUntil: 0 }); // the pause is over
    useViewStore.getState().followPlayhead(40);
    expect(useViewStore.getState().start).toBe(25); // following came back by itself
  });

  it("does not cancel a zoom in progress", () => {
    const view = useViewStore.getState();
    view.zoom(0.5, 0);
    const targetSpan = useViewStore.getState().target.span;
    useViewStore.getState().followPlayhead(40);
    expect(useViewStore.getState().target.span).toBe(targetSpan);
  });
});
