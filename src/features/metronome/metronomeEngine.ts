import { clickSounds } from "@/features/player/syncEngine";
import {
  type BarRequest,
  commands,
  type MetronomeRequest,
  type SequenceRequest,
} from "@/lib/bindings";
import { syncClickSamples } from "@/stores/clickSounds";
import { type MetronomeSetup, type PlayedSequence, useMetronomeStore } from "@/stores/metronome";
import { exercisesRequest, useExercisesStore } from "@/stores/metronomeExercises";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";

/** The bar of a setup, in the engine's terms. */
export function barRequest(setup: MetronomeSetup): BarRequest {
  return {
    beats: setup.beats,
    unit: setup.unit,
    grouping: setup.grouping ?? [],
    states: setup.states,
    subdivision: setup.subdivision,
    swing: setup.swing,
    cross: setup.cross,
    pulseTempo: setup.tempoBase === "pulse",
  };
}

/** A sequence in the engine's terms: every part with its bar, tempo and exercises. */
export function sequenceRequest(sequence: PlayedSequence): SequenceRequest {
  return {
    repeat: sequence.repeat,
    parts: sequence.parts.map((part) => ({
      bpm: part.setup.bpm,
      bar: barRequest(part.setup),
      exercises: exercisesRequest(part.exercises, part.setup.beats, part.setup.subdivision),
      bars: Math.max(1, part.bars),
    })),
  };
}

/** What the engine needs of the metronome store and the click sounds of the settings. */
export function metronomeRequest(): MetronomeRequest {
  const m = useMetronomeStore.getState();
  return {
    bpm: m.bpm,
    bar: barRequest(m),
    countInBars: m.countInBars,
    volume: m.volume,
    sounds: clickSounds(useSettingsStore.getState()),
    exercises: exercisesRequest(useExercisesStore.getState(), m.beats, m.subdivision),
    voice: { on: m.voice.on, subdivisions: m.voice.subdivisions, level: m.voice.level },
  };
}

/**
 * Keeps the engine's metronome in step with the store: every change of tempo, bar or sound
 * is sent (it takes over at once, keeping the place in the bar); starting pauses the track,
 * so the two never play over each other. Started once by the app shell.
 */
export function syncMetronome(): () => void {
  let last = "";
  // The voice's language changes its words, sent apart from the settings
  let language = useMetronomeStore.getState().voice.language;
  void commands.setVoiceLanguage(language);
  const push = (force = false) => {
    const request = metronomeRequest();
    const key = JSON.stringify(request);
    if (!force && key === last) return;
    last = key;
    void commands.setMetronome(request);
  };

  const stopStore = useMetronomeStore.subscribe((state, previous) => {
    push();
    if (state.voice.language !== language) {
      language = state.voice.language;
      void commands.setVoiceLanguage(language);
    }
    if (state.sequence !== previous.sequence) {
      void commands.setSequence(state.sequence ? sequenceRequest(state.sequence) : null);
    }
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
  const stopExercises = useExercisesStore.subscribe(() => push());
  // Imported click sounds, for the metronome and the clicks over the tracks alike
  const stopSamples = syncClickSamples();
  // …and playing the track stops the metronome
  const stopPlayer = usePlayerStore.subscribe((state, previous) => {
    if (state.playing && !previous.playing && useMetronomeStore.getState().running) {
      useMetronomeStore.getState().setRunning(false);
    }
  });
  return () => {
    stopStore();
    stopSettings();
    stopExercises();
    stopSamples();
    stopPlayer();
  };
}

/** Starts or stops the metronome (Space in the metronome mode). */
export function toggleMetronomeRun() {
  const metronome = useMetronomeStore.getState();
  metronome.setRunning(!metronome.running);
}
