import { FileDown, RotateCcw, SplitSquareHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Fader } from "@/components/ui/Fader";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { channelOf, STEM_LEVEL, STEM_ORDER, useStemsStore } from "@/stores/stems";
import { cancelSeparation, exportStems, separateStems } from "./actions";

const s = t.stems;

/** One channel strip: Solo and Mute keys over the fader, as on a desk. */
function Strip({ name }: { name: string }) {
  // The stored list, not a channel made up in the selector: a fresh object at every call
  // would look like a change each time and re-render forever
  const channels = useStemsStore((state) => state.channels);
  const channel = channelOf(channels, name);
  const soloing = useStemsStore((state) => state.channels.some((c) => c.solo));
  const store = useStemsStore.getState;
  const label = s.names[name] ?? name;
  // Silent because another track is soloed: drawn dimmed, like a DAW's implicit mute
  const silenced = channel.mute || (soloing && !channel.solo);
  return (
    <div className={cn("flex w-11 flex-col items-center gap-1.5", silenced && "opacity-50")}>
      <Tooltip label={`${s.solo} ${label}`}>
        <Chip
          active={channel.solo}
          aria-pressed={channel.solo}
          onClick={() => store().toggleSolo(name)}
          className="h-[22px] w-9 justify-center px-0 font-mono text-[10px]"
        >
          S
        </Chip>
      </Tooltip>
      <Tooltip label={`${s.mute} ${label}`}>
        <Chip
          active={channel.mute}
          aria-pressed={channel.mute}
          onClick={() => store().toggleMute(name)}
          className="h-[22px] w-9 justify-center px-0 font-mono text-[10px]"
        >
          M
        </Chip>
      </Tooltip>
      <Fader
        label={label}
        short={label}
        hint={s.levelHint}
        value={channel.level}
        current={() => channelOf(store().channels, name).level}
        reset={STEM_LEVEL.default}
        onChange={(level) => store().setLevel(name, level)}
        min={STEM_LEVEL.min}
        max={STEM_LEVEL.max}
        step={STEM_LEVEL.step}
        heightClassName="h-32"
      />
      <span className="font-mono text-[10px] text-fg-subtle tabular">
        {formatPercent(channel.level)}
      </span>
    </div>
  );
}

/**
 * Side panel tab: "Separate instruments" while the song has no tracks, then a mixer of
 * its tracks (fader, Mute, Solo), saved with the song.
 */
export function StemsPanel() {
  const track = usePlayerStore((state) => state.track);
  const names = useStemsStore((state) => state.names);
  const phase = useStemsStore((state) => state.phase);
  const touched = useStemsStore((state) =>
    state.channels.some((c) => c.level !== STEM_LEVEL.default || c.mute || c.solo),
  );
  const ordered = names
    ? [
        ...STEM_ORDER.filter((n) => names.includes(n)),
        ...names.filter((n) => !(STEM_ORDER as readonly string[]).includes(n)),
      ]
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <p className="panel-label">{s.title}</p>
      {!names && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-fg-muted">{s.intro}</p>
          {phase.kind === "running" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-xs text-fg-muted tabular">
                <span>{s.separating}…</span>
                <span>{Math.round(phase.progress * 100)}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-led-off">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(phase.progress * 100)}%` }}
                />
              </div>
              <Button variant="hardware" onClick={cancelSeparation}>
                {s.cancel}
              </Button>
            </div>
          ) : (
            <Tooltip label={track ? s.separateHint : s.needsTrack}>
              <span>
                <Button
                  variant="primary"
                  disabled={!track?.complete}
                  onClick={() => void separateStems()}
                >
                  <SplitSquareHorizontal className="size-4" />
                  {s.separate}
                </Button>
              </span>
            </Tooltip>
          )}
          {phase.kind === "error" && (
            <p className="text-sm text-accent">{t.errors[phase.error.kind]}</p>
          )}
          {track && !track.complete && phase.kind !== "running" && (
            <p className="text-xs text-readout">{t.errors.stillLoading}</p>
          )}
        </div>
      )}
      {names && (
        <>
          <div className="flex justify-between gap-1">
            {ordered.map((name) => (
              <Strip key={name} name={name} />
            ))}
          </div>
          <Tooltip label={s.resetHint}>
            <span className="self-start">
              <Button
                variant="hardware"
                disabled={!touched}
                onClick={() => useStemsStore.getState().reset()}
              >
                <RotateCcw className="size-3.5" />
                {s.reset}
              </Button>
            </span>
          </Tooltip>
          <ExportKey />
        </>
      )}
      <p className="mt-auto text-[10px] leading-snug text-fg-subtle">{s.licence}</p>
    </div>
  );
}

/** "Export tracks": the six tracks as WAV files, then their folder in Explorer. */
function ExportKey() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMessage(null);
    const result = await exportStems();
    if (result?.status === "ok") setMessage(s.exported(result.data.folder));
    else if (result) setMessage(t.errors[result.error.kind]);
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1">
      <Tooltip label={s.exportHint}>
        <span className="self-start">
          <Button variant="hardware" disabled={busy} onClick={() => void run()}>
            <FileDown className="size-3.5" />
            {busy ? s.exporting : s.export}
          </Button>
        </span>
      </Tooltip>
      {message && <p className="break-all text-xs text-fg-muted">{message}</p>}
    </div>
  );
}
