import { ArrowLeft, FolderOpen, Lightbulb, Metronome, Music, Upload } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { LessonHome } from "@/features/lessons/LessonHome";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useLessonsStore } from "@/stores/lessons";
import { useMetronomeStore } from "@/stores/metronome";
import { useRecentStore } from "@/stores/recent";
import { formatsLabel } from "./formats";
import { pickAndOpenFile } from "./pickFile";
import { RecentList, ResumeRow } from "./RecentList";

/** One tip per start of the app, picked at random */
const tip = t.recent.tips[Math.floor(Math.random() * t.recent.tips.length)];

function OpenButton() {
  return (
    <Button variant="primary" onClick={() => void pickAndOpenFile()}>
      <FolderOpen className="size-4" />
      {t.empty.openFile}
      <Kbd shortcut="openFile" />
    </Button>
  );
}

/** First start, nothing opened yet: a big place to drop the first track. */
function FirstDrop({ hovering }: { hovering: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-4 rounded-panel border-2 border-dashed px-10 py-14 text-center transition-colors",
        hovering ? "border-accent bg-accent-soft" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-panel bg-surface transition-colors",
          hovering ? "text-accent" : "text-fg-muted",
        )}
      >
        <Music className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{hovering ? t.empty.dropNow : t.empty.title}</h1>
        <p className="text-sm text-fg-subtle">{formatsLabel}</p>
      </div>
      <OpenButton />
    </div>
  );
}

/** A slim strip once there are recent tracks: files can be dropped anywhere in the window. */
function DropStrip({ hovering }: { hovering: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-panel border border-dashed px-3 py-2 transition-colors",
        hovering ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-subtle",
      )}
    >
      <Upload className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs" title={formatsLabel}>
        {hovering ? t.empty.dropNow : t.recent.dropStrip}
      </p>
      <OpenButton />
    </div>
  );
}

/**
 * Start screen: the lessons of the course folders, and beside them the recent tracks, a way to
 * open more, one tip. Also shown over an open track (`overTrack`), with the way back to it.
 */
export function EmptyState({
  hovering,
  overTrack = false,
}: {
  hovering: boolean;
  overTrack?: boolean;
}) {
  const files = useRecentStore((s) => s.files);

  useEffect(() => {
    void useRecentStore.getState().refresh();
  }, []);

  // Over a track, Esc goes back to it
  useEffect(() => {
    if (!overTrack) return;
    const onKey = (event: KeyboardEvent) => {
      // An open menu takes its own Esc
      if (event.key !== "Escape" || document.querySelector('[role="menu"]')) return;
      // Only back to the track: Esc must not also clear its loop
      event.stopPropagation();
      event.preventDefault();
      useLessonsStore.getState().setOpen(false);
    };
    // Before the shortcuts (same window, bubbling)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [overTrack]);

  const last = files[0]?.exists ? files[0] : undefined;
  return (
    // The whole width, at the start and over a track alike
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto px-6 pt-8 pb-10 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-3">
        {overTrack && (
          <Button
            variant="hardware"
            className="h-8 shrink-0 self-start px-3"
            onClick={() => useLessonsStore.getState().setOpen(false)}
          >
            <ArrowLeft className="size-4" />
            {t.lessons.back}
            <Kbd shortcut="toggleHome" />
          </Button>
        )}
        <LessonHome />
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        {files.length === 0 ? (
          <div className="flex flex-1 items-center">
            <FirstDrop hovering={hovering} />
          </div>
        ) : (
          <>
            {last && <ResumeRow file={last} />}
            <div className="flex min-h-0 flex-1 flex-col">
              <RecentList />
            </div>
            <DropStrip hovering={hovering} />
          </>
        )}
        <Button
          variant="hardware"
          className="h-9 shrink-0 self-start px-3"
          onClick={() => useMetronomeStore.getState().setOpen(true)}
        >
          <Metronome className="size-4" />
          {t.metronome.title}
          <Kbd shortcut="toggleMetronomeMode" />
        </Button>
        {/* The whole tip, wrapping if it must: never cut */}
        <p className="shrink-0 text-[11px] leading-snug text-fg-subtle">
          <Lightbulb className="mr-1.5 inline size-3 align-[-2px]" aria-hidden />
          <span className="mr-1.5 font-medium whitespace-nowrap">{t.recent.tipLabel}</span>
          {tip}
        </p>
      </div>
    </div>
  );
}
