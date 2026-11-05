import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import { matchShortcut, type ShortcutId, shortcutKeys, shortcuts } from "./shortcuts";

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  matchShortcut({
    key,
    ctrlKey: mods.ctrl ?? false,
    metaKey: false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });

describe("shortcuts registry", () => {
  it("never assigns the same combo twice", () => {
    const combos = Object.values(shortcuts).map((combo) => combo.toLowerCase());
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("formats keys for display", () => {
    expect(shortcutKeys("pitchUp")).toEqual(["Maiusc", "↑"]);
    expect(shortcutKeys("speedUp")).toEqual(["+"]);
    expect(shortcutKeys("zoomIn")).toEqual(["Ctrl", "+"]);
    expect(shortcutKeys("commandPalette")).toEqual(["Ctrl", "K"]);
  });

  it("has a label for every shortcut", () => {
    for (const id of Object.keys(shortcuts) as ShortcutId[]) {
      expect(t.shortcuts[id]).toBeTruthy();
    }
  });
});

describe("matchShortcut", () => {
  it("matches plain keys, letters in any case and Space", () => {
    expect(press(" ")).toBe("playPause");
    expect(press("l")).toBe("loopToggle");
    expect(press("L", { shift: false })).toBe("loopToggle");
    expect(press("ArrowLeft")).toBe("seekBack");
  });

  it("tells modified keys apart", () => {
    expect(press("ArrowLeft", { shift: true })).toBe("seekBackFine");
    expect(press("+", { ctrl: true })).toBe("zoomIn");
    expect(press("o", { ctrl: true })).toBe("openFile");
    expect(press("o")).toBeNull();
  });

  it("accepts symbols typed with AltGr, which Windows reports as Ctrl+Alt", () => {
    const altGr = (key: string) =>
      matchShortcut({
        key,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: true,
        getModifierState: (state) => state === "AltGraph",
      });
    expect(altGr("[")).toBe("loopStart");
    expect(altGr("]")).toBe("loopEnd");
  });

  it("ignores Shift on symbols, whose position depends on the keyboard layout", () => {
    expect(press("+", { shift: true })).toBe("speedUp");
    expect(press("+")).toBe("speedUp");
  });
});
