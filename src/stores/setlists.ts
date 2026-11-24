import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import {
  type AppError,
  commands,
  type Setlist_Serialize as Setlist,
  type SetlistSong_Serialize as Song,
  type SongFile,
} from "@/lib/bindings";
import { samePath } from "@/lib/format";
import { useSettingsStore } from "./settings";

/** Edits are saved this long after the last one (typing a note, turning a stepper). */
const SAVE_DELAY_MS = 400;

interface SetlistsState {
  setlists: Setlist[];
  files: SongFile[];
  loaded: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
  /** Makes a new setlist, opens it and returns its id. */
  create: (name: string) => Promise<string | null>;
  /** A copy of a setlist (songs and Live settings), opened. */
  duplicate: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Changes a setlist at once on screen; it is saved a moment later. */
  edit: (id: string, change: (setlist: Setlist) => Setlist) => void;
  editSong: (id: string, songId: string, change: Partial<Song>) => void;
  /** Adds songs at the end (or before `at`); files Looplab cannot play are left out. */
  addSongs: (id: string, songs: Song[], at?: number) => void;
  /** The setlist a file or a track is being dragged over (its drop zone lights up) */
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  /** Saves now what is waiting (before Live mode starts, before the window closes). */
  flush: () => Promise<void>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Edits made since each setlist was sent to be saved: an older answer must not undo them. */
const edits = new Map<string, number>();

/** The setlists of the gigs, kept by Rust in the library (`setlist.rs`). */
export const useSetlistsStore = create<SetlistsState>((set, get) => {
  const save = async (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const setlist = get().setlists.find((s) => s.id === id);
    if (!setlist) return;
    const sent = edits.get(id) ?? 0;
    const result = await commands.saveSetlist(setlist);
    if (result.status === "error") {
      set({ error: result.error });
      return;
    }
    // Lengths read by Rust come back; songs edited meanwhile keep the newer edit
    if ((edits.get(id) ?? 0) === sent) {
      set({ setlists: get().setlists.map((s) => (s.id === id ? result.data : s)) });
    }
    // A new file may have been added: whether it exists
    const known = get().files;
    const added = result.data.songs.some(
      (song) => song.path && !known.some((f) => samePath(f.path, song.path)),
    );
    if (added) await get().refresh();
  };

  return {
    setlists: [],
    files: [],
    loaded: false,
    error: null,
    refresh: async () => {
      const result = await commands.setlistLibrary();
      if (result.status === "error") {
        set({ error: result.error });
        return;
      }
      // Setlists with edits still waiting keep them
      const waiting = new Map(
        get()
          .setlists.filter((s) => timers.has(s.id))
          .map((s) => [s.id, s]),
      );
      set({
        setlists: result.data.setlists.map((s) => waiting.get(s.id) ?? s),
        files: result.data.files,
        loaded: true,
        error: null,
      });
    },
    create: async (name) => {
      const result = await commands.saveSetlist({
        id: "",
        name,
        date: null,
        venue: "",
        limitMinutes: null,
        // Auto-advance after a short countdown, like BandHelper's time between songs
        gapSeconds: 3,
        songs: [],
        lastSong: null,
      });
      if (result.status === "error") {
        set({ error: result.error });
        return null;
      }
      await get().refresh();
      useSettingsStore.getState().update({ setlistOpen: result.data.id });
      return result.data.id;
    },
    duplicate: async (id, name) => {
      await get().flush();
      const source = get().setlists.find((s) => s.id === id);
      if (!source) return;
      const result = await commands.saveSetlist({ ...source, id: "", name });
      if (result.status === "error") {
        set({ error: result.error });
        return;
      }
      await get().refresh();
      useSettingsStore.getState().update({ setlistOpen: result.data.id });
    },
    remove: async (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      const result = await commands.deleteSetlist(id);
      if (result.status === "error") set({ error: result.error });
      await get().refresh();
    },
    edit: (id, change) => {
      edits.set(id, (edits.get(id) ?? 0) + 1);
      set({ setlists: get().setlists.map((s) => (s.id === id ? change(s) : s)) });
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(() => void save(id), SAVE_DELAY_MS),
      );
    },
    addSongs: (id, songs, at) =>
      get().edit(id, (setlist) => {
        const place = at ?? setlist.songs.length;
        return {
          ...setlist,
          songs: [...setlist.songs.slice(0, place), ...songs, ...setlist.songs.slice(place)],
        };
      }),
    dropTarget: null,
    setDropTarget: (dropTarget) => {
      if (dropTarget !== get().dropTarget) set({ dropTarget });
    },
    editSong: (id, songId, change) =>
      get().edit(id, (setlist) => ({
        ...setlist,
        songs: setlist.songs.map((song) => (song.id === songId ? { ...song, ...change } : song)),
      })),
    flush: async () => {
      await Promise.all([...timers.keys()].map((id) => save(id)));
    },
  };
});

/** The setlist shown on the Home: the one picked last, else the first (next gig). */
export function openSetlist(setlists: readonly Setlist[], picked: string): Setlist | null {
  return setlists.find((s) => s.id === picked) ?? setlists[0] ?? null;
}

/**
 * Edits still waiting are written before the window closes (the close waits for them, as for
 * the projects in `projectSync`). Started once by the app shell; returns the function that stops it.
 */
export function saveSetlistsOnClose(): () => void {
  const unlisten = getCurrentWindow().onCloseRequested(() => useSetlistsStore.getState().flush());
  return () => void unlisten.then((stop) => stop());
}
