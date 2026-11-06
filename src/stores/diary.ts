import { create } from "zustand";
import { commands } from "@/lib/bindings";

/** One day of practice of one track, with every number guaranteed. */
export interface DiaryRecord {
  /** Local date, "2026-11-06" */
  day: string;
  path: string;
  name: string;
  seconds: number;
  maxSpeed: number;
}

interface DiaryState {
  entries: DiaryRecord[];
  refresh: () => Promise<void>;
}

const num = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The practice diary, as last read from disk. */
export const useDiaryStore = create<DiaryState>((set) => ({
  entries: [],
  refresh: async () => {
    const result = await commands.practiceDiary();
    if (result.status === "ok") {
      set({
        entries: result.data.map((e) => ({
          ...e,
          seconds: num(e.seconds),
          maxSpeed: num(e.maxSpeed),
        })),
      });
    }
  },
}));
