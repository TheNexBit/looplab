import { ChevronDown, Crosshair, Grid3x3, Hand, Metronome, X } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Kbd } from "@/components/ui/Kbd";
import { floatingPanel } from "@/components/ui/menu";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { ShortcutId } from "@/lib/shortcuts";
import { clamp } from "@/lib/time";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { setDownbeatHere, tapBeat } from "./actions";
import { ClickSoundPicker } from "./ClickSoundPicker";
import { TimeSignaturePicker } from "./TimeSignaturePicker";
import { BPM, COUNT_IN_CHOICES } from "./tempo";

const p = t.practice;

/** One entry of the tempo menu: icon, name, what it does, its key. */
function MenuEntry({
  icon,
  label,
  hint,
  shortcut,
  active,
  unavailable,
  closes = true,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  shortcut?: ShortcutId;
  active?: boolean;
  /** Why the entry cannot be used now; shown instead of the hint (the entry is then off) */
  unavailable?: string | null;
  /** Close the menu after it (not for on/off entries) */
  closes?: boolean;
  onClick: () => void;
}) {
  const entry = (
    <button
      type="button"
      disabled={Boolean(unavailable)}
      aria-pressed={active}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-hover disabled:pointer-events-none"
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          active ? "text-accent" : "text-fg-muted",
          unavailable && "opacity-40",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn("flex items-center gap-2 text-sm text-fg", unavailable && "opacity-40")}
        >
          {label}
          {active !== undefined && (
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                active ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-led-off",
              )}
            />
          )}
        </span>
        {unavailable ? (
          <span className="block text-[11px] leading-snug text-readout">{unavailable}</span>
        ) : (
          <span className="block text-[11px] leading-snug text-fg-subtle">{hint}</span>
        )}
      </span>
      {shortcut && (
        <span className={cn(unavailable && "opacity-40")}>
          <Kbd shortcut={shortcut} />
        </span>
      )}
    </button>
  );
  return closes ? <Popover.Close asChild>{entry}</Popover.Close> : entry;
}

/** Everything about the tempo and the click, opened from the display. */
function TempoMenu() {
  const bpm = usePracticeStore((s) => s.bpm);
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const showGrid = useSettingsStore((s) => s.showGrid);
  return (
    <>
      <div className="space-y-1">
        <p className="panel-label px-2">{p.tempo}</p>
        <MenuEntry
          icon={<Hand className="size-3.5" />}
          label={p.tapTempo}
          hint={p.tapMenuHint}
          shortcut="tapTempo"
          unavailable={hasTrack ? null : p.needsTrack}
          onClick={tapBeat}
        />
        <MenuEntry
          icon={<Crosshair className="size-3.5" />}
          label={p.downbeat}
          hint={p.downbeatHint}
          shortcut="setDownbeat"
          unavailable={!hasTrack ? p.needsTrack : bpm === null ? p.needsBpm : null}
          onClick={setDownbeatHere}
        />
        <MenuEntry
          icon={<Grid3x3 className="size-3.5" />}
          label={p.gridItem}
          hint={p.gridHint}
          active={showGrid}
          closes={false}
          onClick={() => useSettingsStore.getState().update({ showGrid: !showGrid })}
        />
        <MenuEntry
          icon={<X className="size-3.5" />}
          label={p.clearBpm}
          hint={p.clearBpmHint}
          unavailable={bpm === null ? p.noBpmSet : null}
          onClick={() => usePracticeStore.getState().setBpm(null)}
        />
      </div>
      {/* Count-in, volume and sounds: also here, and the only place in narrow windows */}
      <div className="space-y-3 border-t border-border px-2 pt-3">
        <ClickOptions />
      </div>
    </>
  );
}

/**
 * Tempo display, like the BPM field of Reaper's and Ableton's transport: click the number to
 * type it, ↑/↓ or the mouse wheel to change it by one. Its menu (tap, downbeat, grid, count-in,
 * click) opens from the "Tempo ▾" caption or with a right-click anywhere on the display.
 */
