import { t } from "@/i18n";

/**
 * Single registry of keyboard shortcuts. Each combo is written as
 * modifiers + key joined by "+", e.g. "Ctrl+K", "Shift+ArrowUp", "Ctrl++".
 * Keys are `KeyboardEvent.key` values ("Space" stands for " ").
 * Labels come from `t.shortcuts` under the same id.
 */
export const shortcuts = {
  playPause: "Space",
  seekBack: "ArrowLeft",
  seekForward: "ArrowRight",
  seekBackFine: "Shift+ArrowLeft",
  seekForwardFine: "Shift+ArrowRight",
  loopStart: "[",
  loopEnd: "]",
  loopToggle: "L",
  addMarker: "M",
  addBeat: "B",
  addSection: "S",
  previousMarker: ",",
  nextMarker: ".",
  speedUp: "+",
  speedDown: "-",
  pitchUp: "Shift+ArrowUp",
  pitchDown: "Shift+ArrowDown",
  zoomIn: "Ctrl++",
  zoomOut: "Ctrl+-",
  commandPalette: "Ctrl+K",
  openSettings: "Ctrl+,",
  openFile: "Ctrl+O",
} as const satisfies Record<keyof typeof t.shortcuts, string>;

export type ShortcutId = keyof typeof shortcuts;

interface Combo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parse(combo: string): Combo {
  const parts = combo.split("+");
  // A trailing "+" is the plus key itself: "Ctrl++" splits into ["Ctrl", "", ""]
  const key = parts.at(-1) === "" ? "+" : (parts.at(-1) ?? "");
  const modifiers = parts.slice(0, key === "+" ? -2 : -1);
  return {
    ctrl: modifiers.includes("Ctrl"),
    shift: modifiers.includes("Shift"),
    alt: modifiers.includes("Alt"),
    key,
  };
}

const parsed = Object.fromEntries(
  Object.entries(shortcuts).map(([id, combo]) => [id, parse(combo)]),
) as Record<ShortcutId, Combo>;

const keySymbols: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ...t.keys,
};

/** Splits a shortcut into display-ready key caps, e.g. "Shift+ArrowUp" → ["Maiusc", "↑"]. */
export function shortcutKeys(id: ShortcutId): string[] {
  const { ctrl, shift, alt, key } = parsed[id];
  const caps = [ctrl && "Ctrl", shift && "Shift", alt && "Alt", key].filter((cap): cap is string =>
    Boolean(cap),
  );
  return caps.map((cap) => keySymbols[cap] ?? cap);
}

export function shortcutLabel(id: ShortcutId): string {
  return t.shortcuts[id];
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> &
  Partial<Pick<KeyboardEvent, "getModifierState">>;

const isSymbol = (key: string) => key.length === 1 && key.toLowerCase() === key.toUpperCase();

/** The shortcut a key press triggers, if any. */
export function matchShortcut(event: KeyEventLike): ShortcutId | null {
  const key = event.key === " " ? "Space" : event.key;
  // AltGr types symbols on many layouts (Italian "[" is AltGr+è) and Windows reports it as
  // Ctrl+Alt: for a symbol typed that way, those modifiers are part of the character
  const altGraph = isSymbol(key) && (event.getModifierState?.("AltGraph") ?? false);
  const ctrl = !altGraph && (event.ctrlKey || event.metaKey);
  const alt = !altGraph && event.altKey;
  for (const [id, combo] of Object.entries(parsed) as [ShortcutId, Combo][]) {
    if (combo.key.toLowerCase() !== key.toLowerCase()) continue;
    if (combo.ctrl !== ctrl || combo.alt !== alt) continue;
    // Symbols like "+" or "[" need Shift on some keyboard layouts and not on others
    if (!isSymbol(key) && combo.shift !== event.shiftKey) continue;
    return id;
  }
  return null;
}
