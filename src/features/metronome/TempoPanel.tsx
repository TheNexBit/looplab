import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { tapTempo } from "@/features/practice/tempo";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useWheelSteps } from "@/lib/useWheelSteps";
import {
  METRONOME_BPM,
  pulsesPerMinute,
  quartersPerMinute,
  shownSetup,
  TEMPO_BASES,
  useMetronomeStore,
} from "@/stores/metronome";
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
  if (pulses === null) return;
  const bpm = metronome.tempoBase === "pulse" ? pulses : (pulses * 4) / metronome.unit;
  metronome.update({ bpm: Math.round(bpm) });
}

/**
 * The tempo, big, on a display like a hardware metronome's: − / +, the wheel over it,
 * double-click for 120, and Tap. Its label (or the right button) opens what the BPM count:
 * quarters, as in DAWs, or the pulses of the bar. Under the number the Italian marking and,
 * when the pulse is not a quarter, the other note's speed (♪ = 320 in 7/8 at 160 quarters).
 */
export function TempoPanel() {
  const bpm = useMetronomeStore((s) => shownSetup(s).bpm);
  const unit = useMetronomeStore((s) => shownSetup(s).unit);
  const tempoBase = useMetronomeStore((s) => shownSetup(s).tempoBase);
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useWheelSteps(ref, (step) => nudgeBpm(step));
  const rounded = Math.round(bpm);
  const tempo = { bpm: rounded, unit, tempoBase };
  const counted = tempoBase === "pulse" ? (NOTE[unit] ?? "") : NOTE[4];
  const other =
    unit === 4
      ? null
      : tempoBase === "pulse"
        ? m.pulseRate(NOTE[4] ?? "", Math.round(quartersPerMinute(tempo)))
        : m.pulseRate(NOTE[unit] ?? "", Math.round(pulsesPerMinute(tempo)));

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
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip label={m.tempoHint} rightClick={m.tempoBaseRight}>
          <div
            ref={ref}
            role="spinbutton"
            aria-label={m.tempo}
            aria-valuenow={rounded}
            aria-valuemin={METRONOME_BPM.min}
            aria-valuemax={METRONOME_BPM.max}
            tabIndex={0}
            onDoubleClick={() =>
              useMetronomeStore.getState().update({ bpm: METRONOME_BPM.default })
            }
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                event.stopPropagation();
                nudgeBpm(event.key === "ArrowUp" ? 1 : -1);
              }
            }}
            className="lcd flex h-24 w-52 cursor-ns-resize flex-col justify-center rounded-panel px-4 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={m.tempoBase}
                onDoubleClick={(event) => event.stopPropagation()}
                className="flex w-fit cursor-pointer items-center gap-1 text-[10px] font-medium tracking-[0.16em] text-lcd-dim uppercase hover:text-lcd-fg focus-visible:outline-none"
              >
                {m.tempo} · BPM {counted}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenu.Trigger>
            <span className="font-mono text-[52px] leading-none font-medium text-lcd-fg tabular lcd-glow">
              {rounded}
            </span>
            <span className="font-mono text-[11px] text-lcd-dim">
              {tempoMarking(rounded)}
              {other && ` · ${other}`}
            </span>
          </div>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={6}
            className={cn(menuContent, "w-80")}
          >
            <DropdownMenu.Label className={menuLabel}>{m.tempoBase}</DropdownMenu.Label>
            {TEMPO_BASES.map((base) => (
              <DropdownMenu.Item
                key={base}
                className={menuItem}
                onSelect={() => useMetronomeStore.getState().update({ tempoBase: base })}
              >
                <Check className={base === tempoBase ? "size-4" : "size-4 opacity-0"} />
                <span className="flex flex-col">
                  <span>{m.tempoBaseNames[base]}</span>
                  <span className="text-[11px] text-fg-subtle">{m.tempoBaseHints[base]}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
