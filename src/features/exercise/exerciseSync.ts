import { isVideoPath } from "@/features/library/formats";
import { adoptSharedProject } from "@/features/markers/projectSync";
import { commands, type Exercise } from "@/lib/bindings";
import { samePath } from "@/lib/format";
import { anglesOf, type ExerciseFile, fileOf, linedUp, useExerciseStore } from "@/stores/exercise";
import { usePlayerStore } from "@/stores/player";
import { useVideoStore } from "@/stores/video";

/** «Sposta» steps: one video frame (at 30 fps) and a tenth of a second. */
export const FRAME_STEP = 1 / 30;
export const COARSE_STEP = 0.1;

/** The open track, as this module last saw it. */
let track: string | null = null;

const store = () => useExerciseStore.getState();

/** Seconds to add to the track's time for the same moment in the file at `path` (null: unknown). */
export function shiftTo(path: string | null): number | null {
  if (!path || !track) return null;
  if (samePath(path, track)) return 0;
  const { exercise } = store();
  const own = fileOf(exercise, track);
  const other = fileOf(exercise, path);
  if (!linedUp(own) || !linedUp(other)) return null;
  return (other.shift ?? 0) - (own.shift ?? 0);
}

function showAngle(path: string | null) {
  store().set({ angle: path });
  useVideoStore.getState().setShift(shiftTo(path) ?? 0);
}

/** The angles that can be shown: those of another take of the lesson are left out. */
const usableAngles = (exercise: Exercise | null) =>
  anglesOf(exercise).filter((f) => f.lineUp !== "mismatch");

function pickAngle(exercise: Exercise, path: string, first: boolean): string | null {
  const angles = usableAngles(exercise);
  // At the opening the angle chosen last time wins over the track's own picture
  const remembered = angles.find((f) => samePath(f.path, exercise.angle));
  if (first && remembered) return remembered.path;
  const current = store().angle;
  if (current && angles.some((f) => samePath(f.path, current))) return current;
  if (remembered) return remembered.path;
  if (isVideoPath(path)) return path;
  return angles[0]?.path ?? null;
}

/** Takes in a new version of the exercise: the angle and the picture's shift follow it. */
function adopt(exercise: Exercise, path: string, first = false) {
  store().set({ exercise });
  showAngle(pickAngle(exercise, path, first));
}

async function align(path: string, redo: string | null) {
  store().set({ aligning: true });
  const result = await commands.alignExercise(path, redo);
  if (track !== path) return;
  store().set({ aligning: false });
  if (result.status === "error") {
    usePlayerStore.getState().reportError(path, result.error);
    return;
  }
  if (!result.data) return;
  adopt(result.data.exercise, path);
  // Another file of the take had a newer score sync, markers or loops: now this track's too
  if (result.data.project) adoptSharedProject(path, result.data.project);
}

async function follow(path: string) {
  track = path;
  store().set({ exercise: null, aligning: false });
  showAngle(isVideoPath(path) ? path : null);
  const opened = await commands.openExercise(path);
  if (track !== path || opened.status === "error" || !opened.data) return;
  adopt(opened.data, path, true);
  if (opened.data.files.some((f) => f.lineUp === "pending")) await align(path, null);
}

async function save(exercise: Exercise) {
  const path = track;
  if (!path) return;
  const result = await commands.saveExercise(path, exercise);
  if (result.status !== "ok" || track !== path) return;
  adopt(result.data.exercise, path);
  // A file moved by hand: the shared times of this track follow
  if (result.data.project) adoptSharedProject(path, result.data.project);
}

/** Changes one file of the take and saves it. */
function change(path: string, edit: (file: ExerciseFile) => ExerciseFile) {
  const { exercise } = store();
  if (!exercise) return;
  void save({
    ...exercise,
    files: exercise.files.map((f) => (samePath(f.path, path) ? edit(f) : f)),
  });
}

/** Shows that angle (remembered for the lesson). */
export function chooseAngle(path: string) {
  const { exercise } = store();
  if (!exercise) return;
  showAngle(path);
  void save({ ...exercise, angle: path });
}

/** Angle number `index` (0-based) of the take, as with Ctrl+1…9. */
export function angleByIndex(index: number) {
  const angle = usableAngles(store().exercise)[index];
  if (angle) chooseAngle(angle.path);
}

/** The next angle of the take, round. */
export function nextAngle() {
  const angles = usableAngles(store().exercise);
  if (angles.length < 2) return;
  const at = angles.findIndex((f) => samePath(f.path, store().angle));
  const next = angles[(at + 1) % angles.length];
  if (next) chooseAngle(next.path);
}

/** Moves a file by hand against the others (`seconds` later in it). */
export function nudge(path: string, seconds: number) {
  if (samePath(path, track)) return;
  change(path, (f) => ({
    ...f,
    shift: Math.round(((f.shift ?? 0) + seconds) * 10000) / 10000,
    lineUp: "hand",
  }));
}

/** Compares that file's sound with the take again. */
export function realign(path: string) {
  if (track) void align(track, path);
}

export function renameTake(path: string, name: string) {
  change(path, (f) => ({ ...f, name }));
}

/** Follows the open track. Started once by the app shell; returns the function that stops it. */
export function followExercise(): () => void {
  return usePlayerStore.subscribe((state, previous) => {
    if (state.track && state.track.path !== previous.track?.path) void follow(state.track.path);
  });
}
