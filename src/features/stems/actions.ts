import { Channel } from "@tauri-apps/api/core";
import { commands } from "@/lib/bindings";
import { cancelModelDownload, ensureModel } from "@/stores/models";
import { usePlayerStore } from "@/stores/player";
import { useStemsStore } from "@/stores/stems";

/**
 * Separates the open song (once: then its tracks come from the cache). Opening another
 * song stops it; so does `cancelSeparation`.
 */
export async function separateStems() {
  const stems = useStemsStore.getState();
  const track = usePlayerStore.getState().track;
  if (!track || stems.phase.kind === "running" || stems.phase.kind === "downloading") return;
  // The model comes first, once: downloaded and checked before the separation starts
  stems.setPhase({ kind: "downloading", progress: 0 });
  const missing = await ensureModel("stems", (progress) => {
    if (useStemsStore.getState().phase.kind === "downloading")
      useStemsStore.getState().setPhase({ kind: "downloading", progress });
  });
  if (missing) {
    stems.setPhase(
      missing.kind === "cancelled" ? { kind: "idle" } : { kind: "error", error: missing },
    );
    return;
  }
  if (usePlayerStore.getState().track?.path !== track.path) {
    stems.setPhase({ kind: "idle" });
    return;
  }
  stems.setPhase({ kind: "running", progress: 0 });
  const progress = new Channel<number | null>();
  progress.onmessage = (value) => {
    if (value !== null && useStemsStore.getState().phase.kind === "running") {
      useStemsStore.getState().setPhase({ kind: "running", progress: value });
    }
  };
  const result = await commands.separateStems({ path: track.path }, progress);
  // Another song was opened meanwhile: its own state is already in place
  if (usePlayerStore.getState().track?.path !== track.path) return;
  const store = useStemsStore.getState();
  if (result.status === "ok") {
    store.setNames(result.data.names);
    store.setPhase({ kind: "idle" });
  } else if (result.error.kind === "cancelled") {
    store.setPhase({ kind: "idle" });
  } else {
    store.setPhase({ kind: "error", error: result.error });
  }
}

/**
 * Saves the open song's separated tracks as WAV files (one folder per song) and shows them in
 * Explorer. Gives the folder, or the error.
 */
export async function exportStems() {
  const track = usePlayerStore.getState().track;
  if (!track) return null;
  const result = await commands.exportStems({ path: track.path });
  if (result.status === "error") return result;
  const first = result.data.files[0];
  if (first) void commands.revealFile(first);
  return result;
}

export function cancelSeparation() {
  if (useStemsStore.getState().phase.kind === "downloading") cancelModelDownload();
  else void commands.cancelStems();
}
