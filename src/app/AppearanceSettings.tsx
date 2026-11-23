import { Check, Pipette, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { Stepper } from "@/components/ui/Stepper";
import { t } from "@/i18n";
import {
  CORNERS,
  CUSTOM_COLORS,
  type CustomColor,
  colorVariables,
  FONTS,
  OVERVIEW_HEIGHTS,
  UI_SCALE,
} from "@/lib/appearance";
import { cn } from "@/lib/cn";
import { isHex } from "@/lib/color";
import { formatPercent } from "@/lib/format";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useAppearanceStore } from "@/stores/appearance";
import { useSettingsStore } from "@/stores/settings";
import { SettingGroup, SettingRow } from "./SettingLayout";

const a = t.settings.appearance;

/** Ready colours for a quick pick, like the colour palettes of track colours in a DAW. */
const SWATCHES = [
  "#ffa726",
  "#ff7043",
  "#ef5350",
  "#ec407a",
  "#ab47bc",
  "#7e8cff",
  "#42a5f5",
  "#26c6da",
  "#26a69a",
  "#66bb6a",
  "#c0ca33",
  "#ffee58",
  "#f5f5f5",
  "#9e9e9e",
] as const;

/** The theme variable each custom colour shows when it is not changed. */
const THEME_VARIABLE: Record<CustomColor, string> = {
  accent: "--color-accent",
  wave: "--color-wave",
  loop: "--color-loop",
  playhead: "--color-playhead",
  cue: "--color-cue",
  lcd: "--color-lcd-fg",
  bar: "--color-bar",
};

/** The colour now on screen for `color`, as hex for the system colour picker. */
function shownColor(color: CustomColor): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(THEME_VARIABLE[color])
    .trim();
  return isHex(value) ? value : "#ffffff";
}

/**
 * A small picture of the app in `theme`: the card carries `data-theme`, so everything
 * inside it takes that theme's colours (with its custom ones) whatever theme the window is in.
 */
function ThemeCard({ theme, selected }: { theme: ThemeId; selected: boolean }) {
  const { name, description } = a.themes[theme];
  const custom = useAppearanceStore((s) => s.colors[theme]);
  return (
    <button
      type="button"
      data-theme={theme}
      aria-pressed={selected}
      style={colorVariables(custom ?? {}) as CSSProperties}
      onClick={() => useAppearanceStore.getState().setTheme(theme)}
      className={cn(
        "flex flex-col overflow-hidden rounded-panel border bg-bg-to text-left text-fg transition-[border-color,box-shadow]",
        selected
          ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-edge hover:border-accent/60",
      )}
    >
      {/* Top bar, waveform with a loop, dock with the display and two keys */}
      <div className="h-3 bg-[linear-gradient(var(--color-topbar-from),var(--color-topbar-to))]" />
      <div className="relative h-12 bg-stage p-1.5">
        <div className="well relative size-full overflow-hidden rounded-control">
          <div className="absolute inset-y-0 left-[30%] w-[28%] bg-loop/25" />
          <div className="absolute inset-x-1 top-1/2 h-4 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,var(--color-wave)_0_2px,transparent_2px_4px)]" />
          <div className="absolute inset-y-0 left-[45%] w-px bg-playhead" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-[linear-gradient(var(--color-dock-from),var(--color-dock-to))] px-1.5 py-1.5">
        <span className="lcd lcd-glow rounded-control px-1.5 py-0.5 font-mono text-[10px] text-lcd-fg">
          1:23.4
        </span>
        <span className="hw flex h-5 w-6 flex-col items-center justify-end rounded-control pb-0.5">
          <span className="h-[2px] w-3 rounded-full bg-loop" />
        </span>
        <span className="hw flex h-5 w-6 flex-col items-center justify-end rounded-control pb-0.5">
          <span className="h-[2px] w-3 rounded-full bg-accent" />
        </span>
        <span className="ml-auto h-1 w-8 rounded-full bg-well">
          <span className="block h-full w-2/3 rounded-full bg-accent/70" />
        </span>
      </div>
      <div className="flex items-start gap-2 border-t border-edge bg-bg-from px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{name}</p>
          <p className="text-[11px] leading-snug text-fg-subtle">{description}</p>
        </div>
        {selected && <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
      </div>
    </button>
  );
}

/** One custom colour: ready swatches, the system picker for any other, back to the theme's. */
function ColorRow({ color }: { color: CustomColor }) {
  const picked = useAppearanceStore((s) => s.colors[s.theme]?.[color]);
  const setColor = useAppearanceStore((s) => s.setColor);
  const { name, hint } = a.colors[color];
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-36 shrink-0">
        <p className="text-sm text-fg">{name}</p>
        <p className="text-[11px] leading-snug text-fg-subtle">{hint}</p>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`${name} ${hex}`}
            aria-pressed={picked === hex}
            onClick={() => setColor(color, hex)}
            className={cn(
              "size-[18px] rounded-control border transition-transform hover:scale-110",
              picked === hex ? "border-fg ring-1 ring-fg" : "border-edge",
            )}
            style={{ background: hex }}
          />
        ))}
        {/* Any other colour: the system picker (a click, no codes to type) */}
        <label
          title={a.otherColor}
          className={cn(
            "hw relative inline-flex size-[22px] cursor-pointer items-center justify-center rounded-control text-fg-muted hover:text-fg",
            picked && !SWATCHES.includes(picked as (typeof SWATCHES)[number]) && "text-accent",
          )}
        >
          <Pipette className="size-3" aria-hidden />
          <input
            type="color"
            aria-label={`${name}: ${a.otherColor}`}
            value={picked ?? shownColor(color)}
            onChange={(event) => setColor(color, event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <Button
        size="icon"
        aria-label={`${name}: ${a.themeColor}`}
        title={a.themeColor}
        disabled={!picked}
        onClick={() => setColor(color, null)}
      >
        <RotateCcw className="size-3.5" />
      </Button>
    </div>
  );
}

