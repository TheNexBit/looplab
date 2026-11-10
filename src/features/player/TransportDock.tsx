import { Magnet, MoveHorizontal, Pause, Play, Undo2 } from "lucide-react";
import { Slider as RadixSlider } from "radix-ui";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSnapHoldStore } from "@/features/markers/snapHold";
import { TempoModule } from "@/features/practice/TempoModule";
import { t } from "@/i18n";
import { formatPercent, signed } from "@/lib/format";
import { clamp } from "@/lib/time";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { usePlayerStore } from "@/stores/player";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { showsWhole, useViewStore } from "@/stores/view";
import { FollowKey } from "./FollowKey";
import { LoopMenu } from "./LoopMenu";
import { CENTS, SEMITONES, SPEED, SPEED_PRESETS } from "./limits";
import { TimeDisplay } from "./TimeDisplay";
import { TuningPicker } from "./TuningPicker";

/** Recessed panel holding a group of keys or a fader. */
const GROUP = "well flex items-center gap-1 rounded-panel p-1.5";

/** Speed and pitch faders line up one under the other */
const LABEL = "w-16";
const TRACK = "w-16 xl:w-20 2xl:w-24";

/** Bottom dock: transport, loop, tempo and click (like every DAW), speed and pitch. */
export function TransportDock() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const playing = usePlayerStore((s) => s.playing);
  const speed = usePlayerStore((s) => s.speed);
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const { togglePlay, setSpeed, setPitch } = usePlayerStore.getState();
  const snap = useSettingsStore((s) => s.snap);
  // While Shift suspends it during a drag, the magnet's lamp goes out
  const suspended = useSnapHoldStore((s) => s.shift && s.pressing);
  const returnToStart = useSettingsStore((s) => s.returnToStart);
  const whole = useViewStore((s) => showsWhole(s.target, s.duration));
  const playLabel = playing ? t.transport.pause : t.transport.play;

  return (
    <footer className="flex h-[88px] shrink-0 items-center gap-1 border-t border-edge bg-[linear-gradient(var(--color-dock-from),var(--color-dock-to))] px-2 lg:gap-2 xl:gap-2.5 xl:px-4 shadow-[inset_0_1px_0_var(--color-sheen)]">
      <div className={GROUP}>
        <Tooltip label={playLabel} shortcut="playPause">
          <Button
            variant="hardware"
            size="play"
            led="green"
            active={playing}
            disabled={!hasTrack}
            onClick={togglePlay}
            aria-label={playLabel}
          >
            {playing ? (
              <Pause className="size-[18px] fill-loop text-loop" />
            ) : (
              <Play className="size-[18px] fill-current" />
            )}
          </Button>
        </Tooltip>

        <Tooltip label={t.transport.returnToStart}>
          <Button
            variant="hardware"
            size="key"
            led="amber"
            active={returnToStart}
            onClick={() => useSettingsStore.getState().update({ returnToStart: !returnToStart })}
            aria-label={t.settings.returnToStart}
            aria-pressed={returnToStart}
          >
            <Undo2 className="size-4" />
          </Button>
        </Tooltip>
      </div>

      <TimeDisplay />
      <div className={GROUP}>
        <LoopMenu disabled={!hasTrack} />
        <FollowKey />
        {/* Below 1024 px the dock has no room for it: the Z key and the palette still do it */}
        <div className="hidden lg:flex">
          <Tooltip label={t.transport.wholeTrack} shortcut="zoomToTrack">
            <Button
              variant="hardware"
              size="key"
              led="amber"
              active={hasTrack && whole}
              disabled={!hasTrack}
              onClick={() => useViewStore.getState().toggleWhole()}
              aria-label={t.shortcuts.zoomToTrack}
              aria-pressed={hasTrack && whole}
            >
              <MoveHorizontal className="size-4" />
            </Button>
          </Tooltip>
        </div>
        <Tooltip label={t.transport.snap} shortcut="toggleSnap">
          <Button
            variant="hardware"
            size="key"
            led="amber"
            active={snap && !suspended}
            onClick={() => useSettingsStore.getState().update({ snap: !snap })}
            aria-label={t.shortcuts.toggleSnap}
            aria-pressed={snap}
          >
            <Magnet className="size-4" />
          </Button>
        </Tooltip>
      </div>

      <TempoModule />

      {/* Speed over pitch, like two strips of a mixer: the dock fits the narrowest window */}
      <div className="well ml-auto flex shrink-0 items-center gap-2 rounded-panel px-3 py-1.5">
        {/* Track and click levels first: lower the track to hear the click over a loud mix */}
        <VolumeStrip />
        <div className="grid gap-1">
          <div className="flex items-center gap-1">
            <Slider
              label={t.transport.speed}
              value={speed}
              defaultValue={SPEED.default}
              min={SPEED.min}
              max={SPEED.max}
              step={SPEED.step}
              onChange={setSpeed}
              format={formatPercent}
              parse={parsePercent}
              labelClassName={LABEL}
              trackClassName={TRACK}
            />
            {SPEED_PRESETS.map((preset) => (
              <Chip
                key={preset}
                active={speed === preset}
                onClick={() => setSpeed(preset)}
                aria-label={`${t.transport.speedPreset} ${formatPercent(preset)}`}
                className="hidden h-[22px] px-1.5 font-mono text-[10px] tabular 2xl:inline-block"
              >
                {formatPercent(preset)}
              </Chip>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Slider
              label={t.transport.pitch}
              value={semitones}
              defaultValue={SEMITONES.default}
              min={SEMITONES.min}
              max={SEMITONES.max}
              step={SEMITONES.step}
              onChange={(value) => setPitch(value, cents)}
              format={(value) => signed(value, t.transport.semitones)}
              labelClassName={LABEL}
              trackClassName={TRACK}
            />
            <Tooltip label={t.transport.fineTune}>
              <span>
                <NumberField
                  label={t.transport.fineTune}
                  value={cents}
                  min={CENTS.min}
                  max={CENTS.max}
                  step={CENTS.step}
                  onChange={(value) => setPitch(semitones, value)}
                  format={(value) => signed(value, t.transport.cents)}
                />
              </span>
            </Tooltip>
            <TuningPicker />
          </div>
        </div>
      </div>
    </footer>
  );
}

/** One upright fader of the mixer strip: drag, wheel (5% a notch), double-click to reset. */
function Fader({
  label,
  short,
  hint,
  value,
  current,
  reset,
  onChange,
}: {
  label: string;
  short: string;
  hint: string;
  value: number;
  /** The value now, read at each wheel notch (fast notches come before a re-render) */
  current: () => number;
  reset: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { min, max, step } = SETTING_LIMITS.trackVolume;
  useWheelSteps(ref, (notch) =>
    onChange(clamp(Math.round((current() + notch * step) * 100) / 100, min, max)),
  );
  return (
    <Tooltip label={`${label} ${formatPercent(value)} — ${hint}`}>
      <div ref={ref} className="flex flex-col items-center gap-1">
        <RadixSlider.Root
          orientation="vertical"
          className="relative flex h-11 w-4 touch-none flex-col items-center"
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => next !== undefined && onChange(next)}
          onDoubleClick={() => onChange(reset)}
          aria-label={label}
        >
          <RadixSlider.Track className="relative w-1 grow rounded-[2px] bg-well shadow-[inset_0_1px_1px_var(--color-shade),0_1px_0_var(--color-sheen)]">
            <RadixSlider.Range className="absolute w-full rounded-[2px] bg-accent/70" />
          </RadixSlider.Track>
          <RadixSlider.Thumb className="hw block h-3 w-5 rounded-[2px] bg-[linear-gradient(var(--color-thumb-from),var(--color-thumb-to))] transition-[filter] hover:brightness-125" />
        </RadixSlider.Root>
        <span className="panel-label leading-none">{short}</span>
      </div>
    </Tooltip>
  );
}

/** The level of the track and of the click, always at hand: two faders, like a mixer. */
function VolumeStrip() {
  const trackVolume = useSettingsStore((s) => s.trackVolume);
  const clickVolume = useSettingsStore((s) => s.clickVolume);
  const update = useSettingsStore((s) => s.update);
  const v = t.transport;
  return (
    <div className="flex shrink-0 items-end gap-1.5 border-r border-border pr-2">
      <Fader
        label={v.trackVolume}
        short={v.trackVolumeShort}
        hint={v.trackVolumeHint}
        value={trackVolume}
        current={() => useSettingsStore.getState().trackVolume}
        reset={1}
        onChange={(value) => update({ trackVolume: value })}
      />
      <Fader
        label={v.clickVolume}
        short={v.clickVolumeShort}
        hint={v.clickVolumeHint}
        value={clickVolume}
        current={() => useSettingsStore.getState().clickVolume}
        reset={0.6}
        onChange={(value) => update({ clickVolume: value })}
      />
    </div>
  );
}
