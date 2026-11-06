import { ChevronDown, ChevronUp, ExternalLink, PanelLeft, PanelTop } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { playbackClock } from "@/stores/player";
import { useVideoStore } from "@/stores/video";
import { detachVideo } from "./detach";
import { VideoView } from "./VideoView";
import { fallBackToProxy } from "./videoLoader";

/**
 * Space always left to the waveforms, in CSS pixels: overview, section lane and a usable
 * detailed view on top; a readable waveform width at the side.
 */
const WAVEFORMS_MIN_HEIGHT = 260;
const WAVEFORMS_MIN_WIDTH = 420;

/** The chosen size, shrunk when the window is too small, so the video never pushes the waveforms out. */
const panelSize = (top: boolean, size: number) =>
  top
    ? { height: `min(${size}px, calc(100% - ${WAVEFORMS_MIN_HEIGHT}px))` }
    : { width: `min(${size}px, calc(100% - ${WAVEFORMS_MIN_WIDTH}px))` };

/** Drag handle between the video and the waveforms. */
function Resizer({ vertical }: { vertical: boolean }) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = vertical ? event.clientY : event.clientX;
    const initial = useVideoStore.getState().size;
    const move = (e: globalThis.PointerEvent) =>
      useVideoStore.getState().setSize(initial + (vertical ? e.clientY : e.clientX) - start);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "shrink-0 bg-border transition-colors hover:bg-accent",
        vertical ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize",
      )}
    />
  );
}

/**
 * Docks the video panel above or beside the waveforms (`children`), resizable and
 * collapsible. Without a video, or while it is detached, only `children` is shown.
 */
export function VideoLayout({ children }: { children: ReactNode }) {
  const video = useVideoStore();
  if (video.status === "none" || video.detached) return children;
  const top = video.dock === "top";

  const panel = (
    <section
      aria-label={t.video.title}
      className="flex shrink-0 flex-col overflow-hidden"
      style={video.collapsed ? undefined : panelSize(top, video.size)}
    >
      <header className="flex h-8 shrink-0 items-center gap-1 px-3 text-xs text-fg-subtle">
        <span className="mr-auto font-medium tracking-wide uppercase">{t.video.title}</span>
        <Tooltip label={top ? t.video.dockSide : t.video.dockTop}>
          <Button
            size="icon"
            className="size-6"
            aria-label={top ? t.video.dockSide : t.video.dockTop}
            onClick={() => video.setDock(top ? "side" : "top")}
          >
            {top ? <PanelLeft className="size-3.5" /> : <PanelTop className="size-3.5" />}
          </Button>
        </Tooltip>
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
        <Tooltip label={video.collapsed ? t.video.expand : t.video.collapse}>
          <Button
            size="icon"
            className="size-6"
            aria-label={video.collapsed ? t.video.expand : t.video.collapse}
            onClick={video.toggleCollapsed}
          >
            {video.collapsed ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </Button>
        </Tooltip>
      </header>
      {!video.collapsed && (
        <div className="min-h-0 flex-1 px-4 pb-2">
          <div className="size-full overflow-hidden rounded-panel border border-border bg-black">
            <VideoView
              src={video.src}
              status={video.status}
              progress={video.progress}
              error={video.error}
              clock={playbackClock}
              onUnsupported={() => void fallBackToProxy()}
              onNoPicture={() => video.setStatus("none", { src: null })}
              onReady={() => video.setStatus("ready")}
            />
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className={cn("flex h-full overflow-hidden", top ? "flex-col" : "flex-row")}>
      {panel}
      {!video.collapsed && <Resizer vertical={top} />}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
