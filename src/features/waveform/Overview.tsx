import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { drawWaveform } from "./draw";
import { useCanvas } from "./useCanvas";

/**
 * Whole track at a glance. The highlighted box is the part shown in the detailed view:
 * drag it to move the view; click elsewhere to jump there.
 */
export function Overview() {
  const peaks = usePlayerStore((s) => s.peaks);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(true);
  const { ref: canvasRef, size } = useCanvas(() => {
    dirty.current = true;
  });

  useEffect(() => {
    if (peaks) dirty.current = true;
  }, [peaks]);

  useAnimationFrame(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !peaks || duration <= 0) return;

    if (dirty.current) {
      const { width, height } = size.current;
      ctx.clearRect(0, 0, width, height);
      drawWaveform(
        ctx,
        peaks,
        { start: 0, span: duration, width, height },
        themeColor("fg-subtle"),
      );
      dirty.current = false;
    }

    const { start, span } = useViewStore.getState();
    const box = windowRef.current;
    if (box) {
      box.style.left = `${(start / duration) * 100}%`;
      box.style.width = `${(span / duration) * 100}%`;
    }
    const playhead = playheadRef.current;
    if (playhead) playhead.style.left = `${(currentPosition() / duration) * 100}%`;
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let dragOffset: number | null = null;

    const timeAt = (clientX: number) => {
      const rect = element.getBoundingClientRect();
      return (
        ((clientX - rect.left) / rect.width) * (usePlayerStore.getState().track?.duration ?? 0)
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const time = timeAt(event.clientX);
      const { start, span, centerOn } = useViewStore.getState();
      if (time >= start && time <= start + span) {
        dragOffset = time - start;
        element.setPointerCapture(event.pointerId);
      } else {
        usePlayerStore.getState().seek(time);
        centerOn(time);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragOffset !== null) useViewStore.getState().scrollTo(timeAt(event.clientX) - dragOffset);
    };
    const onPointerUp = () => {
      dragOffset = null;
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-14 shrink-0 cursor-pointer overflow-hidden rounded-panel border border-border bg-surface"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label={t.waveform.overview}
      />
      <div
        ref={windowRef}
        className="absolute top-0 bottom-0 cursor-grab rounded-[6px] border border-accent bg-accent-soft active:cursor-grabbing"
      />
      <div ref={playheadRef} className="pointer-events-none absolute top-0 bottom-0 w-px bg-fg" />
    </div>
  );
}
