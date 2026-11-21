import { type ReactNode, useRef } from "react";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { ScorePanel } from "@/features/score/ScoreLayout";
import { t } from "@/i18n";
import type { ProjectScore } from "@/stores/score";
import { LESSON_HEIGHT, LESSON_SPLIT, useVideoStore } from "@/stores/video";
import { BesideKey, DetachKey, VideoBox, VideoHeader } from "./VideoLayout";

/** Room always left to the waveforms under a lesson (overview and a usable detailed view). */
const WAVEFORMS_MIN_HEIGHT = 170;
/** Narrowest the video and the score columns get, in CSS pixels. */
const VIDEO_MIN_WIDTH = 200;
const SCORE_MIN_WIDTH = 340;
const HANDLE_PX = 4;

/**
 * A lesson, as in JTC's player: the video and the score side by side on top, the waveforms
 * across the whole width below. Both bars drag (the video's share of the width and the
 * row's height are remembered); the video still opens in a window of its own.
 */
export function LessonLayout({ link, children }: { link: ProjectScore; children: ReactNode }) {
  const split = useVideoStore((s) => s.split);
  const height = useVideoStore((s) => s.lessonHeight);
  const layoutRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const tallest = () =>
    (layoutRef.current?.clientHeight ?? Number.POSITIVE_INFINITY) -
    WAVEFORMS_MIN_HEIGHT -
    HANDLE_PX;
  const rowWidth = () => (rowRef.current?.clientWidth ?? 1000) - HANDLE_PX;
  // What is on screen, so a drag never first makes up a size the window cannot show
  const shownHeight = () => Math.min(useVideoStore.getState().lessonHeight, tallest());
  const videoWidth = () => {
    const width = rowWidth();
    const wanted = useVideoStore.getState().split * width;
    return Math.max(VIDEO_MIN_WIDTH, Math.min(wanted, width - SCORE_MIN_WIDTH));
  };

  return (
    <div ref={layoutRef} className="flex h-full flex-col overflow-hidden">
      <div
        ref={rowRef}
        className="flex shrink-0 overflow-hidden"
        style={{
          height: `max(${LESSON_HEIGHT.min}px, min(${height}px, calc(100% - ${WAVEFORMS_MIN_HEIGHT}px)))`,
        }}
      >
        <section
          aria-label={t.video.title}
          className="flex shrink-0 flex-col overflow-hidden"
          style={{
            width: `clamp(${VIDEO_MIN_WIDTH}px, ${split * 100}%, calc(100% - ${SCORE_MIN_WIDTH}px))`,
          }}
        >
          <VideoHeader>
            <BesideKey beside />
            <DetachKey />
          </VideoHeader>
          <VideoBox />
        </section>
        <ResizeHandle
          label={t.video.resizeBeside}
          size={videoWidth}
          onResize={(width) => useVideoStore.getState().setSplit(width / rowWidth())}
          onReset={() => useVideoStore.getState().setSplit(LESSON_SPLIT.default)}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
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
