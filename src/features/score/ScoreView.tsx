import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { commands } from "@/lib/bindings";
import { onThemeChange } from "@/lib/theme";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { type ProjectScore, useScoreStore } from "@/stores/score";
import { activeScore } from "./activeScore";
import { type Rect, ScoreEngine } from "./scoreEngine";
import { startScoreExtras } from "./scoreExtras";
import { useWheelZoom } from "./useWheelZoom";

/** Pointer travel (CSS px) under which a press is a click, not a drag. */
const DRAG_PX = 4;

interface Bands {
  inside: Rect[];
  outside: Rect[];
}
const NO_BANDS: Bands = { inside: [], outside: [] };

/** Seconds of the loop being dragged, or of the loop in force. */
type Span = { start: number; end: number } | null;

function useLoopSpan(): Span {
  const start = useLoopStore((s) => s.start);
  const end = useLoopStore((s) => s.end);
  const enabled = useLoopStore((s) => s.enabled);
  return enabled && start !== null && end !== null ? { start, end } : null;
}

/**
 * The drawn score of the open song, following Looplab's playhead. Click a note: the playhead
 * goes there. Drag over notes: that stretch becomes the A/B loop (snapped to the notes). The
 * loop shows as a band, the rest of the music dimmed.
 */
export function ScoreView({ link }: { link: ProjectScore }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useWheelZoom(scrollRef);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ScoreEngine | null>(null);
  const extrasRef = useRef<ReturnType<typeof startScoreExtras> | null>(null);
  const [bands, setBands] = useState<Bands>(NO_BANDS);
  const [drag, setDrag] = useState<Span>(null);
  const loop = useLoopSpan();
  const shown = drag ?? loop;
  const shownRef = useRef<Span>(shown);
  shownRef.current = shown;

  // One engine per score file; view changes are applied to it, not rebuilt
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt only for another file
  useEffect(() => {
    const element = surfaceRef.current;
    const scroller = scrollRef.current;
    if (!element || !scroller) return;
    const store = useScoreStore.getState();
    const player = () => usePlayerStore.getState();
    const engine = new ScoreEngine(
      element,
      scroller,
      link,
      {
        duration: trackDuration,
        position: () => currentPosition(),
        playing: () => player().playing,
      },
      {
        loaded: (tracks, barCount, fileSync) => store.setLoaded(tracks, barCount, fileSync),
        rendered: () => {
          const span = shownRef.current;
          setBands(span ? engine.regionRects(span.start, span.end) : NO_BANDS);
        },
        failed: () => store.setStatus("error"),
        timed: () => {
          store.bumpTiming();
          extrasRef.current?.refresh();
          // The loop band follows the bars wherever the new sync puts them
          const span = shownRef.current;
          setBands(span ? engine.regionRects(span.start, span.end) : NO_BANDS);
        },
      },
    );
    engineRef.current = engine;
    activeScore.engine = engine;
    const extras = startScoreExtras(engine);
    extrasRef.current = extras;

    let cancelled = false;
    void (async () => {
      const prepared = await commands.prepareScore(link.file);
      if (cancelled) return;
      if (prepared.status === "error") {
        store.setStatus("error", prepared.error);
        return;
      }
      try {
        const response = await fetch(convertFileSrc(prepared.data));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) engine.load(bytes);
      } catch {
        if (!cancelled) store.setStatus("error");
      }
    })();

    const stopPlayer = usePlayerStore.subscribe((state, previous) => {
      if (state.playing !== previous.playing) engine.setPlaying(state.playing);
    });
    const stopTheme = onThemeChange(() => engine.retheme());
    return () => {
      cancelled = true;
      stopPlayer();
      stopTheme();
      extras.stop();
      extrasRef.current = null;
      engine.destroy();
      engineRef.current = null;
      if (activeScore.engine === engine) activeScore.engine = null;
    };
  }, [link.file]);

  // Staves, layout, follow, zoom, tracks, sync: applied to the running engine
  useEffect(() => {
    engineRef.current?.setView(link);
    // Another track shows other notes (the sync's own changes come back as `timed`)
    extrasRef.current?.refresh();
  }, [link]);

  // Loop band: placed again when the loop (or the drag) changes
  const bandStart = shown?.start ?? null;
  const bandEnd = shown?.end ?? null;
  useEffect(() => {
    const engine = engineRef.current;
    setBands(
      engine && bandStart !== null && bandEnd !== null
        ? engine.regionRects(bandStart, bandEnd)
        : NO_BANDS,
    );
  }, [bandStart, bandEnd]);

  // The cursor follows the playhead on every display frame (smooth even when slowed down)
  useAnimationFrame(() => {
    engineRef.current?.follow(currentPosition());
  });

  const press = useRef<{ x: number; y: number; start: number; end: number; moved: boolean } | null>(
    null,
  );

  const local = (event: React.PointerEvent) => {
    const box = surfaceRef.current?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : null;
  };

  const beatTime = (event: React.PointerEvent) => {
    const engine = engineRef.current;
    const at = local(event);
    if (!engine || !at) return null;
    const beat = engine.beatAt(at.x, at.y);
    return beat ? engine.beatTime(beat, currentPosition()) : null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const time = beatTime(event);
    if (!time) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, ...time, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = press.current;
    if (!start) return;
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_PX) {
      return;
    }
    start.moved = true;
    const time = beatTime(event);
    if (!time) return;
    setDrag({ start: Math.min(start.start, time.start), end: Math.max(start.end, time.end) });
  };

  const onPointerUp = () => {
    const start = press.current;
    press.current = null;
    if (!start) return;
    if (!start.moved) {
      usePlayerStore.getState().seek(start.start);
    } else if (drag) {
      useLoopStore.getState().setRegion(drag.start, drag.end, trackDuration());
      // Playing from the loop's start, as when a loop is drawn on the waveform
      if (!usePlayerStore.getState().playing) usePlayerStore.getState().seek(drag.start);
    }
    setDrag(null);
  };

  return (
    <div
      ref={scrollRef}
      className="score-scroll relative isolate h-full overflow-auto overscroll-contain bg-stage"
    >
      <div
        className="relative min-h-full cursor-pointer select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
      >
        <div ref={surfaceRef} className="score-surface" />
        {/* Loop band and dimming, over the drawing; clicks pass through */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {bands.outside.map((r) => (
            <div
              key={`o${r.x},${r.y}`}
              className="absolute bg-stage/55 transition-opacity duration-150"
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            />
          ))}
          {bands.inside.map((r) => (
            <div
              key={`i${r.x},${r.y}`}
              className={
                drag
                  ? "absolute rounded-sm border border-loop/70 bg-loop/15"
                  : "absolute rounded-sm border-y-2 border-loop/60 bg-loop/10"
              }
              style={{ left: r.x - 2, top: r.y, width: r.w + 4, height: r.h }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
