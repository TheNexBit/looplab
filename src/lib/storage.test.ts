import { beforeEach, describe, expect, it } from "vitest";
import { readPrefs, readStored, writeStored } from "./storage";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
  } as Storage;
});

describe("stored preferences", () => {
  it("round-trips JSON and fills missing fields from the defaults", () => {
    writeStored("p", { a: 2 });
    expect(readStored("p")).toEqual({ a: 2 });
    expect(readPrefs("p", { a: 1, b: true })).toEqual({ a: 2, b: true });
  });

  it("falls back on missing or damaged values", () => {
    expect(readStored("none")).toBeUndefined();
    memory.set("bad", "{not json");
    expect(readPrefs("bad", { a: 1 })).toEqual({ a: 1 });
    memory.set("number", "300");
    expect(readPrefs("number", { a: 1 })).toEqual({ a: 1 });
  });
});
