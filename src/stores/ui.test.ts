import { describe, expect, it, vi } from "vitest";

/** The UI store as a fresh start of the app would load it from the library's `saved` values. */
async function freshStart(saved: Record<string, string>) {
  vi.resetModules();
  const { startStorage } = await import("@/lib/storage");
  startStorage({ ...saved }, (key, json) => {
    if (json === null) delete saved[key];
    else saved[key] = json;
  });
  return (await import("./ui")).useUiStore;
}

describe("side panel", () => {
  it("comes back closed, on its tab, after the app is closed and opened again", async () => {
    const library: Record<string, string> = {};
    const first = await freshStart(library);
    expect(first.getState().sidePanelOpen).toBe(true);
    first.getState().setSidePanelTab("eq");
    first.getState().toggleSidePanel();

    const second = await freshStart(library);
    expect(second.getState().sidePanelOpen).toBe(false);
    expect(second.getState().sidePanelTab).toBe("eq");
  });

  it("opens on the sections when nothing was saved or the saved tab is unknown", async () => {
    const ui = await freshStart({ "looplab.sidePanelTab": JSON.stringify("gone") });
    expect(ui.getState().sidePanelOpen).toBe(true);
    expect(ui.getState().sidePanelTab).toBe("sections");
  });
});
