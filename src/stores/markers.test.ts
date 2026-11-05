import { beforeEach, describe, expect, it } from "vitest";
import {
  beatNumbers,
  type MarkerData,
  neighbourPoint,
  sectionRanges,
  useMarkersStore,
} from "./markers";

const marker = (id: string, time: number, kind: MarkerData["kind"] = "free"): MarkerData => ({
  id,
  time,
  kind,
  label: "",
});
const section = (id: string, start: number) => ({ id, start, name: id, color: 0 });

describe("sectionRanges", () => {
  it("runs each section to the next one, the last to the end", () => {
    const ranges = sectionRanges([section("b", 30), section("a", 0), section("c", 60)], 90);
    expect(ranges.map((r) => [r.id, r.start, r.end])).toEqual([
      ["a", 0, 30],
      ["b", 30, 60],
      ["c", 60, 90],
    ]);
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
  const sections = [section("s", 15)];

  it("finds the next and previous point among markers and sections", () => {
    expect(neighbourPoint(12, 1, markers, sections)).toBe(15);
    expect(neighbourPoint(12, -1, markers, sections)).toBe(10);
  });

  it("moves past a point the playhead is standing on", () => {
    expect(neighbourPoint(15, 1, markers, sections)).toBe(20);
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
    store.addSection(0);
    store.addSection(30);
    const [first, second] = useMarkersStore.getState().sections;
    expect(first?.name).toBe("Sezione 1");
    expect(second?.color).toBe(1);
  });

  it("refuses two sections at the same instant", () => {
    useMarkersStore.getState().addSection(10);
    useMarkersStore.getState().addSection(10.01);
    expect(useMarkersStore.getState().sections).toHaveLength(1);
  });
});
