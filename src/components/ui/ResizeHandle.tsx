import type { PointerEvent } from "react";
import { cn } from "@/lib/cn";

interface ResizeHandleProps {
  /** A horizontal bar dragged up and down (else a vertical bar dragged sideways) */
  vertical?: boolean;
  /** Current size, as shown (read when the drag starts and after each resize) */
  size: () => number;
  /** New size: the starting size plus the distance dragged (minus, with `grows: "before"`) */
  onResize: (size: number) => void;
  /** The panel sits before the handle (left / above): dragging away from it grows it */
  grows?: "after" | "before";
  onStart?: () => void;
  onEnd?: () => void;
  /** Double-click: back to the default size */
  onReset?: () => void;
  label: string;
  /** "bar": a visible bar between panels; "edge": invisible over a panel's border, lit on hover */
  look?: "bar" | "edge";
}

/**
 * Drag bar between two panels. The edge stays under the hand: once the panel stops at a
 * limit, the drag is taken up again from there, so dragging back moves it at once
 * instead of first making up the distance dragged past the limit.
 */
export function ResizeHandle({
  vertical = false,
  size,
  onResize,
  grows = "after",
  onStart,
  onEnd,
  onReset,
  label,
  look = "bar",
}: ResizeHandleProps) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let start = vertical ? event.clientY : event.clientX;
    let initial = size();
    const sign = grows === "after" ? 1 : -1;
    onStart?.();
    const move = (e: globalThis.PointerEvent) => {
      const at = vertical ? e.clientY : e.clientX;
      const wanted = initial + sign * (at - start);
      onResize(wanted);
      const reached = size();
      if (Math.abs(reached - wanted) >= 1) {
        start = at;
        initial = reached;
      }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      onEnd?.();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <div
      aria-hidden
      title={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      className={cn(
        "shrink-0 transition-colors hover:bg-accent",
        look === "bar"
          ? // A thin bar, easy to grab: it catches the mouse a few pixels around it too
            cn(
              "relative z-10 bg-border after:absolute after:content-['']",
              vertical
                ? "after:inset-x-0 after:-inset-y-1.5"
                : "after:inset-y-0 after:-inset-x-1.5",
            )
          : "absolute inset-y-0 left-0 z-10 bg-transparent",
        vertical ? "h-1 cursor-row-resize" : "w-1.5 cursor-col-resize",
      )}
    />
  );
}
