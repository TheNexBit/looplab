import {
  Eraser,
  FileDown,
  Flag,
  FlagTriangleRight,
  Grid3x3,
  Hand,
  MapPin,
  Metronome,
  MoveHorizontal,
  RefreshCw,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCompact } from "@/components/ui/FitBar";
import { menuContent, menuItem, menuLabel, menuSeparator, smallKey } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { currentPosition } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { type ProjectScore, type SyncPoint, useScoreStore } from "@/stores/score";
import { activeScore } from "./activeScore";
import { findBarsAgain } from "./pdf/PdfBarCheck";
import { autoSync, startTapping, syncToGrid, tempoMapFromScore } from "./syncActions";

/** Steps of "Move all", seconds: fine and coarse, earlier and later. */
const SHIFTS = [-0.5, -0.05, 0.05, 0.5] as const;

/**
 * The score's sync: pin bar 1, the last bar's end or the bar under the cursor to the playhead;
 * tap the bars with T; lock every bar to the tempo grid; make the tempo map from the tab;
 * move all points together. The points themselves are dragged on the waveform (SyncFlags).
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
  const hasGrid = usePracticeStore((s) => s.tempoMap.length > 0);
  const [offer, setOffer] = useState<Offer>(NO_OFFER);
  const aligning = useScoreStore((s) => s.aligning !== null);
  const compact = useCompact();
  const count = link.sync.length;
  const hasFirst = link.sync.some((p) => p.bar === 0 && p.occurrence === 0 && p.position === 0);
  const synced = count > 0;
  const pin = (point: SyncPoint | null) => point && useScoreStore.getState().putSync(point);

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setOffer(offerAt(currentPosition()))}>
      <Tooltip label={`${t.score.sync} · ${synced ? t.score.synced(count) : t.score.unsynced}`}>
        <DropdownMenu.Trigger asChild>
          <Button variant="hardware" options disabled={disabled} aria-label={t.score.sync}>
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                synced ? "bg-loop shadow-[0_0_5px_var(--color-loop)]" : "animate-pulse bg-accent",
              )}
            />
            {compact ? <RefreshCw className="size-3.5" /> : t.score.sync}
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContent} w-80`}>
          <DropdownMenu.Label className={menuLabel}>
            {synced ? t.score.synced(count) : t.score.unsynced}
          </DropdownMenu.Label>
          {/* A PDF has no notes to listen for: the automatic sync needs a tab */}
          {link.kind === "notation" && (
            <>
              <DropdownMenu.Item
                className={cn(menuItem, "items-start")}
                disabled={aligning}
                onSelect={() => void autoSync()}
              >
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <span>
                  {t.score.autoSync}
                  <span className="block text-[11px] opacity-70">
                    {hasFirst ? t.score.autoSyncKeep : t.score.autoSyncHint}
                  </span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className={menuSeparator} />
            </>
          )}
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
          <DropdownMenu.Item className={cn(menuItem, "items-start")} onSelect={startTapping}>
            <Hand className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t.score.syncTap}
              <span className="block text-[11px] opacity-70">{t.score.syncTapHint}</span>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparator} />
          {/* A PDF's meters are not read from the picture: grid and tempo map need a tab */}
          {link.kind === "notation" && (
            <>
              <DropdownMenu.Item
                className={cn(menuItem, "items-start")}
                disabled={!hasGrid}
                onSelect={syncToGrid}
              >
                <Grid3x3 className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t.score.syncGrid}
                  <span className="block text-[11px] opacity-70">
                    {hasGrid ? t.score.syncGridHint : t.score.syncGridNeedsTempo}
                  </span>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={cn(menuItem, "items-start")}
                disabled={!synced}
                onSelect={tempoMapFromScore}
              >
                <Metronome className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t.score.tempoFromScore}
                  <span className="block text-[11px] opacity-70">{t.score.tempoFromScoreHint}</span>
                </span>
              </DropdownMenu.Item>
            </>
          )}
          {synced && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 whitespace-nowrap">
              <MoveHorizontal className="size-3.5 text-fg-muted" aria-hidden />
              <span className="mr-auto pr-1">{t.score.syncShift}</span>
              {SHIFTS.map((step) => (
                <button
                  key={step}
                  type="button"
                  className={cn(smallKey, "w-auto px-1.5 font-mono text-[10px] tabular")}
                  aria-label={step < 0 ? t.score.syncShiftEarlier : t.score.syncShiftLater}
                  title={step < 0 ? t.score.syncShiftEarlier : t.score.syncShiftLater}
                  onClick={() => useScoreStore.getState().shiftSync(step)}
                >
                  {step > 0 ? "+" : "−"}
                  {Math.abs(step).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </button>
              ))}
            </div>
          )}
          {(fileSync.length > 0 || synced || link.kind === "pdf") && (
            <DropdownMenu.Separator className={menuSeparator} />
          )}
          {link.kind === "pdf" && (
            <DropdownMenu.Label className={menuLabel}>
              {t.score.pdfBarCount(link.pdfBars.length)}
            </DropdownMenu.Label>
          )}
          {link.kind === "pdf" && (
            <DropdownMenu.Item className={cn(menuItem, "items-start")} onSelect={findBarsAgain}>
              <ScanSearch className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex flex-col">
                {t.score.findBarsAgain}
                <span className="text-[11px] text-fg-subtle">{t.score.findBarsAgainHint}</span>
              </span>
            </DropdownMenu.Item>
          )}
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
