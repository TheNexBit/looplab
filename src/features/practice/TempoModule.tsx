import { ChevronDown, Crosshair, Grid3x3, Hand, Metronome, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { floatingPanel } from "@/components/ui/menu";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
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

/** Small caption over a display, like the labels printed on a hardware panel. */
function Caption({ children }: { children: string }) {
  return (
    <span className="text-[9px] font-medium tracking-[0.16em] text-lcd-dim uppercase">
      {children}
    </span>
  );
}

/**
 * Tempo display, like the BPM field of Reaper's and Ableton's transport: click to type,
 * ↑/↓ or the mouse wheel to change it by one; the arrow beside it opens tap, first beat,
 * grid and "tempo unknown".
 */
function BpmDisplay() {
  const bpm = usePracticeStore((s) => s.bpm);
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const showGrid = useSettingsStore((s) => s.showGrid);

  // The wheel changes the tempo by one
  const ref = useRef<HTMLDivElement>(null);
  useWheelSteps(ref, (step) => {
    const current = usePracticeStore.getState().bpm ?? BPM.default;
    usePracticeStore.getState().setBpm(clamp(current + step, BPM.min, BPM.max));
  });

  return (
    <div className="flex h-[58px] flex-col justify-center gap-1 lcd rounded-panel px-2">
      <div className="flex items-center justify-between gap-2">
        <Caption>{p.tempo}</Caption>
        <Popover.Root>
          <Tooltip label={p.tempoMenu}>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label={p.tempoMenu}
                className="-my-1 rounded-control px-0.5 text-lcd-dim hover:text-lcd-fg"
              >
                <ChevronDown className="size-3" />
              </button>
            </Popover.Trigger>
          </Tooltip>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              className={`${floatingPanel} w-72 space-y-3 p-3`}
            >
              <div className="grid gap-1">
                <Popover.Close asChild>
                  <Button variant="hardware" disabled={!hasTrack} onClick={tapBeat}>
                    <Hand className="size-3.5" />
                    {p.tap}
                  </Button>
                </Popover.Close>
                <Tooltip label={p.downbeatHint} shortcut="setDownbeat">
                  <Popover.Close asChild>
                    <Button
                      variant="hardware"
                      disabled={!hasTrack || bpm === null}
                      onClick={setDownbeatHere}
                    >
                      <Crosshair className="size-3.5" />
                      {p.downbeat}
                    </Button>
                  </Popover.Close>
                </Tooltip>
                <Tooltip label={p.gridHint}>
                  <Button
                    variant="hardware"
                    active={showGrid}
                    aria-pressed={showGrid}
                    onClick={() => useSettingsStore.getState().update({ showGrid: !showGrid })}
                  >
                    <Grid3x3 className="size-3.5" />
                    {p.gridItem}
                  </Button>
                </Tooltip>
                <Popover.Close asChild>
                  <Button
                    variant="ghost"
                    disabled={bpm === null}
                    onClick={() => usePracticeStore.getState().setBpm(null)}
                  >
                    <X className="size-3.5" />
                    {p.clearBpm}
                  </Button>
                </Popover.Close>
              </div>
              {/* Count-in, volume and sounds: also here, and the only place in narrow windows */}
              <div className="space-y-3 border-t border-border pt-3">
                <ClickOptions />
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div ref={ref} className="flex items-center gap-1">
        <Tooltip label={p.bpmHint}>
          <span>
            <NumberField
              label={p.bpm}
              value={bpm ?? BPM.default}
              min={BPM.min}
              max={BPM.max}
              step={BPM.step}
              onChange={(value) => usePracticeStore.getState().setBpm(value)}
              format={(value) => (bpm === null ? p.noBpm : String(value))}
              variant="display"
            />
          </span>
        </Tooltip>
        <TimeSignaturePicker side="top" variant="display" />
      </div>
    </div>
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
          <Tooltip label={p.countInKeyHint} shortcut="toggleCountIn">
            <Button
              variant="hardware"
              size="key"
              led="amber"
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
