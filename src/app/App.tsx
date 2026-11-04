import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { DropOverlay } from "@/features/library/DropOverlay";
import { EmptyState } from "@/features/library/EmptyState";
import { ErrorBanner } from "@/features/library/ErrorBanner";
import { LoadingState } from "@/features/library/LoadingState";
import { openDroppedFiles, pickAndOpenFile } from "@/features/library/pickFile";
import { useFileDrop } from "@/features/library/useFileDrop";
import { TransportDock } from "@/features/player/TransportDock";
import { WaveformPanel } from "@/features/waveform/WaveformPanel";
import { t } from "@/i18n";
import { type AppInfo, commands, events } from "@/lib/bindings";
import { useShortcuts } from "@/lib/useShortcuts";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";

const KEYBOARD_ZOOM = 1.5;

const zoomAroundPlayhead = (factor: number) =>
  useViewStore.getState().zoom(factor, currentPosition());

export function App() {
  const [info, setInfo] = useState<AppInfo>();
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const loading = usePlayerStore((s) => s.load.kind === "loading");
  const hovering = useFileDrop(openDroppedFiles);

  useEffect(() => {
    void commands.appInfo().then(setInfo);
    const unlisten = events.playbackStatus.listen((event) =>
      usePlayerStore.getState().applyStatus(event.payload),
    );
    // Pinch and Ctrl+wheel must never zoom the whole page
    const blockPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    return () => {
      void unlisten.then((stop) => stop());
      window.removeEventListener("wheel", blockPageZoom);
    };
  }, []);

  useShortcuts({
    playPause: () => usePlayerStore.getState().togglePlay(),
    seekBack: () => usePlayerStore.getState().seekBy(-5),
    seekForward: () => usePlayerStore.getState().seekBy(5),
    seekBackFine: () => usePlayerStore.getState().seekBy(-1),
    seekForwardFine: () => usePlayerStore.getState().seekBy(1),
    zoomIn: () => zoomAroundPlayhead(1 / KEYBOARD_ZOOM),
    zoomOut: () => zoomAroundPlayhead(KEYBOARD_ZOOM),
    openFile: () => void pickAndOpenFile(),
  });

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            {loading ? (
              <LoadingState />
            ) : hasTrack ? (
              <WaveformPanel />
            ) : (
              <EmptyState hovering={hovering} />
            )}
            <DropOverlay visible={hovering && hasTrack} />
            <ErrorBanner />
            {info && !hasTrack && (
              <span className="absolute right-3 bottom-2 text-[11px] text-fg-subtle tabular">
                {info.name} {info.version} · {t.app.engine} {info.engineVersion}
              </span>
            )}
          </main>
          <SidePanel />
        </div>
        <TransportDock />
      </div>
    </TooltipProvider>
  );
}
