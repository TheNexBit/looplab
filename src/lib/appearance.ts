import { lighten, textOn, withAlpha } from "./color";
import { applyTheme, refreshThemeColors, type ThemeId } from "./theme";

/**
 * The colours one can change on top of a theme, like Reaper's theme tweaker. Each one also
 * sets the shades made from it (hover, soft background, glow), so a single pick is enough.
 */
export const CUSTOM_COLORS = ["accent", "wave", "loop", "playhead", "cue", "lcd", "bar"] as const;
export type CustomColor = (typeof CUSTOM_COLORS)[number];
export type CustomColors = Partial<Record<CustomColor, string>>;

/** The CSS variables set by each custom colour `hex`. */
function variablesOf(color: CustomColor, hex: string): Record<string, string> {
  switch (color) {
    case "accent":
      return {
        "--color-accent": hex,
        "--color-accent-hover": lighten(hex, 0.15),
        "--color-accent-soft": withAlpha(hex, 0.14),
        "--color-on-accent": textOn(hex),
      };
    case "wave":
      return { "--color-wave": hex, "--color-wave-dim": lighten(hex, -0.25) };
    case "loop":
      return { "--color-loop": hex, "--color-loop-soft": withAlpha(hex, 0.08) };
    case "playhead":
      return { "--color-playhead": hex };
    case "cue":
      return { "--color-cue": hex };
    case "lcd":
      return {
        "--color-lcd-fg": hex,
        "--color-lcd-dim": lighten(hex, -0.3),
        "--color-lcd-glow": withAlpha(hex, 0.45),
      };
    case "bar":
      return { "--color-bar": withAlpha(hex, 0.5), "--color-beat": withAlpha(hex, 0.14) };
  }
}

/** Every CSS variable set by `colors`. */
export function colorVariables(colors: CustomColors): Record<string, string> {
  const result: Record<string, string> = {};
  for (const color of CUSTOM_COLORS) {
    const hex = colors[color];
    if (hex) Object.assign(result, variablesOf(color, hex));
  }
  return result;
}

/** Typefaces of the interface (the numbers on the displays stay monospaced). */
export const FONTS = {
  inter: '"Inter Variable", system-ui, "Segoe UI", sans-serif',
  system: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, Consolas, monospace',
} as const;
export type FontId = keyof typeof FONTS;

/** Corners of keys and panels: [keys, panels]. */
export const CORNERS = {
  square: ["0px", "1px"],
  normal: ["3px", "4px"],
  round: ["6px", "9px"],
} as const;
export type CornersId = keyof typeof CORNERS;

/** Height of the overview strip, in CSS pixels: its bottom edge drags it, the settings offer steps. */
export const OVERVIEW_HEIGHT = { min: 36, max: 240, default: 56 } as const;
export const OVERVIEW_STEPS = { low: 36, normal: 56, tall: 88 } as const;
export type OverviewStep = keyof typeof OVERVIEW_STEPS;
/**
 * Least height of the detailed waveform, ruler included (CSS pixels): its bottom edge drags it.
 * Score and video give way before it goes below; with room to spare it grows.
 */
export const DETAIL_HEIGHT = { min: 96, max: 600, default: 140 } as const;

/** Size of the whole interface, like the zoom of a browser. */
export const UI_SCALE = { min: 0.8, max: 1.5, step: 0.1, default: 1 } as const;

export interface Appearance {
  theme: ThemeId;
  /** Changes on top of each theme, kept per theme (switching back finds them again) */
  colors: Partial<Record<ThemeId, CustomColors>>;
  font: FontId;
  corners: CornersId;
  /** CSS pixels, within `OVERVIEW_HEIGHT` */
  overviewHeight: number;
  /** CSS pixels, within `DETAIL_HEIGHT` */
  detailHeight: number;
  uiScale: number;
}

/** The CSS variables that `appearance` sets on the page, over the theme's palette. */
export function appearanceVariables(appearance: Appearance): Record<string, string> {
  const [control, panel] = CORNERS[appearance.corners];
  return {
    ...colorVariables(appearance.colors[appearance.theme] ?? {}),
    "--font-sans": FONTS[appearance.font],
    "--radius-control": control,
    "--radius-panel": panel,
  };
}

/** Variables set by the last `applyAppearance`, so the ones no longer wanted are removed. */
let applied: string[] = [];

/**
 * Applies the theme, custom colours, font and corners to the whole window. They are inline
 * variables on <html>, which win over the palettes; previews carry their own `data-theme`.
 */
export function applyAppearance(appearance: Appearance) {
  applyTheme(appearance.theme);
  const style = document.documentElement.style;
  const variables = appearanceVariables(appearance);
  for (const name of applied) if (!(name in variables)) style.removeProperty(name);
  for (const [name, value] of Object.entries(variables)) style.setProperty(name, value);
  applied = Object.keys(variables);
  refreshThemeColors();
}
