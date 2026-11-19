import { convertFileSrc } from "@tauri-apps/api/core";
import { Combine, Scissors, Trash2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ContextMenu } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { menuContent, menuItem } from "@/components/ui/menu";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { useLoopStore } from "@/stores/loop";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { type PdfBar, type ProjectScore, useScoreStore } from "@/stores/score";
import { activeScore } from "../activeScore";
import { detectBars, toGray } from "./detectBars";
import { mergeBars, PdfClock, removeBar, splitBar } from "./pdfClock";

// pdf.js parses in its own worker, bundled by Vite from the package
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Width (px) pages are drawn at to find their bars: enough for thin lines, quick to scan. */
const DETECT_WIDTH = 1400;
/** Width of a page on screen at zoom 1, CSS pixels (narrower panels shrink it). */
const PAGE_WIDTH = 900;
/** Pages this far outside the view (in screens) are drawn ahead, those beyond let go. */
const AHEAD = 1;
const DRAG_PX = 4;

type Doc = pdfjs.PDFDocumentProxy;

/** Draws page `index` of `doc` into `canvas` at `cssWidth` CSS pixels wide. */
async function drawPage(doc: Doc, index: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: (cssWidth * ratio) / base.width });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return;
  await page.render({ canvasContext: context, viewport, canvas }).promise;
}

/** The bars of every page (reading order), found from the pictures; one per page if none is. */
async function findBars(doc: Doc, onPage: (done: number) => void): Promise<PdfBar[]> {
  const bars: PdfBar[] = [];
  const canvas = document.createElement("canvas");
  for (let index = 0; index < doc.numPages; index++) {
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: DETECT_WIDTH / base.width });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) continue;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (const box of detectBars(toGray(pixels), canvas.width, canvas.height)) {
      bars.push({ page: index, ...box });
    }
    onPage(index + 1);
  }
  // A PDF with no staff found (a lead sheet, a handwritten page): each page is one "bar", so
  // the pages still turn with the music
  if (bars.length === 0) {
    for (let index = 0; index < doc.numPages; index++) {
      bars.push({ page: index, x: 0, y: 0, w: 1, h: 1 });
    }
  }
  return bars;
}

/** One page: its place keeps the page's shape; the picture is drawn only near the view. */
function Page({
  doc,
  index,
  width,
  aspect,
  near,
}: {
  doc: Doc;
  index: number;
  width: number;
  aspect: number;
  near: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !near) return;
    let stale = false;
    const timer = setTimeout(() => {
      if (!stale) void drawPage(doc, index, canvas, width);
    }, 30);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [doc, index, width, near]);
  return (
    <canvas
      ref={canvasRef}
      aria-label={t.score.pdfPage(index + 1)}
      className="block size-full rounded-[2px] bg-white"
      style={near ? undefined : { visibility: "hidden" }}
      width={1}
      height={Math.max(1, Math.round(aspect))}
    />
  );
}

interface Layout {
  /** Top of each page in the scrolled content, CSS px */
  tops: number[];
  heights: number[];
  width: number;
  left: number;
}

const GAP = 16;

function layoutPages(aspects: number[], width: number, containerWidth: number): Layout {
  const tops: number[] = [];
  const heights: number[] = [];
  let y = GAP;
  for (const aspect of aspects) {
    tops.push(y);
    const height = width * aspect;
    heights.push(height);
    y += height + GAP;
  }
  return { tops, heights, width, left: Math.max(GAP, (containerWidth - width) / 2) };
}

/** A bar's box on screen (CSS px in the scrolled content). */
function barBox(bar: PdfBar, layout: Layout) {
  return {
    x: layout.left + bar.x * layout.width,
    y: (layout.tops[bar.page] ?? 0) + bar.y * (layout.heights[bar.page] ?? 0),
    w: bar.w * layout.width,
    h: bar.h * (layout.heights[bar.page] ?? 0),
  };
}

/**
 * A PDF score following the playhead: its pages one under the other, the bar playing lit with
 * a cursor crossing it, click a bar to go there, drag over bars to loop them, right-click a bar
 * to split, merge or drop it when the bars found are not quite right.
 */
