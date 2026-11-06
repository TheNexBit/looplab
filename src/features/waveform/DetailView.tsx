import { useEffect, useRef } from "react";
import { MarkerFlags } from "@/features/markers/MarkerFlags";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { currentGrid, usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { drawBeatGrid, drawRuler, drawWaveform } from "./draw";
import { attachWaveformGestures } from "./gestures";
import { LoopOverlay, placeLoopOverlay } from "./LoopOverlay";
import { useCanvas } from "./useCanvas";

const RULER_CSS = 20;

/**
 * Zoomable waveform with ruler, loop, markers, start point and playhead.
 * Its mouse and wheel gestures live in `gestures.ts`.
 */
export function DetailView() {
  const peaks = usePlayerStore((s) => s.peaks);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
  const braceRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(true);
  const drawn = useRef({ start: -1, span: -1 });
  const { ref: canvasRef, size } = useCanvas(() => {
    dirty.current = true;
  });

  // New track: redraw even if the window happens to match the previous one
  useEffect(() => {
    if (peaks) dirty.current = true;
  }, [peaks]);

  // A new tempo, first beat or grid switch: redraw the grid
  useEffect(() => {
    const redraw = () => {
      dirty.current = true;
    };
    const stops = [usePracticeStore.subscribe(redraw), useSettingsStore.subscribe(redraw)];
    return () => {
      for (const stop of stops) stop();
    };
  }, []);

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
      drawRuler(ctx, view, dpr, {
        tick: themeColor("tick"),
        label: themeColor("fg-muted"),
        grid: themeColor("grid"),
      });
      const beats = useSettingsStore.getState().showGrid ? currentGrid() : null;
      if (beats) drawBeatGrid(ctx, view, beats, dpr, "beats", { line: themeColor("beat") });
      drawWaveform(ctx, peaks, view, themeColor("wave"));
      if (beats) {
        drawBeatGrid(ctx, view, beats, dpr, "bars", {
          line: themeColor("bar"),
          notch: themeColor("accent"),
        });
      }
      drawn.current = { start, span };
      dirty.current = false;
    }

    const toX = (time: number) => ((time - start) / span) * (width / dpr);
    placeLoopOverlay(loopRef.current, toX, "px");
    placeLoopOverlay(braceRef.current, toX, "px");
    const cue = cueRef.current;
    if (cue) {
      // The start point stopping returns to (hidden when that option is off)
      const shown =
        useSettingsStore.getState().returnToStart &&
        player.cue >= start &&
        player.cue <= start + span;
      cue.style.visibility = shown ? "visible" : "hidden";
      cue.style.transform = `translateX(${toX(player.cue)}px)`;
    }
    const playhead = playheadRef.current;
    if (playhead) {
      playhead.style.transform = `translateX(${toX(position)}px)`;
      playhead.style.visibility =
        position >= start && position <= start + span ? "visible" : "hidden";
    }
  });

  useEffect(() => {
    const element = containerRef.current;
    return element ? attachWaveformGestures(element, RULER_CSS) : undefined;
  }, []);

  return (
    <div
      ref={containerRef}
      className="well relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-panel"
    >
      {/* Ruler strip and centre line, drawn behind the transparent canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 border-b border-black bg-[linear-gradient(#25272b,#1d1e21)]"
        style={{ height: RULER_CSS }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center"
        style={{ top: RULER_CSS }}
      >
        <div className="h-px w-full bg-grid" />
      </div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label={t.waveform.detail}
      />
      <LoopOverlay ref={loopRef} />
      <LoopOverlay ref={braceRef} variant="brace" height={RULER_CSS - 4} />
      <MarkerFlags area={containerRef} top={RULER_CSS} />
      <div
        ref={cueRef}
        aria-hidden
        title={t.transport.cue}
        className="pointer-events-none absolute left-0 will-change-transform"
        style={{ top: RULER_CSS - 7 }}
      >
        <div className="-translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-accent" />
      </div>
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-playhead shadow-[0_0_6px_rgb(255_255_255/0.5)] will-change-transform"
      >
        <div className="-translate-x-[5.5px] border-x-[6px] border-t-[8px] border-x-transparent border-t-playhead" />
      </div>
    </div>
  );
}
