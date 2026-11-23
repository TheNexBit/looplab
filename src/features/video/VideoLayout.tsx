import { Columns2, ExternalLink, Film, PanelLeft, PanelTop } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { Tooltip } from "@/components/ui/Tooltip";
import { AngleMenu } from "@/features/exercise/AngleMenu";
import { SCORE_MIN_VISIBLE, SCORE_ROW_HEIGHT } from "@/features/score/ScoreLayout";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { playbackClock } from "@/stores/player";
import { useScoreStore } from "@/stores/score";
import { useVideoStore } from "@/stores/video";
import { useWavesStore } from "@/stores/waves";
import { detachVideo } from "./detach";
import { VideoView } from "./VideoView";
import { fallBackToProxy } from "./videoLoader";

/** The picture is kept at least this tall while there is room (the waveforms come first). */
const VIDEO_MIN_VISIBLE = 140;
/** A readable waveform width beside a video docked at the side. */
const WAVEFORMS_MIN_WIDTH = 420;
/** The drag bar between the video and the waveforms. */
const HANDLE_PX = 4;

/**
 * The chosen size, shrunk when the window is too small: the video gives way first, so it never
 * pushes the waveforms (and the score) under their least height.
 */
const panelSize = (top: boolean, size: number, below: number) =>
  top
    ? {
        height: `max(0px, min(max(${VIDEO_MIN_VISIBLE}px, ${size}px), calc(100% - ${below}px)))`,
      }
    : { width: `min(${size}px, calc(100% - ${WAVEFORMS_MIN_WIDTH}px))` };

/**
 * The video panel's title bar: the shared panel title (its arrow folds the picture when
 * `onToggle` is given), the angles, then `children`, its keys, on the right.
 */
export function VideoHeader({
  children,
  open = true,
  onToggle,
}: {
  children: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <header className="flex h-8 shrink-0 items-center gap-1 px-3 text-xs text-fg-subtle">
      <span className="mr-auto">
        <PanelTitle
          label={t.video.title}
          icon={<Film className="size-3.5 shrink-0 text-accent" aria-hidden />}
          open={open}
          onToggle={onToggle}
          foldLabel={t.video.collapse}
          openLabel={t.video.expand}
        />
      </span>
      <AngleMenu />
      {children}
    </header>
  );
}

/** Opens the video in a window of its own. */
export function DetachKey() {
  return (
    <Tooltip label={t.video.detach}>
      <Button
        size="icon"
        className="size-6"
        aria-label={t.video.detach}
        onClick={() => void detachVideo()}
      >
        <ExternalLink className="size-3.5" />
      </Button>
    </Tooltip>
  );
}

/** With a score: puts the video beside it (a lesson), or back to the usual panels. */
export function BesideKey({ beside }: { beside: boolean }) {
  const label = beside ? t.video.besideOff : t.video.besideOn;
  return (
    <Tooltip label={label}>
      <Button
        size="icon"
        className={cn("size-6", beside && "text-accent")}
        aria-label={label}
        aria-pressed={beside}
        onClick={() => useVideoStore.getState().setBeside(!beside)}
      >
        <Columns2 className="size-3.5" />
      </Button>
    </Tooltip>
  );
}

/** The player's clock moved onto the picture's file (another angle of the take). */
const videoClock = () => {
  const clock = playbackClock();
  return { ...clock, position: clock.position + useVideoStore.getState().shift };
};

/** The picture, in its dark frame, following the player's clock. */
export function VideoBox() {
  const src = useVideoStore((s) => s.src);
  const status = useVideoStore((s) => s.status);
  const progress = useVideoStore((s) => s.progress);
  const error = useVideoStore((s) => s.error);
  const { setStatus } = useVideoStore.getState();
  return (
    <div className="min-h-0 flex-1 px-4 pb-2">
      <div className="size-full overflow-hidden rounded-panel border border-border bg-black">
        <VideoView
          src={src}
          status={status}
          progress={progress}
          error={error}
          clock={videoClock}
          onUnsupported={() => void fallBackToProxy()}
          onNoPicture={() => setStatus("none", { src: null })}
          onReady={() => setStatus("ready")}
        />
      </div>
    </div>
  );
}

