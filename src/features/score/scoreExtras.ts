import { create } from "zustand";
import { type AlignBar, type AlignedBar, commands, type ScoreNote } from "@/lib/bindings";
import { usePlayerStore } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import type { SyncPoint } from "@/stores/score";
import { useScoreStore } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";
import type { NeckChord } from "./scoreNotes";
import { type TimedBar, tempoMapFromBars } from "./syncTools";

/** What the extras read of a tab on screen (its engine), without pulling alphaTab in. */
interface TabSource {
  synthNotes(semitones: number): ScoreNote[];
  neckChords(): NeckChord[];
  tuning(): number[];
  alignBars(): AlignBar[];
  syncFromAligned(found: AlignedBar[]): { sync: SyncPoint[]; unsure: number[] };
  timedBars(): { bars: TimedBar[]; end: number } | null;
}

/** The tab on screen, for the sync menu's automatic sync (null with a PDF or no score). */
export const activeTab: { source: TabSource | null } = { source: null };

interface NeckState {
  /** What the neck lights up, in recording seconds; the strings lowest first (MIDI) */
  chords: NeckChord[];
  tuning: number[];
  set: (chords: NeckChord[], tuning: number[]) => void;
}

export const useNeckStore = create<NeckState>((set) => ({
  chords: [],
  tuning: [],
  set: (chords, tuning) => set({ chords, tuning }),
}));

/** The synth's level as the engine wants it: 0 when off. */
const synthLevel = () => {
  const settings = useSettingsStore.getState();
  return settings.scoreSynth ? settings.scoreSynthLevel : 0;
};

/**
 * Keeps the synth, the neck and the count-in's tempo in step with the tab on screen: called
 * again (`refresh`) whenever its bars are placed again in the recording or its tracks change.
 * Returns the refresh and the stop.
 */
export function startScoreExtras(source: TabSource): { refresh: () => void; stop: () => void } {
  activeTab.source = source;
  let sentNotes = false;

  const pushNotes = () => {
    if (!useSettingsStore.getState().scoreSynth) {
      if (sentNotes) void commands.setScoreNotes([]);
      sentNotes = false;
      return;
    }
    const { semitones, cents } = usePlayerStore.getState();
    void commands.setScoreNotes(source.synthNotes(semitones + cents / 100));
    sentNotes = true;
  };

  const refresh = () => {
    pushNotes();
    useNeckStore.getState().set(source.neckChords(), source.tuning());
    // A synced tab gives the clicks and the count-in its tempo (used while the song has none)
    const synced = (useScoreStore.getState().link?.sync.length ?? 0) > 0;
    const timed = synced ? source.timedBars() : null;
    usePracticeStore
      .getState()
      .setScoreMap(timed && timed.bars.length > 0 ? tempoMapFromBars(timed.bars, timed.end) : []);
  };

  void commands.setSynthLevel(synthLevel());
  const stops = [
    useSettingsStore.subscribe((state, previous) => {
      if (state.scoreSynth !== previous.scoreSynth) pushNotes();
      if (
        state.scoreSynth !== previous.scoreSynth ||
        state.scoreSynthLevel !== previous.scoreSynthLevel
      ) {
        void commands.setSynthLevel(synthLevel());
      }
    }),
    usePlayerStore.subscribe((state, previous) => {
      if (state.semitones !== previous.semitones || state.cents !== previous.cents) pushNotes();
      // A track opened: the engine may have been restarted (another device…)
      if (state.track && state.track !== previous.track) {
        void commands.setSynthLevel(synthLevel());
        pushNotes();
      }
    }),
  ];

  return {
    refresh,
    stop: () => {
      for (const stop of stops) stop();
      if (activeTab.source === source) activeTab.source = null;
      void commands.setScoreNotes([]);
      useNeckStore.getState().set([], []);
      usePracticeStore.getState().setScoreMap([]);
    },
  };
}
