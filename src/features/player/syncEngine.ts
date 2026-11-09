import { commands, type SoundsRequest } from "@/lib/bindings";
import { eqToRust, useEqStore } from "@/stores/eq";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { type Settings, useSettingsStore } from "@/stores/settings";

/** How often the marker in force at the playhead is looked up (ms): cheap, and fast enough to see. */
const FOCUS_MS = 100;

/** Sends a value only when it differs from the last one sent (or when forced). */
function sender<T>(send: (value: T) => unknown) {
  let last = "";
  return (value: T, force = false) => {
    const key = JSON.stringify(value);
    if (!force && key === last) return;
    last = key;
    void send(value);
  };
}

/**
 * Where the first beat goes when a tempo is set before any first beat: the loop start, else
 * the first bar marker, else 0 (what the grid did before it had a first beat of its own).
 */
export function firstBeatGuess(): number {
  const region = useLoopStore.getState().region();
  const firstBar = useMarkersStore
    .getState()
    .markers.filter((m) => m.kind === "beat")
    .reduce<number | null>((first, m) => (first === null ? m.time : Math.min(first, m.time)), null);
  return region?.start ?? firstBar ?? 0;
}

/** Metronome and count-in over the track; where the beats fall comes with the tempo map. */
export function clickSettings() {
  const settings = useSettingsStore.getState();
  return {
    countIn: settings.countIn ? settings.countInBars : 0,
    metronome: settings.metronome,
    volume: settings.clickVolume,
    sounds: clickSounds(settings),
  };
}

/** Sound and level of every kind of click, from the settings (shared with the metronome mode). */
export function clickSounds(settings: Settings): SoundsRequest {
  return {
    accentSound: settings.accentSound,
    accentLevel: settings.accentLevel,
    beatSound: settings.beatSound,
    beatLevel: settings.beatLevel,
    subSound: settings.subSound,
    subLevel: settings.subLevel,
    crossSound: settings.crossSound,
    crossLevel: settings.crossLevel,
  };
}

/**
 * Keeps the engine in step with the loop, EQ, channel and click (tempo, metronome,
 * count-in) settings. Started once by the
 * app shell. Runs on every change while dragging too: commands are tiny and the engine
 * applies them at the next audio block. Everything is re-sent when a track opens, in
 * case the engine was restarted (e.g. after the audio device changed).
 */
export function syncWithEngine(): () => void {
  usePracticeStore.getState().setFirstBeatGuess(firstBeatGuess);
  const sendLoop = sender(commands.setLoop);
  const sendEq = sender(commands.setEq);
  const sendChannels = sender(commands.setChannelMode);
  const sendClick = sender(commands.setClick);
  const sendTempo = sender(commands.setTempoMap);
  const pushTempo = (force = false) => sendTempo(usePracticeStore.getState().tempoMap, force);

  const loopSettings = () => {
    const loop = useLoopStore.getState();
    const region = loop.region();
    return {
      enabled: loop.enabled && region !== null,
      start: region?.start ?? 0,
      end: region?.end ?? 0,
      leadIn: loop.leadIn,
      gap: loop.gap,
    };
  };
  const pushClick = () => sendClick(clickSettings());

  const pushAll = (force: boolean) => {
    sendLoop(loopSettings(), force);
    sendClick(clickSettings(), force);
    pushTempo(force);
    const eq = useEqStore.getState();
    if (eq.settings.bands.length > 0) sendEq(eqToRust(eq.settings), force);
    sendChannels(eq.channels, force);
  };

  const stops = [
    useLoopStore.subscribe(() => {
      sendLoop(loopSettings());
      pushClick();
    }),
    usePracticeStore.subscribe(() => pushTempo()),
    useSettingsStore.subscribe(pushClick),
    useEqStore.subscribe(() => pushAll(false)),
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track !== previous.track) pushAll(true);
    }),
  ];
  // The tempo display and the meter edit the marker in force at the playhead: follow it
  const focus = window.setInterval(() => {
    usePracticeStore.getState().focusAt(currentPosition());
  }, FOCUS_MS);
  return () => {
    window.clearInterval(focus);
    for (const stop of stops) stop();
  };
}
