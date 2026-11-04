import { useRef } from "react";
import { formatTime } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, usePlayerStore } from "@/stores/player";

/** "position / duration", updated every frame without re-rendering React. */
export function TimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);

  useAnimationFrame(() => {
    const element = ref.current;
    if (!element) return;
    const duration = usePlayerStore.getState().track?.duration ?? 0;
    const text = `${formatTime(currentPosition())} / ${formatTime(duration)}`;
    if (element.textContent !== text) element.textContent = text;
  });

  return <span ref={ref} className="w-36 text-sm text-fg-muted tabular" />;
}
