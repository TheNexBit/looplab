import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryStore } from "./history";
import { useLoopStore } from "./loop";
import { useMarkersStore } from "./markers";
import { usePracticeStore } from "./practice";
import { useSavedLoopsStore } from "./savedLoops";

describe("undo / redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useMarkersStore.getState().replace([], []);
    useLoopStore.getState().clear();
    useSavedLoopsStore.getState().replace([]);
    useHistoryStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  const markerTimes = () => useMarkersStore.getState().markers.map((m) => m.time);

  it("undoes and redoes a change", () => {
    useMarkersStore.getState().addMarker("free", 3);
    vi.advanceTimersByTime(500);
    useHistoryStore.getState().undo();
    expect(markerTimes()).toEqual([]);
    useHistoryStore.getState().redo();
    expect(markerTimes()).toEqual([3]);
  });

  it("treats a burst of changes, like a drag, as one step", () => {
    useMarkersStore.getState().addMarker("free", 1);
    vi.advanceTimersByTime(500);
    const id = useMarkersStore.getState().markers[0]?.id ?? "";
    for (const time of [1.1, 1.2, 1.3, 1.4]) {
      useMarkersStore.getState().moveMarker(id, time);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(500);
    useHistoryStore.getState().undo();
    expect(markerTimes()).toEqual([1]);
  });

  it("undoes a change that has not settled yet", () => {
    useLoopStore.getState().setRegion(2, 4, 10);
    useHistoryStore.getState().undo();
    expect(useLoopStore.getState().region()).toBeNull();
  });

  it("drops the redo steps after a new change", () => {
    useMarkersStore.getState().addMarker("free", 1);
    vi.advanceTimersByTime(500);
    useHistoryStore.getState().undo();
    useMarkersStore.getState().addMarker("beat", 2);
    vi.advanceTimersByTime(500);
    expect(useHistoryStore.getState().future).toEqual([]);
    useHistoryStore.getState().redo();
    expect(markerTimes()).toEqual([2]);
  });

  it("forgets everything on reset (a new track)", () => {
    useMarkersStore.getState().addMarker("free", 1);
    vi.advanceTimersByTime(500);
    useHistoryStore.getState().reset();
    useHistoryStore.getState().undo();
    expect(markerTimes()).toEqual([1]);
  });

  it("undoes a tempo marker dragged by mistake, the whole drag as one step", () => {
    const practice = usePracticeStore.getState();
    practice.setTempoMap([
      { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
      { time: 8, bpm: 90, beatsPerBar: 7, beatUnit: 8 },
    ]);
    vi.advanceTimersByTime(500);
    for (const time of [8.5, 9, 9.5, 10]) {
      usePracticeStore.getState().moveTempoMarker(1, time);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(500);
    useHistoryStore.getState().undo();
    expect(usePracticeStore.getState().tempoMap[1]?.time).toBe(8);
    useHistoryStore.getState().redo();
    expect(usePracticeStore.getState().tempoMap[1]?.time).toBe(10);
  });
});
