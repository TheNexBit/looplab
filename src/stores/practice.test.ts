import { beforeEach, describe, expect, it } from "vitest";
import { usePracticeStore } from "./practice";

const store = () => usePracticeStore.getState();

describe("tempo map of the open track", () => {
  beforeEach(() => {
    store().setTempoMap([]);
    store().setBeatOffset(null);
    store().setTimeSignature(4, 4);
    store().setFirstBeatGuess(() => 0);
  });

  it("keeps a first beat and a meter picked before the tempo, then makes them the first marker", () => {
    store().setBeatOffset(1.5);
    store().setTimeSignature(7, 8);
    expect(store().tempoMap).toEqual([]);
    expect(store().bpm).toBeNull();
    store().setBpm(140);
    expect(store().tempoMap).toEqual([{ time: 1.5, bpm: 140, beatsPerBar: 7, beatUnit: 8 }]);
  });

  it("puts a first tempo on the guessed first beat when none was set", () => {
    store().setFirstBeatGuess(() => 12);
    store().setBpm(100);
    expect(store().tempoMap[0]?.time).toBe(12);
  });

  it("edits only the marker in force at the playhead", () => {
    store().setTempoMap([
      { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
      { time: 10, bpm: 90, beatsPerBar: 7, beatUnit: 8 },
    ]);
    store().focusAt(12);
    expect(store().bpm).toBe(90);
    expect(store().beatsPerBar).toBe(7);
    store().setBpm(95);
    store().focusAt(3);
    expect(store().bpm).toBe(120);
    expect(store().tempoMap.map((m) => m.bpm)).toEqual([120, 95]);
  });

  it("moves a marker's first beat but never past its neighbours", () => {
    store().setTempoMap([
      { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 },
      { time: 10, bpm: 90, beatsPerBar: 4, beatUnit: 4 },
    ]);
    store().focusAt(11);
    store().setBeatOffset(9.5);
    expect(store().tempoMap[1]?.time).toBe(9.5);
    store().setBeatOffset(-1);
    expect(store().tempoMap[1]?.time).toBe(9.5);
  });

  it("forgets the whole map when the tempo is cleared", () => {
    store().setTempoMap([{ time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 }]);
    store().setBpm(null);
    expect(store().tempoMap).toEqual([]);
    expect(store().bpm).toBeNull();
  });

  it("adds a marker on the nearest bar line with the tempo in force, then moves and removes it", () => {
    // 120 BPM 4/4: bars every 2 s
    store().setTempoMap([{ time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4 }]);
    expect(store().addTempoMarker(6.3)).toBe(true);
    expect(store().tempoMap.map((m) => m.time)).toEqual([0, 6]);
    expect(store().tempoMap[1]?.bpm).toBe(120);
    expect(store().addTempoMarker(6.1), "one is there already").toBe(false);
    store().moveTempoMarker(1, 7);
    expect(store().tempoMap[1]?.time).toBe(7);
    store().moveTempoMarker(1, -1);
    expect(store().tempoMap[1]?.time, "never before the previous one").toBe(7);
    store().removeTempoMarker(1);
    expect(store().tempoMap).toHaveLength(1);
    store().setTempoMap([]);
    expect(store().addTempoMarker(3), "no tempo yet").toBe(false);
  });
});

describe("markers proposed by the tempo analysis", () => {
  const proposed = [
    { time: 0, bpm: 120, beatsPerBar: 4, beatUnit: 4, auto: true },
    { time: 8, bpm: 140, beatsPerBar: 7, beatUnit: 8, auto: true },
    { time: 14, bpm: 100, beatsPerBar: 4, beatUnit: 4 },
  ];
  beforeEach(() => store().setTempoMap(proposed));

  it("stay flagged until the user touches them", () => {
    expect(store().tempoMap.map((m) => m.auto ?? false)).toEqual([true, true, false]);
    store().moveTempoMarker(1, 8.5);
    expect(store().tempoMap[1]).toEqual({ time: 8.5, bpm: 140, beatsPerBar: 7, beatUnit: 8 });
    store().focusAt(1);
    store().setBpm(126);
    expect(store().tempoMap[0]?.auto).toBeUndefined();
  });

  it("are confirmed or dropped all at once", () => {
    store().removeProposed();
    expect(store().tempoMap).toEqual([proposed[2]]);
    store().setTempoMap(proposed);
    store().confirmProposed();
    expect(store().tempoMap.some((m) => m.auto)).toBe(false);
    expect(store().tempoMap).toHaveLength(3);
  });
});
