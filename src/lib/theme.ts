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
  | "bar";

/** Reads a theme token from `styles/theme.css` for code that cannot use classes (canvas). */
export function themeColor(token: ThemeToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
}
