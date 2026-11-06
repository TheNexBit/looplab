import { LocateFixed, Magnet, Pause, Play, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberField, parsePercent } from "@/components/ui/NumberField";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { TempoModule } from "@/features/practice/TempoModule";
import { t } from "@/i18n";
import { signed } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { LoopMenu } from "./LoopMenu";
import { CENTS, formatSpeed, SEMITONES, SPEED, SPEED_PRESETS } from "./limits";
import { TimeDisplay } from "./TimeDisplay";

/** Recessed panel holding a group of keys or a fader. */
const GROUP = "well flex items-center gap-1 rounded-panel p-1.5";

/** Speed and pitch faders line up one under the other */
const LABEL = "w-16";
const TRACK = "w-16 lg:w-24";

/** Bottom dock: transport, loop, tempo and click (like every DAW), speed and pitch. */
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
    <footer className="flex h-[88px] shrink-0 items-center gap-1 border-t border-black bg-[linear-gradient(#26282c,#1b1c1f)] px-2 lg:gap-2 xl:gap-2.5 xl:px-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
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

      <TempoModule />

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
            parse={parsePercent}
            labelClassName={LABEL}
            trackClassName={TRACK}
          />
          {SPEED_PRESETS.map((preset) => (
            <Chip
              key={preset}
              active={speed === preset}
              onClick={() => setSpeed(preset)}
              aria-label={`${t.transport.speedPreset} ${formatSpeed(preset)}`}
              className="hidden h-[22px] px-1.5 font-mono text-[10px] tabular xl:inline-block"
            >
              {formatSpeed(preset)}
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
        </div>
      </div>
    </footer>
  );
}
