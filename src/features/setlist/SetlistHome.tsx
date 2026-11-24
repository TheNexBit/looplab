import { CalendarDays, ListMusic, MapPin, Plus, Trash2, X } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineName } from "@/components/ui/InlineName";
import { floatingPanel } from "@/components/ui/menu";
import { Stepper } from "@/components/ui/Stepper";
import { t } from "@/i18n";
import type { Setlist_Serialize as Setlist } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { formatLength } from "@/lib/time";
import { openSetlist, useSetlistsStore } from "@/stores/setlists";
import { useSettingsStore } from "@/stores/settings";
import { HomeTabs } from "./HomeTabs";
import {
  AddSongs,
  LiveKey,
  newSetlist,
  SetKey,
  SetlistDropZone,
  SetlistPicker,
  SongList,
  shortDate,
} from "./SetlistParts";
import { daysTo, GAP_SECONDS, isBreak, LIMIT_MINUTES, setLength } from "./setlistMath";

const s = t.setlist;
const store = () => useSetlistsStore.getState();

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

/** «Tra 12 giorni» as a chip: filled amber in the last week, grey once past. */
export function Countdown({ date }: { date: string }) {
  const days = daysTo(date);
  return (
    <span
      className={cn(
        "shrink-0 rounded-control px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        days < 0 ? "text-fg-subtle" : days <= 7 ? "bg-accent text-on-accent" : "text-accent",
      )}
    >
      {s.daysTo(days)}
    </span>
  );
}

/** The gig day, picked from the system calendar (nothing to type), with its countdown. */
function GigDate({ setlist }: { setlist: Setlist }) {
  const edit = (date: string | null) => store().edit(setlist.id, (x) => ({ ...x, date }));
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
      {setlist.date && <Countdown date={setlist.date} />}
      {setlist.date && (
        <Button size="icon" title={s.clearDate} aria-label={s.clearDate} onClick={() => edit(null)}>
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Set length against the time the venue gives, as a meter: amber, red when over. */
export function SetMeter({ setlist, compact = false }: { setlist: Setlist; compact?: boolean }) {
  const { seconds, unknown } = setLength(setlist.songs);
  const limit = (setlist.limitMinutes ?? 0) * 60;
  const over = limit > 0 && seconds > limit;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-mono text-lg text-readout tabular">{formatLength(seconds)}</span>
        <span className="text-fg-subtle">
          {s.songCount(setlist.songs.filter((song) => !isBreak(song)).length)}
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
        <div className={cn("well overflow-hidden rounded-full", compact ? "h-1" : "h-1.5")}>
          <div
            className={cn("h-full", over ? "bg-red-400" : "bg-accent")}
            style={{ width: `${Math.min(100, (seconds / limit) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SetTiming({ setlist }: { setlist: Setlist }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-48 flex-1">
        <SetMeter setlist={setlist} />
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

export function SetlistInvite({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border-2 border-dashed border-border px-5 py-6">
      <ListMusic className="size-7 text-accent" aria-hidden />
      <h2 className="text-base font-semibold">{s.emptyTitle}</h2>
      <p className="text-sm text-fg-subtle">{compact ? s.emptyTextShort : s.emptyText}</p>
      <Button variant="primary" onClick={() => void newSetlist()}>
        <Plus className="size-4" />
        {s.newSetlist}
      </Button>
    </div>
  );
}

/** The setlist shown, read when it appears and again when the window comes back to the front. */
export function useSetlists() {
  useEffect(() => {
    void store().refresh();
    const onFocus = () => void store().refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const setlists = useSetlistsStore((st) => st.setlists);
  const loaded = useSetlistsStore((st) => st.loaded);
  const picked = useSettingsStore((st) => st.setlistOpen);
  return { setlist: openSetlist(setlists, picked), loaded };
}

/**
 * The Setlist side of the Home: the gigs, each with its songs in playing order and their Live
 * settings, and the Live key that plays the set on the Stage view.
 */
export function SetlistHome() {
  const { setlist, loaded } = useSetlists();

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
        {setlist && <SetKey setlist={setlist} />}
        {setlist && <LiveKey setlist={setlist} />}
      </div>
      {!setlist ? (
        loaded && <SetlistInvite />
      ) : (
        <SetlistDropZone
          setlistId={setlist.id}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1 pr-2"
        >
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
          <SetTiming setlist={setlist} />
          <SongList setlist={setlist} />
          <AddSongs setlist={setlist} />
        </SetlistDropZone>
      )}
    </div>
  );
}
