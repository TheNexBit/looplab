import type { Ref } from "react";
import { cn } from "@/lib/cn";
import { useLoopStore } from "@/stores/loop";

const VARIANTS = {
  /** Shading over the whole height of a waveform */
  region:
    "top-0 bottom-0 border-x-2 border-accent bg-accent-soft data-[enabled=false]:border-fg-subtle data-[enabled=false]:bg-fg/5",
  /** Bar in the time ruler, like a DAW loop brace: grab its middle to move the loop */
  brace:
    "top-0.5 rounded-[3px] border-x-[3px] border-accent bg-accent/45 data-[enabled=false]:border-fg-subtle data-[enabled=false]:bg-fg-subtle/30",
} as const;

/** The loop drawn over a waveform. Position it each frame with `placeLoopOverlay`. */
export function LoopOverlay({
  ref,
  variant = "region",
  height,
}: {
  ref: Ref<HTMLDivElement>;
  variant?: keyof typeof VARIANTS;
  /** CSS pixels, for the brace (the region spans the full height) */
  height?: number;
}) {
  return (
    <div
      ref={ref}
      data-enabled="false"
      className={cn("pointer-events-none absolute hidden", VARIANTS[variant])}
      style={height ? { height } : undefined}
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
