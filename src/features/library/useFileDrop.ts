import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";

/**
 * Tracks files being dragged over the window. Tauri intercepts OS file drops,
 * so the native event is used instead of HTML drag events.
 * `onDrop` receives absolute file paths.
 */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") setHovering(true);
        else setHovering(false);
        if (payload.type === "drop" && payload.paths.length > 0) onDrop(payload.paths);
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop]);

  return hovering;
}
