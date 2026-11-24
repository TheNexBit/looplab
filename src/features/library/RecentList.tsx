import {
  ArrowLeft,
  ChevronRight,
  Eraser,
  FileAudio,
  FileVideo,
  FolderOpen,
  ListPlus,
  Play,
  Search,
  X,
} from "lucide-react";
import { ContextMenu, Popover } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { floatingPanel, menuContent, menuItem, menuSeparator } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { lessonAround, lessonHolding } from "@/features/lessons/lessonOrder";
import { openLesson } from "@/features/lessons/openLesson";
import { useAddToOpenSetlist } from "@/features/setlist/SetlistParts";
import { dragTrack } from "@/features/setlist/setlistDrop";
import { t } from "@/i18n";
import { commands, type RecentFile } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { fileNameOf, formatAgo, formatPercent, samePath } from "@/lib/format";
import { formatLength } from "@/lib/time";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { isVideoPath } from "./formats";

const r = t.recent;
/** Below this many tracks a search field would only be in the way */
const SEARCH_FROM = 7;

/** The lesson of the Home that holds `path`, if any. */
const lessonOf = (path: string) => lessonHolding(useLessonsStore.getState().library.lessons, path);

/** Opens a recent track: through its lesson when it is one (its tab and angles come along). */
export function openRecent(file: RecentFile) {
  const lesson = lessonOf(file.path);
  if (lesson) void openLesson(lesson, file.path);
  else void usePlayerStore.getState().open(file.path);
}
const open = openRecent;

/**
 * Where a track comes from: «course · module» for a lesson's file, else «file». Components
 * showing it subscribe to the lessons' library, so it follows a rescan.
 */
export function originOf(path: string): string {
  const lesson = lessonOf(path);
  if (!lesson) return r.looseFile;
  const course = useLessonsStore
    .getState()
    .library.roots.find((root) => root.path === lesson.root)?.name;
  return [course, lesson.group].filter(Boolean).join(" · ");
}

/** "3 loop · 2 sez. · 75%": what the track's project holds, empty without one. */
export function projectSummary(file: RecentFile): string {
  const parts: string[] = [];
  if (file.savedLoops > 0) parts.push(`${file.savedLoops} ${r.loops}`);
  if (file.sections > 0) parts.push(`${file.sections} ${r.sectionsShort}`);
  if (file.speed && Math.abs(file.speed - 1) > 0.001) parts.push(formatPercent(file.speed));
  return parts.join(" · ");
}

export const ago = (file: RecentFile) =>
  file.openedAt ? formatAgo(new Date(file.openedAt * 1000), new Date(), r.ago) : "";

