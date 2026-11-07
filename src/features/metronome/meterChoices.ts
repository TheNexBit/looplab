/**
 * Choices offered by the metronome screen: the meters, the ways of grouping a bar, the
 * Italian tempo marking of a BPM, and what the readout says about a position.
 */

/** Plain meters, as most players count them. */
export const COMMON_METERS: readonly (readonly [number, 2 | 4 | 8 | 16])[] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
];

/** Group sizes a grouping is made of: a felt beat of 2, 3 or 4 pulses. */
const PARTS = [2, 3, 4] as const;
/** At most this many groupings in the menu: past it the list stops being readable. */
const MAX_CHOICES = 16;

/**
 * Ways of grouping `beats` pulses into felt beats (7 → 3+4, 4+3, 2+2+3, 2+3+2, 3+2+2…),
 * fewest groups first. Bars of 4 or less have nothing to group.
 */
export function groupingChoices(beats: number): number[][] {
  if (beats <= 4) return [];
  const found: number[][] = [];
  const walk = (left: number, parts: number[]) => {
    if (found.length > 200) return;
    if (left === 0) {
      if (parts.length > 1) found.push(parts);
      return;
    }
    for (const part of PARTS) if (part <= left) walk(left - part, [...parts, part]);
  };
  walk(beats, []);
  return found
    .sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()))
    .slice(0, MAX_CHOICES);
}

/** Italian tempo marking of a tempo in quarter notes per minute. */
export function tempoMarking(bpm: number): string {
  const marks: [number, string][] = [
    [40, "Grave"],
    [60, "Largo"],
    [66, "Larghetto"],
    [76, "Adagio"],
    [108, "Andante"],
    [120, "Moderato"],
    [168, "Allegro"],
    [176, "Vivace"],
    [200, "Presto"],
  ];
  return marks.find(([below]) => bpm < below)?.[1] ?? "Prestissimo";
}

/** Where a position falls: bar (from 1; 0 or less during the count-in) and pulse in it. */
export function barAndPulse(pulses: number, beats: number): { bar: number; pulse: number } {
  const whole = Math.floor(pulses + 1e-9);
  return {
    bar: Math.floor(whole / beats) + 1,
    pulse: ((whole % beats) + beats) % beats,
  };
}

/** "3:07" from seconds. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
