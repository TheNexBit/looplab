import { useEffect, useRef } from "react";
import { CurrentMemo } from "@/features/markers/CurrentMemo";
import { MarkerFlags } from "@/features/markers/MarkerFlags";
import { TempoFlags } from "@/features/markers/TempoFlags";
import { SyncFlags } from "@/features/score/SyncFlags";
import { StemLaneHeads } from "@/features/stems/StemLanes";
import { t } from "@/i18n";
import { themeColor } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { laneHeard, useFileStemsStore } from "@/stores/fileStems";
import { useLoopStore } from "@/stores/loop";
import { SECTION_COLORS } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { currentTempoMap, usePracticeStore } from "@/stores/practice";
import { useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";
import { drawBeatGrid, drawRuler, drawWaveform } from "./draw";
import { attachWaveformGestures } from "./gestures";
import { LoopOverlay, placeLoopOverlay } from "./LoopOverlay";
import { useCanvas } from "./useCanvas";

const RULER_CSS = 20;

/**
 * Playing inside an active loop that is all on screen: following would only scroll the loop
 * away (after a zoom to the loop, say), so the view stays put.
 */
function loopInSight(position: number, view: { start: number; span: number }): boolean {
  const loop = useLoopStore.getState();
  const region = loop.enabled ? loop.region() : null;
  return (
    region !== null &&
    position >= region.start &&
    position <= region.end &&
    region.start >= view.start &&
    region.end <= view.start + view.span
  );
}

/**
 * Zoomable waveform with ruler, loop, markers, start point and playhead.
 * Its mouse and wheel gestures live in `gestures.ts`.
 */
export function DetailView() {
  const peaks = usePlayerStore((s) => s.peaks);
  const playheadWidth = useSettingsStore((s) => s.playheadWidth);
  const centerLine = useSettingsStore((s) => s.centerLine && s.waveStyle !== "half");
  // Stems from files: one band per lane (the centre line would cross them)
  const stemLanes = useFileStemsStore((s) => s.lanes.length > 1);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);
  const braceRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(true);
  const drawn = useRef({ start: -1, span: -1 });
  /** Ruler, grid and waveform of the view from `start`, `span` seconds wide. */
  const paint = (ctx: CanvasRenderingContext2D, start: number, span: number) => {
    if (!peaks) return;
    const viewStore = useViewStore.getState();
    const { width, height, dpr } = size.current;
    ctx.clearRect(0, 0, width, height);
    // A view stretched past an end of the track (hand drag): shade where there is no music
    const pixelsPerSecond = width / span;
    ctx.fillStyle = themeColor("grid");
    if (start < 0) ctx.fillRect(0, 0, Math.round(-start * pixelsPerSecond), height);
    const end = viewStore.duration;
    if (start + span > end) {
      const x = Math.round((end - start) * pixelsPerSecond);
      ctx.fillRect(x, 0, width - x, height);
    }
    const view = { start, span, width, height, top: RULER_CSS * dpr };
    const settings = useSettingsStore.getState();
    drawRuler(ctx, view, dpr, {
      tick: themeColor("tick"),
      label: themeColor("fg-muted"),
      grid: settings.rulerLines ? themeColor("grid") : undefined,
    });
    const beats = settings.showGrid ? currentTempoMap() : null;
    if (beats) drawBeatGrid(ctx, view, beats, dpr, "beats", { line: themeColor("beat") });
    const look = { style: settings.waveStyle, zoom: settings.waveZoom };
    const { lanes } = useFileStemsStore.getState();
    if (lanes.length > 1) {
      // Stems from files: one band per lane, in its colour while heard, grey when not
      const band = (height - view.top) / lanes.length;
      for (const [index, lane] of lanes.entries()) {
        const lanePeaks = index === 0 ? peaks : lane.peaks;
        const top = view.top + index * band;
        if (index > 0) {
          ctx.fillStyle = themeColor("border");
          ctx.fillRect(0, Math.round(top), width, Math.max(1, dpr));
        }
        if (!lanePeaks) continue;
        const color = laneHeard(lanes, index)
          ? themeColor(`section-${index % SECTION_COLORS}`)
          : themeColor("fg-subtle");
        drawWaveform(ctx, lanePeaks, { ...view, top, height: top + band }, color, look);
      }
    } else {
      drawWaveform(ctx, peaks, view, themeColor("wave"), look);
    }
    if (beats) {
      drawBeatGrid(ctx, view, beats, dpr, "bars", {
        line: themeColor("bar"),
        notch: themeColor("accent"),
      });
    }
    drawn.current = { start, span };
    dirty.current = false;
  };
  // A resize empties the canvas: drawn again at once, never shown blank for a frame
  const { ref: canvasRef, size } = useCanvas(() => {
    const ctx = canvasRef.current?.getContext("2d");
    const { start, span } = useViewStore.getState();
    if (ctx) paint(ctx, start, span);
  });

  // New track: redraw even if the window happens to match the previous one
  useEffect(() => {
    if (peaks) dirty.current = true;
  }, [peaks]);

  // A new tempo, first beat or grid switch, lanes opened or mixed: redraw
  useEffect(() => {
    const redraw = () => {
      dirty.current = true;
    };
    const stops = [
      usePracticeStore.subscribe(redraw),
      useSettingsStore.subscribe(redraw),
      useFileStemsStore.subscribe(redraw),
    ];
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
    const { followPlayhead, followMode } = useSettingsStore.getState();
    if (player.playing && followPlayhead && !loopInSight(position, viewStore)) {
      viewStore.followPlayhead(position, followMode);
    }
    viewStore.step();
    const { start, span } = useViewStore.getState();
    const { width, dpr } = size.current;

    if (dirty.current || drawn.current.start !== start || drawn.current.span !== span) {
      paint(ctx, start, span);
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
    const shade = shadeRef.current;
    if (shade) {
      // From the start point to the playhead while playing: what stopping goes back over
      const { cueShade, returnToStart } = useSettingsStore.getState();
      const from = Math.max(0, toX(player.cue));
      const to = Math.min(width / dpr, toX(position));
      const shown = cueShade && returnToStart && player.playing && to > from;
      shade.style.visibility = shown ? "visible" : "hidden";
      if (shown) {
        shade.style.transform = `translateX(${from}px)`;
        shade.style.width = `${to - from}px`;
      }
    }
    const playhead = playheadRef.current;
    if (playhead) {
      playhead.style.transform = `translateX(${toX(position) - playheadWidth / 2}px)`;
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
        className="pointer-events-none absolute inset-x-0 top-0 border-b border-edge bg-[linear-gradient(var(--color-ruler-from),var(--color-ruler-to))]"
        style={{ height: RULER_CSS }}
      />
      {centerLine && !stemLanes && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center"
          style={{ top: RULER_CSS }}
        >
          <div className="h-px w-full bg-grid" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label={t.waveform.detail}
      />
      <LoopOverlay ref={loopRef} />
      <LoopOverlay ref={braceRef} variant="brace" height={RULER_CSS - 4} />
      <MarkerFlags area={containerRef} top={RULER_CSS} />
      <TempoFlags area={containerRef} />
      <SyncFlags area={containerRef} />
      <CurrentMemo top={RULER_CSS} />
      <StemLaneHeads top={RULER_CSS} />
      <div
        ref={shadeRef}
        aria-hidden
        className="pointer-events-none invisible absolute bottom-0 left-0 bg-cue/15 will-change-transform"
        style={{ top: RULER_CSS }}
      />
      <div
        ref={cueRef}
        aria-hidden
        title={t.transport.cue}
        className="pointer-events-none absolute top-0 bottom-0 left-0 will-change-transform"
      >
        {/* Dashed full-height line, like Reaper's edit cursor: the playhead is the solid one */}
        <div
          className="absolute bottom-0 -left-px border-l-2 border-dashed border-cue opacity-80"
          style={{ top: RULER_CSS }}
        />
        {/* Flag at the foot of the ruler, outlined so it stands out on any waveform */}
        <svg
          aria-hidden
          width="14"
          height="11"
          viewBox="0 0 14 11"
          className="absolute -translate-x-1/2 overflow-visible"
          style={{ top: RULER_CSS - 10 }}
        >
          <path
            d="M1 1 H13 L7 10 Z"
            className="fill-cue stroke-edge"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 left-0 bg-playhead shadow-[0_0_6px_color-mix(in_srgb,var(--color-playhead)_50%,transparent)] will-change-transform"
        style={{ width: playheadWidth }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-playhead" />
      </div>
    </div>
  );
}
