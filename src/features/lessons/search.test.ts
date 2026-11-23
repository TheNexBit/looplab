import { describe, expect, it } from "vitest";
import { litParts, matches, searchWords } from "./search";

describe("lesson search", () => {
  it("takes every word, in any order, case and accents aside", () => {
    const words = searchWords("  Légato   02 ");
    expect(words).toEqual(["legato", "02"]);
    expect(matches("Ambient Pop Exercise 05 Legato 02 · Module 1", words)).toBe(true);
    expect(matches("Ambient Pop Exercise 04 Legato 01", words)).toBe(false);
    expect(matches("02 something LEGATO", words)).toBe(true);
  });

  it("finds a lesson by its course or module too", () => {
    const text =
      "Funk Fusion Exercise 04 Timing MODULE 2 FUNK FUSION AZ_CompletePhrasingEssentials";
    expect(matches(text, searchWords("phrasing timing"))).toBe(true);
  });

  it("lights the searched words in the name, accents kept", () => {
    expect(litParts("Arpège Legato", ["arpege"])).toEqual([
      { text: "Arpège", lit: true },
      { text: " Legato", lit: false },
    ]);
    expect(litParts("Lick 01", [])).toEqual([{ text: "Lick 01", lit: false }]);
  });
});
