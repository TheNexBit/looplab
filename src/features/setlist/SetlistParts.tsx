import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  FileAudio,
  FilePlus,
  FileVideo,
  GraduationCap,
  GripVertical,
  History,
  ListMusic,
  MonitorPlay,
  MoreHorizontal,
  Music,
  OctagonPause,
  Pencil,
  Play,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from "lucide-react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MenuChoice } from "@/components/ui/MenuChoice";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Stepper } from "@/components/ui/Stepper";
import { isVideoPath, MEDIA_EXTENSIONS } from "@/features/library/formats";
import { t } from "@/i18n";
import type { Setlist_Serialize as Setlist, SetlistSong_Serialize as Song } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatPercent, samePath, signed } from "@/lib/format";
import { formatLength } from "@/lib/time";
import { useLessonsStore } from "@/stores/lessons";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { useSetlistsStore } from "@/stores/setlists";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { LiveSettingsDialog } from "./LiveSettingsDialog";
import { useLiveStore } from "./live";
import { printSetlist } from "./printSetlist";
import { addFilesTo, DROP_ATTRIBUTE } from "./setlistDrop";
import {
  breakItem,
  daysTo,
  isBreak,
  moved,
  newSongId,
  playLength,
  songFromFile,
  songNumbers,
  songWithoutFile,
  todayIso,
} from "./setlistMath";

const s = t.setlist;
const store = () => useSetlistsStore.getState();

