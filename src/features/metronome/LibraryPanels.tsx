import { ChevronDown, ChevronUp, ListPlus, Play, Plus, Square, Upload, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineName } from "@/components/ui/InlineName";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { type MetronomeSetup, useMetronomeStore } from "@/stores/metronome";
import { PART_BARS, partSeconds, toPlayed, useLibraryStore } from "@/stores/metronomeLibrary";
import { formatElapsed } from "./meterChoices";

const l = t.metronome.library;

/** "7/8 (2+2+3) · 160" (quarters) or "7/8 (2+2+3) · 160/8" (pulses): a setup at a glance. */
export function setupSummary(setup: MetronomeSetup): string {
  const grouping = setup.grouping ? ` (${setup.grouping.join("+")})` : "";
  const pulses = setup.tempoBase === "pulse" && setup.unit !== 4 ? `/${setup.unit}` : "";
  return `${setup.beats}/${setup.unit}${grouping} · ${Math.round(setup.bpm)}${pulses}`;
}

const iconKey = "size-6";

/** Saved songs: a whole setup with a name. A click on the arrow puts it on the metronome. */
export function SongsPanel() {
  const songs = useLibraryStore((s) => s.songs);
  const library = useLibraryStore.getState();
  return (
    <div className="space-y-3">
      <Button
        variant="hardware"
        className="w-full justify-center"
        onClick={() => {
          const m = useMetronomeStore.getState();
          library.saveSong(setupSummary(m));
        }}
      >
        <Plus className="size-3.5" />
        {l.saveSong}
      </Button>
      {songs.length === 0 ? (
        <p className="text-xs text-fg-subtle">{l.noSongs}</p>
      ) : (
        <ul className="space-y-1">
          {songs.map((song) => (
            <li
              key={song.id}
              className="flex items-center gap-1 rounded-control bg-surface px-1.5 py-1"
            >
              <div className="min-w-0 flex-1">
                <InlineName
                  value={song.name}
                  label={l.rename}
                  onRename={(name) => library.renameSong(song.id, name)}
                />
                <p className="px-1 font-mono text-[11px] text-fg-subtle">
                  {setupSummary(song.setup)}
                </p>
              </div>
              <Tooltip label={l.loadSong}>
                <Button
                  variant="hardware"
                  size="icon"
                  className={iconKey}
                  onClick={() => library.loadSong(song.id)}
                  aria-label={l.loadSong}
                >
                  <Upload className="size-3.5" />
                </Button>
              </Tooltip>
              <Tooltip label={l.remove}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconKey}
                  onClick={() => library.removeSong(song.id)}
                  aria-label={l.remove}
                >
                  <X className="size-3.5" />
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Adds a saved song as the next part of a sequence. */
function AddSongPart({ sequenceId }: { sequenceId: string }) {
  const songs = useLibraryStore((s) => s.songs);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="hardware"
          className="h-7 flex-1 justify-center"
          disabled={songs.length === 0}
        >
          <ListPlus className="size-3.5" />
          {l.addSong}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContent}>
          <DropdownMenu.Label className={menuLabel}>{l.songs}</DropdownMenu.Label>
          {songs.map((song) => (
            <DropdownMenu.Item
              key={song.id}
              className={menuItem}
              onSelect={() => useLibraryStore.getState().addPart(sequenceId, song.id)}
            >
              <span className="flex-1 truncate">{song.name}</span>
              <span className="font-mono text-[11px] text-fg-subtle">
                {setupSummary(song.setup)}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Sequences: parts played in order, each with its bar and tempo for some bars. A setlist of
 * songs, a practice routine, or the bars of a prog song (4 × 7/8, 2 × 5/4…).
 */
export function SequencesPanel() {
  const sequences = useLibraryStore((s) => s.sequences);
  const playing = useMetronomeStore((s) => s.sequence);
  const running = useMetronomeStore((s) => s.running);
  const segment = useMetronomeStore((s) => s.segment);
  const library = useLibraryStore.getState();
  const [chosen, setChosen] = useState<string | null>(null);
  const sequence = sequences.find((s) => s.id === chosen) ?? sequences[0];
  const isPlaying =
    running && playing !== null && sequence !== undefined && playing.id === sequence.id;
  const total = sequence?.parts.reduce((sum, part) => sum + partSeconds(part), 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="hardware"
              className="h-7 min-w-0 flex-1 justify-between"
              disabled={sequences.length === 0}
            >
              <span className="truncate">{sequence?.name ?? l.noSequences}</span>
              <ChevronDown className="size-3.5 shrink-0" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className={menuContent}>
              {sequences.map((s) => (
                <DropdownMenu.Item key={s.id} className={menuItem} onSelect={() => setChosen(s.id)}>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {l.partsCount(s.parts.length)}
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Tooltip label={l.newSequence}>
          <Button
            variant="hardware"
            size="icon"
            onClick={() => setChosen(library.addSequence(l.sequenceName(sequences.length + 1)))}
            aria-label={l.newSequence}
          >
            <Plus className="size-3.5" />
          </Button>
        </Tooltip>
      </div>

      {sequence && (
        <>
          <div className="flex items-center gap-1">
            <InlineName
              value={sequence.name}
              label={l.rename}
              onRename={(name) => library.renameSequence(sequence.id, name)}
            />
            <Tooltip label={l.removeSequence}>
              <Button
                variant="ghost"
                size="icon"
                className={iconKey}
                onClick={() => {
                  library.removeSequence(sequence.id);
                  setChosen(null);
                }}
                aria-label={l.removeSequence}
              >
                <X className="size-3.5" />
              </Button>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isPlaying ? "hardware" : "primary"}
              className="h-8 flex-1 justify-center"
              disabled={sequence.parts.length === 0}
              onClick={() => {
                const metronome = useMetronomeStore.getState();
                if (isPlaying) metronome.setRunning(false);
                else metronome.playSequence(toPlayed(sequence));
              }}
            >
              {isPlaying ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <Play className="size-3.5 fill-current" />
              )}
              {isPlaying ? t.metronome.stop : l.play}
            </Button>
            <Tooltip label={l.repeatHint}>
              <span className="text-xs text-fg-muted">{l.repeat}</span>
            </Tooltip>
            <OnOffKey
              label={l.repeat}
              on={sequence.repeat}
              onChange={(repeat) => library.setRepeat(sequence.id, repeat)}
            />
          </div>

          {sequence.parts.length === 0 ? (
            <p className="text-xs text-fg-subtle">{l.noParts}</p>
          ) : (
            <ol className="space-y-1">
              {sequence.parts.map((part, index) => (
                <li
                  key={part.id}
                  className={cn(
                    "space-y-1 rounded-control border px-1.5 py-1",
                    isPlaying && index === segment
                      ? "border-accent bg-accent-soft"
                      : "border-transparent bg-surface",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="w-5 text-right font-mono text-[11px] text-fg-subtle">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {setupSummary(part.setup)}
                    </span>
                    <Stepper
                      label={l.bars}
                      value={part.bars}
                      min={PART_BARS.min}
                      max={PART_BARS.max}
                      step={1}
                      onChange={(bars) => library.updatePart(sequence.id, part.id, { bars })}
                      format={(bars) => `×${bars}`}
                    />
                  </div>
                  <div className="flex items-center gap-1 pl-6">
                    <InlineName
                      value={part.note || part.name}
                      label={l.note}
                      onRename={(note) => library.updatePart(sequence.id, part.id, { note })}
                      className="text-xs text-fg-muted"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      disabled={index === 0}
                      onClick={() => library.movePart(sequence.id, part.id, -1)}
                      aria-label={l.up}
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      disabled={index === sequence.parts.length - 1}
                      onClick={() => library.movePart(sequence.id, part.id, 1)}
                      aria-label={l.down}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={() => library.removePart(sequence.id, part.id)}
                      aria-label={l.remove}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-1">
            <Tooltip label={l.addCurrentHint}>
              <Button
                variant="hardware"
                className="h-7 flex-1 justify-center"
                onClick={() => library.addPart(sequence.id)}
              >
                <Plus className="size-3.5" />
                {l.addCurrent}
              </Button>
            </Tooltip>
            <AddSongPart sequenceId={sequence.id} />
          </div>
          <p className="font-mono text-[11px] text-fg-subtle">{l.total(formatElapsed(total))}</p>
        </>
      )}
    </div>
  );
}
