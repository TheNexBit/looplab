import { create } from "zustand";

export type SidePanelTab = "sections" | "eq";

interface UiState {
  sidePanelOpen: boolean;
  sidePanelTab: SidePanelTab;
  toggleSidePanel: () => void;
  setSidePanelTab: (tab: SidePanelTab) => void;
}

/** Layout state of the shell: which panels are open, which tab is active. */
export const useUiStore = create<UiState>((set) => ({
  sidePanelOpen: true,
  sidePanelTab: "sections",
  toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),
  setSidePanelTab: (tab) => set({ sidePanelTab: tab }),
}));
