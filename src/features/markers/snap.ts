import { useMarkersStore } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";

/** How close, in CSS pixels, the pointer must come to a point for the magnet to catch it. */
export const SNAP_PX = 10;

/** The point closest to `time` within `threshold` seconds, or `time` itself if none is. */
export function nearestWithin(time: number, points: number[], threshold: number): number {
  let best = time;
  let bestDistance = threshold;
  for (const point of points) {
    const distance = Math.abs(point - time);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/** What the thing being dragged must not stick to: itself. */
export interface SnapExclude {
  markerId?: string;
  sectionId?: string;
}

/**
 * With the magnet on, moves `time` onto the nearest marker, bar, section start,
 * playhead or track edge, if one is within `SNAP_PX` on screen.
 * `area` is the element whose width shows the visible time span.
 */
export function snapTime(
  time: number,
  area: HTMLElement | null,
  exclude: SnapExclude = {},
): number {
  if (!useSettingsStore.getState().snap || !area) return time;
  const { span } = useViewStore.getState();
  const secondsPerPixel = span / Math.max(1, area.getBoundingClientRect().width);
  const { markers, sections } = useMarkersStore.getState();
  const points = [
    0,
    usePlayerStore.getState().track?.duration ?? 0,
    currentPosition(),
    ...markers.filter((m) => m.id !== exclude.markerId).map((m) => m.time),
    ...sections.filter((s) => s.id !== exclude.sectionId).map((s) => s.start),
  ];
  return nearestWithin(time, points, SNAP_PX * secondsPerPixel);
}
