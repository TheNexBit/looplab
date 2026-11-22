import { create } from "zustand";
import {
  type AppError,
  commands,
  type LessonChoice_Deserialize,
  type LessonLibrary_Serialize,
} from "@/lib/bindings";
import { usePlayerStore } from "./player";

interface LessonsState {
  library: LessonLibrary_Serialize;
  /** The course folders are being read again */
  scanning: boolean;
  /** The Home is shown over the open track */
  open: boolean;
  query: string;
  error: AppError | null;
  setQuery: (query: string) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** The kept listing at once, then the folders read again in the background. */
  refresh: () => Promise<void>;
  scan: () => Promise<void>;
  addRoot: (path: string) => Promise<void>;
  removeRoot: (path: string) => Promise<void>;
  choose: (id: string, choice: LessonChoice_Deserialize) => Promise<void>;
}

type Result = Awaited<ReturnType<typeof commands.lessonLibrary>>;

/** The lesson Home: course folders and their lessons, as kept by Rust (`lessons.rs`). */
export const useLessonsStore = create<LessonsState>((set, get) => {
  const take = (result: Result) => {
    if (result.status === "ok") set({ library: result.data, error: null });
    else set({ error: result.error });
  };
  return {
    library: { roots: [], lessons: [] },
    scanning: false,
    open: false,
    query: "",
    error: null,
    setQuery: (query) => set({ query }),
    setOpen: (open) => set({ open }),
    toggle: () => set({ open: !get().open }),
    refresh: async () => {
      take(await commands.lessonLibrary());
      await get().scan();
    },
    scan: async () => {
      if (get().scanning || get().library.roots.length === 0) return;
      set({ scanning: true });
      try {
        take(await commands.scanLessons());
      } finally {
        set({ scanning: false });
      }
    },
    addRoot: async (path) => {
      set({ scanning: true });
      try {
        take(await commands.addLessonRoot(path));
      } finally {
        set({ scanning: false });
      }
    },
    removeRoot: async (path) => take(await commands.removeLessonRoot(path)),
    choose: async (id, choice) => take(await commands.setLessonChoice(id, choice)),
  };
});

// Whatever opens a track leaves the Home
usePlayerStore.subscribe((state, previous) => {
  if (state.load !== previous.load && state.load.kind === "loading") {
    useLessonsStore.getState().setOpen(false);
  }
});
