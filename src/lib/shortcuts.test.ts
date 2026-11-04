import { describe, expect, it } from "vitest";
import { type ShortcutId, shortcutKeys, shortcuts } from "./shortcuts";

describe("shortcuts registry", () => {
  it("never assigns the same combo twice", () => {
    const combos = Object.values(shortcuts).map((combo) => combo.toLowerCase());
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("formats keys for display", () => {
    expect(shortcutKeys("pitchUp")).toEqual(["Maiusc", "↑"]);
    expect(shortcutKeys("speedUp")).toEqual(["+"]);
    expect(shortcutKeys("commandPalette")).toEqual(["Ctrl", "K"]);
  });

  it("has a label for every shortcut", async () => {
    const { t } = await import("@/i18n");
    for (const id of Object.keys(shortcuts) as ShortcutId[]) {
      expect(t.shortcuts[id]).toBeTruthy();
    }
  });
});
