import { beforeEach, describe, expect, it } from "vitest";
import {
  beatNumbers,
  insertSection,
  type MarkerData,
  neighbourPoint,
  roomAround,
  type SectionData,
  useMarkersStore,
  withEnds,
} from "./markers";

const marker = (id: string, time: number, kind: MarkerData["kind"] = "free"): MarkerData => ({
  id,
  time,
  kind,
  label: "",
});
const section = (id: string, start: number, end: number): SectionData => ({
  id,
  start,
  end,
  name: id,
  color: 0,
  memo: "",
});
const spans = (sections: SectionData[]) =>
  [...sections].sort((a, b) => a.start - b.start).map((s) => [s.start, s.end]);

describe("sections of older project files", () => {
  it("run each section to the next one, the last to the end", () => {
    const old = [30, 0, 60].map((start) => ({ ...section(`s${start}`, start, 0), end: null }));
    expect(spans(withEnds(old, 90))).toEqual([
      [0, 30],
      [30, 60],
      [60, 90],
    ]);
  });

  it("keep the end they already have", () => {
    expect(spans(withEnds([section("a", 10, 20)], 90))).toEqual([[10, 20]]);
  });
});

describe("a new section among the others", () => {
  const verse = section("verse", 10, 30);

  it("goes in a free stretch untouched", () => {
    expect(spans(insertSection([verse], section("solo", 40, 50)))).toEqual([
      [10, 30],
      [40, 50],
    ]);
  });

  it("cuts back the ones it covers in part, and drops those it covers whole", () => {
    expect(spans(insertSection([verse], section("x", 25, 35)))).toEqual([
      [10, 25],
      [25, 35],
    ]);
    expect(spans(insertSection([verse], section("x", 5, 35)))).toEqual([[5, 35]]);
  });

  it("splits one it falls inside", () => {
    const result = insertSection([verse], section("fill", 15, 20));
    expect(spans(result)).toEqual([
      [10, 15],
      [15, 20],
      [20, 30],
    ]);
    expect(new Set(result.map((s) => s.id)).size).toBe(3);
  });
});

describe("roomAround", () => {
  it("is the free stretch between the neighbours", () => {
    const sections = [section("a", 0, 10), section("b", 20, 30), section("c", 40, 50)];
    expect(roomAround(sections, "b", 60)).toEqual({ min: 10, max: 40 });
    expect(roomAround(sections, "c", 60)).toEqual({ min: 30, max: 60 });
  });
});

describe("beatNumbers", () => {
  it("numbers bars in time order and ignores free markers", () => {
    const numbers = beatNumbers([marker("x", 8, "beat"), marker("f", 1), marker("y", 4, "beat")]);
    expect(numbers.get("y")).toBe(1);
    expect(numbers.get("x")).toBe(2);
    expect(numbers.has("f")).toBe(false);
  });
});

describe("neighbourPoint", () => {
  const markers = [marker("a", 10), marker("b", 20)];
  const sections = [section("s", 15, 18)];

  it("finds the next and previous point among markers and section edges", () => {
    expect(neighbourPoint(12, 1, markers, sections)).toBe(15);
    expect(neighbourPoint(16, 1, markers, sections)).toBe(18);
    expect(neighbourPoint(12, -1, markers, sections)).toBe(10);
  });

  it("moves past a point the playhead is standing on", () => {
    expect(neighbourPoint(15, 1, markers, sections)).toBe(18);
    expect(neighbourPoint(15, -1, markers, sections)).toBe(10);
  });

  it("returns null at the ends", () => {
    expect(neighbourPoint(25, 1, markers, sections)).toBeNull();
  });
});

describe("markers store", () => {
  beforeEach(() => useMarkersStore.getState().replace([], []));

  it("names and colours new sections in turn", () => {
    const store = useMarkersStore.getState();
    store.addSection(0, 10, 60);
    store.addSection(30, 20, 60);
    const [first, second] = useMarkersStore.getState().sections;
    expect(first?.name).toBe("Sezione 1");
    expect(second?.color).toBe(1);
    expect(spans(useMarkersStore.getState().sections)).toEqual([
      [0, 10],
      [20, 30],
    ]);
  });

  it("opens a section with S and closes it with S again", () => {
    const store = useMarkersStore.getState();
    store.markSection(12, 60);
    expect(useMarkersStore.getState().pendingSection).toBe(12);
    useMarkersStore.getState().markSection(20, 60);
    expect(useMarkersStore.getState().pendingSection).toBeNull();
    expect(spans(useMarkersStore.getState().sections)).toEqual([[12, 20]]);
  });

  it("drops an open section on cancel, and refuses one too short", () => {
    useMarkersStore.getState().markSection(12, 60);
    useMarkersStore.getState().cancelSection();
    useMarkersStore.getState().addSection(10, 10.01, 60);
    expect(useMarkersStore.getState().sections).toHaveLength(0);
    expect(useMarkersStore.getState().pendingSection).toBeNull();
  });

  it("keeps an edited section inside its free room", () => {
    useMarkersStore.getState().replace([], [section("a", 0, 10), section("b", 20, 30)]);
    useMarkersStore.getState().setSectionBounds("b", 5, 40, 35);
    expect(spans(useMarkersStore.getState().sections)).toEqual([
      [0, 10],
      [10, 35],
    ]);
  });
});
