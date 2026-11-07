import { type PointerEvent, useEffect, useRef, type WheelEvent } from "react";
import { useCanvas } from "@/features/waveform/useCanvas";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { followPointer } from "@/lib/followPointer";
import { themeColor } from "@/lib/theme";
import { clamp } from "@/lib/time";
import { eqToRust, GAIN, hasGain, Q, useEqStore } from "@/stores/eq";
import { sectionColor } from "@/stores/markers";
import {
  CURVE_POINTS,
  formatFrequency,
  frequencyToX,
  gainToY,
  xToFrequency,
  yToGain,
} from "./scale";

const GRID_FREQUENCIES = [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000];
const GRID_GAINS = [-12, -6, 0, 6, 12];

/**
 * Frequency response of the EQ, computed by the engine itself, with one handle per band:
 * drag a handle to change frequency and gain, use the wheel on it to change Q.
 */
export function EqCurve() {
  const settings = useEqStore((s) => s.settings);
  const response = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { width, height, dpr } = size.current;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = themeColor("grid");
    for (const hz of GRID_FREQUENCIES)
      ctx.fillRect(Math.round(frequencyToX(hz) * width), 0, dpr, height);
    for (const db of GRID_GAINS)
      ctx.fillRect(0, Math.round(gainToY(db) * height), width, db === 0 ? 2 * dpr : dpr);

    const points = response.current;
    if (points.length === 0) return;
    ctx.strokeStyle = themeColor(useEqStore.getState().settings.bypass ? "fg-subtle" : "accent");
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    points.forEach((db, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = gainToY(clamp(db, GAIN.min, GAIN.max)) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  const { ref: canvasRef, size } = useCanvas(draw);

  // The engine computes the curve, so the picture always matches what is heard.
  // Runs after every render: the component only re-renders when the settings change
  useEffect(() => {
    if (settings.bands.length === 0) return;
    let current = true;
    void commands.eqResponse(eqToRust(settings), CURVE_POINTS).then((values) => {
      if (!current) return;
      response.current = values.map((v) => v ?? 0);
      draw();
    });
    return () => {
      current = false;
    };
  });

  const dragBand = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const area = containerRef.current;
    if (!area || event.button !== 0) return;
    followPointer(event, (e) => {
      const rect = area.getBoundingClientRect();
      const band = useEqStore.getState().settings.bands[index];
      if (!band) return;
      useEqStore.getState().setBand(index, {
        frequency: Math.round(xToFrequency((e.clientX - rect.left) / rect.width)),
        ...(hasGain(band.kind)
          ? { gain: Math.round(yToGain((e.clientY - rect.top) / rect.height) * 2) / 2 }
          : {}),
      });
    });
  };

  const widenBand = (index: number, event: WheelEvent) => {
    const band = useEqStore.getState().settings.bands[index];
    if (!band) return;
    const q = band.q * Math.exp(-event.deltaY * 0.002);
    useEqStore.getState().setBand(index, { q: Math.round(clamp(q, Q.min, Q.max) * 10) / 10 });
  };

  return (
    <div ref={containerRef} className="well relative h-40 overflow-hidden rounded-panel">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label={t.eq.title} />
      {settings.bands.map((band, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: the five bands never move
          key={index}
          type="button"
          aria-label={`${t.eq.band} ${index + 1}: ${t.eq.kinds[band.kind]} ${formatFrequency(band.frequency)}`}
          title={`${t.eq.kinds[band.kind]} · ${formatFrequency(band.frequency)}${hasGain(band.kind) ? ` · ${band.gain} dB` : ""} · Q ${band.q}`}
          onPointerDown={(event) => dragBand(index, event)}
          onWheel={(event) => widenBand(index, event)}
          className={cn(
            "absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full text-[10px] font-semibold text-bg-to shadow active:cursor-grabbing",
            !band.enabled && "opacity-30",
          )}
          style={{
            left: `${frequencyToX(band.frequency) * 100}%`,
            top: `${gainToY(hasGain(band.kind) ? band.gain : 0) * 100}%`,
            background: sectionColor(index),
          }}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}
