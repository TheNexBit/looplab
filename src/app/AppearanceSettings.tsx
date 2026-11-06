import { Check } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useThemeStore } from "@/stores/theme";

const a = t.settings.appearance;

/**
 * A small picture of the app in `theme`: the card carries `data-theme`, so everything
 * inside it takes that theme's colours whatever theme the window is in.
 */
function ThemeCard({ theme, selected }: { theme: ThemeId; selected: boolean }) {
  const { name, description } = a.themes[theme];
  return (
    <button
      type="button"
      data-theme={theme}
      aria-pressed={selected}
      onClick={() => useThemeStore.getState().setTheme(theme)}
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

/** Settings → Appearance: the colour theme of this PC, applied at once. */
export function AppearanceSettings() {
  const current = useThemeStore((s) => s.theme);
  return (
    <div className="space-y-3 px-4 pt-3 pb-4">
      <div>
        <p className="text-sm text-fg">{a.theme}</p>
        <p className="text-xs text-fg-subtle">{a.themeHint}</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {THEMES.map((theme) => (
          <ThemeCard key={theme} theme={theme} selected={theme === current} />
        ))}
      </div>
    </div>
  );
}
