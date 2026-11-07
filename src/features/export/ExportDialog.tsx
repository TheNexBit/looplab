import { Channel } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { menuContent, menuItem } from "@/components/ui/menu";
import { t } from "@/i18n";
import { type AppError, commands, type ExportFormat } from "@/lib/bindings";
import { formatPercent, signed } from "@/lib/format";
import { readPrefs, writeStored } from "@/lib/storage";
import { formatTime } from "@/lib/time";
import { eqToRust, useEqStore } from "@/stores/eq";
import { normalizeRegion, useLoopStore } from "@/stores/loop";
import { sectionRanges, useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { useUiStore } from "@/stores/ui";
import {
  type ExportSource,
  exportedLength,
  extensionOf,
  FORMATS,
  fileName,
  REPEAT_CHOICES,
  regionOf,
} from "./exportPlan";

const x = t.export;
const PREFS_KEY = "looplab.export";

interface Prefs {
  format: ExportFormat;
  withSound: boolean;
  withEq: boolean;
}

/** The last choices are a per-machine convenience, like the render settings of a DAW. */
const loadPrefs = (): Prefs =>
  readPrefs<Prefs>(PREFS_KEY, { format: "wav16", withSound: true, withEq: true });

type Phase =
  | { kind: "idle" }
  | { kind: "running"; progress: number }
  | { kind: "done"; path: string }
  | { kind: "error"; error: AppError };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="panel-label w-24 shrink-0">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  );
}

