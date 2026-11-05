import { create } from "zustand";
import { commands, type RecentFile } from "@/lib/bindings";

interface RecentState {
  files: RecentFile[];
  refresh: () => Promise<void>;
  forget: (path: string) => Promise<void>;
}

/** Recently opened tracks, as kept by the Rust side (`recent.rs`). */
export const useRecentStore = create<RecentState>((set, get) => ({
  files: [],
  refresh: async () => {
    const result = await commands.recentFiles();
    if (result.status === "ok") set({ files: result.data });
  },
  forget: async (path) => {
    await commands.forgetRecent(path);
    await get().refresh();
  },
}));