export function PdfView({ link }: { link: ProjectScore }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const litRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [aspects, setAspects] = useState<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(800);
  const [view, setView] = useState({ top: 0, height: 600 });
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [menuBar, setMenuBar] = useState<{ index: number; at: number } | null>(null);
  const clock = useMemo(() => new PdfClock([], []), []);
  const bars = link.pdfBars;

  // The PDF itself: read once per file, closed when the view goes
  useEffect(() => {
    let cancelled = false;
    let loaded: Doc | null = null;
    let task: pdfjs.PDFDocumentLoadingTask | null = null;
    const store = useScoreStore.getState();
    void (async () => {
      const prepared = await commands.prepareScore(link.file);
      if (cancelled) return;
      if (prepared.status === "error") {
        store.setStatus("error", prepared.error);
        return;
      }
      try {
        task = pdfjs.getDocument({ url: convertFileSrc(prepared.data) });
        loaded = await task.promise;
        if (cancelled) return;
        const shapes: number[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const v = (await loaded.getPage(i)).getViewport({ scale: 1 });
          shapes.push(v.height / v.width);
        }
        if (cancelled) return;
        setAspects(shapes);
        setDoc(loaded);
        if (useScoreStore.getState().link?.pdfBars.length === 0) {
          useScoreStore.setState({ detecting: { done: 0, of: loaded.numPages } });
          const found = await findBars(loaded, (done) =>
            useScoreStore.setState({ detecting: { done, of: loaded?.numPages ?? done } }),
          );
          if (cancelled) return;
          useScoreStore.setState({ detecting: null });
          store.setPdfBars(found);
        }
      } catch {
        if (!cancelled) store.setStatus("error", { kind: "corruptFile", detail: "score" });
      }
    })();
    return () => {
      cancelled = true;
      useScoreStore.setState({ detecting: null });
      // Its worker and memory go with the view
      void task?.destroy();
    };
  }, [link.file]);

  // Bars and sync into the clock; ready once there are bars
  useEffect(() => {
    clock.update(bars, link.sync);
    activeScore.engine = clock;
    if (bars.length > 0 && doc) {
      const store = useScoreStore.getState();
      if (store.status !== "ready") store.setLoaded([], bars.length, []);
      store.bumpTiming();
    }
  }, [clock, bars, link.sync, doc]);
  useEffect(
    () => () => {
      if (activeScore.engine === clock) activeScore.engine = null;
    },
    [clock],
  );

  // The width pages are drawn at follows the panel and the zoom
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => setView({ top: scroller.scrollTop, height: scroller.clientHeight });
    const observer = new ResizeObserver(() => {
      setContainerWidth(scroller.clientWidth);
      measure();
    });
    observer.observe(scroller);
    // Which pages are near the view: drawn when they come close, not on every pixel scrolled
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const pageWidth = Math.round(
    Math.min(containerWidth - 2 * GAP, PAGE_WIDTH * link.zoom * (containerWidth > 0 ? 1 : 0)),
  );
  const layout = useMemo(
    () => layoutPages(aspects, Math.max(200, pageWidth), containerWidth),
    [aspects, pageWidth, containerWidth],
  );
  const contentHeight = (layout.tops.at(-1) ?? 0) + (layout.heights.at(-1) ?? 0) + GAP;

  // The lit bar and the cursor, moved on every frame without React; the view follows them
  const lastBar = useRef(-1);
  useAnimationFrame(() => {
    const cursor = cursorRef.current;
    const lit = litRef.current;
    const scroller = scrollRef.current;
    if (!cursor || !lit || !scroller) return;
    const at = clock.ready ? clock.barAt(currentPosition()) : null;
    const bar = at ? bars[at.index] : undefined;
    if (!at || !bar) {
      cursor.style.visibility = "hidden";
      lit.style.visibility = "hidden";
      return;
    }
    const box = barBox(bar, layout);
    const x = box.x + Math.min(1, Math.max(0, at.position)) * box.w;
    cursor.style.visibility = "visible";
    lit.style.visibility = "visible";
    cursor.style.transform = `translate(${x - 1.5}px, ${box.y}px)`;
    cursor.style.height = `${box.h}px`;
    lit.style.transform = `translate(${box.x}px, ${box.y}px)`;
    lit.style.width = `${box.w}px`;
    lit.style.height = `${box.h}px`;
    if (at.index !== lastBar.current) {
      lastBar.current = at.index;
      const follow = useScoreStore.getState().link?.follow ?? "continuous";
      const top = scroller.scrollTop;
      const bottom = top + scroller.clientHeight;
      const outside = box.y < top || box.y + box.h > bottom;
      if (follow === "continuous" && (outside || box.y > top + scroller.clientHeight * 0.55)) {
        scroller.scrollTo({
          top: Math.max(0, box.y - scroller.clientHeight * 0.25),
          behavior: "smooth",
        });
      } else if (follow === "paged" && outside) {
        scroller.scrollTo({ top: Math.max(0, box.y - GAP), behavior: "smooth" });
      }
    }
  });

  // The loop (or the drag) as bands over its bars
  const loopStart = useLoopStore((s) => s.start);
  const loopEnd = useLoopStore((s) => s.end);
  const loopOn = useLoopStore((s) => s.enabled);
  const timing = useScoreStore((s) => s.timing);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `timing` says the bars moved in time
  const bands = useMemo(() => {
    let from: number | null = null;
    let to: number | null = null;
    if (drag) {
      from = Math.min(drag.from, drag.to);
      to = Math.max(drag.from, drag.to);
    } else if (loopOn && loopStart !== null && loopEnd !== null && clock.ready) {
      const a = clock.barAt(loopStart + 0.001);
      const b = clock.barAt(loopEnd - 0.001);
      if (a && b) {
        from = a.index;
        to = b.index;
      }
    }
    if (from === null || to === null) return [];
    return bars.slice(from, to + 1).map((bar) => barBox(bar, layout));
  }, [drag, loopOn, loopStart, loopEnd, bars, layout, clock, timing]);

  const barUnder = (event: { clientX: number; clientY: number }) => {
    const scroller = scrollRef.current;
    if (!scroller) return null;
    const rect = scroller.getBoundingClientRect();
    const x = event.clientX - rect.left + scroller.scrollLeft;
    const y = event.clientY - rect.top + scroller.scrollTop;
    for (let index = 0; index < bars.length; index++) {
      const bar = bars[index];
      if (!bar) continue;
      const box = barBox(bar, layout);
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return { index, at: (x - box.x) / box.w };
      }
    }
    return null;
  };

  const press = useRef<{ x: number; y: number; index: number; moved: boolean } | null>(null);
  const onPointerDown = (event: React.PointerEvent) => {
    // Right button: the bar menu (split, merge, drop) is for the bar under the pointer
    if (event.button === 2) {
      setMenuBar(barUnder(event));
      return;
    }
    if (event.button !== 0) return;
    const hit = barUnder(event);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, index: hit.index, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const start = press.current;
    if (!start) return;
    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_PX)
      return;
    start.moved = true;
    const hit = barUnder(event);
    if (hit) setDrag({ from: start.index, to: hit.index });
  };
  const onPointerUp = () => {
    const start = press.current;
    press.current = null;
    if (!start) return;
    const player = usePlayerStore.getState();
    if (!start.moved) {
      const time = clock.barTime(start.index);
      if (time !== null) player.seek(Math.max(0, time));
    } else if (drag) {
      const from = clock.barTime(Math.min(drag.from, drag.to));
      const to = clock.barTime(Math.max(drag.from, drag.to), 1);
      if (from !== null && to !== null && to > from) {
        useLoopStore.getState().setRegion(Math.max(0, from), to, trackDuration());
        if (!player.playing) player.seek(Math.max(0, from));
      }
    }
    setDrag(null);
  };

  const fix = (result: { bars: PdfBar[]; sync: ProjectScore["sync"] } | null) => {
    if (result) useScoreStore.getState().setPdfBars(result.bars, result.sync);
  };

  // Pages near the view are drawn; the rest keep only their place
  const near = (index: number) => {
    const top = layout.tops[index] ?? 0;
    const height = layout.heights[index] ?? 0;
    const margin = view.height * AHEAD;
    return top + height > view.top - margin && top < view.top + view.height + margin;
  };

  return (
    <ContextMenu.Root onOpenChange={(open) => !open && setMenuBar(null)}>
      <ContextMenu.Trigger asChild>
        <div
          ref={scrollRef}
          className="relative isolate h-full overflow-auto overscroll-contain bg-stage"
        >
          <div
            className="relative cursor-pointer select-none"
            style={{ height: contentHeight }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              press.current = null;
              setDrag(null);
            }}
          >
            {doc &&
              aspects.map((aspect, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: pages never reorder
                  key={index}
                  className="absolute shadow-[0_2px_10px_rgb(0_0_0/0.35)]"
                  style={{
                    left: layout.left,
                    top: layout.tops[index],
                    width: layout.width,
                    height: layout.heights[index],
                  }}
                >
                  <Page
                    doc={doc}
                    index={index}
                    width={layout.width}
                    aspect={aspect}
                    near={near(index)}
                  />
                </div>
              ))}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {bands.map((box) => (
                <div
                  key={`${box.x},${box.y}`}
                  className={
                    drag
                      ? "absolute rounded-sm border border-loop/70 bg-loop/15"
                      : "absolute rounded-sm border-y-2 border-loop/60 bg-loop/10"
                  }
                  style={{ left: box.x - 2, top: box.y, width: box.w + 4, height: box.h }}
                />
              ))}
              <div
                ref={litRef}
                className="invisible absolute top-0 left-0 rounded-[3px] bg-accent/12 will-change-transform"
              />
              <div
                ref={cursorRef}
                className="invisible absolute top-0 left-0 w-[3px] rounded-[2px] bg-accent shadow-[0_0_10px_var(--color-accent)] will-change-transform"
              />
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        {menuBar && (
          <ContextMenu.Content className={menuContent}>
            <ContextMenu.Label className="px-2.5 py-1 text-[11px] text-fg-subtle">
              {t.score.pdfBar(menuBar.index + 1)}
            </ContextMenu.Label>
            <ContextMenu.Item
              className={menuItem}
              onSelect={() => fix(splitBar(bars, link.sync, menuBar.index, menuBar.at))}
            >
              <Scissors className="size-4" />
              {t.score.pdfSplit}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menuItem}
              disabled={!mergeBars(bars, link.sync, menuBar.index)}
              onSelect={() => fix(mergeBars(bars, link.sync, menuBar.index))}
            >
              <Combine className="size-4" />
              {t.score.pdfMerge}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menuItem}
              onSelect={() => fix(removeBar(bars, link.sync, menuBar.index))}
            >
              <Trash2 className="size-4" />
              {t.score.pdfRemove}
            </ContextMenu.Item>
          </ContextMenu.Content>
        )}
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
