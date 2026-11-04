import { invoke } from "@tauri-apps/api/core";

/**
 * Reader of the binary waveform data built by `crates/audio-engine/src/peaks.rs`.
 * Layout (little-endian): u32 sampleRate, u32 levelCount, then per level
 * u32 binFrames, u32 bins, i8[bins * 2] as interleaved (min, max).
 */
export interface PeakLevel {
  binFrames: number;
  /** Interleaved (min, max) per bin, ±127 = loudest peak of the song */
  data: Int8Array;
}

export interface Peaks {
  sampleRate: number;
  /** From finest to coarsest */
  levels: PeakLevel[];
}

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
  return { sampleRate, levels };
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
