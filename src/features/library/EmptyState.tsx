import { FolderOpen, Music } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { type ShortcutId, shortcutLabel } from "@/lib/shortcuts";
import { formatsLabel } from "./formats";
import { pickAndOpenFile } from "./pickFile";

const highlighted: ShortcutId[] = [
  "playPause",
  "seekBack",
  "loopStart",
  "loopEnd",
  "loopToggle",
  "addMarker",
  "addSection",
  "commandPalette",
];

export function EmptyState({ hovering }: { hovering: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 p-8">
      <div
        className={cn(
          "flex w-full max-w-xl flex-col items-center gap-4 rounded-panel border-2 border-dashed px-10 py-14 text-center transition-colors",
          hovering ? "border-accent bg-accent-soft" : "border-border",
        )}
      >
        <div
          className={cn(
            "flex size-14 items-center justify-center rounded-panel bg-surface transition-colors",
            hovering ? "text-accent" : "text-fg-muted",
          )}
        >
          <Music className="size-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{hovering ? t.empty.dropNow : t.empty.title}</h1>
          <p className="text-sm text-fg-subtle">{formatsLabel}</p>
        </div>
        <Button variant="primary" className="mt-2" onClick={() => void pickAndOpenFile()}>
          <FolderOpen className="size-4" />
          {t.empty.openFile}
          <Kbd shortcut="openFile" />
        </Button>
      </div>

      <section className="w-full max-w-xl">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
          {t.empty.shortcutsTitle}
        </h2>
        <ul className="grid grid-cols-2 gap-x-8 gap-y-2">
          {highlighted.map((id) => (
            <li key={id} className="flex items-center justify-between text-sm text-fg-muted">
              {shortcutLabel(id)}
              <Kbd shortcut={id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
