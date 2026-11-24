import { readStored } from "@/lib/storage";
import { en } from "./en";
import { it } from "./it";
import { systemLanguage, type UiLanguage } from "./system";

/** A translation's text: every key and function of the Italian strings, any wording. */
type Widen<T> = T extends string
  ? string
  : T extends boolean
    ? boolean
    : T extends (...args: infer A) => infer R
      ? (...args: A) => Widen<R>
      : T extends readonly (infer U)[]
        ? readonly Widen<U>[]
        : T extends object
          ? { readonly [K in keyof T]: Widen<T[K]> }
          : T;

/** Shape every translation must follow, derived from the Italian strings. */
export type Strings = Widen<typeof it>;

/** Settings key the language is read from (the settings store writes it there). */
const SETTINGS_KEY = "looplab.settings";

/**
 * The language chosen in Settings, read once at start, before any string is used: every
 * module keeps its strings, so a change takes effect by reloading the window.
 */
function chosenLanguage(): UiLanguage {
  // The settings live in the library (lib/storage.ts), loaded before any module reads them
  const stored = readStored(SETTINGS_KEY) as { language?: unknown } | undefined;
  if (stored?.language === "en" || stored?.language === "it") return stored.language;
  return systemLanguage();
}

export const language = chosenLanguage();

/** Active UI strings. */
export const t: Strings = language === "en" ? en : it;
