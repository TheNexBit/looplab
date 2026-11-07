import { CHORDS, findChord } from "./chords";
import { degreeMap, intervalLabel, scaleDegreeLabels } from "./intervals";
import { type PitchClass, pitchClass } from "./notes";
import { findScale, SCALES } from "./scales";

/**
 * A root plus something to play on it — the one thing the rest of the app
 * passes around.
 *
 * Deliberately a *reference* (`kind` + `id`) rather than a copy of the interval
 * set. A practice routine's block stores one of these, and a block written last
 * month must still mean the same scale after the definition behind it has been
 * corrected.
 */
export interface MusicalShape {
  root: PitchClass;
  kind: "scale" | "chord";
  id: string;
}

export interface ResolvedShape {
  shape: MusicalShape;
  name: string;
  intervals: number[];
  /** Degree name per interval, in the same order. */
  labels: string[];
  /** Which pitch class is which degree — what the neck actually asks for. */
  degrees: Map<PitchClass, string>;
}

export const DEFAULT_SHAPE: MusicalShape = { root: 9, kind: "scale", id: "minor-pentatonic" };

/**
 * Turns a reference into the notes it means, or `null` if it names nothing.
 *
 * `null` rather than a fallback on purpose: silently substituting a different
 * scale would have the neck teach one thing while the label said another, and
 * that is the single worst thing a diagram can do.
 */
export function resolveShape(shape: MusicalShape): ResolvedShape | null {
  const root = pitchClass(shape.root);

  if (shape.kind === "scale") {
    const scale = findScale(shape.id);
    if (!scale) return null;
    const labels = scaleDegreeLabels(scale.intervals);
    return {
      shape: { ...shape, root },
      name: scale.name,
      intervals: scale.intervals,
      labels,
      degrees: degreeMap(root, scale.intervals, labels),
    };
  }

  const chord = findChord(shape.id);
  if (!chord) return null;
  const labels = chord.intervals.map(intervalLabel);
  return {
    shape: { ...shape, root },
    name: chord.name,
    intervals: chord.intervals,
    labels,
    degrees: degreeMap(root, chord.intervals, labels),
  };
}

/** Every shape that can be named, for a picker. Scales first, then chords. */
export function shapeCatalogue(): { group: string; items: { id: string; name: string }[] }[] {
  const groups = new Map<string, { id: string; name: string }[]>();
  const push = (group: string, item: { id: string; name: string }) => {
    const list = groups.get(group);
    if (list) list.push(item);
    else groups.set(group, [item]);
  };

  for (const scale of SCALES) push(scale.group, { id: scale.id, name: scale.name });
  for (const chord of CHORDS) {
    push(chord.group, { id: chord.id, name: `${chord.name} (${chord.symbol || "maj"})` });
  }

  return [...groups].map(([group, items]) => ({ group, items }));
}

/** True when `id` names a chord rather than a scale — how a picker tells them apart. */
export function isChordId(id: string): boolean {
  return CHORDS.some((chord) => chord.id === id);
}
