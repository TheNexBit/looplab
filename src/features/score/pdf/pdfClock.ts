import type { PdfBar, SyncPoint } from "@/stores/score";
import { BarSync } from "../barSync";
import type { BarSpan } from "../timeline";
import { QUARTER_TICKS } from "../timeline";

/** A PDF bar's nominal length: 4 quarters (the real meter is not read from the picture). */
const BAR_TICKS = 4 * QUARTER_TICKS;

/**
 * The bars of a PDF and where they fall in the recording. A picture has no notes, so every
 * bar counts the same: between two sync points the bars share the time evenly (as Soundslice
 * does), and the cursor crosses each bar at an even pace.
 */
export class PdfClock extends BarSync {
  constructor(bars: readonly PdfBar[], sync: SyncPoint[]) {
    super();
    this.update(bars, sync);
  }

  /** New bars (found, split, merged) or a new sync. */
  update(bars: readonly PdfBar[], sync: SyncPoint[]) {
    const spans: BarSpan[] = bars.map((_, bar) => ({
      bar,
      occurrence: 0,
      startTick: bar * BAR_TICKS,
      endTick: (bar + 1) * BAR_TICKS,
      tempos: [{ tick: bar * BAR_TICKS, bpm: 120 }],
    }));
    this.sync = sync;
    this.setSpans(spans);
  }

  /** The bar heard at `seconds` (index in reading order) and how far through it, or null. */
  barAt(seconds: number): { index: number; position: number } | null {
    const place = this.placeAt(seconds);
    return place ? { index: place.bar, position: place.position } : null;
  }

  /** Seconds where bar `index` starts (`position` 0) or ends (1). */
  barTime(index: number, position = 0): number | null {
    return this.timeOf(index, 0, position);
  }
}

/**
 * The bars after splitting bar `index` at `at` (0..1 across it), with the sync moved along:
 * every point of a later bar now names the bar one further on.
 */
export function splitBar(bars: PdfBar[], sync: SyncPoint[], index: number, at: number) {
  const bar = bars[index];
  if (!bar || at <= 0.05 || at >= 0.95) return null;
  const left = { ...bar, w: bar.w * at };
  const right = { ...bar, x: bar.x + bar.w * at, w: bar.w * (1 - at) };
  return {
    bars: [...bars.slice(0, index), left, right, ...bars.slice(index + 1)],
    sync: sync.map((p) => (p.bar > index ? { ...p, bar: p.bar + 1 } : p)),
  };
}

/** The bars after merging bar `index` with the next one (same row of the same page only). */
export function mergeBars(bars: PdfBar[], sync: SyncPoint[], index: number) {
  const bar = bars[index];
  const next = bars[index + 1];
  if (!bar || !next || next.page !== bar.page || Math.abs(next.y - bar.y) > bar.h / 2) return null;
  const merged = { ...bar, w: next.x + next.w - bar.x };
  return {
    bars: [...bars.slice(0, index), merged, ...bars.slice(index + 2)],
    // Points on the next bar go (it is gone); later ones move back by one
    sync: sync
      .filter((p) => p.bar !== index + 1)
      .map((p) => (p.bar > index + 1 ? { ...p, bar: p.bar - 1 } : p)),
  };
}

/** The bars without bar `index` (it was not a bar), sync moved along. */
export function removeBar(bars: PdfBar[], sync: SyncPoint[], index: number) {
  if (!bars[index]) return null;
  return {
    bars: bars.filter((_, i) => i !== index),
    sync: sync
      .filter((p) => p.bar !== index)
      .map((p) => (p.bar > index ? { ...p, bar: p.bar - 1 } : p)),
  };
}
