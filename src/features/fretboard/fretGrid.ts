import { type PitchClass, pitchClass } from "@/lib/music";

export const MIN_FRETS = 12;
export const MAX_FRETS = 24;

/** Where the dots are inlaid on a neck. Two at the octave and at the double. */
export const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
export const DOUBLE_INLAYS = [12, 24];

/** One note of the shape, found at one place on the neck. */
interface FretMark {
  /** Index into the tuning, so 0 is the lowest string. */
  string: number;
  /** 0 is the open string. */
  fret: number;
  midi: number;
  pc: PitchClass;
  /** What this note is called in the shape: "R", "♭3", "9". */
  degree: string;
  isRoot: boolean;
  /** False when the fret falls outside the position being studied. */
  inWindow: boolean;
}

/**
 * Every place on the neck where the shape's notes fall.
 *
 * The whole of it, every time — the window only decides what is *drawn* faintly,
 * never what exists. A diagram that hid the rest of the neck would teach a
 * position as an island, which is exactly the habit that makes players unable to
 * leave the fifth fret.
 *
 * Pure: a tuning, a set of degrees and a fret count in, marks out. Nothing here
 * knows what a scale is, only which pitch classes were asked for.
 */
export function marksFor(
  strings: number[],
  degrees: Map<PitchClass, string>,
  frets: number,
  window: { from: number; span: number },
): FretMark[] {
  const marks: FretMark[] = [];
  const windowed = window.span > 0;
  const to = window.from + window.span - 1;

  strings.forEach((open, string) => {
    for (let fret = 0; fret <= frets; fret += 1) {
      const midi = open + fret;
      const pc = pitchClass(midi);
      const degree = degrees.get(pc);
      if (degree === undefined) continue;
      marks.push({
        string,
        fret,
        midi,
        pc,
        degree,
        isRoot: degree === "R",
        // An open string belongs to every position: it is played from wherever
        // the hand already is, which is most of the point of an open string.
        inWindow: !windowed || fret === 0 || (fret >= window.from && fret <= to),
      });
    }
  });

  return marks;
}

/** Marks indexed by string, so a row can be drawn without scanning the list. */
export function byString(marks: FretMark[], strings: number): (FretMark | null)[][] {
  const rows: (FretMark | null)[][] = Array.from({ length: strings }, () => []);
  for (const mark of marks) {
    const row = rows[mark.string];
    if (row) row[mark.fret] = mark;
  }
  return rows;
}

/** Keeps a position window inside the neck as the neck or the span changes. */
export function clampWindow(from: number, span: number, frets: number): number {
  if (span <= 0) return 1;
  return Math.min(Math.max(1, from), Math.max(1, frets - span + 1));
}
