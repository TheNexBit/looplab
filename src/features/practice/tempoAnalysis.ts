import { Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { type AppError, commands } from "@/lib/bindings";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";

/** Where the tempo analysis of the open track stands. */
type Phase =
  | { kind: "idle" }
  | { kind: "running"; progress: number }
  | { kind: "done"; found: number }
  | { kind: "error"; error: AppError };

export const useTempoAnalysisStore = create<{ phase: Phase }>(() => ({
  phase: { kind: "idle" },
}));

const setPhase = (phase: Phase) => useTempoAnalysisStore.setState({ phase });

/** A new track forgets the result shown for the previous one. */
export function resetTempoAnalysis() {
  if (useTempoAnalysisStore.getState().phase.kind !== "running") setPhase({ kind: "idle" });
}

/**
 * Analyses the tempo of the open track and puts the result in the tempo map (one undo step).
 * The markers the user set or edited are sent along: they come back untouched and the
 * analysis lines its bars up with them. The others come back flagged as proposed.
 */
export async function analyzeTempo() {
  if (useTempoAnalysisStore.getState().phase.kind === "running") return;
  const track = usePlayerStore.getState().track?.path;
  if (!track) return;
  setPhase({ kind: "running", progress: 0 });
  const keep = usePracticeStore.getState().tempoMap.filter((m) => !m.auto);
  const progress = new Channel<number | null>();
  progress.onmessage = (value) => {
    if (value !== null && useTempoAnalysisStore.getState().phase.kind === "running")
      setPhase({ kind: "running", progress: value });
  };
  const result = await commands.analyzeTempo({ keep }, progress);
  // Another track was opened meanwhile: this result is not for it
  if (usePlayerStore.getState().track?.path !== track) {
    setPhase({ kind: "idle" });
    return;
  }
  if (result.status === "error") {
    setPhase({ kind: "error", error: result.error });
    return;
  }
  // JSON has no NaN: a number that was not finite arrives as null, and is dropped
  const markers = result.data.flatMap(({ time, bpm, ...rest }) =>
    time === null || bpm === null ? [] : [{ ...rest, time, bpm }],
  );
  const found = markers.filter((m) => m.auto).length;
  if (markers.length > 0) usePracticeStore.getState().setTempoMap(markers);
  setPhase({ kind: "done", found });
}
