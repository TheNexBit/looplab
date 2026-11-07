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

  it("turns the page at the right edge in page mode, like Reaper", () => {
    useViewStore.getState().followPlayhead(20, "page");
    expect(useViewStore.getState().start).toBe(0); // still inside the page
    useViewStore.getState().followPlayhead(29.9, "page");
    expect(useViewStore.getState().start).toBeCloseTo(29.3); // new page just before it
  });

  it("does not cancel a zoom in progress", () => {
    const view = useViewStore.getState();
    view.zoom(0.5, 0);
    const targetSpan = useViewStore.getState().target.span;
    useViewStore.getState().followPlayhead(40);
    expect(useViewStore.getState().target.span).toBe(targetSpan);
  });
});

describe("scrolling with Shift+wheel", () => {
  beforeEach(() => useViewStore.getState().reset(300));

  it("glides to the new place instead of jumping, and quick turns add up", () => {
    const view = useViewStore.getState();
    view.scrollBy(3);
    view.scrollBy(3);
    expect(useViewStore.getState().start).toBe(0); // nothing jumps at once
    useViewStore.getState().step();
    const first = useViewStore.getState().start;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(6); // part of the way, the rest in the next frames
    for (let frame = 0; frame < 60; frame++) useViewStore.getState().step();
    expect(useViewStore.getState().start).toBe(6);
    expect(useViewStore.getState().span).toBe(30); // the zoom is untouched
  });

  it("stops at the track edges", () => {
    useViewStore.getState().scrollBy(-10);
    for (let frame = 0; frame < 60; frame++) useViewStore.getState().step();
    expect(useViewStore.getState().start).toBe(0);
  });
});

describe("opening a track", () => {
  it("shows the whole track when asked, and keeps doing so while it loads", () => {
    const view = useViewStore.getState();
    view.reset(60, true);
    expect(useViewStore.getState()).toMatchObject({ start: 0, span: 60 });
    useViewStore.getState().setDuration(200);
    expect(useViewStore.getState()).toMatchObject({ start: 0, span: 200 });
  });

  it("keeps a zoom chosen by hand when the track finishes loading", () => {
    useViewStore.getState().reset(300);
    useViewStore.getState().setDuration(400);
    expect(useViewStore.getState().span).toBe(30);
  });
});

describe("whole track on screen", () => {
  it("shows the whole track, and goes back to the zoom it came from", () => {
    const view = useViewStore.getState();
    view.reset(300);
    view.scrollTo(100);
    useViewStore.getState().toggleWhole();
    expect(useViewStore.getState().target).toEqual({ start: 0, span: 300 });
    useViewStore.getState().toggleWhole();
    expect(useViewStore.getState().target).toEqual({ start: 100, span: 30 });
  });
});
