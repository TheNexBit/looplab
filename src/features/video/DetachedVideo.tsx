import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { VIDEO_SYNC_EVENT, type VideoSyncPayload } from "./detach";
import type { Clock } from "./useVideoSync";
import { VideoView } from "./VideoView";

/**
 * The whole content of the detached video window. It has no audio or stores of its own:
 * the main window sends the source and the audio clock, and this window interpolates.
 */
export function DetachedVideo() {
  const [state, setState] = useState<VideoSyncPayload | null>(null);
  const received = useRef({ position: 0, playing: false, speed: 1, at: 0 });

  useEffect(() => {
    const unlisten = listen<VideoSyncPayload>(VIDEO_SYNC_EVENT, ({ payload }) => {
      received.current = { ...payload, at: performance.now() };
      setState((previous) =>
        previous?.src === payload.src &&
        previous.status === payload.status &&
        previous.progress === payload.progress
          ? previous
          : payload,
      );
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  const clock = (): Clock => {
    const { position, playing, speed, at } = received.current;
    const elapsed = playing ? ((performance.now() - at) / 1000) * speed : 0;
    return { position: position + elapsed, playing, speed };
  };

  return (
    <div className="h-full bg-black">
      <VideoView
        src={state?.src ?? null}
        status={state?.status ?? "none"}
        progress={state?.progress ?? 0}
        error={null}
        clock={clock}
      />
    </div>
  );
}
