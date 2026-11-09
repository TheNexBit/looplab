import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { tapTempo } from "@/features/practice/tempo";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { shownSetup, TEMPO_BASES, useMetronomeStore } from "@/stores/metronome";

const m = t.metronome;
export const NOTE: Record<number, string> = { 2: "minima", 4: "♩", 8: "♪", 16: "♬" };

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

/** The menu of what the BPM count: quarters, as in DAWs, or the pulses of the bar. */
export function TempoBaseItems() {
  const tempoBase = useMetronomeStore((s) => shownSetup(s).tempoBase);
  return (
    <DropdownMenu.Content
      side="bottom"
      align="center"
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
  );
}

/** Tap, as a big hardware key that flashes on every tap (also the T key). */
export function TapKey() {
  const [flash, setFlash] = useState(0);
  return (
    <Tooltip label={m.tapHint} shortcut="tapTempo">
      <button
        type="button"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          tapMetronome();
          setFlash((n) => n + 1);
        }}
        className="hw flex size-24 flex-col items-center justify-center gap-1.5 rounded-panel text-fg-muted transition-[filter] hover:brightness-125 hover:text-fg active:translate-y-px"
      >
        <span
          key={flash}
          aria-hidden
          className={cn(
            "size-2 rounded-full bg-led-off",
            flash > 0 && "animate-[tap-flash_220ms_ease-out]",
          )}
        />
        <span className="text-sm font-semibold tracking-[0.14em] uppercase">{m.tap}</span>
      </button>
    </Tooltip>
  );
}
