import type { PointerEvent as ReactPointerEvent } from "react";
import { DRAG_PX } from "@/features/waveform/pointer";
import { useViewStore } from "@/stores/view";

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
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  let dragging = false;

  const timeAt = (clientX: number) => {
    const rect = area.getBoundingClientRect();
    const { start, span } = useViewStore.getState();
    return start + ((clientX - rect.left) / rect.width) * span;
  };
  const move = (e: PointerEvent) => {
    if (!dragging && Math.abs(e.clientX - startX) > DRAG_PX) dragging = true;
    if (dragging) onMove(timeAt(e.clientX));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
    if (!dragging) onClick?.();
    // The browser still fires a click after a drag: swallow it so it does not count as one
    else window.addEventListener("click", swallow, { capture: true, once: true });
  };
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}
