import { nearestBeat } from "@/features/practice/tempo";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition, trackDuration } from "@/stores/player";
import { currentTempoMap } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { snapSuspended } from "./snapHold";

/** How close, in CSS pixels, the pointer must come to a point for the magnet to catch it. */
const SNAP_PX = 10;

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
interface SnapExclude {
  markerId?: string;
  sectionId?: string;
  /** While the loop itself is being drawn, moved or resized */
  loop?: boolean;
  /** While the playhead itself is being placed */
  playhead?: boolean;
}

/**
 * With the magnet on (and Shift not held: Shift suspends it, as in Reaper), moves `time`
 * onto the nearest marker, bar, section edge,
 * loop edge, playhead, beat of the grid or track edge, if one is within `SNAP_PX` on screen
 * (like Reaper's snapping to the time selection).
 * `area` is the element whose width shows the visible time span.
 */
export function snapTime(
  time: number,
  area: HTMLElement | null,
  exclude: SnapExclude = {},
): number {
  if (!useSettingsStore.getState().snap || snapSuspended() || !area) return time;
  const { span } = useViewStore.getState();
  const secondsPerPixel = span / Math.max(1, area.getBoundingClientRect().width);
  const { markers, sections } = useMarkersStore.getState();
  const region = exclude.loop ? null : useLoopStore.getState().region();
  const grid = useSettingsStore.getState().showGrid ? currentTempoMap() : null;
  const points = [
    0,
    trackDuration(),
    ...(exclude.playhead ? [] : [currentPosition()]),
    ...(region ? [region.start, region.end] : []),
    ...markers.filter((m) => m.id !== exclude.markerId).map((m) => m.time),
    ...sections.filter((s) => s.id !== exclude.sectionId).flatMap((s) => [s.start, s.end]),
    ...(grid ? [nearestBeat(time, grid)] : []),
  ];
  return nearestWithin(time, points, SNAP_PX * secondsPerPixel);
}
