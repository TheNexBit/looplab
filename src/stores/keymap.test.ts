import { beforeEach, describe, expect, it } from "vitest";
import { comboFromEvent, matchShortcut } from "@/lib/shortcuts";
import { useKeymapStore } from "./keymap";

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean } = {}) => ({
  key,
  ctrlKey: mods.ctrl ?? false,
  metaKey: false,
  shiftKey: mods.shift ?? false,
  altKey: false,
});

describe("custom keys", () => {
  beforeEach(() => useKeymapStore.getState().resetAll());

  it("moves an action to a new key", () => {
    useKeymapStore.getState().setKey("loopToggle", "PageDown");
    expect(matchShortcut(press("PageDown"))).toBe("loopToggle");
    expect(matchShortcut(press("l"))).toBeNull();
  });

  it("takes the key away from the action that had it", () => {
    const loser = useKeymapStore.getState().setKey("loopToggle", "M");
    expect(loser).toBe("addMarker");
    expect(useKeymapStore.getState().keys.addMarker).toBe("");
    expect(matchShortcut(press("m"))).toBe("loopToggle");
  });

  it("can leave an action without a key and restore every default", () => {
    useKeymapStore.getState().setKey("playPause", "");
    expect(matchShortcut(press(" "))).toBeNull();
    useKeymapStore.getState().resetAll();
    expect(matchShortcut(press(" "))).toBe("playPause");
  });

  it("keeps media keys working whatever the settings", () => {
    useKeymapStore.getState().setKey("playPause", "");
    expect(matchShortcut(press("MediaPlayPause"))).toBe("playPause");
  });

  it("gives a MIDI trigger to one action only", () => {
    const { setMidi } = useKeymapStore.getState();
    setMidi("playPause", "cc:1:64");
    setMidi("loopToggle", "cc:1:64");
    expect(useKeymapStore.getState().midi).toEqual({ loopToggle: "cc:1:64" });
  });
});

describe("comboFromEvent", () => {
  it("records keys with their modifiers", () => {
    expect(comboFromEvent(press("k", { ctrl: true }))).toBe("Ctrl+K");
    expect(comboFromEvent(press(" "))).toBe("Space");
    expect(comboFromEvent(press("ArrowUp", { shift: true }))).toBe("Shift+ArrowUp");
    expect(comboFromEvent(press("+", { ctrl: true, shift: true }))).toBe("Ctrl++");
  });

  it("waits while only modifiers are held", () => {
    expect(comboFromEvent(press("Control", { ctrl: true }))).toBeNull();
    expect(comboFromEvent(press("Shift", { shift: true }))).toBeNull();
  });
});
