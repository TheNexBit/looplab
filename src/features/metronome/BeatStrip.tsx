import { useRef } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPulses, shownSetup, useMetronomeStore } from "@/stores/metronome";
import type { BeatState } from "./types";

const m = t.metronome;

/** Look of a pad by the state of its felt beat. */
const padLook: Record<BeatState, string> = {
  accent: "border-transparent bg-accent text-on-accent font-semibold",
  normal: "hw text-fg",
  muted: "border-dashed border-border bg-transparent text-fg-subtle",
};

/** Level marks under the number: how loud the beat is, like a drum machine's velocity. */
const LEVEL: Record<BeatState, number> = { accent: 3, normal: 2, muted: 0 };

/** The felt beats of the bar: each one with the pulses it spans (one each without a grouping). */
export function feltBeatSpans(
  beats: number,
  grouping: number[] | null,
): { first: number; size: number }[] {
  const sizes = grouping ?? Array.from({ length: beats }, () => 1);
  let first = 0;
  return sizes.map((size) => {
    const beat = { first, size };
    first += size;
    return beat;
  });
}

/**
 * The bar as a row of pads, like the steps of a drum machine: one group per felt beat, as
 * wide as its pulses (a 2+2+3 bar looks as uneven as it feels); a click on a group cycles
 * forte → normale → muto. A lamp over each pulse lights while it plays (blue in the
 * count-in); dots show the subdivisions. Under it, the cross rhythm on a lane of its own.
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
    <div className="well space-y-3 rounded-panel p-3">
      <div className="flex gap-3">
        {feltBeatSpans(beats, grouping).map(({ first, size }, beat) => {
          const state = states[beat] ?? "normal";
          return (
            <Tooltip key={first} label={m.beatKey(beat + 1, m.beatStates[state])}>
              <button
                type="button"
                onClick={() => cycleBeat(beat)}
                style={{ flexGrow: size, flexBasis: 0 }}
                className="group grid min-w-0"
                aria-label={m.beatKey(beat + 1, m.beatStates[state])}
              >
                <span
                  className="grid gap-1.5"
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
                        className="group/pulse flex min-w-0 flex-col gap-1.5"
                      >
                        {/* Lamp */}
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 rounded-full bg-led-off transition-[background-color,box-shadow] duration-75",
                            "group-data-[lit=true]/pulse:bg-accent group-data-[lit=true]/pulse:shadow-[0_0_8px_var(--color-accent)]",
                            "group-data-[count-in=true]/pulse:group-data-[lit=true]/pulse:bg-cue group-data-[count-in=true]/pulse:group-data-[lit=true]/pulse:shadow-[0_0_8px_var(--color-cue)]",
                          )}
                        />
                        {/* Pad */}
                        <span
                          className={cn(
                            "flex h-20 flex-col items-center justify-center gap-1.5 rounded-control border font-mono text-lg tabular transition-[filter] duration-75 group-hover:brightness-110",
                            padLook[state],
                            inside > 0 && "opacity-75",
                            "group-data-[lit=true]/pulse:brightness-125",
                          )}
                        >
                          {pulse + 1}
                          <span aria-hidden className="flex h-2 items-end gap-0.5">
                            {inside === 0 &&
                              Array.from({ length: LEVEL[state] }, (_, level) => (
                                <span
                                  // biome-ignore lint/suspicious/noArrayIndexKey: one mark per level, in order
                                  key={level}
                                  className="w-1 rounded-[1px] bg-current opacity-70"
                                  style={{ height: `${(level + 1) * 33}%` }}
                                />
                              ))}
                          </span>
                        </span>
                        {/* Subdivisions */}
                        <span aria-hidden className="flex h-1.5 justify-center gap-1">
                          {subdivision > 1 &&
                            Array.from({ length: subdivision }, (_, dot) => (
                              <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: one dot per click, in order
                                key={dot}
                                className={cn(
                                  "size-1.5 rounded-full bg-fg-subtle",
                                  dot > 0 && "opacity-40",
                                )}
                              />
                            ))}
                        </span>
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
