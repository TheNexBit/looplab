import { create } from "zustand";
import { fetchStemPeaks, type Peaks } from "@/features/waveform/peaks";
import { t } from "@/i18n";
import { type AppError, commands, type StemFile } from "@/lib/bindings";
import { fileNameOf, samePath } from "@/lib/format";

/** One lane of the stems from files: lane 0 is the open track itself. */
export interface StemLane {
  path: string;
  /** What is heard at `t` of the track is at `t + shift` in this file */
  shift: number;
  /** Lined up from the sound; false: it starts with the track (its head shows a warning) */
  linedUp: boolean;
  /** 0..1 */
  level: number;
  mute: boolean;
  solo: boolean;
  /** Its waveform on the track's time; lane 0 draws the track's own */
  peaks: Peaks | null;
}

export const LANE_LEVEL = { min: 0, max: 1, step: 0.01, default: 1 } as const;
/** Most lanes: the open track and eight more files (the engine's `MAX_STEMS`). */
export const MAX_LANES = 9;

interface FileStemsState {
  /** The open track the lanes belong to; null while it plays alone */
  track: string | null;
  lanes: StemLane[];
  /** Files being decoded and lined up */
  loading: boolean;
  error: AppError | null;
  /** What was left out of the last opening (files missing or unreadable, too many files) */
  notice: string | null;
  /**
   * Opens `files` as stems of the open `track` (its own lane first). `saved` brings back the
   * shifts and the mix of a project; files already lined up are not compared again.
   */
  open: (track: string, files: string[], saved?: readonly StemFile[]) => Promise<void>;
  /** More files on new lanes. */
  add: (files: string[]) => Promise<void>;
  /** Takes a lane away (the open track's own stays). */
  remove: (index: number) => Promise<void>;
  /** Back to the open track alone. */
  close: () => Promise<void>;
  /** Forgets the lanes without telling the engine (a new track opened: it forgot them itself). */
  forget: () => void;
  dismissNotice: () => void;
  setLevel: (index: number, level: number) => void;
  toggleMute: (index: number) => void;
  /** The S key of a lane: on or off, like Reaper's (several lanes can be soloed together). */
  toggleSolo: (index: number) => void;
  /** «Listen»: lane `index` alone, or every lane with `null` (no solo, no mute). */
  listenTo: (index: number | null) => void;
  /** What «Listen» shows next (all → first → second… → all), without stopping. */
  cycleSolo: () => void;
}

const clampLevel = (level: number) =>
  Number.isFinite(level) ? Math.min(LANE_LEVEL.max, Math.max(LANE_LEVEL.min, level)) : 1;

/** The level the engine gets for each lane: with any solo only the soloed ones, a mute silences. */
export function laneGains(lanes: readonly Pick<StemLane, "level" | "mute" | "solo">[]): number[] {
  const soloing = lanes.some((lane) => lane.solo);
  return lanes.map((lane) => (lane.mute || (soloing && !lane.solo) ? 0 : lane.level));
}

/** Whether lane `index` is heard (for drawing it in colour or grey). */
export const laneHeard = (lanes: readonly StemLane[], index: number) =>
  (laneGains(lanes)[index] ?? 0) > 0;

/**
 * What «Listen» shows: the lane heard alone (`index`), every lane (`null`: no solo and no
 * mute), or `undefined` when the mix is anything else (no single choice is lit, so the lit
 * choice is always what is heard).
 */
export function listening(
  lanes: readonly Pick<StemLane, "solo" | "mute">[],
): number | null | undefined {
  const soloed = lanes.flatMap((lane, i) => (lane.solo ? [i] : []));
  if (soloed.length === 0) return lanes.some((lane) => lane.mute) ? undefined : null;
  const only = soloed[0];
  return soloed.length === 1 && only !== undefined && !lanes[only]?.mute ? only : undefined;
}

/** What comes next in «Listen»: all → first lane → second… → last → all again. */
export function nextSolo(lanes: readonly Pick<StemLane, "solo" | "mute">[]): number | null {
  const now = listening(lanes);
  if (now === null || now === undefined) return 0;
  return now + 1 < lanes.length ? now + 1 : null;
}

