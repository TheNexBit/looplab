import { currentPosition } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useScoreStore } from "@/stores/score";
import { activeScore } from "./activeScore";
import { gridSync, tempoMapFromBars } from "./syncTools";

/**
 * Tap mode: from the bar after the last one pinned (bar 1 with no sync yet), each `T` pins
 * the next bar's start at the playhead. The shortcut `T` comes here only while it is on.
 */
export function startTapping() {
  const next = nextTapIndex();
  const bars = activeScore.engine?.bars.length ?? 0;
  if (bars > 0) useScoreStore.getState().setTapping(next < bars ? next : 0);
}

export const stopTapping = () => useScoreStore.getState().setTapping(null);

/**
 * The bar pass (playback order) the next `T` pins: the one after the latest point in the
 * recording, bar 1 with none. Always worked out from the points there are, never counted
 * apart: an undo, a delete or a drag can never leave tap mode one bar ahead.
 */
function nextTapIndex(): number {
  const engine = activeScore.engine;
  const sync = useScoreStore.getState().link?.sync ?? [];
  if (!engine) return 0;
  const latest = sync.reduce<(typeof sync)[number] | null>(
    (last, p) => (!last || p.time > last.time ? p : last),
    null,
  );
  if (!latest) return 0;
  // The end of the last bar is pinned: nothing is left to tap
  if (latest.position >= 1) return engine.bars.length;
  return engine.indexOf(latest) + 1;
}

// Whatever changes the points while tapping (undo, redo, a drag, a delete), the bar shown
// and pinned next follows them
useScoreStore.subscribe((state, previous) => {
  if (state.tapping === null || state.link?.sync === previous.link?.sync) return;
  const next = nextTapIndex();
  const bars = activeScore.engine?.bars.length ?? 0;
  if (next !== state.tapping) state.setTapping(next < bars ? next : null);
});

/** One `T` in tap mode: the bar due starts here; a tap that would contradict the sync is skipped. */
export function tapSync() {
  const engine = activeScore.engine;
  const store = useScoreStore.getState();
  if (!engine || store.tapping === null) return;
  const point = engine.barStart(nextTapIndex(), currentPosition());
  if (!point) {
    stopTapping();
    return;
  }
  // A tap that contradicts the sync (too early, say) is dropped and the same bar waits for the
  // next T: nothing is skipped
  if (!engine.canPin(point)) return;
  // The subscription above moves tap mode on to the following bar
  store.putSync(point);
}

/** True while `T` belongs to tap mode instead of the tempo tap. */
export const isTapping = () => useScoreStore.getState().tapping !== null;

/**
 * Every bar on the tempo grid (phase 17's map, or one set by hand), from bar 1 as pinned (or
 * the grid's first marker): the score's own meters decide how many beats each bar takes.
 */
export function syncToGrid(): boolean {
  const engine = activeScore.engine;
  const map = usePracticeStore.getState().tempoMap;
  const timed = engine?.timedBars();
  if (!engine || !timed || map.length === 0) return false;
  const first = useScoreStore
    .getState()
    .link?.sync.find((p) => p.bar === 0 && p.occurrence === 0 && p.position === 0);
  const anchor = first?.time ?? map[0]?.time ?? 0;
  useScoreStore.getState().setSync(gridSync(timed.bars, anchor, map));
  return true;
}

/** The tempo map of the synced score: tempo and meter wherever they change (e.g. a 7/4 intro). */
export function tempoMapFromScore(): boolean {
  const timed = activeScore.engine?.timedBars();
  if (!timed || timed.bars.length === 0) return false;
  const map = tempoMapFromBars(timed.bars, timed.end);
  if (map.length === 0) return false;
  usePracticeStore.getState().setTempoMap(map);
  return true;
}
