import { Magnet, MoveHorizontal, Pause, Play, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Fader } from "@/components/ui/Fader";
import { FitBar, useCompact } from "@/components/ui/FitBar";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSnapHoldStore } from "@/features/markers/snapHold";
import { TempoModule } from "@/features/practice/TempoModule";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPercent, signed } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
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
const TRACK = "w-12 lg:w-16 2xl:w-20 min-[1800px]:w-24";
/** In a crowded dock: a shorter label column and faders (every control stays) */
const LABEL_COMPACT = "w-9";
const TRACK_COMPACT = "w-12";

/** Bottom dock: transport, loop, tempo and click (like every DAW), speed and pitch. */
export function TransportDock() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const playing = usePlayerStore((s) => s.playing);
  const { togglePlay } = usePlayerStore.getState();
  const snap = useSettingsStore((s) => s.snap);
  // While Shift suspends it during a drag, the magnet's lamp goes out
  const suspended = useSnapHoldStore((s) => s.shift && s.pressing);
  const returnToStart = useSettingsStore((s) => s.returnToStart);
  const whole = useViewStore((s) => showsWhole(s.target, s.duration));
  const playLabel = playing ? t.transport.pause : t.transport.play;

  return (
    <footer className="shrink-0 border-t border-edge bg-[linear-gradient(var(--color-dock-from),var(--color-dock-to))] px-2 py-1.5 2xl:px-4 shadow-[inset_0_1px_0_var(--color-sheen)]">
      {/* Every key stays: in a narrow window the keys get compact, then the dock takes two rows */}
      <FitBar className="min-h-[76px] gap-x-1 lg:gap-x-2 2xl:gap-x-2.5 data-[fit=compact]:gap-x-1 data-[fit=wrap]:gap-x-1">
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

        {/* Speed over pitch, like two strips of a mixer */}
        <SpeedPitch />
      </FitBar>
    </footer>
  );
}

/** Speed and pitch faders with their quick keys: narrower in a crowded dock, never fewer. */
function SpeedPitch() {
  const speed = usePlayerStore((s) => s.speed);
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const { setSpeed, setPitch } = usePlayerStore.getState();
  const compact = useCompact();
  const label = compact ? LABEL_COMPACT : LABEL;
  const track = compact ? TRACK_COMPACT : TRACK;
  return (
    <div className="well ml-auto flex shrink-0 items-center gap-2 rounded-panel px-2 py-1.5 lg:px-3">
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
            labelClassName={label}
            trackClassName={track}
          />
          {SPEED_PRESETS.map((preset) => (
            <Chip
              key={preset}
              active={speed === preset}
              onClick={() => setSpeed(preset)}
              aria-label={`${t.transport.speedPreset} ${formatPercent(preset)}`}
              className={cn("h-[22px] font-mono text-[10px] tabular", compact ? "px-1" : "px-1.5")}
            >
              {compact ? Math.round(preset * 100) : formatPercent(preset)}
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
            labelClassName={label}
            trackClassName={track}
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