export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(s.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const newSetlist = () => store().create(s.newSetlistName(todayIso()));

/** Where «Resume» starts: the song the set was last left on (the first one otherwise). */
export function resumeIndex(setlist: Setlist): number {
  const index = setlist.songs.findIndex((song) => song.id === setlist.lastSong);
  return Math.max(0, index);
}

/** Turns set mode on at song `index` and plays it at once. */
export async function playFrom(setlistId: string, index: number) {
  await useLiveStore.getState().start(setlistId, index);
  useLiveStore.getState().playSong(index);
}

/** Opens a song of the setlist to practise it alone: set mode ends, the Home closes. */
export async function openToStudy(path: string) {
  useLiveStore.getState().stop();
  useLessonsStore.getState().setOpen(false);
  const player = usePlayerStore.getState();
  if (!samePath(player.track?.path, path)) await player.open(path);
}

async function replaceFile(setlistId: string, song: Song) {
  const path = await pickFiles({
    multiple: false,
    directory: false,
    filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
  });
  if (!path) return;
  // Another file: its length is read again
  store().editSong(setlistId, song.id, { path, length: null, cueIn: null, cueOut: null });
}

async function addFromDisk(setlistId: string) {
  const picked = await pickFiles({
    multiple: true,
    directory: false,
    filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
  });
  const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  addFilesTo(
    setlistId,
    paths.map((path) => ({ path })),
  );
}

/** Short Live settings of a row: «+2 st · 95% · 0:12→3:40». */
function liveSummary(song: Song): string {
  const parts: string[] = [];
  if (song.semitones) parts.push(signed(song.semitones, "st"));
  if (song.speed && song.speed !== 1) parts.push(formatPercent(song.speed));
  if (song.cueIn || song.cueOut !== null) {
    parts.push(
      `${formatLength(song.cueIn ?? 0)}→${song.cueOut !== null ? formatLength(song.cueOut) : s.end}`,
    );
  }
  if (!song.path && song.bpm) parts.push(`${Math.round(song.bpm)} BPM`);
  return parts.join(" · ");
}

/** The key of a song as a small badge, like the key column of a DJ or setlist app. */
export function KeyBadge({ songKey, large = false }: { songKey: string | null; large?: boolean }) {
  if (!songKey) return null;
  return (
    <span
      title={s.keyOf(songKey)}
      className={cn(
        "shrink-0 rounded-control border border-accent/50 font-mono text-accent",
        large ? "px-2.5 py-0.5 text-xl" : "px-1 text-[10px] leading-4",
      )}
    >
      {songKey}
    </span>
  );
}

type MenuParts = {
  Item: typeof DropdownMenu.Item | typeof ContextMenu.Item;
  CheckboxItem: typeof DropdownMenu.CheckboxItem | typeof ContextMenu.CheckboxItem;
  ItemIndicator: typeof DropdownMenu.ItemIndicator | typeof ContextMenu.ItemIndicator;
  Separator: typeof DropdownMenu.Separator | typeof ContextMenu.Separator;
};
const DROPDOWN: MenuParts = {
  Item: DropdownMenu.Item,
  CheckboxItem: DropdownMenu.CheckboxItem,
  ItemIndicator: DropdownMenu.ItemIndicator,
  Separator: DropdownMenu.Separator,
};
const CONTEXT: MenuParts = {
  Item: ContextMenu.Item,
  CheckboxItem: ContextMenu.CheckboxItem,
  ItemIndicator: ContextMenu.ItemIndicator,
  Separator: ContextMenu.Separator,
};

function SongMenuItems({
  setlist,
  index,
  onSettings,
  onRename,
  parts: { Item, CheckboxItem, ItemIndicator, Separator },
}: {
  setlist: Setlist;
  index: number;
  onSettings: () => void;
  onRename: () => void;
  parts: MenuParts;
}) {
  const song = setlist.songs[index];
  if (!song) return null;
  const pause = isBreak(song);
  const last = index === setlist.songs.length - 1;
  const move = (to: number) =>
    store().edit(setlist.id, (x) => ({ ...x, songs: moved(x.songs, index, to) }));
  return (
    <>
      {!pause && (
        <Item className={menuItem} onSelect={() => void playFrom(setlist.id, index)}>
          <Play className="size-4" />
          {s.playFromHere}
        </Item>
      )}
      <Item className={menuItem} onSelect={onSettings}>
        <SlidersHorizontal className="size-4" />
        {pause ? s.breakSettings : s.liveSettings}
      </Item>
      {song.path && (
        <Item className={menuItem} onSelect={() => void openToStudy(song.path ?? "")}>
          <GraduationCap className="size-4" />
          {s.openToStudy}
        </Item>
      )}
      {song.path && (
        <Item className={menuItem} onSelect={() => void replaceFile(setlist.id, song)}>
          <Search className="size-4" />
          {s.replaceFile}
        </Item>
      )}
      {!pause && (
        <CheckboxItem
          className={menuItem}
          checked={song.segue}
          disabled={last}
          onCheckedChange={(segue) =>
            store().editSong(setlist.id, song.id, segue ? { segue, stopAfter: false } : { segue })
          }
        >
          <ArrowDownToLine className="size-4" />
          {s.segue}
          <ItemIndicator className="ml-auto pl-4">
            <Check className="size-4" />
          </ItemIndicator>
        </CheckboxItem>
      )}
      {!pause && (
        <CheckboxItem
          className={menuItem}
          checked={song.stopAfter}
          disabled={last}
          onCheckedChange={(stopAfter) =>
            store().editSong(
              setlist.id,
              song.id,
              stopAfter ? { stopAfter, segue: false } : { stopAfter },
            )
          }
        >
          <OctagonPause className="size-4" />
          {s.stopAfter}
          <ItemIndicator className="ml-auto pl-4">
            <Check className="size-4" />
          </ItemIndicator>
        </CheckboxItem>
      )}
      <Separator className={menuSeparator} />
      <Item className={menuItem} onSelect={onRename}>
        <Pencil className="size-4" />
        {s.rename}
        <kbd className="ml-auto pl-4 text-[10px] opacity-70">F2</kbd>
      </Item>
      <Item className={menuItem} disabled={index === 0} onSelect={() => move(index - 1)}>
        {s.moveUp}
      </Item>
      <Item className={menuItem} disabled={last} onSelect={() => move(index + 1)}>
        {s.moveDown}
      </Item>
      <Item
        className={menuItem}
        onSelect={() => store().addSongs(setlist.id, [{ ...song, id: newSongId() }], index + 1)}
      >
        <Copy className="size-4" />
        {s.duplicateSong}
      </Item>
      <Item
        className={menuItem}
        onSelect={() => store().addSongs(setlist.id, [breakItem(s.breakName)], index + 1)}
      >
        <Coffee className="size-4" />
        {s.addBreakAfter}
      </Item>
      <Separator className={menuSeparator} />
      <Item
        className={menuItem}
        onSelect={() =>
          store().edit(setlist.id, (x) => ({ ...x, songs: x.songs.filter((_, i) => i !== index) }))
        }
      >
        <Trash2 className="size-4" />
        {pause ? s.removeBreak : s.removeSong}
      </Item>
    </>
  );
}

/** The title being renamed: Enter or leaving the field keeps it, Esc cancels, empty is ignored. */
function RenameField({ value, onDone }: { value: string; onDone: (title: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  useEffect(() => {
    // After the menu that asked for it has closed and given the focus back
    const frame = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <input
      ref={ref}
      aria-label={s.renameSong}
      defaultValue={value}
      onBlur={(event) => finish(event.target.value.trim() || null)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value.trim() || null);
        if (event.key === "Escape") finish(null);
      }}
      className="min-w-0 flex-1 rounded-[4px] bg-surface px-1 text-sm text-fg outline-none ring-1 ring-accent/70"
    />
  );
}

function SongRow({
  setlist,
  song,
  index,
  number,
  compact,
  dragging,
  dropLine,
  onGrab,
  onSettings,
  selected,
  onSelect,
  renaming,
  onRename,
}: {
  setlist: Setlist;
  song: Song;
  index: number;
  number: number | undefined;
  compact: boolean;
  dragging: boolean;
  dropLine: "above" | "below" | null;
  onGrab: (event: React.PointerEvent) => void;
  onSettings: () => void;
  selected: boolean;
  onSelect: () => void;
  renaming: boolean;
  /** `true` starts renaming, `false` ends it */
  onRename: (on: boolean) => void;
}) {
  const files = useSetlistsStore((st) => st.files);
  const isOpen = usePlayerStore((st) => samePath(st.track?.path, song.path));
  const rowRef = useRef<HTMLDivElement>(null);
  const liveIndex = useLiveStore((st) =>
    st.active && st.setlistId === setlist.id ? st.index : -1,
  );
  const current = liveIndex === index;
  const played = liveIndex > index;
  const pause = isBreak(song);
  const missing = !!song.path && files.some((f) => samePath(f.path, song.path) && !f.exists);
  const length = playLength(song);
  const summary = compact ? "" : liveSummary(song);
  const Icon = pause ? Coffee : !song.path ? Music : isVideoPath(song.path) ? FileVideo : FileAudio;
  const keyButton = "size-7 shrink-0";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={rowRef}
          data-song-index={index}
          // A click selects the row, like a track in a DAW; F2 renames it
          role="option"
          tabIndex={0}
          aria-selected={selected}
          onClick={onSelect}
          onKeyDown={(event) => {
            if (event.key === "F2" && !renaming) {
              event.preventDefault();
              event.stopPropagation();
              onRename(true);
            }
          }}
          className={cn(
            "group relative flex items-center gap-1.5 rounded-control px-1 outline-none hover:bg-surface-hover",
            pause ? "my-1 h-8 border-y border-dashed border-border" : "h-9",
            (current || (isOpen && liveIndex < 0)) && "bg-accent-soft",
            played && "opacity-50",
            selected && "ring-1 ring-accent/60 ring-inset",
            dragging && "opacity-40",
          )}
          // In the side panel (set mode) a double-click plays the song; on the Home it opens its Live settings
          onDoubleClick={() =>
            compact && !pause ? useLiveStore.getState().playSong(index) : onSettings()
          }
        >
          {dropLine && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-accent",
                dropLine === "above" ? "-top-px" : "-bottom-px",
              )}
            />
          )}
          <button
            type="button"
            aria-label={s.dragHint}
            title={s.dragHint}
            onPointerDown={onGrab}
            className="flex h-7 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-subtle opacity-50 group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
          <span
            className={cn(
              "flex w-5 shrink-0 justify-end font-mono text-[11px] tabular",
              current ? "text-accent" : "text-fg-subtle",
            )}
          >
            {current ? (
              <Play className="size-3 fill-current" aria-label={s.nowPlaying} />
            ) : (
              (number ?? "")
            )}
          </span>
          <Icon
            className={cn("size-3.5 shrink-0", isOpen ? "text-accent" : "text-fg-subtle")}
            aria-hidden
          />
          {renaming ? (
            <RenameField
              value={song.title}
              onDone={(title) => {
                if (title && title !== song.title) store().editSong(setlist.id, song.id, { title });
                onRename(false);
                // Back on the row, so F2 or the arrows go on from here
                requestAnimationFrame(() => rowRef.current?.focus());
              }}
            />
          ) : (
            <span
              title={song.title}
              className={cn(
                "min-w-0 flex-1 cursor-default truncate px-1 text-sm",
                pause && "text-fg-muted italic",
              )}
            >
              {song.title || s.untitledSong}
            </span>
          )}
          <KeyBadge songKey={song.key} />
          {missing && (
            <span title={`${s.fileMissing}: ${song.path ?? ""}`} className="shrink-0 text-red-400">
              <AlertCircle className="size-3.5" aria-label={s.fileMissing} />
            </span>
          )}
          {song.notes && !compact && (
            <span title={song.notes} className="shrink-0 text-fg-subtle">
              <StickyNote className="size-3.5" aria-label={s.hasNotes} />
            </span>
          )}
          {summary && (
            <button
              type="button"
              onClick={onSettings}
              title={s.liveSettings}
              className="shrink-0 rounded-control px-1.5 py-0.5 font-mono text-[11px] text-fg-muted hover:bg-surface hover:text-fg"
            >
              {summary}
            </button>
          )}
          {song.stopAfter && (
            <span title={s.stopAfterHint} className="shrink-0 text-accent">
              <OctagonPause className="size-3.5" aria-label={s.stopAfter} />
            </span>
          )}
          {song.segue && (
            <span title={s.segueHint} className="shrink-0 text-accent">
              <ArrowDownToLine className="size-3.5" aria-label={s.segue} />
            </span>
          )}
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-fg-muted tabular">
            {length === null ? "—" : formatLength(length)}
          </span>
          {!compact && !pause && (
            <Button
              size="icon"
              className={cn(
                keyButton,
                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
              title={s.playFromHere}
              aria-label={s.playFromHere}
              onClick={() => void playFrom(setlist.id, index)}
            >
              <Play className="size-4" />
            </Button>
          )}
          {!compact && (
            <Button
              size="icon"
              className={keyButton}
              title={pause ? s.breakSettings : s.liveSettings}
              aria-label={pause ? s.breakSettings : s.liveSettings}
              onClick={onSettings}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="icon" className={keyButton} aria-label={s.songMenu} title={s.songMenu}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className={menuContent}
                // Rename puts the focus in the title: the menu must not take it back
                onCloseAutoFocus={(event) => renaming && event.preventDefault()}
              >
                <SongMenuItems
                  setlist={setlist}
                  index={index}
                  onSettings={onSettings}
                  onRename={() => onRename(true)}
                  parts={DROPDOWN}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={menuContent}
          onCloseAutoFocus={(event) => renaming && event.preventDefault()}
        >
          <SongMenuItems
            setlist={setlist}
            index={index}
            onSettings={onSettings}
            onRename={() => onRename(true)}
            parts={CONTEXT}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * The setlist's drop zone: files from the system or tracks from the recent list join the
 * setlist when dropped anywhere inside it (the empty space under the songs too). It lights up
 * while they are over it.
 */
export function SetlistDropZone({
  setlistId,
  className,
  children,
}: {
  setlistId: string;
  className?: string;
  children: ReactNode;
}) {
  const dropping = useSetlistsStore((st) => st.dropTarget === setlistId);
  const zone = { [DROP_ATTRIBUTE]: setlistId };
  return (
    <div
      {...zone}
      className={cn(
        "relative rounded-panel transition-colors",
        dropping && "bg-accent-soft ring-2 ring-accent ring-inset",
        className,
      )}
    >
      {children}
      {dropping && (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-accent">
          {s.dropHere}
        </p>
      )}
    </div>
  );
}

/**
 * The songs in playing order. Reordered by their grip (the pointer, not the system drag and
 * drop: the window takes that for files).
 */
export function SongList({ setlist, compact = false }: { setlist: Setlist; compact?: boolean }) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const numbers = songNumbers(setlist.songs);

  const grab = (from: number) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDrag({ from, to: from });
    const target = (y: number) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-song-index]") ?? [])];
      const found = rows.findIndex((row) => {
        const box = row.getBoundingClientRect();
        return y < box.top + box.height / 2;
      });
      return found === -1 ? rows.length : found;
    };
    const onMove = (e: PointerEvent) => setDrag({ from, to: target(e.clientY) });
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag(null);
      const to = target(e.clientY);
      // Dropped below itself: the gap it leaves shifts the place by one
      const place = to > from ? to - 1 : to;
      if (place !== from) {
        store().edit(setlist.id, (x) => ({ ...x, songs: moved(x.songs, from, place) }));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const settingsSong = setlist.songs.find((song) => song.id === settingsOf) ?? null;
  return (
    <div className="flex flex-col">
      {setlist.songs.length === 0 ? (
        <div className="flex flex-1 flex-col items-start gap-2 rounded-panel border-2 border-dashed border-border px-4 py-5">
          <ListMusic className="size-6 text-accent" aria-hidden />
          <p className="text-sm font-medium">{s.noSongs}</p>
          <p className="text-xs text-fg-subtle">{compact ? s.noSongsPanelHint : s.noSongsHint}</p>
        </div>
      ) : (
        <div ref={listRef} role="listbox" aria-label={s.songsLabel} className="flex flex-col">
          {setlist.songs.map((song, index) => (
            <SongRow
              key={song.id}
              setlist={setlist}
              song={song}
              index={index}
              number={numbers.get(song.id)}
              compact={compact}
              dragging={drag?.from === index}
              dropLine={
                drag && drag.to !== drag.from && drag.to !== drag.from + 1
                  ? drag.to === index
                    ? "above"
                    : drag.to === setlist.songs.length && index === setlist.songs.length - 1
                      ? "below"
                      : null
                  : null
              }
              onGrab={grab(index)}
              onSettings={() => setSettingsOf(song.id)}
              selected={selected === song.id}
              onSelect={() => setSelected(song.id)}
              renaming={renaming === song.id}
              onRename={(on) => setRenaming(on ? song.id : null)}
            />
          ))}
        </div>
      )}
      <LiveSettingsDialog
        key={settingsOf ?? ""}
        setlistId={setlist.id}
        song={settingsSong}
        isLast={settingsSong ? setlist.songs.at(-1)?.id === settingsSong.id : false}
        onClose={() => setSettingsOf(null)}
      />
    </div>
  );
}

function RecentItems({
  setlist,
  Item,
  Label,
}: {
  setlist: Setlist;
  Item: typeof DropdownMenu.Item;
  Label: typeof DropdownMenu.Label;
}) {
  const recent = useRecentStore((st) => st.files).filter((f) => f.exists);
  const inSet = (path: string) => setlist.songs.some((song) => samePath(song.path, path));
  if (recent.length === 0) return <Label className={menuLabel}>{s.noRecent}</Label>;
  return (
    <>
      {recent.map((file) => (
        <Item
          key={file.path}
          className={menuItem}
          onSelect={() => store().addSongs(setlist.id, [songFromFile(file.path, file.duration)])}
        >
          {isVideoPath(file.path) ? (
            <FileVideo className="size-4 shrink-0" />
          ) : (
            <FileAudio className="size-4 shrink-0" />
          )}
          <span className="truncate">{file.name}</span>
          {inSet(file.path) && (
            <span className="ml-auto shrink-0 pl-2 text-[10px] text-fg-subtle">{s.alreadyIn}</span>
          )}
        </Item>
      ))}
    </>
  );
}

/**
 * Adds songs: the open track, a recent one, files, a song without file, a break. On the Home
 * every way has its key; in the side panel the open track has one and the rest sit under +.
 */
export function AddSongs({ setlist, compact = false }: { setlist: Setlist; compact?: boolean }) {
  const track = usePlayerStore((st) => st.track);
  const add = (songs: Song[]) => store().addSongs(setlist.id, songs);
  const refreshRecent = (open: boolean) => open && void useRecentStore.getState().refresh();

  const openKey = (
    <Button
      variant="hardware"
      disabled={!track}
      title={track ? s.addOpenHint(track.name) : s.addOpenNone}
      onClick={() => track && add([songFromFile(track.path, track.duration)])}
    >
      <Plus className="size-4" />
      {compact ? s.addThis : s.addOpen}
    </Button>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {openKey}
        <DropdownMenu.Root onOpenChange={refreshRecent}>
          <DropdownMenu.Trigger asChild>
            <Button variant="hardware" title={s.addMore}>
              <ListMusic className="size-4" />
              {s.addMore}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className={cn(menuContent, "max-w-80")}
            >
              <DropdownMenu.Item className={menuItem} onSelect={() => void addFromDisk(setlist.id)}>
                <FilePlus className="size-4" />
                {s.addFiles}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => add([songWithoutFile(s.newSong)])}
              >
                <Music className="size-4" />
                {s.addWithoutFile}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => add([breakItem(s.breakName)])}
              >
                <Coffee className="size-4" />
                {s.addBreak}
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={menuItem}>
                  <History className="size-4" />
                  {s.addRecent}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent
                    className={cn(menuContent, "max-h-96 max-w-80 overflow-y-auto")}
                  >
                    <RecentItems
                      setlist={setlist}
                      Item={DropdownMenu.Item}
                      Label={DropdownMenu.Label}
                    />
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {openKey}
      <DropdownMenu.Root onOpenChange={refreshRecent}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware">
            <History className="size-4" />
            {s.addRecent}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className={cn(menuContent, "max-h-96 max-w-96 overflow-y-auto")}
          >
            <RecentItems setlist={setlist} Item={DropdownMenu.Item} Label={DropdownMenu.Label} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Button variant="hardware" onClick={() => void addFromDisk(setlist.id)}>
        <FilePlus className="size-4" />
        {s.addFiles}
      </Button>
      <Button
        variant="hardware"
        title={s.addWithoutFileHint}
        onClick={() => add([songWithoutFile(s.newSong)])}
      >
        <Music className="size-4" />
        {s.addWithoutFile}
      </Button>
      <Button
        variant="hardware"
        title={s.addBreakHint}
        onClick={() => add([breakItem(s.breakName)])}
      >
        <Coffee className="size-4" />
        {s.addBreak}
      </Button>
      <span className="text-[11px] text-fg-subtle">{s.dropHint}</span>
    </div>
  );
}

