import { en } from "./en";
import { it } from "./it";

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
function chosenLanguage(): "it" | "en" {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? "null");
    return stored?.language === "en" ? "en" : "it";
  } catch {
    return "it";
  }
}

export const language = chosenLanguage();

/** Active UI strings. */
export const t: Strings = language === "en" ? en : it;
