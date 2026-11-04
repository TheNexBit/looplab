import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { drawRuler, drawWaveform } from "./draw";
import { useCanvas } from "./useCanvas";

const RULER_CSS = 20;
/** Wheel sensitivity: a mouse notch (~100) zooms ~16%, a touchpad pinch is finer. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;
const LINE_HEIGHT_PX = 16;

/** Zoomable waveform: wheel zooms around the pointer, Shift+wheel scrolls, click seeks. */
export function DetailView() {
  const peaks = usePlayerStore((s) => s.peaks);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(true);
  const drawn = useRef({ start: -1, span: -1 });
  const { ref: canvasRef, size } = useCanvas(() => {
    dirty.current = true;
  });

  // New track: redraw even if the window happens to match the previous one
  useEffect(() => {
    if (peaks) dirty.current = true;
  }, [peaks]);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !peaks) return;

    const player = usePlayerStore.getState();
    const position = currentPosition(player);
    const viewStore = useViewStore.getState();
    if (player.playing) viewStore.followPlayhead(position);
    viewStore.step();
    const { start, span } = useViewStore.getState();
    const { width, height, dpr } = size.current;

    if (dirty.current || drawn.current.start !== start || drawn.current.span !== span) {
      ctx.clearRect(0, 0, width, height);
      const view = { start, span, width, height, top: RULER_CSS * dpr };
      drawRuler(ctx, view, dpr, { tick: themeColor("border"), label: themeColor("fg-subtle") });
      drawWaveform(ctx, peaks, view, themeColor("accent"));
      drawn.current = { start, span };
      dirty.current = false;
    }

    const playhead = playheadRef.current;
    if (playhead) {
      const x = ((position - start) / span) * (width / dpr);
      playhead.style.transform = `translateX(${x}px)`;
      playhead.style.visibility =
        position >= start && position <= start + span ? "visible" : "hidden";
    }
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const timeAt = (clientX: number) => {
      const rect = element.getBoundingClientRect();
      const { start, span } = useViewStore.getState();
      return start + ((clientX - rect.left) / rect.width) * span;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = useViewStore.getState();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT_PX : 1;
      const dx = (event.shiftKey ? event.deltaY : event.deltaX) * unit;
      const dy = event.shiftKey ? 0 : event.deltaY * unit;
      if (Math.abs(dx) > Math.abs(dy)) {
        view.scrollBy((dx / element.clientWidth) * view.span);
      } else {
        // Touchpad pinch arrives as wheel + Ctrl
        view.zoom(Math.exp(dy * (event.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM)), timeAt(event.clientX));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      usePlayerStore.getState().seek(timeAt(event.clientX));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-panel border border-border bg-surface"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label={t.waveform.detail}
      />
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-fg will-change-transform"
      />
    </div>
  );
}