/** Right-click on a recent track: open it, show it in its folder, take it off the list. */
function RecentMenu({ file, children }: { file: RecentFile; children: ReactNode }) {
  const setlist = useAddToOpenSetlist();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <ContextMenu.Item
            className={menuItem}
            disabled={!file.exists}
            onSelect={() => open(file)}
          >
            <Play className="size-4" />
            {r.open}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItem}
            disabled={!file.exists}
            onSelect={() => void commands.revealFile(file.path)}
          >
            <FolderOpen className="size-4" />
            {r.reveal}
          </ContextMenu.Item>
          {setlist && (
            <ContextMenu.Item
              className={menuItem}
              disabled={!file.exists}
              onSelect={() => setlist.add(file.path, file.duration)}
            >
              <ListPlus className="size-4" />
              {t.setlist.addToSetlist(setlist.name)}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className={menuSeparator} />
          <ContextMenu.Item
            className={menuItem}
            onSelect={() => void useRecentStore.getState().forget(file.path)}
          >
            <X className="size-4" />
            {r.forget}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * The one card on top of the start screen. Over an open track: «Now playing», where it comes
 * from and the way back to it. Otherwise: the last track, to pick up where you left off. Once
 * its lesson is done, the next lesson is a click away.
 */
export function NowCard({ overTrack }: { overTrack: boolean }) {
  const track = usePlayerStore((s) => s.track);
  const files = useRecentStore((s) => s.files);
  const lessons = useLessonsStore((s) => s.library.lessons);
  const last = files[0]?.exists ? files[0] : undefined;
  const playing = overTrack && track ? track : null;
  const path = playing?.path ?? last?.path;
  if (!path) return null;
  const around = lessonAround(lessons, path);
  const lesson = around?.lesson ?? null;
  const next = lesson?.progress === "done" ? around?.next : null;
  const summary = !playing && last ? projectSummary(last) : "";
  // A lesson's other file (its backing, another angle) is named: «Riprendi» opens that one
  const otherFile = lesson && !samePath(path, lesson.main) ? fileNameOf(path) : "";
  const details = [otherFile, originOf(path), !playing && last ? ago(last) : "", summary].filter(
    Boolean,
  );
  return (
    <section className="well shrink-0 rounded-panel px-4 py-3" title={path}>
      <h2 className="panel-label text-fg-subtle">{playing ? r.nowPlaying : t.lessons.resume}</h2>
      <p className="mt-1 flex items-center gap-2">
        <span className="truncate text-base font-semibold text-fg">
          {lesson?.name ?? playing?.name ?? last?.name}
        </span>
        {lesson && lesson.progress !== "none" && (
          <span
            className={cn(
              "text-[11px] whitespace-nowrap",
              lesson.progress === "done" ? "text-loop" : "text-cue",
            )}
          >
            {t.lessons.mark[lesson.progress]}
          </span>
        )}
      </p>
      <p className="truncate text-xs text-fg-subtle">{details.join(" · ")}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {playing ? (
          <Button variant="primary" onClick={() => useLessonsStore.getState().setOpen(false)}>
            <ArrowLeft className="size-4" />
            {t.lessons.back}
            <Kbd shortcut="toggleHome" />
          </Button>
        ) : (
          last && (
            <Button variant="primary" title={t.lessons.resumeHint} onClick={() => open(last)}>
              <Play className="size-4" />
              {t.lessons.resumeKey}
            </Button>
          )
        )}
        {next && (
          <Button
            variant="hardware"
            title={`${t.lessons.next} — ${next.name}`}
            onClick={() => void openLesson(next)}
          >
            <span className="max-w-56 truncate">
              {t.lessons.upNext}: {next.name}
            </span>
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * The key that empties the recent list (asking first), or takes off only the files no longer on
 * the disk. Tracks, their projects and the diary stay. The lesson Home's «Last opened» comes
 * from the same list, so it empties too.
 */
export function ClearRecent() {
  const files = useRecentStore((s) => s.files);
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;
  const missing = files.filter((file) => !file.exists).length;
  const clear = async (onlyMissing: boolean) => {
    setOpen(false);
    await useRecentStore.getState().clear(onlyMissing);
    void useLessonsStore.getState().refresh();
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-fg-subtle hover:text-fg"
          title={r.clear}
          aria-label={r.clear}
        >
          <Eraser className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className={`${floatingPanel} w-80 p-3`}
        >
          <p className="text-sm font-medium text-fg">{r.clearAsk(files.length)}</p>
          <p className="mt-1 text-xs text-fg-subtle">{r.clearHint}</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="hardware" onClick={() => setOpen(false)}>
              {r.keep}
            </Button>
            {missing > 0 && (
              <Button variant="hardware" onClick={() => void clear(true)}>
                {r.clearMissing(missing)}
              </Button>
            )}
            <Button variant="hardware" onClick={() => void clear(false)}>
              <Eraser className="size-4" />
              {r.clearAll}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Recently opened tracks: the heart of the start screen. Name, what its project holds,
 * length and when it was opened; right-click for more. Missing files are struck through.
 */
export function RecentList() {
  const files = useRecentStore((s) => s.files);
  // Read again when the lessons change: each row says which course it comes from
  useLessonsStore((s) => s.library);
  const [query, setQuery] = useState("");

  if (files.length === 0) return null;
  const needle = query.trim().toLowerCase();
  const shown = needle ? files.filter((file) => file.name.toLowerCase().includes(needle)) : files;

  return (
    <section className="flex min-h-0 w-full flex-col">
      <div className="mb-1.5 flex items-center gap-3">
        <h2 className="panel-label flex-1 text-fg-subtle">{r.title}</h2>
        <ClearRecent />
        {files.length >= SEARCH_FROM && (
          <label className="well flex h-7 w-56 items-center gap-1.5 rounded-control px-2 text-fg-subtle focus-within:text-fg">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={r.search}
              aria-label={r.search}
              className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        )}
      </div>
      <ul className="min-h-0 overflow-y-auto">
        {shown.map((file) => {
          const Icon = isVideoPath(file.path) ? FileVideo : FileAudio;
          return (
            <li
              key={file.path}
              className="group flex items-center gap-1 border-t border-border first:border-t-0"
            >
              <RecentMenu file={file}>
                <button
                  type="button"
                  disabled={!file.exists}
                  title={withRightClick(
                    file.exists ? file.path : `${r.missing}: ${file.path}`,
                    r.rightClick,
                  )}
                  onClick={() => open(file)}
                  // Dragged onto a setlist it joins it, like a clip from Ableton's browser
                  onPointerDown={(event) =>
                    file.exists &&
                    dragTrack(event, { path: file.path, name: file.name, length: file.duration })
                  }
                  className={cn(
                    "grid min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto_3.5rem_4.5rem] items-center gap-3 rounded-control px-2 py-1.5 text-left text-sm transition-colors",
                    file.exists
                      ? "text-fg-muted hover:bg-surface-hover hover:text-fg"
                      : "text-fg-subtle line-through",
                  )}
                >
                  <Icon
                    className="size-4"
                    aria-label={isVideoPath(file.path) ? r.video : r.audio}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{file.name}</span>
                    <span className="block truncate text-[11px] text-fg-subtle">
                      {originOf(file.path)}
                    </span>
                  </span>
                  <span className="text-xs text-readout-dim tabular">{projectSummary(file)}</span>
                  <span className="text-right font-mono text-xs text-fg-subtle tabular">
                    {file.duration ? formatLength(file.duration) : ""}
                  </span>
                  <span className="text-right text-xs text-fg-subtle">{ago(file)}</span>
                </button>
              </RecentMenu>
              <button
                type="button"
                onClick={() => void useRecentStore.getState().forget(file.path)}
                aria-label={r.forget}
                title={r.forget}
                className="rounded-control p-1 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-3 text-sm text-fg-subtle">{r.noMatch}</li>}
      </ul>
    </section>
  );
}
