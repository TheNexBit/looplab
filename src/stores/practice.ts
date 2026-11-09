import { create } from "zustand";
import {
  BEAT_UNITS,
  BEATS_PER_BAR,
  BPM,
  beatsBetween,
  markerAt,
  markerIndexAt,
  sanitizeTempoMap,
  type TempoMap,
  type TempoMarker,
} from "@/features/practice/tempo";
import { clamp } from "@/lib/time";

interface PracticeState {
  /** Where tempo and meter change in the open track (empty while unknown). Saved in the project. */
  tempoMap: TempoMap;
  /** The marker in force at the playhead: the one the tempo display and the meter edit */
  focus: number;
  /**
   * The focused marker as the controls read it: its tempo (null while the track has none),
   * where its bars start, its meter. Before the first tempo is set they hold a draft (a first
   * beat or a meter picked first), which becomes the first marker as soon as a tempo arrives.
   */
  bpm: number | null;
  beatOffset: number | null;
  beatsPerBar: number;
  beatUnit: number;
  /** Loop repetitions played since the loop or the speed trainer last changed */
  repetitions: number;
  /** Times (performance.now) of the recent taps of "tap tempo" */
  taps: number[];
  /** Where a first tempo puts its first beat when none was set (the app shell provides it) */
  setFirstBeatGuess: (guess: () => number) => void;
  /** Replaces the whole map (opening a project, an analysis, the marker lane) */
  setTempoMap: (map: readonly Partial<TempoMarker>[]) => void;
  /** Focuses the marker in force at `time` (the playhead moved) */
  focusAt: (time: number) => void;
  /** Tempo of the focused marker; null forgets the whole map */
  setBpm: (bpm: number | null) => void;
  /** Moves the focused marker's first beat to `seconds` (where its bars line up) */
  setBeatOffset: (seconds: number | null) => void;
  setTimeSignature: (beatsPerBar: number, beatUnit: number) => void;
  /**
   * A new marker at the bar line nearest `time`, with the tempo and meter in force there, like
   * Reaper's "insert tempo marker": then the display and the meter change it from there on.
   * Returns false when there is no tempo yet or a marker is already there.
   */
  addTempoMarker: (time: number) => boolean;
  /** Moves marker `index` to `time`, never past its neighbours */
  moveTempoMarker: (index: number, time: number) => void;
  removeTempoMarker: (index: number) => void;
  addTap: (time: number) => void;
  countRepetition: () => void;
  resetRepetitions: () => void;
}

const MAX_TAPS = 8;
let firstBeatGuess = () => 0;

/** The tempo map of the open track, or null while its tempo is unknown. */
export function currentTempoMap(): TempoMap | null {
  const { tempoMap } = usePracticeStore.getState();
  return tempoMap.length > 0 ? tempoMap : null;
}

const roundBpm = (bpm: number) => Math.round(clamp(bpm, BPM.min, BPM.max) * 10) / 10;
const fitBeats = (beats: number) => Math.round(clamp(beats, BEATS_PER_BAR.min, BEATS_PER_BAR.max));
const fitUnit = (unit: number) => ((BEAT_UNITS as readonly number[]).includes(unit) ? unit : 4);

/** What the controls show for `map` focused on `focus` (the draft is kept while empty). */
function mirror(
  map: TempoMap,
  focus: number,
  draft: Pick<PracticeState, "beatOffset" | "beatsPerBar" | "beatUnit">,
) {
  const marker = map[focus];
  if (!marker) {
    // Only the draft's own fields: spreading the whole state would bring the old map back
    const { beatOffset, beatsPerBar, beatUnit } = draft;
    return { bpm: null, beatOffset, beatsPerBar, beatUnit };
  }
  return {
    bpm: marker.bpm,
    beatOffset: marker.time,
    beatsPerBar: marker.beatsPerBar,
    beatUnit: marker.beatUnit,
  };
}

