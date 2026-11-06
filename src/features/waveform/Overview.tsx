import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { drawWaveform } from "./draw";
import { LoopOverlay, placeLoopOverlay } from "./LoopOverlay";
import { DRAG_PX } from "./pointer";
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
  const loopRef = useRef<HTMLDivElement>(null);
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
      drawWaveform(ctx, peaks, { start: 0, span: duration, width, height }, themeColor("wave-dim"));
      dirty.current = false;
    }

    const { start, span } = useViewStore.getState();
    const box = windowRef.current;
    if (box) {
      box.style.left = `${(start / duration) * 100}%`;
      box.style.width = `${(span / duration) * 100}%`;
    }
    placeLoopOverlay(loopRef.current, (time) => (time / duration) * 100, "%");
    const playhead = playheadRef.current;
    if (playhead) playhead.style.left = `${(currentPosition() / duration) * 100}%`;
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    /** Where the press started, and the view at that moment; `dragging` once it moved. */
    let press: { x: number; time: number; viewStart: number; dragging: boolean } | null = null;

    const timeAt = (clientX: number) => {
      const rect = element.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * trackDuration();
    };

    // Like a DAW overview: a click anywhere moves the playhead there, a drag scrolls the view
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      element.setPointerCapture(event.pointerId);
      press = {
        x: event.clientX,
        time: timeAt(event.clientX),
        viewStart: useViewStore.getState().start,
        dragging: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!press) return;
      if (!press.dragging && Math.abs(event.clientX - press.x) > DRAG_PX) {
        press.dragging = true;
        element.style.cursor = "grabbing";
      }
      if (press.dragging) {
        useViewStore.getState().scrollTo(press.viewStart + timeAt(event.clientX) - press.time);
      }
    };
    const onPointerUp = () => {
      if (press && !press.dragging) {
        usePlayerStore.getState().seek(press.time);
        useViewStore.getState().centerOn(press.time);
      }
      press = null;
      element.style.cursor = "";
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
      className="well relative h-14 shrink-0 cursor-pointer overflow-hidden rounded-panel"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label={t.waveform.overview}
      />
      <LoopOverlay ref={loopRef} />
      <div
        ref={windowRef}
        className="pointer-events-none absolute top-0 bottom-0 border border-white/55 bg-white/5"
      />
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-playhead"
      />
      <LoadingShade />
    </div>
  );
}

/** Hatched over the part of the track still loading in the background, like Reaper's peaks. */
function LoadingShade() {
  const loading = usePlayerStore((s) =>
    s.track && !s.track.complete && s.track.duration > 0
      ? Math.min(1, s.track.ready / s.track.duration)
      : null,
  );
  if (loading === null) return null;
  return (
    <div
      className="pointer-events-none absolute top-0 right-0 bottom-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.05)_0_6px,transparent_6px_12px)]"
      style={{ left: `${loading * 100}%` }}
    >
      <span className="font-mono text-[11px] text-fg-muted tabular">
        {t.app.stillLoading} {Math.floor(loading * 100)}%
      </span>
    </div>
  );
}
