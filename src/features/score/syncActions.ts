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
  const engine = activeScore.engine;
  const sync = useScoreStore.getState().link?.sync ?? [];
  if (!engine) return;
  const latest = [...sync].sort((a, b) => b.time - a.time)[0];
  const next = latest ? engine.indexOf(latest) + 1 : 0;
  useScoreStore.getState().setTapping(next < engine.bars.length ? next : 0);
}

export const stopTapping = () => useScoreStore.getState().setTapping(null);

/** One `T` in tap mode: the bar due starts here; a tap that would contradict the sync is skipped. */
export function tapSync() {
  const engine = activeScore.engine;
  const store = useScoreStore.getState();
  if (!engine || store.tapping === null) return;
  const point = engine.barStart(store.tapping, currentPosition());
  if (!point) {
    stopTapping();
    return;
  }
  if (engine.canPin(point)) store.putSync(point);
  const next = store.tapping + 1;
  store.setTapping(next < engine.bars.length ? next : null);
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
