import { Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { SEMITONES, SPEED } from "./limits";

const noop = () => {};
const formatSpeed = (value: number) => `${Math.round(value * 100)}%`;
const formatSemitones = (value: number) =>
  `${value > 0 ? "+" : ""}${value} ${t.transport.semitones}`;

/** Bottom dock: transport, loop, speed and pitch. Controls are inactive until a file is open. */
export function TransportDock() {
  const disabled = true;

  return (
    <footer className="flex h-20 shrink-0 items-center gap-6 border-t border-border px-6">
      <Tooltip label={t.transport.play} shortcut="playPause">
        <Button variant="primary" size="lg-icon" disabled={disabled} aria-label={t.transport.play}>
          <Play className="size-5 fill-current" />
        </Button>
      </Tooltip>

      <span className="w-36 text-sm text-fg-muted tabular">0:00.0 / 0:00.0</span>

      <Tooltip label={t.transport.loop} shortcut="loopToggle">
        <Button size="icon" disabled={disabled} aria-label={t.transport.loop}>
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
          disabled={disabled}
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
          disabled={disabled}
        />
      </div>
    </footer>
  );
}
