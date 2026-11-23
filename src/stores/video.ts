import { create } from "zustand";
import type { AppError } from "@/lib/bindings";
import { readPrefs, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";

export type VideoStatus = "none" | "loading" | "proxying" | "ready" | "error";
type VideoDock = "top" | "side";

/** Panel size limits, in CSS pixels (height when on top, width when at the side). */
const VIDEO_SIZE = { min: 120, max: 900, default: 280 } as const;

/** Video and score side by side (a lesson): the video's share of the width, the row's height. */
export const LESSON_SPLIT = { min: 0.2, max: 0.8, default: 0.45 } as const;
export const LESSON_HEIGHT = { min: 200, max: 1600, default: 460 } as const;

const PREFS_KEY = "looplab.video";

interface Prefs {
  dock: VideoDock;
  /** Where the video docks when the song has a score too (beside it by default: room for both) */
  dockWithScore: VideoDock;
  size: number;
  collapsed: boolean;
  /** With a score too: video beside the score, waveforms below (else the panels as without one) */
  beside: boolean;
  split: number;
  lessonHeight: number;
}

/** Layout preferences are a per-machine convenience: kept in the WebView's local storage. */
const DEFAULT_PREFS: Prefs = {
  dock: "top",
  dockWithScore: "side",
  size: VIDEO_SIZE.default,
  collapsed: false,
  beside: true,
  split: LESSON_SPLIT.default,
  lessonHeight: LESSON_HEIGHT.default,
};

/** Stored preferences, each one checked: a damaged value falls back to its default. */
function loadPrefs(): Prefs {
  const stored = readPrefs<Prefs>(PREFS_KEY, DEFAULT_PREFS);
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  return {
    dock: stored.dock === "side" ? "side" : "top",
    dockWithScore: stored.dockWithScore === "top" ? "top" : "side",
    size: number(stored.size, VIDEO_SIZE.min, VIDEO_SIZE.max, DEFAULT_PREFS.size),
    collapsed: stored.collapsed === true,
    beside: stored.beside !== false,
    split: number(stored.split, LESSON_SPLIT.min, LESSON_SPLIT.max, LESSON_SPLIT.default),
    lessonHeight: number(
      stored.lessonHeight,
      LESSON_HEIGHT.min,
      LESSON_HEIGHT.max,
      LESSON_HEIGHT.default,
    ),
  };
}

interface VideoState extends Prefs {
  status: VideoStatus;
  /** URL the <video> element loads (original file or proxy) */
  src: string | null;
  /** 0..1 while a proxy is being made */
  progress: number;
  error: AppError | null;
  detached: boolean;
  /** Seconds the picture's file runs ahead of the track (another angle of the take) */
  shift: number;
  setShift: (shift: number) => void;
  setStatus: (
    status: VideoStatus,
    extra?: Partial<Pick<VideoState, "src" | "progress" | "error">>,
  ) => void;
  setDock: (dock: VideoDock) => void;
  setDockWithScore: (dock: VideoDock) => void;
  setSize: (size: number) => void;
  toggleCollapsed: () => void;
  setBeside: (beside: boolean) => void;
  setSplit: (split: number) => void;
  setLessonHeight: (height: number) => void;
  setDetached: (detached: boolean) => void;
}

export const useVideoStore = create<VideoState>((set, get) => {
  const prefs = (patch: Partial<Prefs>) => {
    set(patch);
    const { dock, dockWithScore, size, collapsed, beside, split, lessonHeight } = get();
    writeStored(PREFS_KEY, {
      dock,
      dockWithScore,
      size,
      collapsed,
      beside,
      split,
      lessonHeight,
    });
  };
  return {
    ...loadPrefs(),
    status: "none",
    src: null,
    progress: 0,
    error: null,
    detached: false,
    shift: 0,
    setShift: (shift) => set({ shift }),
    setStatus: (status, extra) => set({ status, ...extra }),
    setDock: (dock) => prefs({ dock }),
    setDockWithScore: (dockWithScore) => prefs({ dockWithScore }),
    setSize: (size) => prefs({ size: Math.round(clamp(size, VIDEO_SIZE.min, VIDEO_SIZE.max)) }),
    toggleCollapsed: () => prefs({ collapsed: !get().collapsed }),
    setBeside: (beside) => prefs({ beside }),
    setSplit: (split) =>
      prefs({ split: Math.round(clamp(split, LESSON_SPLIT.min, LESSON_SPLIT.max) * 1000) / 1000 }),
    setLessonHeight: (height) =>
      prefs({ lessonHeight: Math.round(clamp(height, LESSON_HEIGHT.min, LESSON_HEIGHT.max)) }),
    setDetached: (detached) => set({ detached }),
  };
});
