import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { ExportDialog } from "@/features/export/ExportDialog";
import { DropOverlay } from "@/features/library/DropOverlay";
import { EmptyState } from "@/features/library/EmptyState";
import { ErrorBanner } from "@/features/library/ErrorBanner";
import { LoadingState } from "@/features/library/LoadingState";
import { openDroppedFiles, openLastTrack } from "@/features/library/pickFile";
import { useFileDrop } from "@/features/library/useFileDrop";
import { syncProject } from "@/features/markers/projectSync";
import { watchSnapHold } from "@/features/markers/snapHold";
import { MetronomeView } from "@/features/metronome/MetronomeView";
import { syncMetronome } from "@/features/metronome/metronomeEngine";
import { syncWithEngine } from "@/features/player/syncEngine";
import { TransportDock } from "@/features/player/TransportDock";
import { startDiary } from "@/features/practice/diaryRecorder";
import { runPlaylist } from "@/features/practice/playlist";
import { startTrainer } from "@/features/practice/trainer";
import { startRemoteControl } from "@/features/remote/remoteControl";
import { ScoreLayout } from "@/features/score/ScoreLayout";
import { feedDetachedVideo } from "@/features/video/detach";
import { VideoLayout } from "@/features/video/VideoLayout";
import { followTrackVideo } from "@/features/video/videoLoader";
import { WaveformPanel } from "@/features/waveform/WaveformPanel";
import { t } from "@/i18n";
import { type AppInfo, commands, events } from "@/lib/bindings";
import { useShortcuts } from "@/lib/useShortcuts";
import { useMetronomeStore } from "@/stores/metronome";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { AboutDialog } from "./AboutDialog";
import { CommandPalette } from "./CommandPalette";
import { DiaryDialog } from "./DiaryDialog";
import { InfoBar } from "./InfoBar";
import { MiniBar } from "./MiniBar";
import { SettingsDialog } from "./SettingsDialog";
import { SidePanel } from "./SidePanel";
import { shortcutHandlers } from "./shortcutHandlers";
import { TopBar } from "./TopBar";

export function App() {
  const [info, setInfo] = useState<AppInfo>();
  const hasTrack = usePlayerStore((s) => s.track !== null);
  const loading = usePlayerStore((s) => s.load.kind === "loading");
  const mini = useUiStore((s) => s.mini);
  const metronomeOpen = useMetronomeStore((s) => s.open);
  const infoBar = useSettingsStore((s) => s.infoBar);
  const hovering = useFileDrop(openDroppedFiles);

  useEffect(() => {
    void commands.appInfo().then(setInfo);
    if (useSettingsStore.getState().startup === "last") void openLastTrack();
    const unlisten = events.playbackStatus.listen((event) => {
      usePlayerStore.getState().applyStatus(event.payload);
      useMetronomeStore.getState().applyStatus(event.payload);
    });
    const unlistenLoading = events.trackLoading.listen((event) =>
      usePlayerStore.getState().applyLoading(event.payload),
    );
    // Pinch and Ctrl+wheel must never zoom the whole page
    const blockPageZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    const stopEngineSync = syncWithEngine();
    const stopProjectSync = syncProject();
    const stopVideo = followTrackVideo();
    const stopDetached = feedDetachedVideo();
    const stopTrainer = startTrainer();
    const stopPlaylist = runPlaylist();
    const stopRemote = startRemoteControl();
    const stopDiary = startDiary();
    const stopMetronome = syncMetronome();
    // Shift held suspends the magnet while dragging, as in Reaper
    const stopSnapHold = watchSnapHold();
    return () => {
      void unlisten.then((stop) => stop());
      void unlistenLoading.then((stop) => stop());
      window.removeEventListener("wheel", blockPageZoom);
      stopEngineSync();
      stopProjectSync();
      stopVideo();
      stopDetached();
      stopTrainer();
      stopPlaylist();
      stopRemote();
      stopDiary();
      stopMetronome();
      stopSnapHold();
    };
  }, []);

  useShortcuts(shortcutHandlers);

  // Mini mode: the window is a slim bar on top of other programs, with only the essentials
  if (mini) {
    return (
      <TooltipProvider>
        <MiniBar />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 overflow-hidden">
            {loading ? (
              <LoadingState />
            ) : hasTrack ? (
              <VideoLayout>
                <ScoreLayout>
                  <WaveformPanel />
                </ScoreLayout>
              </VideoLayout>
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
            {/* Over the track, which stays loaded underneath: leaving finds it as it was */}
            {metronomeOpen && (
              <div className="absolute inset-0 z-10 bg-stage">
                <MetronomeView />
              </div>
            )}
          </main>
          {!metronomeOpen && <SidePanel />}
        </div>
        {!metronomeOpen && <TransportDock />}
        {infoBar && <InfoBar />}
        <CommandPalette />
        <SettingsDialog />
        <AboutDialog />
        <DiaryDialog />
        <ExportDialog />
      </div>
    </TooltipProvider>
  );
}
