import { METRONOME_BPM } from "@/stores/metronome";

/**
 * The tempo dial's geometry, from MetroFlow's `dial-geometry.ts`: one place for the gauge,
 * the beat pulse that lights copies of its arcs and the − / + seated in its opening.
 */

/** The viewBox the whole dial is drawn in; everything below is in these units. */
export const SIZE = 300;
export const C = SIZE / 2;
export const RADIUS = 116;

/**
 * The scale spans 300° with a 60° gap centred on six o'clock, so the ring opens downward
 * like a gauge. Screen angles: 0° points right and they grow clockwise.
 */
export const SWEEP_DEG = 300;
export const START_DEG = 120;
export const END_DEG = (START_DEG + SWEEP_DEG) % 360;
export const SPAN = METRONOME_BPM.max - METRONOME_BPM.min;

export const angleOf = (bpm: number) =>
  START_DEG +
  SWEEP_DEG *
    ((Math.min(Math.max(bpm, METRONOME_BPM.min), METRONOME_BPM.max) - METRONOME_BPM.min) / SPAN);

const rad = (deg: number) => (deg * Math.PI) / 180;

export const polar = (r: number, deg: number): [number, number] => [
  C + r * Math.cos(rad(deg)),
  C + r * Math.sin(rad(deg)),
];

/** SVG arc between two angles on a circle of radius `r`. */
export function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(r, fromDeg);
  const [x2, y2] = polar(r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Thickness of the − / + shoulders: wider than the ring, they are meant to be hit. */
export const SHOULDER_STROKE = 18;
const SHOULDER_DEG = 20;
const SHOULDER_CLEAR = 3;

/** − beside the start of the scale (bottom left), + beside its end (bottom right). */
export const SLOWER_ARC: [number, number] = [
  START_DEG - SHOULDER_CLEAR - SHOULDER_DEG,
  START_DEG - SHOULDER_CLEAR,
];
export const FASTER_ARC: [number, number] = [
  END_DEG + SHOULDER_CLEAR,
  END_DEG + SHOULDER_CLEAR + SHOULDER_DEG,
];

export const shoulderCentre = (arc: [number, number]) => polar(RADIUS, (arc[0] + arc[1]) / 2);

/** Ten-BPM ticks, taller and numbered every fifty (and at the ends of the scale). */
export const TICKS = (() => {
  const ticks: { value: number; major: boolean }[] = [];
  for (let value = METRONOME_BPM.min; value <= METRONOME_BPM.max; value += 10) {
    ticks.push({ value, major: value % 50 === 0 });
  }
  return ticks;
})();
