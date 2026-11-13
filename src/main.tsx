import { commands } from "@/lib/bindings";
import { startStorage } from "@/lib/storage";

/**
 * The preferences of the library, and once those an older version kept in the WebView's local
 * storage (imported, then cleared there). Without the library the app starts with the defaults.
 */
async function storedPrefs(): Promise<Record<string, string>> {
  const result = await commands.loadPrefs();
  if (result.status === "error") return {};
  if (result.data.imported) return result.data.values;
  const old: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key === null ? null : localStorage.getItem(key);
      if (key !== null && value !== null) old[key] = value;
    }
  } catch {
    // No local storage: nothing to import
  }
  const imported = await commands.importPrefs(old);
  if (imported.status === "error") return result.data.values;
  try {
    localStorage.clear();
  } catch {
    // Nothing to clear
  }
  return imported.data.values;
}

// The stores read their preferences when their modules load: the rest of the app is imported
// only once the preferences are here
storedPrefs()
  .catch(() => ({}))
  .then((values) => {
    startStorage(values, (key, json) => void commands.setPref(key, json));
    return import("./boot");
  });
