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

const cache = new Map<ThemeToken, string>();

/**
 * Reads a theme token from `styles/theme.css` for code that cannot use classes (canvas).
 * The theme never changes while the app runs, so each token is read from the page once:
 * `getComputedStyle` is costly and the waveforms draw up to 60 times a second.
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
