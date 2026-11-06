import { clamp } from "@/lib/time";
import { restartAt, useLoopStore } from "@/stores/loop";
import type { SectionRange } from "@/stores/markers";
import { trackDuration, usePlayerStore } from "@/stores/player";

/** Loops a section and moves the playhead to where each repetition starts. */
export function loopSection(range: SectionRange) {
  const loop = useLoopStore.getState();
  loop.setRegion(range.start, range.end, trackDuration());
  usePlayerStore.getState().seek(restartAt(range, loop.leadIn));
}

/** Keeps a dragged marker or section start inside the track. */
export const clampToTrack = (time: number) => clamp(time, 0, trackDuration());
