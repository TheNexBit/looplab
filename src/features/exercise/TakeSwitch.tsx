import { Drum, Guitar } from "lucide-react";
import { Popover } from "radix-ui";
import { Chip } from "@/components/ui/Chip";
import { useCompact } from "@/components/ui/FitBar";
import { floatingPanel, menuLabel, menuSeparator } from "@/components/ui/menu";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { useOptions } from "@/components/ui/OptionsKey";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { fileNameOf } from "@/lib/format";
import { fileOf, samePath, useExerciseStore } from "@/stores/exercise";
import { usePlayerStore } from "@/stores/player";
import { takeName } from "./AngleMenu";
import { chooseOther, otherTakes, setBacking, setOtherOn } from "./exerciseSync";
import { NudgeRow } from "./TakeControls";

/**
 * «Con chitarra / Solo base»: two keys, the one heard lit, like the mode keys of a DAW. The
 * backing (or, from a backing, the full take) takes over at the same point, loop, speed and
 * pitch (key A). The right button chooses which file it is, marks the backings and moves it.
 * Shown when the open track has other files in its lesson.
 */
export function TakeSwitch() {
  const compact = useCompact();
  const exercise = useExerciseStore((s) => s.exercise);
  const other = useExerciseStore((s) => s.other);
  const otherOn = useExerciseStore((s) => s.otherOn);
  const loading = useExerciseStore((s) => s.otherLoading);
  const track = usePlayerStore((s) => s.track?.path ?? null);
  const { open, setOpen, onContextMenu } = useOptions();
  if (!exercise || !track) return null;
  const own = fileOf(exercise, track);
  const takes = otherTakes(exercise, track);
  const ready = other !== null && !loading;
  // Heard now: a backing when the track is one and the switch is off, or the reverse
  const backingHeard = (own?.backing ?? false) !== otherOn;
  const choose = (backing: boolean) => setOtherOn(backing !== (own?.backing ?? false));
  const keys: [boolean, string, typeof Guitar][] = [
    [false, t.exercise.withGuitar, Guitar],
    [true, t.exercise.backingOnly, Drum],
  ];
  const current = fileOf(exercise, other);
  const audioFiles = exercise.files.filter((f) => !samePath(f.path, track) && f.kind === "audio");

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          role="radiogroup"
          aria-label={t.exercise.switchLabel}
          className="inline-flex shrink-0 gap-1"
          onContextMenu={onContextMenu}
        >
          {keys.map(([backing, name, Icon]) => (
            <Tooltip
              key={name}
              label={loading ? t.exercise.loading : `${name} — ${t.exercise.switchHint}`}
              shortcut="toggleBacking"
              rightClick={t.exercise.switchOptions}
            >
              <Chip
                role="radio"
                aria-checked={backing === backingHeard}
                aria-label={name}
                active={backing === backingHeard}
                disabled={!ready && backing !== backingHeard}
                className="inline-flex items-center gap-1.5"
                onClick={() => choose(backing)}
              >
                <Icon className="size-3.5" />
                {!compact && name}
              </Chip>
            </Tooltip>
          ))}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className={`${floatingPanel} w-80 p-1`}
        >
          <p className={menuLabel}>{t.exercise.takes}</p>
          {takes.map((file) => (
            <div key={file.path} className="px-2.5 py-1">
              <Chip
                active={samePath(file.path, other)}
                aria-pressed={samePath(file.path, other)}
                className="max-w-full truncate"
                title={file.path}
                onClick={() => chooseOther(file.path)}
              >
                {takeName(file.name)} · {fileNameOf(file.path)}
              </Chip>
            </div>
          ))}
          {audioFiles.length > 0 && <div className={menuSeparator} />}
          {audioFiles.map((file) => (
            <div key={file.path} className="flex items-center gap-2 px-2.5 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={file.path}>
                {fileNameOf(file.path)}
              </span>
              <span className="text-fg-subtle">{t.exercise.markBacking}</span>
              <OnOffKey
                label={t.exercise.markBacking}
                on={file.backing}
                onChange={(on) => setBacking(file.path, on)}
              />
            </div>
          ))}
          {current && (
            <>
              <div className={menuSeparator} />
              <NudgeRow file={current} isTrack={false} fine />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
