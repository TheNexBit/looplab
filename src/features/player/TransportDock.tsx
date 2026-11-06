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
/** Recessed panel holding a group of keys or a fader. */
const GROUP = "well flex items-center gap-1 rounded-panel p-1.5";

/** Speed and pitch faders line up one under the other */
const LABEL = "w-16";
const TRACK = "w-20 lg:w-24";

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
    <footer className="flex h-[88px] shrink-0 items-center gap-2 border-t border-black bg-[linear-gradient(#26282c,#1b1c1f)] px-3 lg:gap-3.5 lg:px-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
      <div className={GROUP}>
        <Tooltip label={playLabel} shortcut="playPause">
          <Button
            variant="hardware"
            size="lg-key"
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
        <Tooltip label={t.transport.follow} shortcut="toggleFollow">
          <Button
            variant="hardware"
            size="key"
            led="amber"
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
            variant="hardware"
            size="key"
            led="amber"
            active={snap}
            onClick={() => useSettingsStore.getState().update({ snap: !snap })}
            aria-label={t.shortcuts.toggleSnap}
            aria-pressed={snap}
          >
            <Magnet className="size-4" />
          </Button>
        </Tooltip>
      </div>

      {/* Speed over pitch, like two strips of a mixer: the dock fits the narrowest window */}
      <div className="well ml-auto grid shrink-0 gap-1 rounded-panel px-3 py-1.5">
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
            labelClassName={LABEL}
            trackClassName={TRACK}
          />
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSpeed(preset)}
              aria-label={`${t.transport.speedPreset} ${formatSpeed(preset)}`}
              className={cn(
                "h-[22px] rounded-[2px] px-1.5 font-mono text-[10px] tabular transition-[filter]",
                speed === preset
                  ? "border border-black bg-accent font-bold text-on-accent"
                  : "hw text-fg-muted hover:text-fg hover:brightness-125",
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
        </div>
      </div>
    </footer>
  );
}