const titleOf = (path: string) => {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};
const extensionOf = (path: string) => {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/**
 * Short names that tell the lanes apart: the words every file starts with are left out
 * («Shifting Sands Solo» and «Shifting Sands Solo Backing» → «Shifting Sands Solo», «Backing»).
 * Two lanes left with the same name get their file type, then their number («Solo (mp3)»).
 */
export function laneLabels(paths: readonly string[]): string[] {
  const titles = paths.map(titleOf);
  const words = titles.map((title) => title.split(/[\s_-]+/).filter(Boolean));
  let common = 0;
  const shortest = Math.min(...words.map((w) => w.length));
  while (
    common < shortest &&
    words.every((w) => w[common]?.toLowerCase() === words[0]?.[common]?.toLowerCase())
  ) {
    common += 1;
  }
  const labels = titles.map((title, i) => (words[i] ?? []).slice(common).join(" ") || title);
  const twice = (list: string[], i: number) =>
    list.filter((label) => label.toLowerCase() === list[i]?.toLowerCase()).length > 1;
  const typed = labels.map((label, i) =>
    twice(labels, i) && extensionOf(paths[i] ?? "")
      ? `${label} (${extensionOf(paths[i] ?? "")})`
      : label,
  );
  return typed.map((label, i) => (twice(typed, i) ? `${label} ${i + 1}` : label));
}

/** The lanes as saved in the project. */
export const savedLanes = (lanes: readonly StemLane[]): StemFile[] =>
  lanes.map(({ path, shift, level, mute, solo, linedUp }) => ({
    path,
    shift,
    level,
    mute,
    solo,
    linedUp,
  }));

/** Why a file was left out, in the words of the app's error messages. */
const reason = (kind: AppError["kind"]) => t.errors[kind] ?? t.fileStems.unreadable;

let openToken = 0;
/** Called after the stems are closed by hand (the separated tracks of the song come back). */
let afterClose: (() => void) | null = null;
export function onStemsClosed(listener: () => void) {
  afterClose = listener;
}

/** Stems from files of the open track, like Song Master's «Open as stems» (`file_stems.rs`). */
export const useFileStemsStore = create<FileStemsState>((set, get) => {
  const editLane = (index: number, change: (lane: StemLane) => StemLane) =>
    set({ lanes: get().lanes.map((lane, i) => (i === index ? change(lane) : lane)) });

  const open: FileStemsState["open"] = async (track, files, saved = []) => {
    const wanted = files.filter((path) => !samePath(path, track));
    const others = wanted.slice(0, MAX_LANES - 1);
    if (others.length === 0) {
      await get().close();
      return;
    }
    const token = ++openToken;
    set({ loading: true, error: null, notice: null });
    const find = (path: string) => saved.find((lane) => samePath(lane.path, path));
    const result = await commands.openStemFiles(
      track,
      others.map((path) => ({
        path,
        shift: find(path)?.shift ?? null,
        linedUp: find(path)?.linedUp ?? null,
      })),
    );
    if (token !== openToken) return;
    if (result.status === "error") {
      set({ loading: false, error: result.error });
      return;
    }
    const { lanes: opened, failed } = result.data;
    const notes = [
      ...failed.map((f) => t.fileStems.leftOut(fileNameOf(f.path), reason(f.kind))),
      ...(wanted.length > others.length
        ? [t.fileStems.tooMany(MAX_LANES - 1, wanted.length - others.length)]
        : []),
    ];
    const notice = notes.length > 0 ? notes.join(" · ") : null;
    if (opened.length === 0) {
      set({ track: null, lanes: [], loading: false, notice });
      return;
    }
    const peaks = await Promise.all(opened.map((_, i) => fetchStemPeaks(i).catch(() => null)));
    if (token !== openToken) return;
    // The track's own lane: its mix is the first saved lane (whatever its path was then)
    const own = saved[0];
    const mix = (lane: StemFile | undefined) => ({
      level: clampLevel(lane?.level ?? 1),
      mute: lane?.mute ?? false,
      solo: lane?.solo ?? false,
    });
    set({
      track,
      loading: false,
      notice,
      lanes: [
        { path: track, shift: 0, linedUp: true, peaks: null, ...mix(own) },
        ...opened.map((lane, i) => ({
          path: lane.path,
          shift: lane.shift ?? 0,
          linedUp: lane.linedUp,
          peaks: peaks[i] ?? null,
          ...mix(find(lane.path)),
        })),
      ],
    });
  };

  return {
    track: null,
    lanes: [],
    loading: false,
    error: null,
    notice: null,
    open,
    add: async (files) => {
      const { track, lanes } = get();
      if (!track) return;
      const fresh = files.filter((path) => !lanes.some((lane) => samePath(lane.path, path)));
      await open(track, [...lanes.slice(1).map((lane) => lane.path), ...fresh], savedLanes(lanes));
    },
    remove: async (index) => {
      const { track, lanes } = get();
      if (!track || index === 0) return;
      const kept = lanes.filter((_, i) => i !== index);
      // The last other file goes: back to the track alone, at full level
      if (kept.length < 2) {
        await get().close();
        return;
      }
      await open(
        track,
        kept.slice(1).map((lane) => lane.path),
        savedLanes(kept),
      );
    },
    close: async () => {
      openToken += 1;
      const had = get().lanes.length > 0;
      set({ track: null, lanes: [], loading: false, error: null });
      if (had) {
        await commands.closeStemFiles();
        afterClose?.();
      }
    },
    forget: () => {
      openToken += 1;
      set({ track: null, lanes: [], loading: false, error: null, notice: null });
    },
    dismissNotice: () => set({ notice: null }),
    setLevel: (index, level) => editLane(index, (lane) => ({ ...lane, level: clampLevel(level) })),
    toggleMute: (index) => editLane(index, (lane) => ({ ...lane, mute: !lane.mute })),
    toggleSolo: (index) => editLane(index, (l) => ({ ...l, solo: !l.solo })),
    listenTo: (index) =>
      set({
        lanes: get().lanes.map((l, i) => ({
          ...l,
          solo: i === index,
          // «All» means every lane heard; the lane chosen alone is heard even if it was muted
          mute: index === null || i === index ? false : l.mute,
        })),
      }),
    cycleSolo: () => {
      const lanes = get().lanes;
      if (lanes.length > 1) get().listenTo(nextSolo(lanes));
    },
  };
});
