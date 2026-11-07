import { describe, expect, it } from "vitest";
import { A_NOTE, italianName, noteHz, openStrings } from "./reference";

describe("reference notes", () => {
  it("tunes from the chosen A", () => {
    expect(noteHz(A_NOTE, 440)).toBe(440);
    expect(noteHz(A_NOTE, 432)).toBe(432);
    // Low E of a guitar
    expect(noteHz(40, 440)).toBeCloseTo(82.41, 2);
  });

  it("gives the open strings of each tuning, lowest first", () => {
    expect(openStrings("guitar", "standard").map(italianName)).toEqual([
      "Mi",
      "La",
      "Re",
      "Sol",
      "Si",
      "Mi",
    ]);
    expect(openStrings("guitar", "eFlat").map(italianName)).toEqual([
      "Mi♭",
      "La♭",
      "Re♭",
      "Sol♭",
      "Si♭",
      "Mi♭",
    ]);
    expect(openStrings("guitar", "dropD")).toEqual([38, 45, 50, 55, 59, 64]);
    expect(openStrings("bass", "dropD")).toEqual([26, 33, 38, 43]);
  });
});
