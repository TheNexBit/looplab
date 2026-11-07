import { restartAt, useLoopStore } from "@/stores/loop";
import { trackDuration, usePlayerStore } from "@/stores/player";
import { type PlaylistStepData, usePlaylistStore } from "@/stores/playlist";
import { useSavedLoopsStore } from "@/stores/savedLoops";

/**
 * Where the playlist goes when a step has just been played once more: the same step with
 * one more pass, the next step, or `null` once the last one is done.
 */
export function afterPass(
  steps: readonly PlaylistStepData[],
  current: number,
  pass: number,
): { current: number; pass: number } | null {
  const step = steps[current];
  if (step && pass < step.repeats) return { current, pass: pass + 1 };
  return current + 1 < steps.length ? { current: current + 1, pass: 1 } : null;
}

/** True while the playlist itself changes the loop, so that is not taken as the user's doing. */
let switching = false;

/** Makes step `index` the current loop and plays it from its start (with the lead-in). */
function playStep(index: number) {
  const step = usePlaylistStore.getState().steps[index];
  const saved = useSavedLoopsStore.getState().loops.find((loop) => loop.id === step?.loopId);
  if (!saved) {
    stopPlaylist();
    return;
  }
  const loop = useLoopStore.getState();
  switching = true;
  loop.setRegion(saved.start, saved.end, trackDuration());
  switching = false;
  usePlayerStore.getState().seek(restartAt(saved, loop.leadIn));
  usePlaylistStore.getState().setProgress(index, 1);
}

export function startPlaylist() {
  const player = usePlayerStore.getState();
  if (!player.track || usePlaylistStore.getState().steps.length === 0) return;
  playStep(0);
  if (!usePlayerStore.getState().playing) usePlayerStore.getState().togglePlay();
}

/** Stops following the playlist; the music goes on unless `pause`. */
export function stopPlaylist(pause = false) {
  usePlaylistStore.getState().setProgress(null, 0);
  if (pause && usePlayerStore.getState().playing) usePlayerStore.getState().togglePlay();
}

export const togglePlaylist = () =>
  usePlaylistStore.getState().current === null ? startPlaylist() : stopPlaylist(true);

/**
 * Runs the practice playlist: counts the passes of the current step (from the engine's
 * wrap counter) and moves on to the next step, pausing after the last. Changing the loop by
 * hand, or opening another track, stops it. Started once by the app shell.
 */
export function runPlaylist(): () => void {
  const stops = [
    usePlayerStore.subscribe((state, previous) => {
      const { current, pass, steps } = usePlaylistStore.getState();
      if (current === null) return;
      if (state.track?.path !== previous.track?.path) {
        stopPlaylist();
        return;
      }
      if (state.loops <= previous.loops || !state.playing) return;
      const next = afterPass(steps, current, pass);
      if (!next) stopPlaylist(true);
      else if (next.current === current)
        usePlaylistStore.getState().setProgress(current, next.pass);
      else playStep(next.current);
    }),
    useLoopStore.subscribe((state, previous) => {
      if (switching || usePlaylistStore.getState().current === null) return;
      if (state.start !== previous.start || state.end !== previous.end || !state.enabled) {
        stopPlaylist();
      }
    }),
    // A saved loop deleted takes its steps with it
    useSavedLoopsStore.subscribe((state) =>
      usePlaylistStore.getState().keepLoops(state.loops.map((loop) => loop.id)),
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
