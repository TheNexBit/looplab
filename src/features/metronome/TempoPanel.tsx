import { Minus, Plus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { tapTempo } from "@/features/practice/tempo";
import { t } from "@/i18n";
import { useWheelSteps } from "@/lib/useWheelSteps";
import { METRONOME_BPM, shownSetup, useMetronomeStore } from "@/stores/metronome";
import { tempoMarking } from "./meterChoices";

const m = t.metronome;
const NOTE: Record<number, string> = { 2: "minima", 4: "♩", 8: "♪", 16: "♬" };

/** Changes the tempo by `by`, inside its limits. */
export function nudgeBpm(by: number) {
  const metronome = useMetronomeStore.getState();
  metronome.update({ bpm: Math.round(metronome.bpm) + by });
}

/** One tap, on the pulses of the bar: from the second one the tempo follows the taps. */
export function tapMetronome() {
  const metronome = useMetronomeStore.getState();
  metronome.addTap(performance.now());
  const pulses = tapTempo(useMetronomeStore.getState().taps, 1);
  if (pulses !== null) metronome.update({ bpm: Math.round((pulses * 4) / metronome.unit) });
}

/**
 * The tempo, big, on a display like a hardware metronome's: − / +, the wheel over it,
 * double-click for 120, and Tap. Under it the Italian marking and, when the pulse is not a
 * quarter, how fast the pulses go (♪ = 320 in 7/8 at 160).
 */
export function TempoPanel() {
  const bpm = useMetronomeStore((s) => shownSetup(s).bpm);
  const unit = useMetronomeStore((s) => shownSetup(s).unit);
  const ref = useRef<HTMLDivElement>(null);
  useWheelSteps(ref, (step) => nudgeBpm(step));
  const rounded = Math.round(bpm);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="hardware"
        size="lg-icon"
        onClick={() => nudgeBpm(-1)}
        aria-label={`${m.tempo} −`}
      >
        <Minus className="size-5" />
      </Button>
      <Tooltip label={m.tempoHint}>
        <div
          ref={ref}
          role="spinbutton"
          aria-label={m.tempo}
          aria-valuenow={rounded}
          aria-valuemin={METRONOME_BPM.min}
          aria-valuemax={METRONOME_BPM.max}
          tabIndex={0}
          onDoubleClick={() => useMetronomeStore.getState().update({ bpm: METRONOME_BPM.default })}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              nudgeBpm(event.key === "ArrowUp" ? 1 : -1);
            }
          }}
          className="lcd flex h-24 w-52 cursor-ns-resize flex-col justify-center rounded-panel px-4 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <span className="text-[10px] font-medium tracking-[0.16em] text-lcd-dim uppercase">
            {m.tempo} · BPM
          </span>
          <span className="font-mono text-[52px] leading-none font-medium text-lcd-fg tabular lcd-glow">
            {rounded}
          </span>
          <span className="font-mono text-[11px] text-lcd-dim">
            {tempoMarking(rounded)}
            {unit !== 4 && ` · ${m.pulseRate(NOTE[unit] ?? "", Math.round((rounded * unit) / 4))}`}
          </span>
        </div>
      </Tooltip>
      <Button
        variant="hardware"
        size="lg-icon"
        onClick={() => nudgeBpm(1)}
        aria-label={`${m.tempo} +`}
      >
        <Plus className="size-5" />
      </Button>
      <Tooltip label={m.tapHint} shortcut="tapTempo">
        <Button
          variant="hardware"
          className="h-12 px-4 text-sm font-semibold"
          onClick={tapMetronome}
        >
          {m.tap}
        </Button>
      </Tooltip>
    </div>
  );
}
