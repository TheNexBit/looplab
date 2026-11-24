import { commands, type SoundsRequest } from "@/lib/bindings";
import { eqToRust, useEqStore } from "@/stores/eq";
import { laneGains, onStemsClosed, useFileStemsStore } from "@/stores/fileStems";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { currentPosition, usePlayerStore } from "@/stores/player";
import { clickTempoMap, usePracticeStore } from "@/stores/practice";
import { type Settings, useSettingsStore } from "@/stores/settings";
import { stemGains, useStemsStore } from "@/stores/stems";

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
    volume: settings.clickMuted ? 0 : settings.clickVolume,
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
  const sendTrackVolume = sender(commands.setTrackVolume);
  const sendStemLevels = sender((mix: { levels: number[]; original: number | null }) =>
    commands.setStemLevels(mix.levels, mix.original),
  );
  const pushStems = (force = false) => {
    const { lanes } = useFileStemsStore.getState();
    if (lanes.length > 1) {
      // Stems from files: the open file lane is the mix `original`, the others follow
      const [own = 1, ...others] = laneGains(lanes);
      sendStemLevels({ levels: others, original: own }, force);
      return;
    }
    const { names, channels } = useStemsStore.getState();
    if (names) sendStemLevels({ levels: stemGains(names, channels), original: null }, force);
    // Stems from files just closed and no separated tracks: the track alone, at full level
    else sendStemLevels({ levels: [], original: null }, force);
  };
  /** The separated tracks of a song just opened, if it was separated before */
  const loadStems = async (path: string) => {
    useStemsStore.getState().setNames(null);
    useStemsStore.getState().setPhase({ kind: "idle" });
    const result = await commands.loadStems({ path });
    if (usePlayerStore.getState().track?.path !== path) return;
    if (result.status === "ok" && result.data) {
      useStemsStore.getState().setNames(result.data.names);
      pushStems(true);
    }
  };
  // Stems from files closed by hand: the song's separated tracks (if any) come back at once
  onStemsClosed(() => {
    const path = usePlayerStore.getState().track?.path;
    if (path) void loadStems(path);
  });
  const pushTrackVolume = (force = false) => {
    const { trackVolume, trackMuted } = useSettingsStore.getState();
    sendTrackVolume(trackMuted ? 0 : trackVolume, force);
  };
  const sendTempo = sender(commands.setTempoMap);
  const pushTempo = (force = false) => sendTempo(clickTempoMap(), force);

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
    pushTrackVolume(force);
    pushStems(force);
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
    useSettingsStore.subscribe(() => {
      pushClick();
      pushTrackVolume();
    }),
    useEqStore.subscribe(() => pushAll(false)),
    useStemsStore.subscribe(() => pushStems()),
    useFileStemsStore.subscribe((state, previous) => {
      // Opened, closed or mixed: the engine gets the levels (at once after opening)
      if (state.lanes !== previous.lanes) pushStems(state.lanes.length !== previous.lanes.length);
    }),
    usePlayerStore.subscribe((state, previous) => {
      if (state.track && state.track !== previous.track) {
        pushAll(true);
        if (state.track.path !== previous.track?.path) void loadStems(state.track.path);
      }
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