/** Settings → Appearance: theme, colours and sizes of this PC, applied at once. */
export function AppearanceSettings() {
  const theme = useAppearanceStore((s) => s.theme);
  const uiScale = useAppearanceStore((s) => s.uiScale);
  const font = useAppearanceStore((s) => s.font);
  const corners = useAppearanceStore((s) => s.corners);
  const overviewHeight = useAppearanceStore((s) => s.overviewHeight);
  const changed = useAppearanceStore((s) => Object.keys(s.colors[s.theme] ?? {}).length > 0);
  const showOverview = useSettingsStore((s) => s.showOverview);
  const { update, resetColors, resetLayout } = useAppearanceStore.getState();
  return (
    <div className="space-y-2 px-4 pb-4">
      <SettingGroup title={a.theme} hint={a.themeHint}>
        <div className="grid grid-cols-3 gap-2.5">
          {THEMES.map((card) => (
            <ThemeCard key={card} theme={card} selected={card === theme} />
          ))}
        </div>
      </SettingGroup>

      <SettingGroup title={`${a.colorsTitle} · ${a.themes[theme].name}`} hint={a.colorsHint}>
        <div className="divide-y divide-border">
          {CUSTOM_COLORS.map((color) => (
            <ColorRow key={color} color={color} />
          ))}
        </div>
        <div className="flex justify-end">
          <Button disabled={!changed} onClick={resetColors}>
            {a.resetColors}
          </Button>
        </div>
      </SettingGroup>

      <SettingGroup title={a.layoutTitle} hint={a.layoutHint}>
        <div className="divide-y divide-border">
          <SettingRow label={a.uiScale} hint={a.uiScaleHint}>
            <Stepper
              label={a.uiScale}
              value={uiScale}
              {...UI_SCALE}
              defaultValue={UI_SCALE.default}
              onChange={(uiScale) => update({ uiScale })}
              format={formatPercent}
            />
          </SettingRow>
          <SettingRow label={a.font} hint={a.fontHint}>
            <ChoiceKeys
              label={a.font}
              value={font}
              choices={(Object.keys(FONTS) as (keyof typeof FONTS)[]).map(
                (font) => [font, a.fonts[font]] as const,
              )}
              onChange={(font) => update({ font })}
            />
          </SettingRow>
          <SettingRow label={a.corners} hint={a.cornersHint}>
            <ChoiceKeys
              label={a.corners}
              value={corners}
              choices={(Object.keys(CORNERS) as (keyof typeof CORNERS)[]).map(
                (corners) => [corners, a.cornerNames[corners]] as const,
              )}
              onChange={(corners) => update({ corners })}
            />
          </SettingRow>
          <SettingRow label={a.overviewShown} hint={a.overviewShownHint}>
            <OnOffKey
              label={a.overviewShown}
              on={showOverview}
              onChange={(on) => useSettingsStore.getState().update({ showOverview: on })}
            />
          </SettingRow>
          <SettingRow label={a.overview} hint={a.overviewHint}>
            <ChoiceKeys
              label={a.overview}
              value={overviewHeight}
              choices={(Object.keys(OVERVIEW_HEIGHTS) as (keyof typeof OVERVIEW_HEIGHTS)[]).map(
                (height) => [height, a.overviewHeights[height]] as const,
              )}
              onChange={(overviewHeight) => update({ overviewHeight })}
            />
          </SettingRow>
        </div>
        <div className="flex justify-end">
          <Button onClick={resetLayout}>{a.resetLayout}</Button>
        </div>
      </SettingGroup>
    </div>
  );
}