/** The setlist picker: next gigs first, then undated, then past ones; new, duplicate, print. */
export function SetlistPicker({
  current,
  compact = false,
}: {
  current: Setlist;
  compact?: boolean;
}) {
  const setlists = useSetlistsStore((st) => st.setlists);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="hardware"
          className={cn("min-w-0", compact ? "flex-1" : "max-w-64")}
          title={s.pickSetlist}
        >
          <ListMusic className="size-4 shrink-0" />
          <span className="truncate">{current.name || s.untitled}</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(menuContent, "max-h-96 min-w-64 overflow-y-auto")}
        >
          <DropdownMenu.RadioGroup
            value={current.id}
            onValueChange={(setlistOpen) => useSettingsStore.getState().update({ setlistOpen })}
          >
            {setlists.map((setlist) => (
              <MenuChoice key={setlist.id} value={setlist.id}>
                <span className="truncate">{setlist.name || s.untitled}</span>
                {setlist.date && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 pl-3 text-[11px]",
                      daysTo(setlist.date) < 0 ? "text-fg-subtle" : "text-fg-muted",
                    )}
                  >
                    {shortDate(setlist.date)}
                  </span>
                )}
              </MenuChoice>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Item className={menuItem} onSelect={() => void newSetlist()}>
            <Plus className="size-4" />
            {s.newSetlist}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() =>
              void store().duplicate(current.id, s.copyName(current.name || s.untitled))
            }
          >
            <Copy className="size-4" />
            {s.duplicateSetlist}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItem}
            disabled={current.songs.length === 0}
            onSelect={() => printSetlist(current)}
          >
            <Printer className="size-4" />
            {s.print}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The key that turns set mode on, like loading a set in BandHelper or OnSong: from the song
 * the set was left on («Resume from 5»), or the first. Lit while the set is on; a click ends it.
 */
