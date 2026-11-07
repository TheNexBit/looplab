/**
 * Follows the pointer pressed on `target` until it is let go: `onMove` for every move,
 * `onEnd` once, also when the press is cut short (Windows or another window takes the mouse).
 * The pointer is captured, so the drag goes on outside `target` too.
 */
export function followPointer(
  event: { pointerId: number; currentTarget: EventTarget | null },
  onMove: (event: PointerEvent) => void,
  onEnd?: (event: PointerEvent) => void,
) {
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const end = (e: PointerEvent) => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    target.removeEventListener("lostpointercapture", end);
    onEnd?.(e);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
  target.addEventListener("lostpointercapture", end);
}
