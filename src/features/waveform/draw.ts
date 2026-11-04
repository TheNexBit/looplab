import { formatTick } from "@/lib/time";
import { type Peaks, pickLevel } from "./peaks";

/** Part of the track to draw. Times in seconds, sizes in device pixels. */
export interface Viewport {
  start: number;
  span: number;
  width: number;
  height: number;
  /** Vertical offset of the waveform band (leaves room for the ruler) */
  top?: number;
}

/** Draws min/max bars, one per device pixel. Cost depends on the width, not on the track. */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Peaks,
  view: Viewport,
  color: string,
) {
  const top = view.top ?? 0;
  const bandHeight = view.height - top;
  const middle = top + bandHeight / 2;
  const scale = ((bandHeight / 2) * 0.92) / 127;

  const framesPerPixel = (view.span * peaks.sampleRate) / view.width;
  const level = pickLevel(peaks, framesPerPixel);
  const bins = level.data.length / 2;
  const startFrame = view.start * peaks.sampleRate;

  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = 0; x < view.width; x++) {
    const from = startFrame + x * framesPerPixel;
    const first = Math.floor(from / level.binFrames);
    if (first >= bins) break;
    if (first < 0) continue;
    const last = Math.min(
      bins,
      Math.max(first + 1, Math.floor((from + framesPerPixel) / level.binFrames)),
    );
    let lo = 127;
    let hi = -127;
    for (let bin = first; bin < last; bin++) {
      lo = Math.min(lo, level.data[bin * 2] ?? 0);
      hi = Math.max(hi, level.data[bin * 2 + 1] ?? 0);
    }
    const y = middle - hi * scale;
    ctx.rect(x, y, 1, Math.max(1, (hi - lo) * scale));
  }
  ctx.fill();
}

/** Tick spacings, in seconds, from fine to coarse. */
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIN_TICK_GAP_CSS = 90;

/** Time ruler with labels along the top `height` device pixels. */
export function drawRuler(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  dpr: number,
  colors: { tick: string; label: string },
) {
  const pixelsPerSecond = view.width / view.span;
  const step =
    TICK_STEPS.find((s) => s * pixelsPerSecond >= MIN_TICK_GAP_CSS * dpr) ??
    TICK_STEPS.at(-1) ??
    60;
  const height = view.top ?? 0;

  ctx.fillStyle = colors.tick;
  ctx.font = `${11 * dpr}px system-ui, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  // Integer tick index: adding `step` repeatedly would drift (0.1 + 0.2 ≠ 0.3)
  const last = Math.floor((view.start + view.span) / step);
  for (let tick = Math.ceil(view.start / step); tick <= last; tick++) {
    const time = tick * step;
    const x = Math.round((time - view.start) * pixelsPerSecond);
    ctx.fillStyle = colors.tick;
    ctx.fillRect(x, height - 5 * dpr, Math.max(1, dpr), 5 * dpr);
    ctx.fillStyle = colors.label;
    ctx.fillText(formatTick(time, step < 1), x + 4 * dpr, height / 2 - dpr);
  }
}
