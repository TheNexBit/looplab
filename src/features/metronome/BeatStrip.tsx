import { useRef } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPulses, shownSetup, useMetronomeStore } from "@/stores/metronome";
import type { BeatState } from "./types";

const m = t.metronome;

const cellLook: Record<BeatState, string> = {
  accent: "border-edge bg-accent text-on-accent font-semibold",
  normal: "hw text-fg",
  muted: "border-dashed border-border bg-well text-fg-subtle",
};

/** The felt beats of the bar: each one with the pulses it spans (one each without a grouping). */
function feltBeats(beats: number, grouping: number[] | null): { first: number; size: number }[] {
  const sizes = grouping ?? Array.from({ length: beats }, () => 1);
  let first = 0;
  return sizes.map((size) => {
    const beat = { first, size };
    first += size;
    return beat;
  });
}

/**
 * The bar as it is played: one block per felt beat, as wide as its pulses (a 2+2+3 bar looks
 * as uneven as it feels), a click cycles its state. The pulse being heard lights up; dots
 * show the subdivisions. Under it, the cross rhythm on a row of its own.
 */
export function BeatStrip() {
  const beats = useMetronomeStore((s) => shownSetup(s).beats);
  const grouping = useMetronomeStore((s) => shownSetup(s).grouping);
  const states = useMetronomeStore((s) => shownSetup(s).states);
  const subdivision = useMetronomeStore((s) => shownSetup(s).subdivision);
  const cross = useMetronomeStore((s) => shownSetup(s).cross);
  const cycleBeat = useMetronomeStore((s) => s.cycleBeat);
  const pulseRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const crossRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Light the pulse being heard, outside React: 60 fps without re-rendering
  useAnimationFrame(() => {
    const pulses = currentPulses();
    const inBar = pulses === null ? -1 : ((pulses % beats) + beats) % beats;
    const pulse = Math.floor(inBar);
    const counting = pulses !== null && pulses < 0;
    pulseRefs.current.forEach((cell, index) => {
      if (!cell) return;
      cell.dataset.lit = String(index === pulse);
      cell.dataset.countIn = String(counting);
    });
    const crossIndex = inBar < 0 || counting ? -1 : Math.floor((inBar / beats) * cross);
    crossRefs.current.forEach((cell, index) => {
      if (cell) cell.dataset.lit = String(index === crossIndex);
    });
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {feltBeats(beats, grouping).map(({ first, size }, beat) => {
          const state = states[beat] ?? "normal";
          return (
            <Tooltip key={first} label={m.beatKey(beat + 1, m.beatStates[state])}>
              <button
                type="button"
                onClick={() => cycleBeat(beat)}
                style={{ flexGrow: size, flexBasis: 0 }}
                className={cn(
                  "grid min-w-0 gap-1 rounded-control border p-1 transition-[filter] hover:brightness-110",
                  cellLook[state],
                )}
              >
                <span
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: size }, (_, inside) => {
                    const pulse = first + inside;
                    return (
                      <span
                        key={pulse}
                        ref={(cell) => {
                          pulseRefs.current[pulse] = cell;
                        }}
                        className={cn(
                          "flex h-12 flex-col items-center justify-center gap-1 rounded-[3px] font-mono text-sm tabular transition-[background-color,box-shadow] duration-75",
                          inside > 0 && "opacity-70",
                          "data-[lit=true]:bg-white/25 data-[lit=true]:shadow-[0_0_10px_var(--color-accent)]",
                          "data-[lit=true]:data-[count-in=true]:bg-cue/30",
                        )}
                      >
                        {pulse + 1}
                        {subdivision > 1 && (
                          <span aria-hidden className="flex gap-0.5">
                            {Array.from({ length: subdivision }, (_, dot) => (
                              <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: one dot per click, in order
                                key={dot}
                                className={cn(
                                  "size-1 rounded-full bg-current",
                                  dot > 0 && "opacity-40",
                                )}
                              />
                            ))}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      {cross > 0 && (
        <div className="flex gap-1" role="img" aria-label={m.crossRow(cross, beats)}>
          {Array.from({ length: cross }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one cell per cross pulse, in order
              key={index}
              ref={(cell) => {
                crossRefs.current[index] = cell;
              }}
              className="flex h-7 flex-1 items-center justify-center rounded-control border border-cue/40 bg-cue/10 font-mono text-[11px] text-cue transition-[background-color] duration-75 data-[lit=true]:bg-cue/45"
            >
              {index + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
