import { useEffect, useRef } from "react";

/**
 * Calls `callback` on every display frame while the component is mounted.
 * Used for the playhead and waveforms: they update outside React rendering,
 * so 60 fps never re-renders components.
 */
export function useAnimationFrame(callback: (now: number) => void) {
  const current = useRef(callback);
  current.current = callback;

  useEffect(() => {
    let id = requestAnimationFrame(function loop(now) {
      current.current(now);
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, []);
}
