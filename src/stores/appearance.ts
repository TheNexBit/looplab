import { getCurrentWebview } from "@tauri-apps/api/webview";
import { create } from "zustand";
import {
  type Appearance,
  applyAppearance,
  CORNERS,
  CUSTOM_COLORS,
  type CustomColor,
  type CustomColors,
  DETAIL_HEIGHT,
  FONTS,
  OVERVIEW_HEIGHT,
  OVERVIEW_STEPS,
  UI_SCALE,
} from "@/lib/appearance";
import { isHex } from "@/lib/color";
import { readStored, writeStored } from "@/lib/storage";
import { DEFAULT_THEME, isTheme, THEMES, type ThemeId } from "@/lib/theme";
import { clamp } from "@/lib/time";

const KEY = "looplab.appearance";

export const DEFAULT_APPEARANCE: Appearance = {
  theme: DEFAULT_THEME,
  colors: {},
  font: "inter",
  corners: "normal",
  overviewHeight: OVERVIEW_HEIGHT.default,
  detailHeight: DETAIL_HEIGHT.default,
  uiScale: UI_SCALE.default,
};

const oneOf = <T extends string>(choices: Record<T, unknown>, value: unknown, fallback: T): T =>
  typeof value === "string" && value in choices ? (value as T) : fallback;

/** A height in CSS pixels within its limits; an older file's step name («low»…) is read as its pixels. */
function height(
  value: unknown,
  limits: { min: number; max: number; default: number },
  steps: Record<string, number> = {},
): number {
  const px = typeof value === "string" ? steps[value] : value;
  return typeof px === "number" && Number.isFinite(px)
    ? Math.round(clamp(px, limits.min, limits.max))
    : limits.default;
}

/** Keeps only valid values of a stored appearance (an older or damaged one gets defaults). */
export function sanitizeAppearance(value: unknown): Appearance {
  const stored = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const colors: Appearance["colors"] = {};
  const storedColors = (stored.colors ?? {}) as Record<string, Record<string, unknown>>;
  for (const theme of THEMES) {
    const picked: CustomColors = {};
    for (const color of CUSTOM_COLORS) {
      const hex = storedColors[theme]?.[color];
      if (isHex(hex)) picked[color] = hex;
    }
    if (Object.keys(picked).length > 0) colors[theme] = picked;
  }
  const scale = typeof stored.uiScale === "number" ? stored.uiScale : UI_SCALE.default;
  return {
    theme: isTheme(stored.theme) ? stored.theme : DEFAULT_THEME,
    colors,
    font: oneOf(FONTS, stored.font, DEFAULT_APPEARANCE.font),
    corners: oneOf(CORNERS, stored.corners, DEFAULT_APPEARANCE.corners),
    overviewHeight: height(stored.overviewHeight, OVERVIEW_HEIGHT, OVERVIEW_STEPS),
    detailHeight: height(stored.detailHeight, DETAIL_HEIGHT),
    uiScale: Math.round(clamp(scale, UI_SCALE.min, UI_SCALE.max) * 10) / 10,
  };
}

/** The appearance chosen on this PC. */
export const storedAppearance = (): Appearance => sanitizeAppearance(readStored(KEY));

/** Size of the whole window's content, like Ctrl + / Ctrl − in a browser. */
export function applyUiScale(scale: number) {
  getCurrentWebview()
    .setZoom(scale)
    .catch(() => {
      // Outside the app (tests) there is no webview to zoom
    });
}

interface AppearanceState extends Appearance {
  setTheme: (theme: ThemeId) => void;
  /** A custom colour for the current theme; `null` gives back the theme's own */
  setColor: (color: CustomColor, hex: string | null) => void;
  /** Every custom colour of the current theme back to the theme's own */
  resetColors: () => void;
  update: (
    patch: Partial<
      Pick<Appearance, "font" | "corners" | "overviewHeight" | "detailHeight" | "uiScale">
    >,
  ) => void;
  /** Font, corners, sizes back to default (theme and colours stay) */
  resetLayout: () => void;
}

const pick = ({
  theme,
  colors,
  font,
  corners,
  overviewHeight,
  detailHeight,
  uiScale,
}: Appearance): Appearance => ({
  theme,
  colors,
  font,
  corners,
  overviewHeight,
  detailHeight,
  uiScale,
});

/**
 * Look of this PC, like the Theme menu of Ableton or the theme tweaker of Reaper: applied
 * at once and remembered. Kept apart from the other settings, so "Default values" leaves it alone.
 */
export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const save = (patch: Partial<Appearance>) => {
    const next = sanitizeAppearance({ ...pick(get()), ...patch });
    if (next.uiScale !== get().uiScale) applyUiScale(next.uiScale);
    applyAppearance(next);
    writeStored(KEY, next);
    set(next);
  };
  return {
    ...storedAppearance(),
    setTheme: (theme) => save({ theme }),
    setColor: (color, hex) => {
      const { theme, colors } = get();
      const mine: CustomColors = { ...colors[theme] };
      if (hex) mine[color] = hex;
      else delete mine[color];
      save({ colors: { ...colors, [theme]: mine } });
    },
    resetColors: () => {
      const { theme, colors } = get();
      const rest = { ...colors };
      delete rest[theme];
      save({ colors: rest });
    },
    update: (patch) => save(patch),
    resetLayout: () => {
      const { font, corners, overviewHeight, detailHeight, uiScale } = DEFAULT_APPEARANCE;
      save({ font, corners, overviewHeight, detailHeight, uiScale });
    },
  };
});
