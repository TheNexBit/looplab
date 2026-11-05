import { Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import type { RefObject } from "react";
import { menuContent, menuItem } from "@/components/ui/menu";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { beatNumbers, useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { dragAlongTime } from "./dragAlongTime";
import { clampToTrack } from "./sectionActions";
import { snapTime } from "./snap";

/**
 * Marker lines over the detailed waveform, with a flag under the ruler:
 * click the flag to jump there, drag it to move the marker, right-click to delete.
 */
export function MarkerFlags({
  area,
  top,
}: {
  area: RefObject<HTMLDivElement | null>;
  top: number;
}) {
  const markers = useMarkersStore((s) => s.markers);
  const start = useViewStore((s) => s.start);
  const span = useViewStore((s) => s.span);
  const numbers = beatNumbers(markers);

  return markers.map((marker) => {
    const left = ((marker.time - start) / span) * 100;
    if (left < -1 || left > 101) return null;
    const beat = marker.kind === "beat";
    const label = beat ? String(numbers.get(marker.id)) : marker.label || "◆";
    return (
      <div key={marker.id}>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 w-px",
            beat ? "bg-accent/60" : "bg-fg-muted/60",
          )}
          style={{ left: `${left}%`, top }}
        />
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <button
              type="button"
              data-no-seek
              title={beat ? `${t.markers.bar} ${label}` : t.markers.marker}
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
                "absolute h-4 min-w-4 -translate-x-1/2 cursor-grab rounded-[4px] px-1 text-[10px] leading-4 font-medium tabular active:cursor-grabbing",
                beat ? "bg-accent text-white" : "bg-fg-muted text-bg-to",
              )}
              style={{ left: `${left}%`, top }}
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
  });
}
