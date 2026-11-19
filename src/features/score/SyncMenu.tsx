import { Eraser, FileDown, Flag, FlagTriangleRight, MapPin } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { currentPosition } from "@/stores/player";
import { type ProjectScore, useScoreStore } from "@/stores/score";
import { activeScore } from "./activeScore";

/**
 * Quick sync of phase 21: pin bar 1, the last bar's end, or the bar under the cursor to the
 * playhead. Between pinned bars the music follows the written tempo. The full editor (tap,
 * drag on the waveform, snap to beats) is phase 22.
 */
export function SyncMenu({ link, disabled }: { link: ProjectScore; disabled: boolean }) {
  const fileSync = useScoreStore((s) => s.fileSync);
  const count = link.sync.length;
  const synced = count > 0;

  const pinFirst = () =>
    useScoreStore
      .getState()
      .putSync({ bar: 0, occurrence: 0, position: 0, time: currentPosition() });

  const pinLast = () => {
    const last = activeScore.engine?.bars.at(-1);
    if (!last) return;
    useScoreStore.getState().putSync({
      bar: last.bar,
      occurrence: last.occurrence,
      position: 1,
      time: currentPosition(),
    });
  };

  // The bar the cursor shows now starts at the playhead
  const here = activeScore.engine?.placeAt(currentPosition());
  const pinHere = () => {
    if (!here) return;
    useScoreStore.getState().putSync({
      bar: here.bar,
      occurrence: here.occurrence,
      position: 0,
      time: currentPosition(),
    });
  };

  return (
    <DropdownMenu.Root>
      <Tooltip label={synced ? t.score.synced(count) : t.score.unsynced}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" options disabled={disabled}>
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                synced ? "bg-loop shadow-[0_0_5px_var(--color-loop)]" : "animate-pulse bg-accent",
              )}
            />
            {synced ? t.score.sync : t.score.unsynced}
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContent} w-80`}>
          <DropdownMenu.Label className={menuLabel}>
            {synced ? t.score.synced(count) : t.score.unsynced}
          </DropdownMenu.Label>
          <DropdownMenu.Item className={cn(menuItem, "items-start")} onSelect={pinFirst}>
            <Flag className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t.score.syncFirst}
              <span className="block text-[11px] opacity-70">{t.score.syncFirstHint}</span>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cn(menuItem, "items-start")} onSelect={pinLast}>
            <FlagTriangleRight className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t.score.syncLast}
              <span className="block text-[11px] opacity-70">{t.score.syncLastHint}</span>
            </span>
          </DropdownMenu.Item>
          {here && here.bar > 0 && (
            <DropdownMenu.Item className={menuItem} onSelect={pinHere}>
              <MapPin className="size-3.5" />
              {t.score.syncHere(here.bar + 1)}
            </DropdownMenu.Item>
          )}
          {(fileSync.length > 0 || synced) && <DropdownMenu.Separator className={menuSeparator} />}
          {fileSync.length > 0 && (
            <DropdownMenu.Item
              className={menuItem}
              onSelect={() => useScoreStore.getState().setSync(fileSync)}
            >
              <FileDown className="size-3.5" />
              {t.score.syncFromFile}
            </DropdownMenu.Item>
          )}
          {synced && (
            <DropdownMenu.Item
              className={menuItem}
              onSelect={() => useScoreStore.getState().setSync([])}
            >
              <Eraser className="size-3.5" />
              {t.score.syncClear}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
