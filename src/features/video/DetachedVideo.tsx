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
  const received = useRef({ position: 0, playing: false, speed: 1, wait: 0, at: 0 });

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
    const { position, playing, speed, wait, at } = received.current;
    // A count-in that was under way when the update was sent ends by itself
    const since = (performance.now() - at) / 1000;
    const moving = (playing && wait === 0) || (wait > 0 && since >= wait);
    const elapsed = moving ? (since - wait) * speed : 0;
    return { position: position + elapsed, playing: moving, speed };
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
