import type { PointerEvent as ReactPointerEvent } from "react";
import { DRAG_PX, timeAtX } from "@/features/waveform/pointer";
import { followPointer } from "@/lib/followPointer";

/**
 * Pointer handler for things dragged along the time axis of the detailed view.
 * `onMove` receives the time under the pointer; `onClick` runs when it did not move.
 * `area` is the element whose width maps to the visible time span.
 */
export function dragAlongTime(
  event: ReactPointerEvent,
  area: HTMLElement | null,
  onMove: (time: number) => void,
  onClick?: () => void,
) {
  if (event.button !== 0 || !area) return;
  event.stopPropagation();
  const startX = event.clientX;
  let dragging = false;

  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  followPointer(
    event,
    (e) => {
      if (!dragging && Math.abs(e.clientX - startX) > DRAG_PX) dragging = true;
      if (dragging) onMove(timeAtX(area, e.clientX));
    },
    () => {
      if (!dragging) onClick?.();
      // The browser still fires a click after a drag: swallow it so it does not count as one
      else window.addEventListener("click", swallow, { capture: true, once: true });
    },
  );
}