export function SetKey({ setlist, compact = false }: { setlist: Setlist; compact?: boolean }) {
  const on = useLiveStore((st) => st.active && st.setlistId === setlist.id);
  const empty = !setlist.songs.some((song) => !isBreak(song));
  const resume = resumeIndex(setlist);
  const numbers = songNumbers(setlist.songs);
  const resumeSong = setlist.songs[resume];
  const resumeNumber = resume > 0 && resumeSong ? numbers.get(resumeSong.id) : undefined;
  if (on) {
    return (
      <Button
        variant="hardware"
        active
        led="amber"
        className="h-7 flex-row"
        title={s.leaveSet}
        onClick={() => useLiveStore.getState().stop()}
      >
        {s.setOn}
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      disabled={empty}
      title={empty ? s.liveEmpty : s.activateHint}
      onClick={() => void useLiveStore.getState().start(setlist.id, resume)}
    >
      <Play className="size-4" />
      {resumeNumber && !compact ? s.resumeFrom(resumeNumber) : s.activate}
    </Button>
  );
}

/** Stage view key: the set on the full-window view; ▾ picks the whole set or the changes only. */
export function LiveKey({ setlist, compact = false }: { setlist: Setlist; compact?: boolean }) {
  const mode = useSettingsStore((st) => st.liveMode);
  const seconds = useSettingsStore((st) => st.liveChangeSeconds);
  const empty = !setlist.songs.some((song) => !isBreak(song));
  const start = () => {
    const live = useLiveStore.getState();
    const index = live.active && live.setlistId === setlist.id ? live.index : resumeIndex(setlist);
    void live.start(setlist.id, index, true);
  };
  return (
    <div className="flex shrink-0">
      <Button
        variant="hardware"
        className="rounded-r-none"
        disabled={empty}
        title={empty ? s.liveEmpty : mode === "changes" ? s.liveChangesHint(seconds) : s.liveHint}
        onClick={start}
      >
        <MonitorPlay className="size-4" />
        {!compact && (mode === "changes" ? s.liveChanges : s.stageKey)}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="hardware"
            size="icon"
            className="rounded-l-none border-l border-edge"
            aria-label={s.liveOptions}
            title={s.liveOptions}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={cn(menuContent, "w-72")}>
            <DropdownMenu.Label className={menuLabel}>{s.liveModeLabel}</DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              value={mode}
              onValueChange={(value) =>
                useSettingsStore.getState().update({ liveMode: value as typeof mode })
              }
            >
              <MenuChoice value="set">
                <span className="flex flex-col">
                  {s.modeSet}
                  <span className="text-[11px] opacity-70">{s.modeSetHint}</span>
                </span>
              </MenuChoice>
              <MenuChoice value="changes">
                <span className="flex flex-col">
                  {s.modeChanges}
                  <span className="text-[11px] opacity-70">{s.modeChangesHint}</span>
                </span>
              </MenuChoice>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Separator className={menuSeparator} />
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="flex-1 text-xs text-fg-muted">{s.changeSeconds}</span>
              <Stepper
                label={s.changeSeconds}
                value={seconds}
                {...SETTING_LIMITS.liveChangeSeconds}
                defaultValue={10}
                format={(value) => `${value} s`}
                onChange={(liveChangeSeconds) =>
                  useSettingsStore.getState().update({ liveChangeSeconds })
                }
              />
            </div>
            <p className="px-2.5 pb-1.5 text-[11px] text-fg-subtle">{s.stageKeys}</p>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** «Add to setlist «Gig»» for a track's menu (recent list, lessons): to the setlist last open. */
export function useAddToOpenSetlist(): {
  name: string;
  add: (path: string, length?: number | null) => void;
} | null {
  const setlists = useSetlistsStore((st) => st.setlists);
  const loaded = useSetlistsStore((st) => st.loaded);
  // Read once, so the item is there even if no setlist was shown yet
  useEffect(() => {
    if (!loaded) void store().refresh();
  }, [loaded]);
  const picked = useSettingsStore((st) => st.setlistOpen);
  const setlist = setlists.find((x) => x.id === picked) ?? setlists[0];
  if (!setlist) return null;
  return {
    name: setlist.name || s.untitled,
    add: (path, length) => addFilesTo(setlist.id, [{ path, length }]),
  };
}