/** Ctrl+Alt+R, as in Reaper: renders the loop, a section or the whole track to a file. */
export function ExportDialog() {
  const open = useUiStore((s) => s.dialog === "export");
  const preset = useUiStore((s) => s.exportSource);
  const close = useUiStore((s) => s.closeDialog);
  const track = usePlayerStore((s) => s.track);
  const speed = usePlayerStore((s) => s.speed);
  const semitones = usePlayerStore((s) => s.semitones);
  const cents = usePlayerStore((s) => s.cents);
  const loopStart = useLoopStore((s) => s.start);
  const loopEnd = useLoopStore((s) => s.end);
  const sectionData = useMarkersStore((s) => s.sections);
  const duration = track?.duration ?? 0;
  const sections = useMemo(() => sectionRanges(sectionData, duration), [sectionData, duration]);
  const loop = useMemo(
    () =>
      loopStart !== null && loopEnd !== null ? normalizeRegion(loopStart, loopEnd, duration) : null,
    [loopStart, loopEnd, duration],
  );

  const [source, setSource] = useState<ExportSource>({ kind: "track" });
  const [repeats, setRepeats] = useState(1);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [ffmpeg, setFfmpeg] = useState(true);

  // Each opening starts from what was asked (a section's menu) or the loop, if there is one
  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "idle" });
    setRepeats(1);
    setSource(preset ?? (useLoopStore.getState().region() ? { kind: "loop" } : { kind: "track" }));
    void commands.ffmpegAvailable().then(setFfmpeg);
  }, [open, preset]);

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeStored(PREFS_KEY, next);
  };

  const region = regionOf({ source, loop, sections, duration });
  const sound = prefs.withSound ? { speed, semitones, cents } : null;
  const length = region ? exportedLength(region, repeats, sound?.speed ?? 1) : 0;
  const running = phase.kind === "running";
  const formatMissing = FORMATS.find((f) => f.id === prefs.format)?.needsFfmpeg && !ffmpeg;

  const start = async () => {
    if (!track || !region) return;
    const folder = track.path.replace(/[\\/][^\\/]*$/, "");
    const name = fileName(track.name, region, sound, prefs.format);
    const extension = extensionOf(prefs.format);
    const path = await save({
      defaultPath: `${folder}\\${name}`,
      filters: [{ name: x.formats[prefs.format], extensions: [extension] }],
    });
    if (!path) return;

    setPhase({ kind: "running", progress: 0 });
    const progress = new Channel<number | null>();
    progress.onmessage = (value) => {
      if (value !== null) setPhase({ kind: "running", progress: value });
    };
    const eq = useEqStore.getState();
    const result = await commands.exportAudio(
      {
        path,
        start: region.start,
        end: region.end,
        repeats,
        speed: sound?.speed ?? 1,
        semitones: sound ? sound.semitones + sound.cents / 100 : 0,
        eq: eqToRust({ ...eq.settings, bypass: !prefs.withEq || eq.settings.bypass }),
        channels: prefs.withEq ? eq.channels : "stereo",
        format: prefs.format,
      },
      progress,
    );
    if (result.status === "ok") setPhase({ kind: "done", path });
    else if (result.error.kind === "cancelled") setPhase({ kind: "idle" });
    else setPhase({ kind: "error", error: result.error });
  };

  const onClose = () => {
    if (running) void commands.cancelExport();
    close();
  };

  const sectionName =
    source.kind === "section" ? sections.find((s) => s.id === source.id)?.name : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={x.title}
      className="w-[min(36rem,calc(100vw-2rem))]"
    >
      <div className="divide-y divide-border px-4 pt-1 pb-4">
        <Row label={x.source}>
          <Chip
            active={source.kind === "loop"}
            disabled={!loop || running}
            onClick={() => setSource({ kind: "loop" })}
          >
            {x.loop}
          </Chip>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Chip active={source.kind === "section"} disabled={sections.length === 0 || running}>
                {sectionName ?? x.section} ▾
              </Chip>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={4} className={menuContent}>
                {sections.map((section) => (
                  <DropdownMenu.Item
                    key={section.id}
                    className={menuItem}
                    onSelect={() => setSource({ kind: "section", id: section.id })}
                  >
                    <span className="flex-1">{section.name}</span>
                    <span className="font-mono text-[11px] opacity-70">
                      {formatTime(section.start)}–{formatTime(section.end)}
                    </span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Chip
            active={source.kind === "track"}
            disabled={running}
            onClick={() => setSource({ kind: "track" })}
          >
            {x.track}
          </Chip>
        </Row>

        {source.kind !== "track" && (
          <Row label={x.repeats}>
            {REPEAT_CHOICES.map((count) => (
              <Chip
                key={count}
                active={repeats === count}
                disabled={running}
                onClick={() => setRepeats(count)}
              >
                ×{count}
              </Chip>
            ))}
            <span className="ml-1 text-xs text-fg-subtle">{x.repeatsHint}</span>
          </Row>
        )}

        <Row label={x.sound}>
          <div className="flex flex-col gap-1.5">
            <Check
              checked={prefs.withSound}
              onChange={(withSound) => updatePrefs({ withSound })}
              label={`${x.withSound} (${formatPercent(speed)}, ${signed(semitones, t.transport.semitones)}${cents ? ` ${signed(cents, t.transport.cents)}` : ""})`}
            />
            <Check
              checked={prefs.withEq}
              onChange={(withEq) => updatePrefs({ withEq })}
              label={x.withEq}
            />
          </div>
        </Row>

        <Row label={x.format}>
          {FORMATS.map((format) => (
            <Chip
              key={format.id}
              active={prefs.format === format.id}
              disabled={running || (format.needsFfmpeg && !ffmpeg)}
              title={format.needsFfmpeg && !ffmpeg ? x.needsFfmpeg : undefined}
              onClick={() => updatePrefs({ format: format.id })}
            >
              {x.formats[format.id]}
            </Chip>
          ))}
        </Row>

        <div className="flex items-center gap-3 pt-3">
          <span className="flex-1 font-mono text-xs text-fg-muted tabular">
            {!track?.complete
              ? t.errors.stillLoading
              : region
                ? `${x.length} ${formatTime(length)}`
                : x.sourceGone}
          </span>
          {running ? (
            <Button variant="hardware" onClick={() => void commands.cancelExport()}>
              {x.cancel}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void start()}
              disabled={!region || formatMissing || !track?.complete}
            >
              <Download className="size-4" />
              {x.start}
            </Button>
          )}
        </div>

        {phase.kind === "running" && (
          <div className="well mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${Math.round(phase.progress * 100)}%` }}
            />
          </div>
        )}
        {phase.kind === "done" && (
          <div className="mt-3 flex items-center gap-3 text-sm text-fg">
            <span className="min-w-0 flex-1 truncate" title={phase.path}>
              {x.done} {phase.path.split(/[\\/]/).pop()}
            </span>
            <Button variant="hardware" onClick={() => void commands.revealFile(phase.path)}>
              <FolderOpen className="size-4" />
              {x.reveal}
            </Button>
          </div>
        )}
        {phase.kind === "error" && (
          <p className="mt-3 text-sm text-accent">{t.errors[phase.error.kind]}</p>
        )}
      </div>
    </Dialog>
  );
}
