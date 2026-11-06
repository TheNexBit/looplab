/**
 * Preferences of this PC, kept in the WebView's local storage. Storage can be missing or
 * blocked: reading then gives nothing and writing does nothing, so the app always starts.
 */

/** The JSON value stored under `key`, or `undefined` if there is none or it cannot be read. */
export function readStored(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Saves `value` as JSON; if storage is unavailable it simply lasts until the app closes. */
export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: nothing to do
  }
}

/** Stored preferences over `fallback`: missing fields keep their default. */
export function readPrefs<T extends object>(key: string, fallback: T): T {
  const stored = readStored(key);
  return stored && typeof stored === "object" ? { ...fallback, ...stored } : fallback;
}