/** Practice state of the open track: its tempo map and the repetition counter. */
export const usePracticeStore = create<PracticeState>((set, get) => {
  /** Stores `map`, keeps the focus on the marker in force at `at` and mirrors it. */
  const commit = (map: TempoMap, at: number) => {
    const focus = markerIndexAt(map, at);
    set({ tempoMap: map, focus, ...mirror(map, focus, get()) });
  };
  /** Changes the focused marker; with no map yet, the draft (and a tempo makes it the first). */
  const editFocused = (patch: Partial<TempoMarker>) => {
    const state = get();
    const current = state.tempoMap[state.focus];
    if (!current) {
      const beatsPerBar = patch.beatsPerBar ?? state.beatsPerBar;
      const beatUnit = patch.beatUnit ?? state.beatUnit;
      if (patch.bpm === undefined) {
        // Only a first beat picked by hand is kept: otherwise the guess is made with the tempo
        set({ beatOffset: patch.time ?? state.beatOffset, beatsPerBar, beatUnit });
        return;
      }
      const time = patch.time ?? state.beatOffset ?? firstBeatGuess();
      commit([{ time, bpm: patch.bpm, beatsPerBar, beatUnit }], time);
      return;
    }
    const map = state.tempoMap.map((marker, i) =>
      i === state.focus ? { ...marker, ...patch } : marker,
    );
    commit(sanitizeTempoMap(map), patch.time ?? current.time);
  };

  return {
    tempoMap: [],
    focus: 0,
    bpm: null,
    beatOffset: null,
    beatsPerBar: BEATS_PER_BAR.default,
    beatUnit: 4,
    repetitions: 0,
    taps: [],
    setFirstBeatGuess: (guess) => {
      firstBeatGuess = guess;
    },
    setTempoMap: (markers) => {
      const map = sanitizeTempoMap(markers);
      const focused = get().tempoMap[get().focus];
      commit(map, focused?.time ?? map[0]?.time ?? 0);
    },
    focusAt: (time) => {
      const { tempoMap, focus } = get();
      const next = markerIndexAt(tempoMap, time);
      if (next !== focus) set({ focus: next, ...mirror(tempoMap, next, get()) });
    },
    setBpm: (bpm) => {
      if (bpm === null) {
        set({ tempoMap: [], focus: 0, bpm: null });
        return;
      }
      editFocused({ bpm: roundBpm(bpm) });
    },
    setBeatOffset: (seconds) => {
      if (seconds === null) {
        if (get().tempoMap.length === 0) set({ beatOffset: null });
        return;
      }
      const { tempoMap, focus } = get();
      // A marker never jumps over its neighbours: past them it would rule another stretch
      const before = tempoMap[focus - 1]?.time ?? -Infinity;
      const after = tempoMap[focus + 1]?.time ?? Infinity;
      if (tempoMap.length > 0 && (seconds <= before || seconds >= after)) return;
      editFocused({ time: seconds });
    },
    setTimeSignature: (beatsPerBar, beatUnit) =>
      editFocused({ beatsPerBar: fitBeats(beatsPerBar), beatUnit: fitUnit(beatUnit) }),
    addTempoMarker: (time) => {
      const { tempoMap } = get();
      const marker = markerAt(tempoMap, time);
      if (!marker) return false;
      // On the bar line nearest `time`, so the grid before it stays as it was
      const bars = beatsBetween(time - 60, time + 60, tempoMap).filter((beat) => beat.bar);
      const at = bars.reduce(
        (best, beat) => (Math.abs(beat.time - time) < Math.abs(best - time) ? beat.time : best),
        bars[0]?.time ?? time,
      );
      if (tempoMap.some((m) => Math.abs(m.time - at) < 0.01)) return false;
      commit(sanitizeTempoMap([...tempoMap, { ...marker, time: at }]), at);
      return true;
    },
    moveTempoMarker: (index, time) => {
      const { tempoMap } = get();
      const before = tempoMap[index - 1]?.time ?? -Infinity;
      const after = tempoMap[index + 1]?.time ?? Infinity;
      const marker = tempoMap[index];
      if (!marker || time <= before + 0.01 || time >= after - 0.01) return;
      const map = tempoMap.map((m, i) => (i === index ? { ...m, time } : m));
      commit(map, time);
    },
    removeTempoMarker: (index) => {
      const { tempoMap } = get();
      if (!tempoMap[index]) return;
      const map = tempoMap.filter((_, i) => i !== index);
      commit(map, tempoMap[index]?.time ?? 0);
    },
    addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
    countRepetition: () => set({ repetitions: get().repetitions + 1 }),
    resetRepetitions: () => set({ repetitions: 0 }),
  };
});
