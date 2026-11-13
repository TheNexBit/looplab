import { create } from "zustand";
import type { ExportSource } from "@/features/export/exportPlan";
import { readStored, writeStored } from "@/lib/storage";
import { clamp } from "@/lib/time";

export type SidePanelTab = "sections" | "eq" | "practice" | "stems";
export type Dialog = "palette" | "settings" | "about" | "diary" | "export";

/** Width of the side panel, in CSS pixels. */
export const SIDE_PANEL_WIDTH = { min: 260, max: 560, default: 300 } as const;
const WIDTH_KEY = "looplab.sidePanelWidth";
/** Whether the side panel is open and which tab it shows: kept between sessions too */
const OPEN_KEY = "looplab.sidePanelOpen";
const TAB_KEY = "looplab.sidePanelTab";
const TABS: readonly SidePanelTab[] = ["sections", "eq", "practice", "stems"];
/** Width always left to the waveforms beside the panel. */
const WAVEFORMS_MIN_WIDTH = 480;

function loadWidth(): number {
  const stored = readStored(WIDTH_KEY);
  return typeof stored === "number"
    ? clamp(stored, SIDE_PANEL_WIDTH.min, SIDE_PANEL_WIDTH.max)
    : SIDE_PANEL_WIDTH.default;
}

function loadOpen(): boolean {
  return readStored(OPEN_KEY) !== false;
}

function loadTab(): SidePanelTab {
  const stored = readStored(TAB_KEY);
  return TABS.includes(stored as SidePanelTab) ? (stored as SidePanelTab) : "sections";
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

/**
 * Layout state of the shell: which panels and dialogs are open, which tab is active. The side
 * panel (open or closed, its tab and its width) comes back as it was left, like a DAW's layout.
 */
export const useUiStore = create<UiState>((set, get) => ({
  sidePanelOpen: loadOpen(),
  sidePanelWidth: loadWidth(),
  sidePanelTab: loadTab(),
  dialog: null,
  exportSource: null,
  mini: false,
  toggleSidePanel: () => {
    const sidePanelOpen = !get().sidePanelOpen;
    set({ sidePanelOpen });
    writeStored(OPEN_KEY, sidePanelOpen);
  },
  setSidePanelTab: (tab) => {
    set({ sidePanelTab: tab, sidePanelOpen: true });
    writeStored(TAB_KEY, tab);
    writeStored(OPEN_KEY, true);
  },
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
