import type { Ref } from "react";
import { useLoopStore } from "@/stores/loop";

/** Shaded loop region drawn over a waveform. Position it each frame with `placeLoopOverlay`. */
export function LoopOverlay({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-enabled="false"
      className="pointer-events-none absolute top-0 bottom-0 hidden border-x-2 border-accent bg-accent-soft data-[enabled=false]:border-fg-subtle data-[enabled=false]:bg-fg/5"
    />
  );
}

/**
 * Moves the overlay over the current loop. `toX` maps a time to a horizontal
 * position in `unit` (pixels in the detailed view, percent in the overview).
 */
export function placeLoopOverlay(
  element: HTMLDivElement | null,
  toX: (time: number) => number,
  unit: "px" | "%",
) {
  if (!element) return;
  const loop = useLoopStore.getState();
  const region =
    loop.region() ?? (loop.start !== null ? { start: loop.start, end: loop.start } : null);
  if (!region) {
    element.style.display = "none";
    return;
  }
  const left = toX(region.start);
  element.style.display = "block";
  element.style.left = `${left}${unit}`;
  element.style.width = `${toX(region.end) - left}${unit}`;
  element.dataset.enabled = String(loop.enabled && loop.region() !== null);
}
