import { describe, expect, it, vi } from "vitest";

// The engine is not there in tests: every command succeeds and does nothing
vi.mock("@/lib/bindings", () => ({
  commands: new Proxy({}, { get: () => () => Promise.resolve({ status: "ok", data: null }) }),
}));

const { useScoreStore } = await import("./score");
type ProjectScore = NonNullable<ReturnType<typeof useScoreStore.getState>["link"]>;

const score = (file: string, synced: boolean): ProjectScore => ({
  file,
  name: `${file}.gp`,
  kind: "notation",
  tracks: [],
  staves: "both",
  layout: "page",
  follow: "continuous",
  zoom: 1,
  sync: synced ? [{ bar: 0, occurrence: 0, position: 0, time: 1 }] : [],
  pdfBars: [],
});

describe("tabs kept on the shelf", () => {
  it("switching back finds a tab with its own sync", () => {
    useScoreStore.getState().restore(score("a", true), [score("b", false)]);
    useScoreStore.getState().swapTo("b");
    expect(useScoreStore.getState().link?.file).toBe("b");
    expect(useScoreStore.getState().shelf.map((s) => s.file)).toEqual(["a"]);
    useScoreStore.getState().swapTo("a");
    expect(useScoreStore.getState().link?.sync).toHaveLength(1);
    expect(useScoreStore.getState().shelf.map((s) => s.file)).toEqual(["b"]);
  });

  it("a tab taken away waits on the shelf, never twice", () => {
    useScoreStore.getState().restore(score("a", true), [score("a", true), score("b", false)]);
    useScoreStore.getState().unlink();
    expect(useScoreStore.getState().link).toBeNull();
    expect(useScoreStore.getState().shelf.map((s) => s.file)).toEqual(["a", "b"]);
  });

  it("a file not on the shelf changes nothing", () => {
    useScoreStore.getState().restore(score("a", false), []);
    useScoreStore.getState().swapTo("z");
    expect(useScoreStore.getState().link?.file).toBe("a");
  });
});

describe("finding a PDF's bars again", () => {
  it("empties the bars and their sync, so the view looks for them again", () => {
    const pdf = {
      ...score("p", true),
      kind: "pdf" as const,
      pdfBars: [{ page: 1, x: 0, y: 0, w: 1, h: 0.1 }],
    };
    useScoreStore.getState().restore(pdf, []);
    useScoreStore.getState().findPdfBarsAgain();
    expect(useScoreStore.getState().link?.pdfBars).toEqual([]);
    expect(useScoreStore.getState().link?.sync).toEqual([]);
  });

  it("leaves a Guitar Pro tab alone", () => {
    useScoreStore.getState().restore(score("g", true), []);
    useScoreStore.getState().findPdfBarsAgain();
    expect(useScoreStore.getState().link?.sync).toHaveLength(1);
  });
});
