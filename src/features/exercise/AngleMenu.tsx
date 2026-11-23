import { SwitchCamera } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { InlineName } from "@/components/ui/InlineName";
import { Kbd } from "@/components/ui/Kbd";
import { floatingPanel, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { samePath } from "@/lib/format";
import type { ShortcutId } from "@/lib/shortcuts";
import { anglesOf, fileOf, useExerciseStore } from "@/stores/exercise";
import { usePlayerStore } from "@/stores/player";
import { chooseAngle, renameTake } from "./exerciseSync";
import { LineUpLamp, NudgeRow } from "./TakeControls";

/** Shown name of a file of the take («Principale» for the one with no extra words). */
export const takeName = (name: string) => name || t.exercise.main;

/**
 * Key of the video panel: which camera angle of the lesson is on screen. Its panel lists the
 * angles (Ctrl+1…9 or V switch them at once, at the same point), renames them, and moves the
 * one on screen by hand when its sound cannot line it up.
 */
export function AngleMenu() {
  const exercise = useExerciseStore((s) => s.exercise);
  const angle = useExerciseStore((s) => s.angle);
  const aligning = useExerciseStore((s) => s.aligning);
  const track = usePlayerStore((s) => s.track?.path ?? null);
  const angles = anglesOf(exercise);
  // Nothing to choose and nothing to move: the track's own picture only
  if (angles.length === 0 || (angles.length === 1 && samePath(angles[0]?.path, track))) {
    return null;
  }
  const current = fileOf(exercise, angle);
  const label = `${t.exercise.angle}: ${current ? takeName(current.name) : "—"}`;
  return (
    <Popover.Root>
      <Tooltip label={t.exercise.angles} shortcut="nextAngle">
        <Popover.Trigger asChild>
          <Button className="h-6 gap-1.5 px-2" aria-label={label}>
            <SwitchCamera className="size-3.5" />
            <span className="max-w-32 truncate">{current ? takeName(current.name) : "—"}</span>
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className={`${floatingPanel} w-80 p-1`}
        >
          <p className={menuLabel}>{t.exercise.angles}</p>
          {aligning && <p className="px-2.5 pb-1 text-xs text-fg-subtle">{t.exercise.aligning}</p>}
          {angles.map((file, index) => {
            const usable = file.lineUp !== "mismatch";
            const on = samePath(file.path, angle);
            return (
              <div key={file.path} className="flex items-center gap-2 px-2.5 py-1">
                <Chip
                  active={on}
                  disabled={!usable}
                  aria-pressed={on}
                  className="w-7 shrink-0 px-0"
                  onClick={() => chooseAngle(file.path)}
                >
                  {index + 1}
                </Chip>
                <InlineName
                  value={takeName(file.name)}
                  label={t.exercise.rename}
                  onRename={(name) => renameTake(file.path, name)}
                  className="min-w-0 flex-1"
                />
                <LineUpLamp file={file} />
                {index < 9 && <Kbd shortcut={`angle${index + 1}` as ShortcutId} />}
              </div>
            );
          })}
          {current && (
            <>
              <div className={menuSeparator} />
              <NudgeRow file={current} isTrack={samePath(current.path, track)} />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
