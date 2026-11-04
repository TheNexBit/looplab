/** Reads a theme token from `styles/theme.css` for code that cannot use classes (canvas). */
export function themeColor(token: "accent" | "fg" | "fg-muted" | "fg-subtle" | "border"): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
}
