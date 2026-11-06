import { create } from "zustand";
import { type Keymap, type ShortcutId, setActiveShortcuts, shortcuts } from "@/lib/shortcuts";

/** A MIDI trigger, as `features/midi` writes it: "note:1:60", "cc:1:64", "pc:1:3". */
export type MidiSignature = string;

interface Stored {
  keys: Partial<Keymap>;
  midi: Partial<Record<ShortcutId, MidiSignature>>;
}

const KEY = "looplab.keymap";

function load(): Stored {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stored>;
    const keep = <T>(values: Record<string, T> | undefined, valid: (v: unknown) => boolean) =>
      Object.fromEntries(
        Object.entries(values ?? {}).filter(([id, value]) => id in shortcuts && valid(value)),
      );
    return {
      keys: keep(stored.keys, (v) => typeof v === "string"),
      midi: keep(stored.midi, (v) => typeof v === "string" && v !== ""),
    };
  } catch {
    return { keys: {}, midi: {} };
  }
}

/** Defaults with the user's changes on top. */
const effective = (overrides: Partial<Keymap>): Keymap => ({ ...shortcuts, ...overrides });

interface KeymapState {
  /** Keys in use for every action ("" = none) */
  keys: Keymap;
  /** Only the keys the user changed */
  overrides: Partial<Keymap>;
  midi: Partial<Record<ShortcutId, MidiSignature>>;
  /** The action waiting for a MIDI message to be assigned to it */
  learning: ShortcutId | null;
  /** Gives `combo` to `id`; an action that had it loses it. Returns the action that lost it. */
  setKey: (id: ShortcutId, combo: string) => ShortcutId | null;
  setMidi: (id: ShortcutId, signature: MidiSignature | null) => void;
  learnMidi: (id: ShortcutId | null) => void;
  resetAll: () => void;
}

/** Keys and MIDI triggers of the actions, as chosen in the settings. Kept on this PC. */
export const useKeymapStore = create<KeymapState>((set, get) => {
  const initial = load();
  setActiveShortcuts(effective(initial.keys));

  const save = (overrides: Partial<Keymap>, midi: KeymapState["midi"]) => {
    const keys = effective(overrides);
    setActiveShortcuts(keys);
    set({ keys, overrides, midi });
    try {
      localStorage.setItem(KEY, JSON.stringify({ keys: overrides, midi }));
    } catch {
      // Storage unavailable: the changes last until the app closes
    }
  };

  return {
    keys: effective(initial.keys),
    overrides: initial.keys,
    midi: initial.midi,
    learning: null,

    setKey: (id, combo) => {
      const { keys, overrides, midi } = get();
      const next = { ...overrides, [id]: combo };
      const loser =
        combo === ""
          ? null
          : ((Object.keys(keys) as ShortcutId[]).find(
              (other) => other !== id && keys[other].toLowerCase() === combo.toLowerCase(),
            ) ?? null);
      if (loser) next[loser] = "";
      // A key back to its default is not an override any more
      for (const key of Object.keys(next) as ShortcutId[]) {
        if (next[key] === shortcuts[key]) delete next[key];
      }
      save(next, midi);
      return loser;
    },

    setMidi: (id, signature) => {
      const midi = { ...get().midi };
      if (signature) {
        for (const other of Object.keys(midi) as ShortcutId[]) {
          if (midi[other] === signature) delete midi[other];
        }
        midi[id] = signature;
      } else {
        delete midi[id];
      }
      save(get().overrides, midi);
      set({ learning: null });
    },

    learnMidi: (learning) => set({ learning }),

    resetAll: () => save({}, {}),
  };
});
