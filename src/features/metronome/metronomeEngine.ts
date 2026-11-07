import { clickSounds } from "@/features/player/syncEngine";
import { commands, type MetronomeRequest } from "@/lib/bindings";
import { useMetronomeStore } from "@/stores/metronome";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";

/** What the engine needs of the metronome store and the click sounds of the settings. */
export function metronomeRequest(): MetronomeRequest {
  const m = useMetronomeStore.getState();
  return {
    bpm: m.bpm,
    bar: {
      beats: m.beats,
      unit: m.unit,
      grouping: m.grouping ?? [],
      states: m.states,
      subdivision: m.subdivision,
      swing: m.swing,
      cross: m.cross,
    },
    countInBars: m.countInBars,
    volume: m.volume,
    sounds: clickSounds(useSettingsStore.getState()),
  };
}

/**
 * Keeps the engine's metronome in step with the store: every change of tempo, bar or sound
 * is sent (it takes over at once, keeping the place in the bar); starting pauses the track,
 * so the two never play over each other. Started once by the app shell.
 */
export function syncMetronome(): () => void {
  let last = "";
  const push = (force = false) => {
    const request = metronomeRequest();
    const key = JSON.stringify(request);
    if (!force && key === last) return;
    last = key;
    void commands.setMetronome(request);
  };

  const stopStore = useMetronomeStore.subscribe((state, previous) => {
    push();
    if (state.running === previous.running) return;
    if (state.running) {
      const player = usePlayerStore.getState();
      if (player.playing) player.togglePlay();
      // The settings first, so the count-in and the bar are the ones on screen
      push(true);
    }
    void commands.runMetronome(state.running);
  });
  const stopSettings = useSettingsStore.subscribe(() => push());
  // …and playing the track stops the metronome
  const stopPlayer = usePlayerStore.subscribe((state, previous) => {
    if (state.playing && !previous.playing && useMetronomeStore.getState().running) {
      useMetronomeStore.getState().setRunning(false);
    }
  });
  return () => {
    stopStore();
    stopSettings();
    stopPlayer();
  };
}

/** Starts or stops the metronome (Space in the metronome mode). */
export function toggleMetronomeRun() {
  const metronome = useMetronomeStore.getState();
  metronome.setRunning(!metronome.running);
}
