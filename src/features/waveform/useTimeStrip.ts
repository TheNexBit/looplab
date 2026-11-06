import { useRef } from "react";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { trackDuration } from "@/stores/player";
import { useViewStore } from "@/stores/view";

/**
 * A strip as long as the whole track, slid and stretched every frame so the visible time
 * span fills its parent. Children placed in percent of the track then line up with the
 * detailed view without re-rendering while it scrolls or zooms.
 */
export function useTimeStrip() {
  const ref = useRef<HTMLDivElement>(null);

  useAnimationFrame(() => {
    const strip = ref.current;
    if (!strip) return;
    const duration = trackDuration();
    const { start, span } = useViewStore.getState();
    const left = `${(-start / span) * 100}%`;
    const width = `${(duration / span) * 100}%`;
    if (strip.style.left !== left) strip.style.left = left;
    if (strip.style.width !== width) strip.style.width = width;
  });

  return ref;
}

/** Position of `time` along a strip of `useTimeStrip`, in percent. */
export const percentOfTrack = (time: number, duration: number) =>
  duration > 0 ? (time / duration) * 100 : 0;
