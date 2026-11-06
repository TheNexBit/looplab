import { useRef } from "react";
import { t } from "@/i18n";
import { formatTime } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, usePlayerStore } from "@/stores/player";

/** Amber display: position in large digits, duration beside the label. Updated every frame without re-rendering React. */
export function TimeDisplay() {
  const positionRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef<HTMLSpanElement>(null);

  useAnimationFrame(() => {
    const position = positionRef.current;
    const total = durationRef.current;
    if (!position || !total) return;
    const text = formatTime(currentPosition());
    const duration = `/ ${formatTime(usePlayerStore.getState().track?.duration ?? 0)}`;
    if (position.textContent !== text) position.textContent = text;
    if (total.textContent !== duration) total.textContent = duration;
  });

  return (
    <div className="flex h-[58px] w-[104px] shrink-0 xl:w-44 flex-col justify-center gap-1 rounded-panel border border-black bg-lcd px-3 shadow-[inset_0_2px_6px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.05)]">
      <div className="flex items-baseline justify-between">
        <span className="hidden text-[9px] font-medium tracking-[0.16em] text-lcd-dim uppercase xl:inline">
          {t.transport.position}
        </span>
        <span ref={durationRef} className="font-mono text-[11px] text-lcd-dim tabular" />
      </div>
      <span
        ref={positionRef}
        className="font-mono text-[20px] leading-none xl:text-[26px] font-medium text-lcd-fg tabular [text-shadow:0_0_8px_rgb(255_170_60/0.45)]"
      />
    </div>
  );
}
