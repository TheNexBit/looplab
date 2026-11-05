import { AlertCircle } from "lucide-react";
import { useRef } from "react";
import { t } from "@/i18n";
import type { AppError } from "@/lib/bindings";
import { type Clock, useVideoSync } from "./useVideoSync";

interface VideoViewProps {
  src: string | null;
  status: "none" | "loading" | "proxying" | "ready" | "error";
  progress: number;
  error: AppError | null;
  clock: () => Clock;
  /** WebView2 cannot decode it: a proxy is needed */
  onUnsupported?: () => void;
  /** The file has no picture at all (audio in a video container) */
  onNoPicture?: () => void;
  onReady?: () => void;
}

/** The muted video picture, kept in step with the audio, plus proxy progress and errors. */
export function VideoView({
  src,
  status,
  progress,
  error,
  clock,
  onUnsupported,
  onNoPicture,
  onReady,
}: VideoViewProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useVideoSync(ref, clock);

  if (status === "proxying") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-fg-muted">{t.video.proxying}</p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-fg-subtle tabular">{Math.round(progress * 100)}%</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex size-full items-center justify-center gap-2 p-4 text-center text-sm text-fg-muted">
        <AlertCircle className="size-4 shrink-0 text-accent" />
        {error ? t.errors[error.kind] : t.video.unavailable}
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-fg-subtle">
        {t.video.none}
      </div>
    );
  }
  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="auto"
      className="size-full bg-black object-contain"
      onLoadedMetadata={(event) => {
        // A container with no picture (e.g. an .mp4 holding only audio) plays as audio only
        if (event.currentTarget.videoWidth === 0) onNoPicture?.();
        else onReady?.();
      }}
      onError={() => onUnsupported?.()}
    />
  );
}
