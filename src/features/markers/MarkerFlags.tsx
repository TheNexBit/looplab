import { Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import type { RefObject } from "react";
import { menuContent, menuItem } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { percentOfTrack, useTimeStrip } from "@/features/waveform/useTimeStrip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { beatNumbers, useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { dragAlongTime } from "./dragAlongTime";
import { clampToTrack } from "./sectionActions";
import { snapTime } from "./snap";

/**
 * Marker lines over the detailed waveform, with a flag under the ruler:
 * click the flag to jump there, drag it to move the marker, right-click to delete.
 * They sit on a strip that follows the view, so scrolling never re-renders them.
 */
export function MarkerFlags({
  area,
  top,
}: {
  area: RefObject<HTMLDivElement | null>;
  top: number;
}) {
  const markers = useMarkersStore((s) => s.markers);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const strip = useTimeStrip();
  const numbers = beatNumbers(markers);

  return (
    <div ref={strip} className="pointer-events-none absolute top-0 bottom-0">
      {markers.map((marker) => {
        const left = `${percentOfTrack(marker.time, duration)}%`;
        const beat = marker.kind === "beat";
        const label = beat ? String(numbers.get(marker.id)) : marker.label || "◆";
        return (
          <div key={marker.id}>
            <div
              aria-hidden
              className={cn("absolute bottom-0 w-px", beat ? "bg-fg/10" : "bg-accent/60")}
              style={{ left, top }}
            />
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  data-no-seek
                  title={withRightClick(
                    beat ? `${t.markers.bar} ${label}` : t.markers.marker,
                    t.markers.markerRightClick,
                  )}
                  onPointerDown={(event) =>
                    dragAlongTime(
                      event,
                      area.current,
                      (time) =>
                        useMarkersStore
                          .getState()
                          .moveMarker(
                            marker.id,
                            clampToTrack(snapTime(time, area.current, { markerId: marker.id })),
                          ),
                      () => usePlayerStore.getState().seek(marker.time),
                    )
                  }
                  className={cn(
                    "pointer-events-auto absolute h-4 min-w-4 -translate-x-1/2 cursor-grab rounded-[2px] px-1 font-mono text-[9px] leading-4 font-bold tabular active:cursor-grabbing",
                    beat ? "bg-led-off text-fg" : "bg-accent text-on-accent",
                  )}
                  style={{ left, top }}
                >
                  {label}
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={menuContent}>
                  <ContextMenu.Item
                    className={menuItem}
                    onSelect={() => useMarkersStore.getState().removeMarker(marker.id)}
                  >
                    <Trash2 className="size-4" />
                    {t.markers.remove}
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
