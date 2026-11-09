import { commands, type SoundsRequest } from "@/lib/bindings";
import { eqToRust, useEqStore } from "@/stores/eq";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { type Settings, useSettingsStore } from "@/stores/settings";

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

/** Clicks follow the beat grid; without a first beat set, it starts at the loop, else at
 *  the first bar marker, else at 0. */
export function clickSettings() {
  const settings = useSettingsStore.getState();
  const region = useLoopStore.getState().region();
  const { bpm, beatOffset, beatsPerBar, beatUnit } = usePracticeStore.getState();
  const firstBar = useMarkersStore
    .getState()
    .markers.filter((m) => m.kind === "beat")
    .reduce<number | null>((first, m) => (first === null ? m.time : Math.min(first, m.time)), null);
  return {
    bpm: bpm ?? 0,
    anchor: beatOffset ?? region?.start ?? firstBar ?? 0,
    countIn: settings.countIn ? settings.countInBars * beatsPerBar : 0,
    metronome: settings.metronome,
    // The plain bar of the track's meter: groups, accents and subdivisions come with the
    // metronome mode
    bar: {
      beats: beatsPerBar,
      unit: beatUnit,
      grouping: [],
      states: ["accent" as const],
      subdivision: 1,
      swing: 0.5,
      cross: 0,
      pulseTempo: false,
    },
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
  const sendLoop = sender(commands.setLoop);
  const sendEq = sender(commands.setEq);
  const sendChannels = sender(commands.setChannelMode);
  const sendClick = sender(commands.setClick);

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
    const eq = useEqStore.getState();
    if (eq.settings.bands.length > 0) sendEq(eqToRust(eq.settings), force);
    sendChannels(eq.channels, force);
  };

  const stops = [
    useLoopStore.subscribe(() => {
      sendLoop(loopSettings());
      pushClick();
    }),
    usePracticeStore.subscribe(pushClick),
    useSettingsStore.subscribe(pushClick),
    useMarkersStore.subscribe(pushClick),
    useEqStore.subscribe(() => pushAll(false)),
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track !== previous.track) pushAll(true);
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
