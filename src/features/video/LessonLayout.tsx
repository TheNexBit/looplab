import { type ReactNode, useEffect, useRef, useState } from "react";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { ScorePanel } from "@/features/score/ScoreLayout";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { ProjectScore } from "@/stores/score";
import { LESSON_HEIGHT, LESSON_SPLIT, useVideoStore } from "@/stores/video";
import { BesideKey, DetachKey, VideoBox, VideoHeader } from "./VideoLayout";

/** Room always left to the waveforms under a lesson (overview and a usable detailed view). */
const WAVEFORMS_MIN_HEIGHT = 170;
/** Narrowest the video and the score columns get, in CSS pixels. */
const VIDEO_MIN_WIDTH = 200;
const SCORE_MIN_WIDTH = 340;
/** Thickness of the bars: the one between the columns, the one over the waveforms. */
const SIDE_BAR_PX = 6;
const ROW_BAR_PX = 4;
/** Narrower than this, the lesson stands upright: video over the score (hysteresis on the way back). */
const UPRIGHT_BELOW = 860;
const UPRIGHT_HYSTERESIS = 24;
/** Upright, the shortest the video and the score get, in CSS pixels. */
const VIDEO_MIN_HEIGHT = 120;
const SCORE_MIN_HEIGHT = 200;

/**
 * A lesson, as in JTC's player: the video and the score side by side on top, the waveforms
 * across the whole width below. Both bars drag (the video's share of the width and the
 * row's height are remembered); the video still opens in a window of its own. In a very narrow
 * page the video goes over the score instead.
 */
export function LessonLayout({ link, children }: { link: ProjectScore; children: ReactNode }) {
  const split = useVideoStore((s) => s.split);
  const height = useVideoStore((s) => s.lessonHeight);
  const layoutRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [upright, setUpright] = useState(false);

  // In a very narrow page (the interface enlarged) the columns would be too thin: the video
  // goes over the score instead, and back beside it as soon as there is room
  useEffect(() => {
    const element = layoutRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setUpright((was) =>
        was ? width < UPRIGHT_BELOW + UPRIGHT_HYSTERESIS : width < UPRIGHT_BELOW,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tallest = () =>
    (layoutRef.current?.clientHeight ?? Number.POSITIVE_INFINITY) -
    WAVEFORMS_MIN_HEIGHT -
    ROW_BAR_PX;
  // The room shared by video and score: the row's width, or its height when upright
  const rowSpan = () =>
    upright
      ? (rowRef.current?.clientHeight ?? 600) - ROW_BAR_PX
      : (rowRef.current?.clientWidth ?? 1000) - SIDE_BAR_PX;
  // What is on screen, so a drag never first makes up a size the window cannot show
  const shownHeight = () => Math.min(useVideoStore.getState().lessonHeight, tallest());
  const videoSpan = () => {
    const span = rowSpan();
    const wanted = useVideoStore.getState().split * span;
    const [least, scoreLeast] = upright
      ? [VIDEO_MIN_HEIGHT, SCORE_MIN_HEIGHT]
      : [VIDEO_MIN_WIDTH, SCORE_MIN_WIDTH];
    return Math.max(least, Math.min(wanted, span - scoreLeast));
  };
  const videoStyle = upright
    ? {
        height: `clamp(${VIDEO_MIN_HEIGHT}px, ${split * 100}%, calc(100% - ${SCORE_MIN_HEIGHT + ROW_BAR_PX}px))`,
      }
    : {
        width: `clamp(${VIDEO_MIN_WIDTH}px, ${split * 100}%, calc(100% - ${SCORE_MIN_WIDTH + SIDE_BAR_PX}px))`,
      };

  return (
    <div ref={layoutRef} className="flex h-full flex-col overflow-hidden">
      <div
        ref={rowRef}
        className={cn("flex shrink-0 overflow-hidden", upright && "flex-col")}
        style={{
          height: `max(${LESSON_HEIGHT.min}px, min(${height}px, calc(100% - ${WAVEFORMS_MIN_HEIGHT + ROW_BAR_PX}px)))`,
        }}
      >
        <section
          aria-label={t.video.title}
          className="flex shrink-0 flex-col overflow-hidden"
          style={videoStyle}
        >
          <VideoHeader>
            <BesideKey beside />
            <DetachKey />
          </VideoHeader>
          <VideoBox />
        </section>
        <ResizeHandle
          vertical={upright}
          label={t.video.resizeBeside}
          size={videoSpan}
          onResize={(span) => useVideoStore.getState().setSplit(span / rowSpan())}
          onReset={() => useVideoStore.getState().setSplit(LESSON_SPLIT.default)}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ScorePanel link={link} />
        </div>
      </div>
      <ResizeHandle
        vertical
        label={t.video.resizeLesson}
        size={shownHeight}
        onResize={(next) => useVideoStore.getState().setLessonHeight(Math.min(next, tallest()))}
        onReset={() => useVideoStore.getState().setLessonHeight(LESSON_HEIGHT.default)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
