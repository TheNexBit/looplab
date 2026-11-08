import { create } from "zustand";
import { type CustomSound, commands, type SoundSlot } from "@/lib/bindings";
import { type Settings, useSettingsStore } from "@/stores/settings";

/** The four kinds of click, with the settings that hold their sound, level and import. */
export const SOUND_SLOTS = [
  { slot: "accent", sound: "accentSound", level: "accentLevel", custom: "accentCustom" },
  { slot: "beat", sound: "beatSound", level: "beatLevel", custom: "beatCustom" },
  { slot: "sub", sound: "subSound", level: "subLevel", custom: "subCustom" },
  { slot: "cross", sound: "crossSound", level: "crossLevel", custom: "crossCustom" },
] as const satisfies readonly {
  slot: SoundSlot;
  sound: keyof Settings;
  level: keyof Settings;
  custom: keyof Settings;
}[];

interface ClickSoundsState {
  /** The imported sounds, by name */
  sounds: CustomSound[];
  refresh: () => Promise<void>;
  /** Imports an audio file; gives the new sound's id (null if it could not be read) */
  importFile: (path: string) => Promise<string | null>;
  /** Deletes an imported sound; the kinds using it go back to their synthesised sound */
  remove: (id: string) => Promise<void>;
}

/** Sounds imported for the clicks (MetroFlow's sound slots), kept in the app's data folder. */
export const useClickSoundsStore = create<ClickSoundsState>((set, get) => ({
  sounds: [],
  refresh: async () => {
    const result = await commands.listClickSounds();
    if (result.status === "ok") set({ sounds: result.data });
  },
  importFile: async (path) => {
    const result = await commands.importClickSound(path);
    await get().refresh();
    return result.status === "ok" ? result.data.id : null;
  },
  remove: async (id) => {
    const settings = useSettingsStore.getState();
    const patch: Partial<Settings> = {};
    for (const { custom } of SOUND_SLOTS) if (settings[custom] === id) patch[custom] = "";
    if (Object.keys(patch).length > 0) settings.update(patch);
    await commands.deleteClickSound(id);
    await get().refresh();
  },
}));

/** The imported sound of each kind, in the engine's order (accent, beat, sub, cross). */
function chosen(settings: Settings): [string | null, string | null, string | null, string | null] {
  const [a, b, c, d] = SOUND_SLOTS.map(({ custom }) => settings[custom] || null);
  return [a ?? null, b ?? null, c ?? null, d ?? null];
}

/**
 * Tells the engine which imported sounds the clicks use, at start and whenever the choice
 * changes (it never starts the audio device by itself). Started once with the metronome.
 */
export function syncClickSamples(): () => void {
  let last = "";
  const push = (settings: Settings) => {
    const slots = chosen(settings);
    const key = JSON.stringify(slots);
    if (key === last) return;
    last = key;
    void commands.setClickSamples(slots);
  };
  push(useSettingsStore.getState());
  void useClickSoundsStore.getState().refresh();
  return useSettingsStore.subscribe((settings) => push(settings));
}