function BpmDisplay() {
  const bpm = usePracticeStore((s) => s.bpm);
  const [menu, setMenu] = useState(false);

  // Right-click anywhere on the display opens its menu, like the options of a DAW's keys
  const displayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const display = displayRef.current;
    if (!display) return;
    const open = (event: MouseEvent) => {
      event.preventDefault();
      setMenu(true);
    };
    display.addEventListener("contextmenu", open);
    return () => display.removeEventListener("contextmenu", open);
  }, []);

  // The wheel changes the tempo by one
  const ref = useRef<HTMLDivElement>(null);
  useWheelSteps(ref, (step) => {
    const current = usePracticeStore.getState().bpm ?? BPM.default;
    usePracticeStore.getState().setBpm(clamp(current + step, BPM.min, BPM.max));
  });

  return (
    <Popover.Root open={menu} onOpenChange={setMenu}>
      <Popover.Anchor asChild>
        <div
          ref={displayRef}
          className="flex h-[58px] flex-col justify-center gap-1 lcd rounded-panel px-2"
        >
          <Tooltip label={p.tempoMenu}>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label={p.tempoMenu}
                className={cn(
                  "-mx-1 flex items-center justify-between gap-2 rounded-control px-1 transition-colors",
                  "text-lcd-dim hover:bg-lcd-fg/10 hover:text-lcd-fg",
                  menu && "bg-lcd-fg/10 text-lcd-fg",
                )}
              >
                <span className="text-[9px] font-medium tracking-[0.16em] uppercase">
                  {p.tempo}
                </span>
                <ChevronDown className={cn("size-3 transition-transform", menu && "rotate-180")} />
              </button>
            </Popover.Trigger>
          </Tooltip>
          <div ref={ref} className="flex items-center gap-1">
            <Tooltip label={p.bpmHint} rightClick={p.bpmRightClick}>
              <span>
                <NumberField
                  label={p.bpm}
                  value={bpm ?? BPM.default}
                  min={BPM.min}
                  max={BPM.max}
                  step={BPM.step}
                  onChange={(value) => usePracticeStore.getState().setBpm(value)}
                  format={(value) => (bpm === null ? p.noBpm : value.toFixed(1))}
                  variant="display"
                />
              </span>
            </Tooltip>
            <TimeSignaturePicker side="top" variant="display" />
          </div>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className={`${floatingPanel} w-80 space-y-3 p-2 pb-3`}
        >
          <TempoMenu />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Count-in choices, click volume and the "needs a tempo" warning. */
function ClickOptions() {
  const countIn = useSettingsStore((s) => s.countIn);
  const bars = useSettingsStore((s) => s.countInBars);
  const volume = useSettingsStore((s) => s.clickVolume);
  const metronome = useSettingsStore((s) => s.metronome);
  const hasBpm = usePracticeStore((s) => s.bpm !== null);
  const update = useSettingsStore((s) => s.update);
  return (
    <>
      <div className="space-y-1.5">
        <p className="panel-label">{p.countIn}</p>
        <div className="flex gap-1">
          <Chip
            active={countIn}
            aria-pressed={countIn}
            onClick={() => update({ countIn: !countIn })}
          >
            {p.countInOn}
          </Chip>
          <span className="mx-0.5 w-px self-stretch bg-border" aria-hidden />
          {COUNT_IN_CHOICES.map((choice) => (
            <Chip
              key={choice}
              active={bars === choice}
              aria-pressed={bars === choice}
              // Picking a length is choosing to count in: it switches the count-in on
              onClick={() => update({ countInBars: choice, countIn: true })}
            >
              {choice === 1 ? p.oneBar : `${choice} ${p.bars}`}
            </Chip>
          ))}
        </div>
      </div>
      <Slider
        label={p.volume}
        value={volume}
        defaultValue={0.6}
        min={SETTING_LIMITS.clickVolume.min}
        max={SETTING_LIMITS.clickVolume.max}
        step={SETTING_LIMITS.clickVolume.step}
        onChange={(clickVolume) => update({ clickVolume })}
        format={(value) => `${Math.round(value * 100)}%`}
        parse={parsePercent}
        trackClassName="flex-1"
        className="justify-between"
      />
      <div className="border-t border-border pt-3">
        <ClickSoundPicker />
      </div>
      {!hasBpm && (countIn || metronome) && (
        <p className="well rounded-control px-2 py-1.5 text-[11px] text-readout">{p.needsTempo}</p>
      )}
    </>
  );
}

/**
 * Count-in key, like Reaper's metronome key: a click switches it on and off (the lamp, the
 * bars it will count shown on it); a right-click opens its options.
 */
function CountInKey() {
  const on = useSettingsStore((s) => s.countIn);
  const bars = useSettingsStore((s) => s.countInBars);
  const [options, setOptions] = useState(false);
  const short = bars === 1 ? p.oneBar : `${bars} ${p.bars}`;
  return (
    <Popover.Root open={options} onOpenChange={setOptions}>
      <Popover.Anchor asChild>
        <span>
          <Tooltip
            label={p.countInKeyHint}
            shortcut="toggleCountIn"
            rightClick={p.countInRightClick}
          >
            <Button
              variant="hardware"
              size="key"
              led="amber"
              options
              active={on}
              className="w-16"
              aria-label={`${p.countIn}: ${short}`}
              aria-pressed={on}
              onClick={() => useSettingsStore.getState().update({ countIn: !on })}
              onContextMenu={(event) => {
                event.preventDefault();
                setOptions(true);
              }}
            >
              <span className="flex flex-col items-center gap-0.5 leading-none">
                <span className="text-[8px] font-semibold tracking-[0.06em] uppercase">
                  {p.countIn}
                </span>
                <span className="text-[10px] tabular">{short}</span>
              </span>
            </Button>
          </Tooltip>
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          className={`${floatingPanel} w-72 space-y-3 p-3`}
        >
          <ClickOptions />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Tempo and click in the transport dock, where every DAW keeps them: the tempo display
 * with the time signature, tap, metronome and count-in.
 */
export function TempoModule({ className }: { className?: string }) {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const hasBpm = usePracticeStore((s) => s.bpm !== null);
  const metronome = useSettingsStore((s) => s.metronome);

  return (
    <div className={cn("well flex shrink-0 items-center gap-1 rounded-panel p-1.5", className)}>
      <BpmDisplay />
      <div className="hidden xl:flex">
        <Tooltip label={p.tapHint} shortcut="tapTempo">
          <Button
            variant="hardware"
            size="key"
            disabled={!hasTrack}
            onClick={tapBeat}
            aria-label={p.tap}
          >
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">{p.tap}</span>
          </Button>
        </Tooltip>
      </div>
      <Tooltip label={hasBpm ? p.metronomeHint : p.needsTempo} shortcut="toggleMetronome">
        <Button
          variant="hardware"
          size="key"
          led="amber"
          active={metronome}
          onClick={() => useSettingsStore.getState().update({ metronome: !metronome })}
          aria-label={p.metronome}
          aria-pressed={metronome}
        >
          <Metronome className="size-4" />
        </Button>
      </Tooltip>
      <div className="hidden xl:flex">
        <CountInKey />
      </div>
    </div>
  );
}
