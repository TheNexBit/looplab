import { create } from "zustand";

export type SidePanelTab = "sections" | "eq" | "practice";
export type Dialog = "palette" | "settings" | "about" | "diary";

interface UiState {
  sidePanelOpen: boolean;
  sidePanelTab: SidePanelTab;
  /** The modal window on screen, if any */
  dialog: Dialog | null;
  toggleSidePanel: () => void;
  setSidePanelTab: (tab: SidePanelTab) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
}

/** Layout state of the shell: which panels and dialogs are open, which tab is active. */
export const useUiStore = create<UiState>((set) => ({
  sidePanelOpen: true,
  sidePanelTab: "sections",
  dialog: null,
  toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),
  setSidePanelTab: (tab) => set({ sidePanelTab: tab, sidePanelOpen: true }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));
