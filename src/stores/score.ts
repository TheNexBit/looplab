import { create } from "zustand";
import type { AppError, ScoreFollow, ScoreKind, ScoreLayout, ScoreStaves } from "@/lib/bindings";
import { commands } from "@/lib/bindings";
import { readPrefs, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";

/** Where a place of the score is heard: bar (0-based), pass through it, 0..1 in it, seconds. */
export interface SyncPoint {
  bar: number;
  occurrence: number;
  position: number;
  time: number;
}

/** The score linked to the open song, as its project keeps it (every number guaranteed). */
export interface ProjectScore {
  /** Name in the library's `spartiti` folder */
  file: string;
  /** Name of the user's original file */
  name: string;
  kind: ScoreKind;
  tracks: number[];
  staves: ScoreStaves;
  layout: ScoreLayout;
  follow: ScoreFollow;
  zoom: number;
  sync: SyncPoint[];
}

/** "none": no score linked; "loading": being read and drawn; "ready"; "error". */
export type ScoreStatus = "none" | "loading" | "ready" | "error";

/** A track (instrument) of the score. */
export interface ScoreTrack {
  index: number;
  name: string;
  /** Drums: drawn as percussion, never as tab */
  percussion: boolean;
}

/** Height of the docked panel, in CSS pixels. */
export const SCORE_SIZE = { min: 160, max: 1400, default: 380 } as const;
export const SCORE_ZOOM = { min: 0.5, max: 2, step: 0.1, default: 1 } as const;

const PREFS_KEY = "looplab.score";

interface Prefs {
  size: number;
  collapsed: boolean;
}

/** Layout of the panel is a per-machine convenience (like the video's): in local storage. */
const loadPrefs = (): Prefs =>
  readPrefs<Prefs>(PREFS_KEY, { size: SCORE_SIZE.default, collapsed: false });

interface ScoreState extends Prefs {
  /** The song's linked score, as saved in its project */
  link: ProjectScore | null;
  status: ScoreStatus;
  error: AppError | null;
  /** Tracks of the loaded score */
  tracks: ScoreTrack[];
  /** Sync points found in the file itself (Guitar Pro 8), offered to the user */
  fileSync: SyncPoint[];
  /** Bars written in the score (the last index + 1) */
  barCount: number;
  /** A file is being copied into the library */
  linking: boolean;
  /** The empty panel ("link a score") is open, for a song with no score yet */
  asking: boolean;

  /** Replaces the link (a song opened): only projectSync calls it. */
  restore: (link: ProjectScore | null) => void;
  /** A problem to tell over the score shown (it stays on screen), shown a few seconds */
  notice: AppError | null;
  /** Shows a problem: as a notice over the score if one is shown, else in the empty panel. */
  fail: (error: AppError) => void;
  clearNotice: () => void;
  /** Copies `path` into the library and links it to the open song. */
  linkFile: (path: string) => Promise<void>;
  unlink: () => void;
  setStatus: (status: ScoreStatus, error?: AppError | null) => void;
  setLoaded: (tracks: ScoreTrack[], barCount: number, fileSync: SyncPoint[]) => void;
  setTracks: (tracks: number[]) => void;
  setStaves: (staves: ScoreStaves) => void;
  setLayout: (layout: ScoreLayout) => void;
  setFollow: (follow: ScoreFollow) => void;
  zoomBy: (steps: number) => void;
  setSync: (sync: SyncPoint[]) => void;
  /** Adds a sync point, replacing one at the same place of the score. */
  putSync: (point: SyncPoint) => void;
  setSize: (size: number) => void;
  toggleCollapsed: () => void;
  /** The top bar's Score key: shows or hides the panel (the empty one with no score). */
  toggleShown: () => void;
}

const samePlace = (a: SyncPoint, b: SyncPoint) =>
  a.bar === b.bar && a.occurrence === b.occurrence && Math.abs(a.position - b.position) < 1e-6;

export const useScoreStore = create<ScoreState>((set, get) => {
  const prefs = (patch: Partial<Prefs>) => {
    set(patch);
    const { size, collapsed } = get();
    writeStored(PREFS_KEY, { size, collapsed });
  };
  const edit = (patch: Partial<ProjectScore>) => {
    const link = get().link;
    if (link) set({ link: { ...link, ...patch } });
  };
  return {
    ...loadPrefs(),
    link: null,
    status: "none",
    error: null,
    tracks: [],
    fileSync: [],
    barCount: 0,
    linking: false,
    asking: false,
    notice: null,

    restore: (link) =>
      set({
        asking: false,
        notice: null,
        link,
        status: link ? "loading" : "none",
        error: null,
        tracks: [],
        fileSync: [],
        barCount: 0,
      }),

    fail: (error) => {
      // With a score on screen it stays: the problem shows as a notice over it
      if (get().link) set({ notice: error });
      else set({ status: "error", error });
    },
    clearNotice: () => set({ notice: null }),

    linkFile: async (path) => {
      set({ linking: true, notice: null });
      const result = await commands.importScore(path);
      // A file alphaTab cannot read is not linked (its copy goes at the next clean-up)
      const readable =
        result.status === "ok" &&
        (await import("@/features/score/checkScore").then((m) => m.isReadable(result.data.file)));
      set({ linking: false });
      if (result.status === "error") {
        get().fail(result.error);
        return;
      }
      if (!readable) {
        get().fail({ kind: "corruptFile", detail: "score" });
        return;
      }
      const { file, name, kind } = result.data;
      const previous = get().link;
      // Same file again: keep its sync and view; another file starts fresh
      if (previous?.file === file) {
        set({ asking: false });
        return;
      }
      set({
        link: {
          file,
          name,
          kind,
          tracks: [],
          staves: "both",
          layout: "page",
          follow: "continuous",
          zoom: SCORE_ZOOM.default,
          sync: [],
        },
        status: "loading",
        error: null,
        tracks: [],
        fileSync: [],
        barCount: 0,
        asking: false,
      });
      prefs({ collapsed: false });
    },

    unlink: () => set({ link: null, status: "none", error: null, tracks: [], fileSync: [] }),
    setStatus: (status, error = null) => set({ status, error }),
    setLoaded: (tracks, barCount, fileSync) => set({ tracks, barCount, fileSync, status: "ready" }),
    setTracks: (tracks) => edit({ tracks }),
    setStaves: (staves) => edit({ staves }),
    setLayout: (layout) => edit({ layout }),
    setFollow: (follow) => edit({ follow }),
    zoomBy: (steps) => {
      const zoom = get().link?.zoom ?? SCORE_ZOOM.default;
      const next =
        Math.round(clamp(zoom + steps * SCORE_ZOOM.step, SCORE_ZOOM.min, SCORE_ZOOM.max) * 10) / 10;
      edit({ zoom: next });
    },
    setSync: (sync) => edit({ sync }),
    putSync: (point) => {
      const sync = get().link?.sync ?? [];
      edit({ sync: [...sync.filter((p) => !samePlace(p, point)), point] });
    },
    setSize: (size) => prefs({ size: Math.round(clamp(size, SCORE_SIZE.min, SCORE_SIZE.max)) }),
    toggleCollapsed: () => prefs({ collapsed: !get().collapsed }),
    toggleShown: () => {
      if (get().link) prefs({ collapsed: !get().collapsed });
      else set({ asking: !get().asking, status: "none", error: null });
    },
  };
});
