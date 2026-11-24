import { Crosshair, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Stepper } from "@/components/ui/Stepper";
import { t } from "@/i18n";
import type { SetlistSong_Serialize as Song } from "@/lib/bindings";
import { formatPercent, samePath, signed } from "@/lib/format";
import { formatLength } from "@/lib/time";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { useSetlistsStore } from "@/stores/setlists";
import { LIVE_BPM, LIVE_SEMITONES, LIVE_SPEED, PLANNED_LENGTH } from "./setlistMath";

const s = t.setlist;

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3" title={hint}>
      <span className="w-36 shrink-0 text-xs text-fg-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A cue point: − / + by the second (wheel too), from the playhead, or back to the file's edge. */
function CuePoint({
  label,
  value,
  edge,
  length,
  isOpen,
  onChange,
}: {
  label: string;
  value: number | null;
  /** Where the song starts or ends without this cue */
  edge: number;
  length: number;
  isOpen: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <>
      <Stepper
        label={label}
        value={value ?? edge}
        min={0}
        max={length}
        step={1}
        format={formatLength}
        onChange={onChange}
      />
      <Button
        variant="hardware"
        disabled={!isOpen}
        title={isOpen ? s.live.fromPlayheadHint : s.live.openToUsePlayhead}
        onClick={() => onChange(Math.round(currentPosition() * 10) / 10)}
      >
        <Crosshair className="size-3.5" />
        {s.live.fromPlayhead}
      </Button>
      {value !== null && (
        <Button
          size="icon"
          title={s.live.reset}
          aria-label={s.live.reset}
          onClick={() => onChange(null)}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      )}
    </>
  );
}

/**
 * The Live settings of one song: where it starts and stops on stage, its transpose and speed,
 * its stage notes; a song without file has a BPM and a planned length instead. Every change
 * is saved at once; the study project of the track is never touched.
 */
export function LiveSettingsDialog({
  setlistId,
  song,
  onClose,
}: {
  setlistId: string;
  song: Song | null;
  onClose: () => void;
}) {
  const track = usePlayerStore((st) => st.track);
  if (!song) return null;
  const edit = (change: Partial<Song>) =>
    useSetlistsStore.getState().editSong(setlistId, song.id, change);
  const isOpen = !!song.path && samePath(track?.path, song.path);
  const length = isOpen ? (track?.duration ?? 0) : (song.length ?? 0);

  return (
    <Dialog open onClose={onClose} title={s.live.title(song.title || s.untitledSong)}>
      <div className="flex flex-col gap-3 p-4">
        {song.path ? (
          length > 0 ? (
            <>
              <Row label={s.live.cueIn} hint={s.live.cueInHint}>
                <CuePoint
                  label={s.live.cueIn}
                  value={song.cueIn}
                  edge={0}
                  length={length}
                  isOpen={isOpen}
                  onChange={(cueIn) => edit({ cueIn: cueIn === 0 ? null : cueIn })}
                />
              </Row>
              <Row label={s.live.cueOut} hint={s.live.cueOutHint}>
                <CuePoint
                  label={s.live.cueOut}
                  value={song.cueOut}
                  edge={length}
                  length={length}
                  isOpen={isOpen}
                  onChange={(cueOut) =>
                    edit({ cueOut: cueOut !== null && cueOut >= length ? null : cueOut })
                  }
                />
              </Row>
            </>
          ) : (
            <p className="text-xs text-fg-subtle">{s.live.lengthUnknown}</p>
          )
        ) : (
          <>
            <Row label={s.live.plannedLength} hint={s.live.plannedLengthHint}>
              <Stepper
                label={s.live.plannedLength}
                value={song.length ?? PLANNED_LENGTH.min}
                {...PLANNED_LENGTH}
                format={formatLength}
                onChange={(value) => edit({ length: value })}
              />
            </Row>
            <Row label={s.live.bpm} hint={s.live.bpmHint}>
              <Stepper
                label={s.live.bpm}
                value={song.bpm ?? LIVE_BPM.default}
                {...LIVE_BPM}
                defaultValue={LIVE_BPM.default}
                format={(value) => `${value}`}
                onChange={(value) => edit({ bpm: value })}
              />
            </Row>
          </>
        )}
        {song.path && (
          <>
            <Row label={s.live.transpose} hint={s.live.transposeHint}>
              <Stepper
                label={s.live.transpose}
                value={song.semitones ?? 0}
                {...LIVE_SEMITONES}
                defaultValue={0}
                format={(value) => signed(value, "st")}
                onChange={(value) => edit({ semitones: value === 0 ? null : value })}
              />
            </Row>
            <Row label={s.live.speed} hint={s.live.speedHint}>
              <Stepper
                label={s.live.speed}
                value={song.speed ?? 1}
                {...LIVE_SPEED}
                defaultValue={1}
                format={formatPercent}
                onChange={(value) => edit({ speed: value === 1 ? null : value })}
              />
            </Row>
          </>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{s.live.notes}</span>
          <textarea
            defaultValue={song.notes}
            placeholder={s.live.notesPlaceholder}
            rows={4}
            onChange={(event) => edit({ notes: event.target.value })}
            className="well resize-y rounded-control px-2.5 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:ring-1 focus:ring-accent/70"
          />
        </label>
        <p className="text-[11px] text-fg-subtle">{s.live.studyKept}</p>
      </div>
    </Dialog>
  );
}
