import type { PointerEvent } from "react";
import { cn } from "@/lib/cn";

interface ResizeHandleProps {
  /** A horizontal bar dragged up and down (else a vertical bar dragged sideways) */
  vertical?: boolean;
  /** Current size when the drag starts */
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

/** Drag bar between two panels. */
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
    const start = vertical ? event.clientY : event.clientX;
    const initial = size();
    const sign = grows === "after" ? 1 : -1;
    onStart?.();
    const move = (e: globalThis.PointerEvent) =>
      onResize(initial + sign * ((vertical ? e.clientY : e.clientX) - start));
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
        look === "bar" ? "bg-border" : "absolute inset-y-0 left-0 z-10 bg-transparent",
        vertical ? "h-1 cursor-row-resize" : "w-1.5 cursor-col-resize",
      )}
    />
  );
}
