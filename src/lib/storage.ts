/**
 * The UI's preferences, kept in the library (libreria.db) so they are backed up with the rest of
 * the work. `startStorage` gives them all at start (`main.tsx`), before any store reads them;
 * reading is then instant, and each change is sent to the library. If the library is unavailable
 * the app still starts, with the defaults.
 */

/** Sends a change to the library; its promise says when it is written. */
type Persist = (key: string, json: string | null) => unknown;

let values = new Map<string, string>();
let persist: Persist = () => {};

/** Called once at start with the stored values and how to save a change. */
export function startStorage(stored: Record<string, string>, save: Persist) {
  values = new Map(Object.entries(stored));
  persist = save;
}

/** The JSON value stored under `key`, or `undefined` if there is none or it cannot be read. */
export function readStored(key: string): unknown {
  const text = values.get(key);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Saves `value` as JSON (`undefined` removes it); unchanged values are not sent again. */
export function writeStored(key: string, value: unknown) {
  const text = JSON.stringify(value) as string | undefined;
  if (text === undefined) {
    if (!values.delete(key)) return;
    persist(key, null);
    return;
  }
  if (values.get(key) === text) return;
  values.set(key, text);
  persist(key, text);
}

/**
 * Forgets every stored preference but `keep` (the factory state), and resolves once the library
 * has them all written: the app is then reloaded to start from its factory values.
 */
export async function forgetAllBut(keep: ReadonlySet<string>): Promise<void> {
  const gone = [...values.keys()].filter((key) => !keep.has(key));
  for (const key of gone) values.delete(key);
  await Promise.all(gone.map((key) => persist(key, null)));
}

/** Stored preferences over `fallback`: missing fields keep their default. */
export function readPrefs<T extends object>(key: string, fallback: T): T {
  const stored = readStored(key);
  return stored && typeof stored === "object" ? { ...fallback, ...stored } : fallback;
}
