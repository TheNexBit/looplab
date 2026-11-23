import { beforeEach, describe, expect, it } from "vitest";
import { forgetAllBut, readPrefs, readStored, startStorage, writeStored } from "./storage";

const saved: [string, string | null][] = [];
beforeEach(() => {
  saved.length = 0;
  startStorage({ bad: "{not json", number: "300" }, (key, json) => void saved.push([key, json]));
});

describe("stored preferences", () => {
  it("round-trips JSON and fills missing fields from the defaults", () => {
    writeStored("p", { a: 2 });
    expect(readStored("p")).toEqual({ a: 2 });
    expect(readPrefs("p", { a: 1, b: true })).toEqual({ a: 2, b: true });
    expect(saved).toEqual([["p", '{"a":2}']]);
  });

  it("falls back on missing or damaged values", () => {
    expect(readStored("none")).toBeUndefined();
    expect(readPrefs("bad", { a: 1 })).toEqual({ a: 1 });
    expect(readPrefs("number", { a: 1 })).toEqual({ a: 1 });
  });

  it("sends only real changes to the library", () => {
    writeStored("number", 300);
    writeStored("x", true);
    writeStored("x", true);
    writeStored("x", undefined);
    writeStored("x", undefined);
    expect(saved).toEqual([
      ["x", "true"],
      ["x", null],
    ]);
  });

  it("a factory reset forgets every preference but those kept, in the library too", async () => {
    writeStored("looplab.settings", { a: 1 });
    writeStored("looplab.metronomeLibrary", [1]);
    saved.length = 0;
    await forgetAllBut(new Set(["looplab.metronomeLibrary"]));
    expect(readStored("looplab.settings")).toBeUndefined();
    expect(readStored("number")).toBeUndefined();
    expect(readStored("looplab.metronomeLibrary")).toEqual([1]);
    expect(saved).toContainEqual(["looplab.settings", null]);
    expect(saved).not.toContainEqual(["looplab.metronomeLibrary", null]);
  });
});
