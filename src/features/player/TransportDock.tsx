import { Pause, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { SEMITONES, SPEED } from "./limits";
import { TimeDisplay } from "./TimeDisplay";

const noop = () => {};
const formatSpeed = (value: number) => `${Math.round(value * 100)}%`;
const formatSemitones = (value: number) =>
  `${value > 0 ? "+" : ""}${value} ${t.transport.semitones}`;

/** Bottom dock: transport, loop, speed and pitch. Loop, speed and pitch arrive in phase 3. */
export function TransportDock() {
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const playing = usePlayerStore((s) => s.playing);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playLabel = playing ? t.transport.pause : t.transport.play;

  return (
    <footer className="flex h-20 shrink-0 items-center gap-6 border-t border-border px-6">
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

      <TimeDisplay />

      <Tooltip label={t.transport.loop} shortcut="loopToggle">
        <Button size="icon" disabled aria-label={t.transport.loop}>
          <Repeat className="size-4" />
        </Button>
      </Tooltip>

      <div className="ml-auto flex items-center gap-8">
        <Slider
          label={t.transport.speed}
          value={SPEED.default}
          defaultValue={SPEED.default}
          min={SPEED.min}
          max={SPEED.max}
          step={SPEED.step}
          format={formatSpeed}
          onChange={noop}
          disabled
        />
        <Slider
          label={t.transport.pitch}
          value={SEMITONES.default}
          defaultValue={SEMITONES.default}
          min={SEMITONES.min}
          max={SEMITONES.max}
          step={SEMITONES.step}
          format={formatSemitones}
          onChange={noop}
          disabled
        />
      </div>
    </footer>
  );
}
