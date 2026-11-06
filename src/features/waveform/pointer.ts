import { useViewStore } from "@/stores/view";

/** Pointer travel, in CSS pixels, that turns a click into a drag. Shared by every waveform gesture. */
export const DRAG_PX = 4;
/** Reach of a loop edge, in CSS pixels (shrunk on narrow loops). */
export const EDGE_PX = 6;

/** Time under `clientX` in the detailed view; `area` is the element showing the visible span. */
export function timeAtX(area: HTMLElement, clientX: number): number {
  const rect = area.getBoundingClientRect();
  const { start, span } = useViewStore.getState();
  return start + ((clientX - rect.left) / rect.width) * span;
}
