import { useEffect, useRef } from "react";
import { MarkerFlags } from "@/features/markers/MarkerFlags";
import { snapTime } from "@/features/markers/snap";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { drawRuler, drawWaveform } from "./draw";
import { LoopOverlay, placeLoopOverlay } from "./LoopOverlay";
import { DRAG_PX, EDGE_PX } from "./pointer";
import { useCanvas } from "./useCanvas";

const RULER_CSS = 20;
/** Wheel sensitivity: a mouse notch (~100) zooms ~16%, a touchpad pinch is finer. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.01;
const LINE_HEIGHT_PX = 16;

/** What a pointer press on the waveform is doing. */
type Gesture =
  | { kind: "press"; x: number; time: number; onBrace: boolean }
  | { kind: "select"; anchor: number }
  | { kind: "edge"; fixed: number }
  | { kind: "move"; grab: number; length: number };

/**
 * Zoomable waveform, with the gestures of a DAW:
 * - click anywhere: playhead there; Shift+click: stretch the loop to that point
 * - drag on the waveform or the ruler: a new loop (even over the current one)
 * - drag the loop bar in the ruler: move the loop; drag a loop edge: resize it
 * - wheel: zoom around the pointer; Shift+wheel: scroll
 * With the magnet on, loop ends stick to nearby points.
 */
export function DetailView() {
  const peaks = usePlayerStore((s) => s.peaks);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
  const braceRef = useRef<HTMLDivElement>(null);
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
    placeLoopOverlay(braceRef.current, toX, "px");
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

    /**
     * The loop end that is not under the pointer, when the pointer is on the other one.
     * On a narrow loop the edges' reach shrinks, so its middle stays clickable.
     */
    const edgeUnder = (clientX: number): number | null => {
      const region = useLoopStore.getState().region();
      if (!region) return null;
      const reach = Math.min(EDGE_PX, (xOf(region.end) - xOf(region.start)) / 4);
      if (Math.abs(xOf(region.start) - clientX) <= reach) return region.end;
      if (Math.abs(xOf(region.end) - clientX) <= reach) return region.start;
      return null;
    };
    const insideLoop = (time: number) => {
      const region = useLoopStore.getState().region();
      return region !== null && time > region.start && time < region.end;
    };
    const inRuler = (clientY: number) => clientY - element.getBoundingClientRect().top < RULER_CSS;
    const snap = (time: number) => snapTime(time, element);

    /** Shift+click: the nearer loop end jumps to `time` (or a loop from the playhead is made). */
    const stretchLoopTo = (time: number) => {
      const loop = useLoopStore.getState();
      const region = loop.region();
      if (region) {
        const nearStart = Math.abs(time - region.start) < Math.abs(time - region.end);
        loop.setRegion(nearStart ? time : region.start, nearStart ? region.end : time, duration());
      } else {
        loop.setRegion(loop.start ?? currentPosition(), time, duration());
      }
    };

    /** Moves the whole loop, sticking whichever end is closer to a point. */
    const moveLoop = (start: number, length: number) => {
      const fromStart = snap(start) - start;
      const fromEnd = snap(start + length) - (start + length);
      const shift =
        fromStart !== 0 && (fromEnd === 0 || Math.abs(fromStart) <= Math.abs(fromEnd))
          ? fromStart
          : fromEnd;
      const clamped = Math.min(Math.max(start + shift, 0), Math.max(0, duration() - length));
      useLoopStore.getState().setRegion(clamped, clamped + length, duration());
    };

    const cursorFor = (event: PointerEvent) => {
      if (edgeUnder(event.clientX) !== null) return "ew-resize";
      return inRuler(event.clientY) && insideLoop(timeAt(event.clientX)) ? "grab" : "";
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
      const time = timeAt(event.clientX);
      if (event.shiftKey) {
        stretchLoopTo(snap(time));
        return;
      }
      element.setPointerCapture(event.pointerId);
      const fixed = edgeUnder(event.clientX);
      gesture =
        fixed !== null
          ? { kind: "edge", fixed }
          : {
              kind: "press",
              x: event.clientX,
              time,
              onBrace: inRuler(event.clientY) && insideLoop(time),
            };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture) {
        element.style.cursor = cursorFor(event);
        return;
      }
      const time = timeAt(event.clientX);
      if (gesture.kind === "press" && Math.abs(event.clientX - gesture.x) > DRAG_PX) {
        const region = useLoopStore.getState().region();
        if (gesture.onBrace && region) {
          gesture = {
            kind: "move",
            grab: gesture.time - region.start,
            length: region.end - region.start,
          };
          element.style.cursor = "grabbing";
        } else {
          gesture = { kind: "select", anchor: snap(gesture.time) };
        }
      }
      const loop = useLoopStore.getState();
      if (gesture.kind === "select") loop.setRegion(gesture.anchor, snap(time), duration());
      if (gesture.kind === "edge") loop.setRegion(gesture.fixed, snap(time), duration());
      if (gesture.kind === "move") moveLoop(time - gesture.grab, gesture.length);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (gesture?.kind === "press") usePlayerStore.getState().seek(gesture.time);
      gesture = null;
      element.style.cursor = cursorFor(event);
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
      <LoopOverlay ref={braceRef} variant="brace" height={RULER_CSS - 4} />
      <MarkerFlags area={containerRef} top={RULER_CSS} />
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-fg will-change-transform"
      />
    </div>
  );
}
