import { t } from "@/i18n";

/**
 * Single registry of keyboard shortcuts and their default keys. Each combo is written as
 * modifiers + key joined by "+", e.g. "Ctrl+K", "Shift+ArrowUp", "Ctrl++".
 * Keys are `KeyboardEvent.key` values ("Space" stands for " "); "" means no key.
 * Labels come from `t.shortcuts` under the same id. The keys in use can be changed in the
 * settings (`stores/keymap.ts`), which calls `setActiveShortcuts`.
 */
export const shortcuts = {
  playPause: "Space",
  seekBack: "ArrowLeft",
  seekForward: "ArrowRight",
  seekBackFine: "Shift+ArrowLeft",
  seekForwardFine: "Shift+ArrowRight",
  // Start and end of the track, as Home and End in Reaper and Ableton
  goToStart: "Home",
  goToEnd: "End",
  loopStart: "[",
  loopEnd: "]",
  loopToggle: "L",
  clearLoop: "Escape",
  toggleSnap: "G",
  toggleFollow: "F",
  // Reaper's "Continuous scrolling" toggle: no key by default, assignable in the settings
  toggleContinuousScroll: "",
  addMarker: "M",
  // Reaper's "insert tempo marker"
  addTempoMarker: "Shift+C",
  addBeat: "B",
  // S opens a section, S again closes it (Esc drops it), like recording a region
  addSection: "S",
  // The loop becomes a section, like Reaper's "insert region from time selection"
  sectionFromLoop: "Shift+S",
  previousMarker: ",",
  nextMarker: ".",
  speedUp: "+",
  speedDown: "-",
  pitchUp: "Shift+ArrowUp",
  pitchDown: "Shift+ArrowDown",
  zoomIn: "Ctrl++",
  zoomOut: "Ctrl+-",
  // Whole track on screen and back, like Reaper's zoom to project
  zoomToTrack: "Z",
  zoomToLoop: "Shift+Z",
  // The loop moves by its own length (the next phrase), like Ableton's Ctrl+arrows
  loopShiftBack: "Ctrl+ArrowLeft",
  loopShiftForward: "Ctrl+ArrowRight",
  loopDouble: "Ctrl+ArrowUp",
  loopHalve: "Ctrl+ArrowDown",
  togglePlaylist: "",
  // A slim bar always on top of other programs, like a media player's mini mode
  toggleMini: "Ctrl+M",
  // The metronome on its own, also without a track
  toggleMetronomeMode: "Ctrl+Shift+M",
  commandPalette: "Ctrl+K",
  openSettings: "Ctrl+,",
  openFile: "Ctrl+O",
  undo: "Ctrl+Z",
  redo: "Ctrl+Y",
  saveLoop: "Shift+L",
  tapTempo: "T",
  setDownbeat: "Shift+T",
  toggleMetronome: "K",
  toggleCountIn: "",
  // Render, as in Reaper
  exportAudio: "Ctrl+Alt+R",
  toggleNotes: "N",
  // Number keys: the saved loops, in their order; with Alt, the sections
  recallLoop1: "1",
  recallLoop2: "2",
  recallLoop3: "3",
  recallLoop4: "4",
  recallLoop5: "5",
  recallLoop6: "6",
  recallLoop7: "7",
  recallLoop8: "8",
  recallLoop9: "9",
  recallSection1: "Alt+1",
  recallSection2: "Alt+2",
  recallSection3: "Alt+3",
  recallSection4: "Alt+4",
  recallSection5: "Alt+5",
  recallSection6: "Alt+6",
  recallSection7: "Alt+7",
  recallSection8: "Alt+8",
  recallSection9: "Alt+9",
  // Camera angles of a lesson (the plain numbers are the saved loops)
  angle1: "Ctrl+1",
  angle2: "Ctrl+2",
  angle3: "Ctrl+3",
  angle4: "Ctrl+4",
  angle5: "Ctrl+5",
  angle6: "Ctrl+6",
  angle7: "Ctrl+7",
  angle8: "Ctrl+8",
  angle9: "Ctrl+9",
  nextAngle: "V",
  toggleHome: "Ctrl+L",
  // Light or dark paper under the score, and the overview strip on / off
  toggleScorePaper: "Shift+P",
  toggleOverview: "Shift+O",
  // The next tab of the lesson (.gp or PDF), each with its own sync
  nextTab: "Alt+T",
  // The lessons of a course in their order, like a playlist's previous / next
  previousLesson: "Alt+ArrowLeft",
  nextLesson: "Alt+ArrowRight",
  toggleLessonDone: "",
} as const satisfies Record<keyof typeof t.shortcuts, string>;

export type ShortcutId = keyof typeof shortcuts;
export type Keymap = Record<ShortcutId, string>;

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

let parsed = parseAll(shortcuts);

function parseAll(keymap: Keymap): Record<ShortcutId, Combo | null> {
  return Object.fromEntries(
    Object.entries(keymap).map(([id, combo]) => [id, combo ? parse(combo) : null]),
  ) as Record<ShortcutId, Combo | null>;
}

/** Makes `keymap` the keys that `matchShortcut` and `shortcutKeys` use. */
export function setActiveShortcuts(keymap: Keymap) {
  parsed = parseAll(keymap);
}

/** Keys that also work, fixed: the media keys of keyboards and of many pedals. */
const MEDIA_KEYS: Record<string, ShortcutId> = {
  MediaPlayPause: "playPause",
  MediaStop: "playPause",
  MediaTrackNext: "nextMarker",
  MediaTrackPrevious: "previousMarker",
};

const keySymbols: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  ...t.keys,
};

/** Splits a shortcut into display-ready key caps, e.g. "Shift+ArrowUp" → ["Maiusc", "↑"]. */
export function shortcutKeys(id: ShortcutId): string[] {
  return comboKeys(parsed[id]);
}

/** Display-ready key caps of a combo string; empty when it has no key. */
export function comboCaps(combo: string): string[] {
  return comboKeys(combo ? parse(combo) : null);
}

function comboKeys(combo: Combo | null): string[] {
  if (!combo) return [];
  const { ctrl, shift, alt, key } = combo;
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
  for (const [id, combo] of Object.entries(parsed) as [ShortcutId, Combo | null][]) {
    if (!combo || combo.key.toLowerCase() !== key.toLowerCase()) continue;
    if (combo.ctrl !== ctrl || combo.alt !== alt) continue;
    // Symbols like "+" or "[" need Shift on some keyboard layouts and not on others
    if (!isSymbol(key) && combo.shift !== event.shiftKey) continue;
    return id;
  }
  return MEDIA_KEYS[key] ?? null;
}

const MODIFIERS = [
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Dead",
  "Unidentified",
];

/**
 * The combo string a key press would be saved as ("Ctrl+K", "Space", "PageDown"), or null
 * while only modifiers are held. Symbols keep the modifiers they need to be typed (AltGr,
 * Shift) out of the combo, as `matchShortcut` ignores those for symbols.
 */
export function comboFromEvent(event: KeyEventLike): string | null {
  if (MODIFIERS.includes(event.key)) return null;
  const key = event.key === " " ? "Space" : event.key;
  const symbol = isSymbol(key);
  const altGraph = symbol && (event.getModifierState?.("AltGraph") ?? false);
  const parts: string[] = [];
  if (!altGraph && (event.ctrlKey || event.metaKey)) parts.push("Ctrl");
  if (!symbol && event.shiftKey) parts.push("Shift");
  if (!altGraph && event.altKey) parts.push("Alt");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}
