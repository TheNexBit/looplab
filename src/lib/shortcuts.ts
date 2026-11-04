import { t } from "@/i18n";

/**
 * Single registry of keyboard shortcuts. Each combo is written as
 * modifiers + key joined by "+", e.g. "Ctrl+K", "Shift+ArrowUp".
 * Labels come from `t.shortcuts` under the same id.
 */
export const shortcuts = {
  playPause: "Space",
  seekBack: "ArrowLeft",
  seekForward: "ArrowRight",
  loopStart: "[",
  loopEnd: "]",
  loopToggle: "L",
  addMarker: "M",
  addSection: "S",
  speedUp: "+",
  speedDown: "-",
  pitchUp: "Shift+ArrowUp",
  pitchDown: "Shift+ArrowDown",
  commandPalette: "Ctrl+K",
  openFile: "Ctrl+O",
} as const satisfies Record<keyof typeof t.shortcuts, string>;

export type ShortcutId = keyof typeof shortcuts;

const keySymbols: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ...t.keys,
};

/** Splits a shortcut into display-ready key caps, e.g. "Shift+ArrowUp" → ["Maiusc", "↑"]. */
export function shortcutKeys(id: ShortcutId): string[] {
  // "+" alone is a key, not a separator
  const combo: string = shortcuts[id];
  const parts = combo === "+" ? ["+"] : combo.split("+");
  return parts.map((key) => keySymbols[key] ?? key);
}

export function shortcutLabel(id: ShortcutId): string {
  return t.shortcuts[id];
}