/**
 * Docks the video panel above or beside the waveforms (`children`), resizable and
 * collapsible. Without a video, or while it is detached, only `children` is shown.
 */
export function VideoLayout({ children }: { children: ReactNode }) {
  const status = useVideoStore((s) => s.status);
  const detached = useVideoStore((s) => s.detached);
  const dockAlone = useVideoStore((s) => s.dock);
  const dockWithScore = useVideoStore((s) => s.dockWithScore);
  const collapsed = useVideoStore((s) => s.collapsed);
  const size = useVideoStore((s) => s.size);
  const { setDock, setDockWithScore, toggleCollapsed } = useVideoStore.getState();
  const hasScore = useScoreStore((s) => s.link !== null);
  const askingScore = useScoreStore((s) => s.asking);
  const scoreOpen = useScoreStore((s) => s.link !== null && !s.collapsed);
  const reserve = useWavesStore((s) => s.reserve);
  const layoutRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const visible = status !== "none" && !detached;
  // With a score the video has its own place (beside it by default), so both stay large
  const dock = hasScore ? dockWithScore : dockAlone;
  const top = dock === "top";
  // Under the video: the waveforms, and the score's least height when one is shown
  const below = reserve + (hasScore ? SCORE_MIN_VISIBLE : askingScore ? SCORE_ROW_HEIGHT : 0);

  // On top with no open score between, the video sits right above the waveforms: dragging
  // their edge moves this border
  const neighbour = visible && top && !collapsed && !scoreOpen;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `largest` reads refs and stores
  useEffect(() => {
    if (!neighbour) return;
    return useWavesStore.getState().claimNeighbour({
      shown: () => panelRef.current?.offsetHeight ?? useVideoStore.getState().size,
      resize: (size) => useVideoStore.getState().setSize(Math.min(size, largest())),
    });
  }, [neighbour]);

  if (!visible) return children;

  // Largest panel the window allows now (the CSS of `panelSize` keeps it so on screen)
  const largest = () => {
    const layout = layoutRef.current;
    if (!layout) return Number.POSITIVE_INFINITY;
    return top
      ? layout.clientHeight - below - HANDLE_PX
      : layout.clientWidth - WAVEFORMS_MIN_WIDTH - HANDLE_PX;
  };
  // The size on screen, not the one asked for: a larger one saved earlier would make the
  // first part of a drag move nothing while it shrinks down to what fits
  const shown = () => Math.min(useVideoStore.getState().size, largest());

  const panel = (
    <section
      ref={panelRef}
      aria-label={t.video.title}
      className="flex shrink-0 flex-col overflow-hidden"
      style={collapsed ? undefined : panelSize(top, size, below)}
    >
      <VideoHeader open={!collapsed} onToggle={toggleCollapsed}>
        {hasScore && <BesideKey beside={false} />}
        <Tooltip label={top ? t.video.dockSide : t.video.dockTop}>
          <Button
            size="icon"
            className="size-6"
            aria-label={top ? t.video.dockSide : t.video.dockTop}
            onClick={() =>
              hasScore ? setDockWithScore(top ? "side" : "top") : setDock(top ? "side" : "top")
            }
          >
            {top ? <PanelLeft className="size-3.5" /> : <PanelTop className="size-3.5" />}
          </Button>
        </Tooltip>
        <DetachKey />
      </VideoHeader>
      {!collapsed && <VideoBox />}
    </section>
  );

  return (
    <div
      ref={layoutRef}
      className={cn("flex h-full overflow-hidden", top ? "flex-col" : "flex-row")}
    >
      {panel}
      {!collapsed && (
        <ResizeHandle
          vertical={top}
          label={t.video.resize}
          size={shown}
          onResize={(size) => useVideoStore.getState().setSize(Math.min(size, largest()))}
        />
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
