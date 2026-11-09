import { create } from "zustand";
import {
  BEAT_UNITS,
  BEATS_PER_BAR,
  BPM,
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
    addTap: (time) => set({ taps: [...get().taps, time].slice(-MAX_TAPS) }),
    countRepetition: () => set({ repetitions: get().repetitions + 1 }),
    resetRepetitions: () => set({ repetitions: 0 }),
  };
});
