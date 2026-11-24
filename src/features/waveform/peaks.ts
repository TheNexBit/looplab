import { invoke } from "@tauri-apps/api/core";

/**
 * Reader of the binary waveform data built by `crates/audio-engine/src/peaks.rs`.
 * Layout (little-endian): u32 sampleRate, u32 levelCount, then per level
 * u32 binFrames, u32 bins, i8[bins * 2] as interleaved (min, max).
 */
interface PeakLevel {
  binFrames: number;
  /** Interleaved (min, max) per bin, ±127 = full scale (`Peaks.gain` enlarges quiet songs) */
  data: Int8Array;
}

export interface Peaks {
  sampleRate: number;
  /** From finest to coarsest */
  levels: PeakLevel[];
  /** Multiplier that brings the loudest peak to full height: quiet songs are drawn as tall */
  gain: number;
}

/** Most a quiet song is enlarged: silence must not turn noise into a full waveform. */
const MAX_GAIN = 8;

export function parsePeaks(buffer: ArrayBuffer): Peaks {
  const view = new DataView(buffer);
  const sampleRate = view.getUint32(0, true);
  const count = view.getUint32(4, true);
  const levels: PeakLevel[] = [];
  let offset = 8;
  for (let i = 0; i < count; i++) {
    const binFrames = view.getUint32(offset, true);
    const bins = view.getUint32(offset + 4, true);
    levels.push({ binFrames, data: new Int8Array(buffer, offset + 8, bins * 2) });
    offset += 8 + bins * 2;
  }
  // Values are on a fixed scale (±127 = full scale); the coarsest level holds the loudest peak
  let loudest = 0;
  for (const value of levels.at(-1)?.data ?? []) loudest = Math.max(loudest, Math.abs(value));
  const gain = loudest > 0 ? Math.min(MAX_GAIN, 127 / loudest) : 1;
  return { sampleRate, levels, gain };
}

/** Coarsest level that still has at least one bin per pixel. */
export function pickLevel(peaks: Peaks, framesPerPixel: number): PeakLevel {
  let best = peaks.levels[0];
  for (const level of peaks.levels) {
    if (level.binFrames <= framesPerPixel) best = level;
  }
  if (!best) throw new Error("Waveform data has no levels");
  return best;
}

/**
 * Not in the generated bindings: tauri-specta cannot type raw binary responses.
 * Must match `GET_PEAKS` in `src-tauri/src/commands/waveform.rs`.
 */
const GET_PEAKS = "get_peaks";

export async function fetchPeaks(): Promise<Peaks> {
  return parsePeaks(await invoke<ArrayBuffer>(GET_PEAKS));
}

/** Must match `GET_STEM_PEAKS` in `src-tauri/src/commands/waveform.rs`. */
const GET_STEM_PEAKS = "get_stem_peaks";

/** Waveform of lane `index` of the stems from files (already moved onto the track's time). */
export async function fetchStemPeaks(index: number): Promise<Peaks> {
  return parsePeaks(await invoke<ArrayBuffer>(GET_STEM_PEAKS, { index }));
}
