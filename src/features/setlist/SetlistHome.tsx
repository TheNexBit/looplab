import { open as pickFiles } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Copy,
  FileAudio,
  FilePlus,
  FileVideo,
  GripVertical,
  History,
  ListMusic,
  MapPin,
  MoreHorizontal,
  Music,
  Play,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { ContextMenu, DropdownMenu, Popover } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineName } from "@/components/ui/InlineName";
import { MenuChoice } from "@/components/ui/MenuChoice";
import {
  floatingPanel,
  menuContent,
  menuItem,
  menuLabel,
  menuSeparator,
} from "@/components/ui/menu";
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
import { openSetlist, useSetlistsStore } from "@/stores/setlists";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { HomeTabs } from "./HomeTabs";
import { LiveSettingsDialog } from "./LiveSettingsDialog";
import { useLiveStore } from "./live";
import {
  daysTo,
  GAP_SECONDS,
  LIMIT_MINUTES,
  moved,
  playLength,
  setLength,
  songFromFile,
  songWithoutFile,
  todayIso,
} from "./setlistMath";

const s = t.setlist;
const store = () => useSetlistsStore.getState();

/** «tra 12 giorni», «oggi», «3 giorni fa». */
function countdown(date: string): { text: string; soon: boolean; past: boolean } {
  const days = daysTo(date);
  return { text: s.daysTo(days), soon: days >= 0 && days <= 7, past: days < 0 };
}

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(t.setlist.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Plain text field saved when left (Enter too); empty is allowed, unlike a name. */
function TextField({
  value,
  label,
  placeholder,
  icon,
  onChange,
}: {
  value: string;
  label: string;
  placeholder: string;
  icon: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="well flex h-7 min-w-0 items-center gap-1.5 rounded-control px-2 text-fg-subtle focus-within:text-fg">
      {icon}
      <input
        key={value}
        type="text"
        aria-label={label}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => {
          if (event.target.value.trim() !== value) onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = value;
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle"
      />
    </label>
  );
}

/** The gig day, picked from the system calendar (nothing to type), with its countdown. */
function GigDate({ setlist }: { setlist: Setlist }) {
  const edit = (date: string | null) => store().edit(setlist.id, (x) => ({ ...x, date }));
  const when = setlist.date ? countdown(setlist.date) : null;
  return (
    <div className="flex items-center gap-2">
      <label
        className="well relative flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-2 text-xs text-fg-subtle hover:text-fg"
        title={s.dateHint}
      >
        <CalendarDays className="size-3.5 shrink-0" />
        <span className={setlist.date ? "text-fg" : undefined}>
          {setlist.date ? shortDate(setlist.date) : s.noDate}
        </span>
        <input
          type="date"
          aria-label={s.date}
          value={setlist.date ?? ""}
          onChange={(event) => edit(event.target.value || null)}
          onClick={(event) => event.currentTarget.showPicker?.()}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {when && (
        <span
          className={cn(
            "rounded-control px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
            when.past ? "text-fg-subtle" : when.soon ? "bg-accent text-on-accent" : "text-accent",
          )}
        >
          {when.text}
        </span>
      )}
      {setlist.date && (
        <Button size="icon" title={s.clearDate} aria-label={s.clearDate} onClick={() => edit(null)}>
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Set length against the time the venue gives, as a meter: amber, red when over. */
function SetMeter({ setlist }: { setlist: Setlist }) {
  const { seconds, unknown } = setLength(setlist.songs);
  const limit = (setlist.limitMinutes ?? 0) * 60;
  const over = limit > 0 && seconds > limit;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-mono text-lg text-readout tabular">{formatLength(seconds)}</span>
          <span className="text-fg-subtle">
            {s.songCount(setlist.songs.length)}
            {unknown > 0 && ` · ${s.unknownLengths(unknown)}`}
          </span>
          {limit > 0 && (
            <span
              className={cn("ml-auto font-mono tabular", over ? "text-red-400" : "text-fg-subtle")}
            >
              {over
                ? s.overBy(formatLength(seconds - limit))
                : s.leftOf(formatLength(limit - seconds))}
            </span>
          )}
        </div>
        {limit > 0 && (
          <div className="well h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("h-full", over ? "bg-red-400" : "bg-accent")}
              style={{ width: `${Math.min(100, (seconds / limit) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2" title={s.limitHint}>
        <span className="text-xs text-fg-muted">{s.limit}</span>
        <Stepper
          label={s.limit}
          value={setlist.limitMinutes ?? 0}
          {...LIMIT_MINUTES}
          defaultValue={0}
          format={(minutes) => (minutes === 0 ? s.noLimit : `${minutes} min`)}
          onChange={(minutes) =>
            store().edit(setlist.id, (x) => ({
              ...x,
              limitMinutes: minutes === 0 ? null : minutes,
            }))
          }
        />
      </div>
      <div className="flex items-center gap-2" title={s.gapHint}>
        <span className="text-xs text-fg-muted">{s.gap}</span>
        <Stepper
          label={s.gap}
          value={setlist.gapSeconds}
          {...GAP_SECONDS}
          defaultValue={0}
          format={(seconds) => (seconds === 0 ? s.gapWait : `${seconds} s`)}
          onChange={(gapSeconds) => store().edit(setlist.id, (x) => ({ ...x, gapSeconds }))}
        />
      </div>
    </div>
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

function SongMenuItems({
  setlist,
  index,
  onSettings,
  Item,
  Separator,
}: {
  setlist: Setlist;
  index: number;
  onSettings: () => void;
  Item: typeof DropdownMenu.Item | typeof ContextMenu.Item;
  Separator: typeof DropdownMenu.Separator | typeof ContextMenu.Separator;
}) {
  const song = setlist.songs[index];
  if (!song) return null;
  const move = (to: number) =>
    store().edit(setlist.id, (x) => ({ ...x, songs: moved(x.songs, index, to) }));
  return (
    <>
      <Item
        className={menuItem}
        onSelect={() => void useLiveStore.getState().start(setlist.id, index)}
      >
        <Radio className="size-4" />
        {s.liveFromHere}
      </Item>
      <Item className={menuItem} onSelect={onSettings}>
        <SlidersHorizontal className="size-4" />
        {s.liveSettings}
      </Item>
      {song.path && (
        <Item className={menuItem} onSelect={() => void openToStudy(song.path ?? "")}>
          <Play className="size-4" />
          {s.openToStudy}
        </Item>
      )}
      {song.path && (
        <Item className={menuItem} onSelect={() => void replaceFile(setlist.id, song)}>
          <Search className="size-4" />
          {s.replaceFile}
        </Item>
      )}
      <Separator className={menuSeparator} />
      <Item className={menuItem} disabled={index === 0} onSelect={() => move(index - 1)}>
        {s.moveUp}
      </Item>
      <Item
        className={menuItem}
        disabled={index === setlist.songs.length - 1}
        onSelect={() => move(index + 1)}
      >
        {s.moveDown}
      </Item>
      <Item
        className={menuItem}
        onSelect={() =>
          store().edit(setlist.id, (x) => ({
            ...x,
            songs: [
              ...x.songs.slice(0, index + 1),
              { ...song, id: songFromFile("").id },
              ...x.songs.slice(index + 1),
            ],
          }))
        }
      >
        <Copy className="size-4" />
        {s.duplicateSong}
      </Item>
      <Separator className={menuSeparator} />
      <Item
        className={menuItem}
        onSelect={() =>
          store().edit(setlist.id, (x) => ({ ...x, songs: x.songs.filter((_, i) => i !== index) }))
        }
      >
        <Trash2 className="size-4" />
        {s.removeSong}
      </Item>
    </>
  );
}

async function openToStudy(path: string) {
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

function SongRow({
  setlist,
  song,
  index,
  dragging,
  dropLine,
  onGrab,
  onSettings,
}: {
  setlist: Setlist;
  song: Song;
  index: number;
  dragging: boolean;
  dropLine: "above" | "below" | null;
  onGrab: (event: React.PointerEvent) => void;
  onSettings: () => void;
}) {
  const files = useSetlistsStore((st) => st.files);
  const playing = usePlayerStore((st) => samePath(st.track?.path, song.path));
  const missing = !!song.path && files.some((f) => samePath(f.path, song.path) && !f.exists);
  const length = playLength(song);
  const summary = liveSummary(song);
  const Icon = !song.path ? Music : isVideoPath(song.path) ? FileVideo : FileAudio;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <li
          data-song-index={index}
          className={cn(
            "group relative flex h-10 items-center gap-2 rounded-control px-1.5 hover:bg-surface-hover",
            dragging && "opacity-40",
          )}
          onDoubleClick={onSettings}
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
            className="flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-fg-subtle opacity-50 group-hover:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
          <span className="w-6 shrink-0 text-right font-mono text-xs text-fg-subtle tabular">
            {index + 1}
          </span>
          <Icon
            className={cn("size-4 shrink-0", playing ? "text-accent" : "text-fg-subtle")}
            aria-hidden
          />
          <InlineName
            value={song.title || s.untitledSong}
            label={s.renameSong}
            onRename={(title) => store().editSong(setlist.id, song.id, { title })}
            className="truncate"
          />
          {missing && (
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] text-red-400"
              title={song.path ?? ""}
            >
              <AlertCircle className="size-3.5" />
              {s.fileMissing}
            </span>
          )}
          {song.notes && (
            <StickyNote className="size-3.5 shrink-0 text-fg-subtle" aria-label={s.hasNotes}>
              <title>{song.notes}</title>
            </StickyNote>
          )}
          {summary && (
            <button
              type="button"
              onClick={onSettings}
              title={s.liveSettings}
              className="shrink-0 rounded-control px-1.5 py-0.5 font-mono text-[11px] text-readout hover:bg-surface"
            >
              {summary}
            </button>
          )}
          <span className="w-12 shrink-0 text-right font-mono text-xs text-fg-muted tabular">
            {length === null ? "—" : formatLength(length)}
          </span>
          <Button
            size="icon"
            className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            title={s.liveFromHere}
            aria-label={s.liveFromHere}
            onClick={() => void useLiveStore.getState().start(setlist.id, index)}
          >
            <Radio className="size-4" />
          </Button>
          <Button
            size="icon"
            className="size-7 shrink-0"
            title={s.liveSettings}
            aria-label={s.liveSettings}
            onClick={onSettings}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="icon" className="size-7 shrink-0" aria-label={s.songMenu}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={menuContent}>
                <SongMenuItems
                  setlist={setlist}
                  index={index}
                  onSettings={onSettings}
                  Item={DropdownMenu.Item}
                  Separator={DropdownMenu.Separator}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </li>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <SongMenuItems
            setlist={setlist}
            index={index}
            onSettings={onSettings}
            Item={ContextMenu.Item}
            Separator={ContextMenu.Separator}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * The songs in playing order. Dragged by their grip (the pointer, not the system drag and
 * drop: the window takes that for files dropped from outside).
 */
function SongList({ setlist }: { setlist: Setlist }) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const grab = (from: number) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDrag({ from, to: from });
    const target = (y: number) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-song-index]") ?? [])];
      let to = rows.length;
      for (const [i, row] of rows.entries()) {
        const box = row.getBoundingClientRect();
        if (y < box.top + box.height / 2) {
          to = i;
          break;
        }
      }
      return to;
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

  if (setlist.songs.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-panel border-2 border-dashed border-border px-5 py-6">
        <ListMusic className="size-6 text-accent" aria-hidden />
        <p className="text-sm font-medium">{s.noSongs}</p>
        <p className="text-xs text-fg-subtle">{s.noSongsHint}</p>
      </div>
    );
  }

  return (
    <>
      <ol ref={listRef} className="flex flex-col">
        {setlist.songs.map((song, index) => (
          <SongRow
            key={song.id}
            setlist={setlist}
            song={song}
            index={index}
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
          />
        ))}
      </ol>
      <LiveSettingsDialog
        key={settingsOf ?? ""}
        setlistId={setlist.id}
        song={settingsSong}
        onClose={() => setSettingsOf(null)}
      />
    </>
  );
}

/** Adds songs: the open track, a recent one, files, or a song without file. */
function AddSongs({ setlist }: { setlist: Setlist }) {
  const track = usePlayerStore((st) => st.track);
  const recent = useRecentStore((st) => st.files);
  const add = (songs: Song[]) =>
    store().edit(setlist.id, (x) => ({ ...x, songs: [...x.songs, ...songs] }));
  const inSet = (path: string) => setlist.songs.some((song) => samePath(song.path, path));

  const fromFiles = async () => {
    const picked = await pickFiles({
      multiple: true,
      directory: false,
      filters: [{ name: t.library.mediaFiles, extensions: [...MEDIA_EXTENSIONS] }],
    });
    const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
    if (paths.length > 0) add(paths.map((path) => songFromFile(path)));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="hardware"
        disabled={!track}
        title={track ? s.addOpenHint(track.name) : s.addOpenNone}
        onClick={() => track && add([songFromFile(track.path, track.duration)])}
      >
        <Plus className="size-4" />
        {s.addOpen}
      </Button>
      <DropdownMenu.Root onOpenChange={(open) => open && void useRecentStore.getState().refresh()}>
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
            {recent.filter((f) => f.exists).length === 0 && (
              <DropdownMenu.Label className={menuLabel}>{s.noRecent}</DropdownMenu.Label>
            )}
            {recent
              .filter((f) => f.exists)
              .map((file) => (
                <DropdownMenu.Item
                  key={file.path}
                  className={menuItem}
                  onSelect={() => add([songFromFile(file.path, file.duration)])}
                >
                  {isVideoPath(file.path) ? (
                    <FileVideo className="size-4 shrink-0" />
                  ) : (
                    <FileAudio className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{file.name}</span>
                  {inSet(file.path) && (
                    <span className="ml-auto shrink-0 text-[10px] text-fg-subtle">
                      {s.alreadyIn}
                    </span>
                  )}
                </DropdownMenu.Item>
              ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Button variant="hardware" onClick={() => void fromFiles()}>
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
    </div>
  );
}

/** Asks before deleting a setlist (its songs' files stay). */
function DeleteSetlist({ setlist }: { setlist: Setlist }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="icon" title={s.deleteSetlist} aria-label={s.deleteSetlist}>
          <Trash2 className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className={`${floatingPanel} w-72 p-3`}
        >
          <p className="text-sm font-medium text-fg">{s.deleteAsk(setlist.name || s.untitled)}</p>
          <p className="mt-1 text-xs text-fg-subtle">{s.deleteHint}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="hardware" onClick={() => setOpen(false)}>
              {s.keep}
            </Button>
            <Button
              variant="hardware"
              onClick={() => {
                setOpen(false);
                useSettingsStore.getState().update({ setlistOpen: "" });
                void store().remove(setlist.id);
              }}
            >
              <Trash2 className="size-4" />
              {s.deleteSetlist}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The setlist picker: next gigs first, then undated, then past ones. */
function SetlistPicker({ current }: { current: Setlist }) {
  const setlists = useSetlistsStore((st) => st.setlists);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="hardware" className="max-w-64" title={s.pickSetlist}>
          <ListMusic className="size-4 shrink-0" />
          <span className="truncate">{current.name || s.untitled}</span>
          <ChevronDown className="size-3.5 shrink-0" />
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const newSetlist = () => store().create(s.newSetlistName(todayIso()));

/** Live key, like a DAW's: a click starts the set; ▾ picks the whole set or the changes only. */
function LiveKey({ setlist }: { setlist: Setlist }) {
  const mode = useSettingsStore((st) => st.liveMode);
  const seconds = useSettingsStore((st) => st.liveChangeSeconds);
  const empty = setlist.songs.length === 0;
  return (
    <div className="flex">
      <Button
        variant="primary"
        className="rounded-r-none"
        disabled={empty}
        title={empty ? s.liveEmpty : mode === "changes" ? s.liveChangesHint(seconds) : s.liveHint}
        onClick={() => void useLiveStore.getState().start(setlist.id, 0)}
      >
        <Radio className="size-4" />
        {mode === "changes" ? s.liveChanges : s.liveKey}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="primary"
            className="w-6 rounded-l-none border-l border-on-accent/20 px-0"
            aria-label={s.liveOptions}
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

function Invite() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border-2 border-dashed border-border px-6 py-8">
      <ListMusic className="size-7 text-accent" aria-hidden />
      <h2 className="text-base font-semibold">{s.emptyTitle}</h2>
      <p className="text-sm text-fg-subtle">{s.emptyText}</p>
      <Button variant="primary" onClick={() => void newSetlist()}>
        <Plus className="size-4" />
        {s.newSetlist}
      </Button>
    </div>
  );
}

/**
 * The Setlist side of the Home: the gigs, each with its songs in playing order and their Live
 * settings, and the Live key that plays the set on the Stage view.
 */
export function SetlistHome() {
  const setlists = useSetlistsStore((st) => st.setlists);
  const loaded = useSetlistsStore((st) => st.loaded);
  const picked = useSettingsStore((st) => st.setlistOpen);
  const setlist = openSetlist(setlists, picked);

  useEffect(() => {
    void store().refresh();
    const onFocus = () => void store().refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <HomeTabs />
        {setlist && <SetlistPicker current={setlist} />}
        <span className="flex-1" />
        {setlist && (
          <Button variant="hardware" onClick={() => void newSetlist()}>
            <Plus className="size-4" />
            {s.newSetlist}
          </Button>
        )}
        {setlist && <LiveKey setlist={setlist} />}
      </div>
      {!setlist ? (
        loaded && <Invite />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <InlineName
              value={setlist.name || s.untitled}
              label={s.renameSetlist}
              onRename={(name) => store().edit(setlist.id, (x) => ({ ...x, name }))}
              className="min-w-48 text-lg font-semibold"
            />
            <GigDate setlist={setlist} />
            <div className="w-56">
              <TextField
                value={setlist.venue}
                label={s.venue}
                placeholder={s.venuePlaceholder}
                icon={<MapPin className="size-3.5 shrink-0" />}
                onChange={(venue) => store().edit(setlist.id, (x) => ({ ...x, venue }))}
              />
            </div>
            <DeleteSetlist setlist={setlist} />
          </div>
          <SetMeter setlist={setlist} />
          <SongList setlist={setlist} />
          <AddSongs setlist={setlist} />
        </div>
      )}
    </div>
  );
}
