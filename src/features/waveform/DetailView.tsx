import { useEffect, useRef } from "react";
import { MarkerFlags } from "@/features/markers/MarkerFlags";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { drawRuler, drawWaveform } from "./draw";
import { LoopOverlay, placeLoopOverlay } from "./LoopOverlay";
import { useCanvas } from "./useCanvas";

const RULER_CSS = 20;
/** Wheel sensitivity: a mouse notch (~100) zooms ~16%, a touchpad pinch is finer. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;
const LINE_HEIGHT_PX = 16;
/** Pointer travel that turns a click into a drag, and reach of a loop edge, in CSS pixels. */
const DRAG_PX = 4;
const EDGE_PX = 6;

/** What a pointer press on the waveform is doing. */
type Gesture =
  | { kind: "press"; x: number; time: number }
  | { kind: "select"; anchor: number }
  | { kind: "edge"; fixed: number };

/**
 * Zoomable waveform. Wheel zooms around the pointer, Shift+wheel scrolls,
 * click seeks, drag selects a loop, dragging a loop edge resizes it.
 */
export function DetailView() {
  const peaks = usePlayerStore((s) => s.peaks);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
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
    if (player.playing && useSettingsStore.getState().followPlayhead)
      viewStore.followPlayhead(position);
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

    const toX = (time: number) => ((time - start) / span) * (width / dpr);
    placeLoopOverlay(loopRef.current, toX, "px");
    const playhead = playheadRef.current;
    if (playhead) {
      playhead.style.transform = `translateX(${toX(position)}px)`;
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
    const xOf = (time: number) => {
      const rect = element.getBoundingClientRect();
      const { start, span } = useViewStore.getState();
      return rect.left + ((time - start) / span) * rect.width;
    };
    const duration = () => usePlayerStore.getState().track?.duration ?? 0;

    /** The loop end that is not under the pointer, when the pointer is on the other one. */
    const edgeUnder = (clientX: number): number | null => {
      const region = useLoopStore.getState().region();
      if (!region) return null;
      if (Math.abs(xOf(region.start) - clientX) <= EDGE_PX) return region.end;
      if (Math.abs(xOf(region.end) - clientX) <= EDGE_PX) return region.start;
      return null;
    };

    let gesture: Gesture | null = null;

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
      // Marker flags handle their own presses
      if (event.target instanceof Element && event.target.closest("[data-no-seek]")) return;
      element.setPointerCapture(event.pointerId);
      const fixed = edgeUnder(event.clientX);
      gesture =
        fixed !== null
          ? { kind: "edge", fixed }
          : { kind: "press", x: event.clientX, time: timeAt(event.clientX) };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture) {
        element.style.cursor = edgeUnder(event.clientX) !== null ? "ew-resize" : "";
        return;
      }
      if (gesture.kind === "press" && Math.abs(event.clientX - gesture.x) > DRAG_PX) {
        gesture = { kind: "select", anchor: gesture.time };
      }
      const time = timeAt(event.clientX);
      if (gesture.kind === "select")
        useLoopStore.getState().setRegion(gesture.anchor, time, duration());
      if (gesture.kind === "edge")
        useLoopStore.getState().setRegion(gesture.fixed, time, duration());
    };

    const onPointerUp = () => {
      if (gesture?.kind === "press") usePlayerStore.getState().seek(gesture.time);
      gesture = null;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
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
      <LoopOverlay ref={loopRef} />
      <MarkerFlags area={containerRef} top={RULER_CSS} />
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-fg will-change-transform"
      />
    </div>
  );
}
