import { LocateFixed, Magnet, Pause, Play, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NumberField, parseNumber } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { LoopMenu } from "./LoopMenu";
import { CENTS, SEMITONES, SPEED, SPEED_PRESETS } from "./limits";
import { TimeDisplay } from "./TimeDisplay";

const formatSpeed = (value: number) => `${Math.round(value * 100)}%`;
/** Speeds are typed as percentages: "75" → 0.75. */
const parseSpeed = (text: string) => {
  const value = parseNumber(text);
  return value === null ? null : value / 100;
};
const signed = (value: number, unit: string) => `${value > 0 ? "+" : ""}${value} ${unit}`;

/** Bottom dock: transport, loop, speed and pitch. */
export function TransportDock() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const playing = usePlayerStore((s) => s.playing);
  const speed = usePlayerStore((s) => s.speed);
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const { togglePlay, setSpeed, setPitch } = usePlayerStore.getState();
  const snap = useSettingsStore((s) => s.snap);
  const returnToStart = useSettingsStore((s) => s.returnToStart);
  const follow = useSettingsStore((s) => s.followPlayhead);
  const playLabel = playing ? t.transport.pause : t.transport.play;

  return (
    <footer className="flex h-20 shrink-0 items-center gap-5 border-t border-border px-6">
      <Tooltip label={playLabel} shortcut="playPause">
        <Button
          variant="primary"
          size="lg-icon"
          disabled={!hasTrack}
          onClick={togglePlay}
          aria-label={playLabel}
        >
          {playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 fill-current" />
          )}
        </Button>
      </Tooltip>

      <Tooltip label={t.transport.returnToStart}>
        <Button
          size="icon"
          active={returnToStart}
          onClick={() => useSettingsStore.getState().update({ returnToStart: !returnToStart })}
          aria-label={t.settings.returnToStart}
          aria-pressed={returnToStart}
        >
          <Undo2 className="size-4" />
        </Button>
      </Tooltip>

      <TimeDisplay />
      <div className="flex items-center gap-1">
        <LoopMenu disabled={!hasTrack} />
        <Tooltip label={t.transport.follow} shortcut="toggleFollow">
          <Button
            size="icon"
            active={follow}
            onClick={() => {
              useSettingsStore.getState().update({ followPlayhead: !follow });
              useViewStore.getState().resumeFollow();
            }}
            aria-label={t.shortcuts.toggleFollow}
            aria-pressed={follow}
          >
            <LocateFixed className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip label={t.transport.snap} shortcut="toggleSnap">
          <Button
            size="icon"
            active={snap}
            onClick={() => useSettingsStore.getState().update({ snap: !snap })}
            aria-label={t.shortcuts.toggleSnap}
            aria-pressed={snap}
          >
            <Magnet className="size-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="ml-auto flex items-center gap-6">
        <div className="flex items-center gap-1">
          <Slider
            label={t.transport.speed}
            value={speed}
            defaultValue={SPEED.default}
            min={SPEED.min}
            max={SPEED.max}
            step={SPEED.step}
            onChange={setSpeed}
            format={formatSpeed}
            parse={parseSpeed}
          />
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSpeed(preset)}
              aria-label={`${t.transport.speedPreset} ${formatSpeed(preset)}`}
              className={cn(
                "h-6 rounded-control px-1.5 text-[11px] tabular transition-colors",
                speed === preset
                  ? "bg-accent-soft text-accent"
                  : "text-fg-subtle hover:bg-surface-hover hover:text-fg",
              )}
            >
              {formatSpeed(preset)}
            </button>
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
        </div>
      </div>
    </footer>
  );
}
