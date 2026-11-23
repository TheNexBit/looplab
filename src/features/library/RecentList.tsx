import { Eraser, FileAudio, FileVideo, FolderOpen, Play, Search, X } from "lucide-react";
import { ContextMenu, Popover } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { floatingPanel, menuContent, menuItem, menuSeparator } from "@/components/ui/menu";
import { withRightClick } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { commands, type RecentFile } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatAgo, formatPercent } from "@/lib/format";
import { formatLength } from "@/lib/time";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { isVideoPath } from "./formats";

const r = t.recent;
/** Below this many tracks a search field would only be in the way */
const SEARCH_FROM = 7;

const open = (file: RecentFile) => void usePlayerStore.getState().open(file.path);

/** "3 loop · 2 sez. · 75%": what the track's project holds, empty without one. */
function projectSummary(file: RecentFile): string {
  const parts: string[] = [];
  if (file.savedLoops > 0) parts.push(`${file.savedLoops} ${r.loops}`);
  if (file.sections > 0) parts.push(`${file.sections} ${r.sectionsShort}`);
  if (file.speed && Math.abs(file.speed - 1) > 0.001) parts.push(formatPercent(file.speed));
  return parts.join(" · ");
}

const ago = (file: RecentFile) =>
  file.openedAt ? formatAgo(new Date(file.openedAt * 1000), new Date(), r.ago) : "";

/** Right-click on a recent track: open it, show it in its folder, take it off the list. */
function RecentMenu({ file, children }: { file: RecentFile; children: ReactNode }) {
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

/** The last track, one slim row on top: back to it with one click. */
export function ResumeRow({ file }: { file: RecentFile }) {
  const summary = projectSummary(file);
  return (
    <button
      type="button"
      title={file.path}
      onClick={() => open(file)}
      className="well group flex w-full items-center gap-3 rounded-panel px-3 py-2 text-left transition-[filter] hover:brightness-125"
    >
      <span className="hw flex size-7 shrink-0 items-center justify-center rounded-control text-accent">
        <Play className="size-3.5 fill-current" />
      </span>
      <span className="panel-label shrink-0 text-accent">{r.resume}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{file.name}</span>
      {summary && <span className="shrink-0 text-xs text-readout tabular">{summary}</span>}
    </button>
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
                  <span className="truncate">{file.name}</span>
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
