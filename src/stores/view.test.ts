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

  it("waits for as long as the view is held by hand, then pauses as usual", () => {
    const view = useViewStore.getState();
    view.scrollTo(100);
    view.holdFollow(true);
    useViewStore.getState().followPlayhead(40);
    expect(useViewStore.getState().start).toBe(100); // held: never pulled away
    expect(useViewStore.getState().manualUntil).toBe(Number.POSITIVE_INFINITY);
    useViewStore.getState().holdFollow(false);
    expect(Number.isFinite(useViewStore.getState().manualUntil)).toBe(true);
  });

  it("stretches past the start under the hand, then glides back", () => {
    const view = useViewStore.getState();
    view.pan(-10);
    const pulled = useViewStore.getState().start;
    expect(pulled).toBeLessThan(0); // something moved under the hand
    expect(pulled).toBeGreaterThan(-6); // but never more than a fifth of the 30 s view
    useViewStore.getState().pan(-20);
    expect(useViewStore.getState().start).toBeLessThan(pulled); // still moving, more stiffly
    useViewStore.getState().pan(5);
    expect(useViewStore.getState().start).toBe(5); // inside the track: exactly with the hand
    useViewStore.getState().pan(-10);
    useViewStore.getState().settle();
    for (let frame = 0; frame < 120; frame++) useViewStore.getState().step();
    expect(useViewStore.getState().start).toBe(0); // back to the start once let go
  });

  it("stretches past the end too", () => {
    useViewStore.getState().pan(290); // 300 s track, 30 s view: the last start is 270
    expect(useViewStore.getState().start).toBeGreaterThan(270);
    expect(useViewStore.getState().start).toBeLessThan(276);
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
