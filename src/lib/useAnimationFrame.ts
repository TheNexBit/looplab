import { useEffect, useRef } from "react";

/** Everything drawn on each display frame; one loop runs them all, and none while empty. */
const callbacks = new Set<(now: number) => void>();
let frame = 0;

function tick(now: number) {
  for (const callback of callbacks) {
    // One drawing that fails must not stop the others: it goes to the error log instead
    try {
      callback(now);
    } catch (error) {
      reportError(error);
    }
  }
  frame = callbacks.size > 0 ? requestAnimationFrame(tick) : 0;
}

/**
 * Calls `callback` on every display frame while the component is mounted.
 * Used for the playhead and waveforms: they update outside React rendering,
 * so 60 fps never re-renders components. All of them share one frame loop, in the
 * order they were mounted.
 */
export function useAnimationFrame(callback: (now: number) => void) {
  const current = useRef(callback);
  current.current = callback;

  useEffect(() => {
    const run = (now: number) => current.current(now);
    callbacks.add(run);
    if (frame === 0) frame = requestAnimationFrame(tick);
    return () => {
      callbacks.delete(run);
      if (callbacks.size === 0 && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
  }, []);
}
