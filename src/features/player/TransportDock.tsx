import { Check, Magnet, Minus, MoveHorizontal, Pause, Play, Plus, Undo2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { FitBar, useCompact } from "@/components/ui/FitBar";
import { Knob } from "@/components/ui/Knob";
import { menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSnapHoldStore } from "@/features/markers/snapHold";
import { TempoModule } from "@/features/practice/TempoModule";
import { playOrPause } from "@/features/setlist/live";
import { t } from "@/i18n";
import { formatPercent, signed } from "@/lib/format";
import { clamp } from "@/lib/time";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { showsWhole, useViewStore } from "@/stores/view";
import { FollowKey } from "./FollowKey";
import { LoopMenu } from "./LoopMenu";
import { CENTS, SEMITONES, SPEED, SPEED_PRESETS } from "./limits";
import { TimeDisplay } from "./TimeDisplay";
import { TuningItems } from "./TuningPicker";

/** Recessed panel holding a group of keys or a fader. */
const GROUP = "well flex items-center gap-1 rounded-panel p-1.5";

/** Bottom dock: transport, loop, tempo and click (like every DAW), speed and pitch. */
export function TransportDock() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const playing = usePlayerStore((s) => s.playing);
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
              onClick={playOrPause}
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

        <SpeedPitch />
      </FitBar>
    </footer>
  );
}

const tr = t.transport;
const player = () => usePlayerStore.getState();

/** The pitch as its display shows it: semitones, and the cents when there are some. */
const pitchText = (semitones: number, cents: number) =>
  cents === 0
    ? signed(semitones, tr.semitones)
    : `${signed(semitones)} ${signed(cents)}${tr.cents.charAt(0)}`;

/**
 * Speed and pitch, two knobs like the levels (one look for every value): the speed presets,
 * the fine tuning and the tunings on their right button.
 */
function SpeedPitch() {
  const speed = usePlayerStore((s) => s.speed);
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const compact = useCompact();
  const keepOpen = (event: Event) => event.preventDefault();
  const fine = (next: number) =>
    player().setPitch(player().semitones, clamp(next, CENTS.min, CENTS.max));
  return (
    <div className="well ml-auto flex shrink-0 items-center gap-3 rounded-panel px-3 py-1.5">
      <Knob
        label={tr.speed}
        caption={compact ? tr.speedShort : tr.speed}
        hint={tr.knobHint}
        value={speed}
        current={() => player().speed}
        min={SPEED.min}
        max={SPEED.max}
        step={SPEED.step}
        defaultValue={SPEED.default}
        centered
        onChange={player().setSpeed}
        format={formatPercent}
        rightClick={tr.speedRightClick}
        menu={
          <>
            <ContextMenu.Label className={menuLabel}>{tr.speedPreset}</ContextMenu.Label>
            {SPEED_PRESETS.map((preset) => (
              <ContextMenu.Item
                key={preset}
                className={menuItem}
                onSelect={() => player().setSpeed(preset)}
              >
                <Check className={speed === preset ? "size-4" : "size-4 opacity-0"} />
                {formatPercent(preset)}
              </ContextMenu.Item>
            ))}
          </>
        }
      />
      <Knob
        label={tr.pitch}
        caption={compact ? tr.pitchShort : tr.pitch}
        hint={tr.knobHint}
        value={semitones}
        current={() => player().semitones}
        min={SEMITONES.min}
        max={SEMITONES.max}
        step={SEMITONES.step}
        defaultValue={SEMITONES.default}
        centered
        onChange={(next) => player().setPitch(next, player().cents)}
        format={(value) => pitchText(value, cents)}
        rightClick={tr.pitchRightClick}
        menu={
          <>
            <ContextMenu.Label className={menuLabel}>
              {tr.fineTune}: {signed(cents, tr.cents)}
            </ContextMenu.Label>
            <ContextMenu.Item
              className={menuItem}
              disabled={cents >= CENTS.max}
              onSelect={(event) => {
                keepOpen(event);
                fine(player().cents + CENTS.step);
              }}
            >
              <Plus className="size-4" />
              {tr.fineUp}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menuItem}
              disabled={cents <= CENTS.min}
              onSelect={(event) => {
                keepOpen(event);
                fine(player().cents - CENTS.step);
              }}
            >
              <Minus className="size-4" />
              {tr.fineDown}
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItem} disabled={cents === 0} onSelect={() => fine(0)}>
              <Undo2 className="size-4" />
              {tr.fineReset}
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparator} />
            <TuningItems />
          </>
        }
      />
    </div>
  );
}
