import { describe, expect, it } from "vitest";
import { en } from "./en";

/** Common Italian words that never belong in an English sentence. */
const ITALIAN =
  /\b(il|lo|gli|della|delle|dello|degli|nel|nella|che|non|con|una|anche|oppure|questo|questa|brano|brani|traccia|tracce|sezione|sezioni|velocità|tonalità|lezione|lezioni|scaletta|cartella|apri|chiudi|salva|nessun[ao]?)\b|[àèéìòù]/i;

/** Names that stay Italian on purpose: folders on disk and the language picker. */
const ALLOWED = new Set(["settings.language", "settings.choices.language.it"]);

/** Every text of a strings object (functions called with sample arguments), by its path. */
function texts(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (typeof value === "function") {
    const sample = (value as (...args: unknown[]) => unknown)(2, 3, "x", 4);
    return typeof sample === "string" ? [[path.join("."), sample]] : [];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => texts(inner, [...path, key]));
  }
  return [];
}

describe("English strings", () => {
  it("hold no Italian words left over from the translation", () => {
    const leftovers = texts(en).filter(([path, text]) => !ALLOWED.has(path) && ITALIAN.test(text));
    expect(leftovers).toEqual([]);
  });
});
