/** Tokens of `styles/theme.css` that canvas drawing reads. */
export type ThemeToken =
  | "accent"
  | "fg"
  | "fg-muted"
  | "fg-subtle"
  | "border"
  | "wave"
  | "wave-dim"
  | "grid"
  | "tick"
  | "beat"
  | "bar"
  | "key-white"
  | "key-black"
  | "on-accent";

/** Colour themes; each id has a palette block `[data-theme="<id>"]` in `styles/theme.css`. */
export const THEMES = [
  "rack",
  "phosphor",
  "night",
  "sunset",
  "abyss",
  "tubes",
  "oled",
  "light",
  "paper",
  "contrast",
] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = "rack";

export const isTheme = (value: unknown): value is ThemeId =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

const cache = new Map<ThemeToken, string>();
const listeners = new Set<() => void>();

/**
 * Reads a theme token from `styles/theme.css` for code that cannot use classes (canvas).
 * Each token is read from the page once per theme: `getComputedStyle` is costly and the
 * waveforms draw up to 60 times a second.
 */
export function themeColor(token: ThemeToken): string {
  let color = cache.get(token);
  if (color === undefined) {
    color = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
    // An empty value means the styles are not loaded yet: ask again next time
    if (color) cache.set(token, color);
  }
  return color;
}

/** Switches the whole window to `theme`; canvases are told to redraw with the new colours. */
export function applyTheme(theme: ThemeId) {
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  refreshThemeColors();
}

/** Colours changed on the page (a theme or a custom colour): canvases read them again. */
export function refreshThemeColors() {
  cache.clear();
  for (const listener of listeners) listener();
}

/** Calls `listener` after every theme change; returns the function that stops it. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
