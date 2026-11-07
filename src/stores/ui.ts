import { create } from "zustand";
import type { ExportSource } from "@/features/export/exportPlan";
import { readStored, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";

export type SidePanelTab = "sections" | "eq" | "practice";
export type Dialog = "palette" | "settings" | "about" | "diary" | "export";

/** Width of the side panel, in CSS pixels. */
export const SIDE_PANEL_WIDTH = { min: 260, max: 560, default: 300 } as const;
const WIDTH_KEY = "looplab.sidePanelWidth";
/** Width always left to the waveforms beside the panel. */
const WAVEFORMS_MIN_WIDTH = 480;

function loadWidth(): number {
  const stored = readStored(WIDTH_KEY);
  return typeof stored === "number"
    ? clamp(stored, SIDE_PANEL_WIDTH.min, SIDE_PANEL_WIDTH.max)
    : SIDE_PANEL_WIDTH.default;
}

interface UiState {
  sidePanelOpen: boolean;
  sidePanelWidth: number;
  sidePanelTab: SidePanelTab;
  /** The modal window on screen, if any */
  dialog: Dialog | null;
  /** What the export window starts with; null = the loop if there is one, else the track */
  exportSource: ExportSource | null;
  /** The window is the mini bar, always on top (`app/miniMode.ts` switches it) */
  mini: boolean;
  toggleSidePanel: () => void;
  setSidePanelTab: (tab: SidePanelTab) => void;
  setSidePanelWidth: (width: number) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  openExport: (source?: ExportSource) => void;
}

/** Layout state of the shell: which panels and dialogs are open, which tab is active. */
export const useUiStore = create<UiState>((set) => ({
  sidePanelOpen: true,
  sidePanelWidth: loadWidth(),
  sidePanelTab: "sections",
  dialog: null,
  exportSource: null,
  mini: false,
  toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),
  setSidePanelTab: (tab) => set({ sidePanelTab: tab, sidePanelOpen: true }),
  setSidePanelWidth: (width) => {
    // Never so wide that the waveforms get squeezed out of a small window
    const room = Math.max(SIDE_PANEL_WIDTH.min, window.innerWidth - WAVEFORMS_MIN_WIDTH);
    const max = Math.min(SIDE_PANEL_WIDTH.max, room);
    const sidePanelWidth = Math.round(clamp(width, SIDE_PANEL_WIDTH.min, max));
    set({ sidePanelWidth });
    writeStored(WIDTH_KEY, sidePanelWidth);
  },
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  openExport: (source) => set({ dialog: "export", exportSource: source ?? null }),
}));
