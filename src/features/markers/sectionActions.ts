import { restartAt, useLoopStore } from "@/stores/loop";
import type { SectionRange } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";

const duration = () => usePlayerStore.getState().track?.duration ?? 0;

/** Loops a section and moves the playhead to where each repetition starts. */
export function loopSection(range: SectionRange) {
  const loop = useLoopStore.getState();
  loop.setRegion(range.start, range.end, duration());
  usePlayerStore.getState().seek(restartAt(range, loop.leadIn));
}

/** Keeps a dragged marker or section start inside the track. */
export const clampToTrack = (time: number) => Math.min(Math.max(time, 0), duration());

/** Playhead time for "add here" actions. */
export const here = () => currentPosition();
