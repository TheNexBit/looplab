export type { ChordDef } from "./chords";
export { CHORDS, chordName, findChord } from "./chords";
export { degreeMap, intervalLabel, reduceToOctave, scaleDegreeLabels } from "./intervals";
export type { Accidental, PitchClass } from "./notes";
export {
  intervalFrom,
  midiName,
  midiToFrequency,
  noteName,
  OCTAVE,
  octaveOf,
  parseMidiNote,
  pitchClass,
  ROOT_CHOICES,
} from "./notes";
export type { ScaleDef } from "./scales";
export { findScale, SCALES, scaleGroups } from "./scales";
export type { MusicalShape, ResolvedShape } from "./shape";
export { DEFAULT_SHAPE, isChordId, resolveShape, shapeCatalogue } from "./shape";
