import type { SyncPoint } from "@/stores/score";
import { quartersOf, type TimedBar } from "./syncTools";
import { type BarSpan, buildTimeline, type Timeline } from "./timeline";

/** Least time between two sync points (seconds): closer ones are a slip of the hand. */
const MIN_SYNC_GAP = 0.2;

/**
 * The bars of a score (in playback order) and where they fall in the recording: what the
 * sync tools work on, the same for a Guitar Pro tab and for a PDF. `timeline` maps the score
 * to the recording through the usable sync points.
 */
export class BarSync {
  protected spans: BarSpan[] = [];
  protected sync: SyncPoint[] = [];
  protected timeline: Timeline | null = null;

  /** The bars changed (a score loaded, a PDF's bars fixed): the map is built again. */
  protected setSpans(spans: BarSpan[]) {
    this.spans = spans;
    this.rebuild();
  }

  /** The saved sync changed: only its usable points are applied. Returns those. */
  protected setSync(saved: SyncPoint[]): SyncPoint[] {
    this.sync = saved;
    return this.rebuild();
  }

  private rebuild(): SyncPoint[] {
    if (this.spans.length === 0) {
      this.timeline = null;
      return [];
    }
    const usable = this.cleanSync(this.sync);
    this.timeline = buildTimeline(this.spans, usable);
    return usable;
  }

  /**
   * The usable part of `sync`: in score order each point must come later in the recording
   * than the one before (at least `MIN_SYNC_GAP`). Points that contradict an earlier one, or
   * name a bar the score does not have, are left out.
   */
  cleanSync(sync: SyncPoint[]): SyncPoint[] {
    if (this.spans.length === 0) return sync;
    const probe = buildTimeline(this.spans, []);
    const placed = sync
      .map((point) => ({ point, tick: probe.tickOf(point.bar, point.occurrence, point.position) }))
      .filter((p): p is { point: SyncPoint; tick: number } => p.tick !== null)
      .sort((a, b) => a.tick - b.tick);
    const kept: SyncPoint[] = [];
    let lastTime = Number.NEGATIVE_INFINITY;
    let lastTick = Number.NEGATIVE_INFINITY;
    for (const { point, tick } of placed) {
      if (tick > lastTick && point.time >= lastTime + MIN_SYNC_GAP) {
        kept.push(point);
        lastTime = point.time;
        lastTick = tick;
      }
    }
    return kept;
  }

  /** True if `point` can join the sync without contradicting it (or replacing its own place). */
  canPin(point: SyncPoint): boolean {
    const others = this.sync.filter(
      (p) =>
        !(
          p.bar === point.bar &&
          p.occurrence === point.occurrence &&
          Math.abs(p.position - point.position) < 1e-6
        ),
    );
    return this.cleanSync([...others, point]).includes(point);
  }

  get ready() {
    return this.timeline !== null;
  }

  get bars(): readonly BarSpan[] {
    return this.spans;
  }

  /** Every bar pass with where it starts in the recording, and where the last one ends. */
  timedBars(): { bars: TimedBar[]; end: number } | null {
    const timeline = this.timeline;
    if (!timeline) return null;
    const bars = this.spans.map((span) => ({
      bar: span.bar,
      occurrence: span.occurrence,
      quarters: quartersOf(span.startTick, span.endTick),
      time: timeline.seconds(span.startTick),
      beatsPerBar: span.beatsPerBar ?? 4,
      beatUnit: span.beatUnit ?? 4,
    }));
    return { bars, end: timeline.seconds(timeline.endTick) };
  }

  /** The sync point at the start of the bar pass number `index` (playback order), at `time`. */
  barStart(index: number, time: number): SyncPoint | null {
    const span = this.spans[index];
    return span ? { bar: span.bar, occurrence: span.occurrence, position: 0, time } : null;
  }

  /** Index (playback order) of the bar pass a sync point starts, -1 if none. */
  indexOf(point: SyncPoint): number {
    return this.spans.findIndex((s) => s.bar === point.bar && s.occurrence === point.occurrence);
  }

  /** The bar pass heard at `seconds`, and how far through it (0..1). */
  placeAt(seconds: number): SyncPoint | null {
    const timeline = this.timeline;
    if (!timeline) return null;
    const tick = timeline.tick(seconds);
    const span = timeline.spanAt(tick);
    if (!span) return null;
    const length = span.endTick - span.startTick;
    return {
      bar: span.bar,
      occurrence: span.occurrence,
      position: length > 0 ? (tick - span.startTick) / length : 0,
      time: seconds,
    };
  }

  /** Seconds where a place of the score is heard. */
  timeOf(bar: number, occurrence: number, position: number): number | null {
    const tick = this.timeline?.tickOf(bar, occurrence, position);
    return tick == null || !this.timeline ? null : this.timeline.seconds(tick);
  }
}
