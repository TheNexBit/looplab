import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";

type Position = { x: number; y: number };

/**
 * Tracks files being dragged over the window. Tauri intercepts OS file drops,
 * so the native event is used instead of HTML drag events.
 * `onDrop` receives absolute file paths and where they were dropped; `onOver` follows the
 * pointer while they are dragged (`null` when they leave). Positions are physical pixels.
 */
export function useFileDrop(
  onDrop: (paths: string[], position: Position | null) => void,
  onOver?: (position: Position | null) => void,
): boolean {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setHovering(true);
          onOver?.(payload.position);
        } else {
          setHovering(false);
          onOver?.(null);
        }
        if (payload.type === "drop" && payload.paths.length > 0) {
          onDrop(payload.paths, payload.position);
        }
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop, onOver]);

  return hovering;
}
