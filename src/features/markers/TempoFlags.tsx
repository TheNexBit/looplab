import { Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import type { RefObject } from "react";
import { menuContent, menuItem } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { nearestBeat } from "@/features/practice/tempo";
import { percentOfTrack, useTimeStrip } from "@/features/waveform/useTimeStrip";
import { t } from "@/i18n";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { dragAlongTime } from "./dragAlongTime";
import { snapSuspended } from "./snapHold";

/**
 * Where a dragged tempo marker lands: with the magnet on (and Shift not held), on a beat of
 * the tempo before it, so the bars leading up to the change stay whole, as in Reaper.
 */
function landing(index: number, time: number): number {
  const { tempoMap } = usePracticeStore.getState();
  if (!useSettingsStore.getState().snap || snapSuspended()) return time;
  const others = tempoMap.filter((_, i) => i !== index);
  return others.length > 0 ? nearestBeat(time, others) : time;
}

/**
 * The tempo markers over the detailed waveform, like Reaper's: a line where tempo or meter
 * changes and a flag at the foot ("120 · 7/8"). Click a flag to go there (the tempo display
 * and the meter then change that marker), drag it to move it, right-click to delete it.
 */
export function TempoFlags({ area }: { area: RefObject<HTMLDivElement | null> }) {
  const tempoMap = usePracticeStore((s) => s.tempoMap);
  const focus = usePracticeStore((s) => s.focus);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const strip = useTimeStrip();
  const m = t.markers;

  return (
    <div ref={strip} className="pointer-events-none absolute top-0 bottom-0">
      {tempoMap.map((marker, index) => {
        const left = `${percentOfTrack(marker.time, duration)}%`;
        const label = `${Math.round(marker.bpm * 10) / 10} · ${marker.beatsPerBar}/${marker.beatUnit}`;
        const focused = index === focus;
        return (
          <div key={marker.time}>
            <div
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-lcd-fg/35"
              style={{ left }}
            />
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  data-no-seek
                  title={withRightClick(
                    `${m.tempoMarker} ${label} — ${m.tempoMarkerHint}`,
                    m.tempoRightClick,
                  )}
                  onPointerDown={(event) =>
                    dragAlongTime(
                      event,
                      area.current,
                      (time) =>
                        usePracticeStore
                          .getState()
                          .moveTempoMarker(index, Math.max(0, landing(index, time))),
                      () => usePlayerStore.getState().seek(marker.time),
                    )
                  }
                  className={`lcd pointer-events-auto absolute bottom-1 h-4 -translate-x-1/2 cursor-grab rounded-[2px] px-1 font-mono text-[9px] leading-4 tabular whitespace-nowrap active:cursor-grabbing ${
                    focused ? "text-lcd-fg lcd-glow" : "text-lcd-dim"
                  }`}
                  style={{ left }}
                >
                  {label}
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={menuContent}>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => usePracticeStore.getState().removeTempoMarker(index)}
                  >
                    <Trash2 className="size-4" />
                    {m.removeTempoMarker}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          </div>
        );
      })}
    </div>
  );
}
