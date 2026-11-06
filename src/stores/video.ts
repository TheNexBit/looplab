import { create } from "zustand";
import type { AppError } from "@/lib/bindings";
import { clamp } from "@/lib/time";

export type VideoStatus = "none" | "loading" | "proxying" | "ready" | "error";
export type VideoDock = "top" | "side";

/** Panel size limits, in CSS pixels (height when on top, width when at the side). */
const VIDEO_SIZE = { min: 120, max: 900, default: 280 } as const;

const PREFS_KEY = "looplab.video";

interface Prefs {
  dock: VideoDock;
  size: number;
  collapsed: boolean;
}

/** Layout preferences are a per-machine convenience: kept in the WebView's local storage. */
function loadPrefs(): Prefs {
  const fallback: Prefs = { dock: "top", size: VIDEO_SIZE.default, collapsed: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the layout simply resets next time
  }
}

interface VideoState extends Prefs {
  status: VideoStatus;
  /** URL the <video> element loads (original file or proxy) */
  src: string | null;
  /** 0..1 while a proxy is being made */
  progress: number;
  error: AppError | null;
  detached: boolean;
  setStatus: (
    status: VideoStatus,
    extra?: Partial<Pick<VideoState, "src" | "progress" | "error">>,
  ) => void;
  setDock: (dock: VideoDock) => void;
  setSize: (size: number) => void;
  toggleCollapsed: () => void;
  setDetached: (detached: boolean) => void;
}

export const useVideoStore = create<VideoState>((set, get) => {
  const prefs = (patch: Partial<Prefs>) => {
    set(patch);
    const { dock, size, collapsed } = get();
    savePrefs({ dock, size, collapsed });
  };
  return {
    ...loadPrefs(),
    status: "none",
    src: null,
    progress: 0,
    error: null,
    detached: false,
    setStatus: (status, extra) => set({ status, ...extra }),
    setDock: (dock) => prefs({ dock }),
    setSize: (size) => prefs({ size: Math.round(clamp(size, VIDEO_SIZE.min, VIDEO_SIZE.max)) }),
    toggleCollapsed: () => prefs({ collapsed: !get().collapsed }),
    setDetached: (detached) => set({ detached }),
  };
});
