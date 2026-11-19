import { Eraser, FileDown, Flag, FlagTriangleRight, MapPin } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { currentPosition } from "@/stores/player";
import { type ProjectScore, type SyncPoint, useScoreStore } from "@/stores/score";
import { activeScore } from "./activeScore";

/**
 * Quick sync of phase 21: pin bar 1, the last bar's end, or the bar under the cursor to the
 * playhead. Between pinned bars the music follows the written tempo. The full editor (tap,
 * drag on the waveform, snap to beats) is phase 22.
 */
/** The points the menu offers, worked out when it opens (the playhead moves meanwhile). */
interface Offer {
  first: SyncPoint | null;
  last: SyncPoint | null;
  here: SyncPoint | null;
}
const NO_OFFER: Offer = { first: null, last: null, here: null };

/** `point` if it fits the sync (comes after what is before it, before what is after), else null. */
const fitting = (point: SyncPoint | null) =>
  point && activeScore.engine?.canPin(point) ? point : null;

function offerAt(time: number): Offer {
  const engine = activeScore.engine;
  if (!engine) return NO_OFFER;
  const end = engine.bars.at(-1);
  // The bar start nearest the playhead (the cursor's bar, or the next one past its middle)
  const place = engine.placeAt(time);
  const spans = engine.bars;
  let here: SyncPoint | null = null;
  if (place) {
    const index = spans.findIndex((s) => s.bar === place.bar && s.occurrence === place.occurrence);
    const span = place.position > 0.5 ? (spans[index + 1] ?? spans[index]) : spans[index];
    if (span && span.bar > 0)
      here = { bar: span.bar, occurrence: span.occurrence, position: 0, time };
  }
  return {
    first: fitting({ bar: 0, occurrence: 0, position: 0, time }),
    last: end ? fitting({ bar: end.bar, occurrence: end.occurrence, position: 1, time }) : null,
    here: fitting(here),
  };
}

export function SyncMenu({ link, disabled }: { link: ProjectScore; disabled: boolean }) {
  const fileSync = useScoreStore((s) => s.fileSync);
  const [offer, setOffer] = useState<Offer>(NO_OFFER);
  const count = link.sync.length;
  const synced = count > 0;
  const pin = (point: SyncPoint | null) => point && useScoreStore.getState().putSync(point);

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setOffer(offerAt(currentPosition()))}>
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
          <DropdownMenu.Item
            className={cn(menuItem, "items-start")}
            disabled={!offer.first}
            onSelect={() => pin(offer.first)}
          >
            <Flag className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t.score.syncFirst}
              <span className="block text-[11px] opacity-70">
                {offer.first ? t.score.syncFirstHint : t.score.syncConflict}
              </span>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={cn(menuItem, "items-start")}
            disabled={!offer.last}
            onSelect={() => pin(offer.last)}
          >
            <FlagTriangleRight className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t.score.syncLast}
              <span className="block text-[11px] opacity-70">
                {offer.last ? t.score.syncLastHint : t.score.syncConflict}
              </span>
            </span>
          </DropdownMenu.Item>
          {offer.here && (
            <DropdownMenu.Item className={menuItem} onSelect={() => pin(offer.here)}>
              <MapPin className="size-3.5" />
              {t.score.syncHere(offer.here.bar + 1)}
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
