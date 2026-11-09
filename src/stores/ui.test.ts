import { afterEach, describe, expect, it, vi } from "vitest";

/** A localStorage that lives in memory, standing in for the WebView's. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

/** The UI store as a fresh start of the app would load it. */
async function freshStart() {
  vi.resetModules();
  return (await import("./ui")).useUiStore;
}

describe("side panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comes back closed, on its tab, after the app is closed and opened again", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const first = await freshStart();
    expect(first.getState().sidePanelOpen).toBe(true);
    first.getState().setSidePanelTab("eq");
    first.getState().toggleSidePanel();

    const second = await freshStart();
    expect(second.getState().sidePanelOpen).toBe(false);
    expect(second.getState().sidePanelTab).toBe("eq");
  });

  it("opens on the sections when nothing was saved or the saved tab is unknown", async () => {
    const storage = memoryStorage();
    storage.setItem("looplab.sidePanelTab", JSON.stringify("gone"));
    vi.stubGlobal("localStorage", storage);
    const ui = await freshStart();
    expect(ui.getState().sidePanelOpen).toBe(true);
    expect(ui.getState().sidePanelTab).toBe("sections");
  });
});
