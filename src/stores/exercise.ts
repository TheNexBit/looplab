import { create } from "zustand";
import type { Exercise, ExerciseFile } from "@/lib/bindings";
import { samePath } from "@/lib/format";

export type { Exercise, ExerciseFile };

interface ExerciseState {
  /** The files of the open track's take (null: the track is alone) */
  exercise: Exercise | null;
  /** The files are being compared to line them up */
  aligning: boolean;
  /** Path of the video on screen (an angle of the take, or the track itself) */
  angle: string | null;
  set: (patch: Partial<Omit<ExerciseState, "set">>) => void;
}

/** The take of the open track: its files and the angle shown. */
export const useExerciseStore = create<ExerciseState>((set) => ({
  exercise: null,
  aligning: false,
  angle: null,
  set: (patch) => set(patch),
}));

/** The file of the take at `path`. */
export const fileOf = (exercise: Exercise | null, path: string | null) =>
  exercise?.files.find((f) => samePath(f.path, path)) ?? null;

/** The shift can carry times to and from this file. */
export const linedUp = (file: ExerciseFile | null): file is ExerciseFile =>
  file !== null && (file.lineUp === "sound" || file.lineUp === "hand");

/** The video files of the take: its camera angles, in order. */
export const anglesOf = (exercise: Exercise | null): ExerciseFile[] =>
  exercise?.files.filter((f) => f.kind === "video") ?? [];
