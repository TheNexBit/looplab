import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition } from "@/stores/player";
import { useSavedLoopsStore } from "@/stores/savedLoops";

export interface Memo {
  /** Name of the loop or section it belongs to */
  name: string;
  text: string;
}

/**
 * The memo that applies now: the one of the saved loop being looped, or else the one of the
 * section under the playhead. `null` when neither has one.
 */
export function memoNow(): Memo | null {
  const loop = useLoopStore.getState();
  const region = loop.enabled ? loop.region() : null;
  if (region) {
    const saved = useSavedLoopsStore
      .getState()
      .loops.find((l) => l.start === region.start && l.end === region.end);
    if (saved?.memo) return { name: saved.name, text: saved.memo };
  }
  const position = currentPosition();
  const section = useMarkersStore
    .getState()
    .sections.find((range) => position >= range.start && position < range.end);
  return section?.memo ? { name: section.name, text: section.memo } : null;
}
