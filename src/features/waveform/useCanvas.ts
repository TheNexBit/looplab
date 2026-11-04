import { useEffect, useRef } from "react";

export interface CanvasSize {
  /** Device pixels: what drawing code works in */
  width: number;
  height: number;
  dpr: number;
}

/**
 * Keeps a canvas backing store at the exact device-pixel size, so it stays
 * sharp on every monitor. Calls `onResize` after any change, including the
 * window moving to a monitor with a different scaling.
 */
export function useCanvas(onResize: () => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  const callback = useRef(onResize);
  callback.current = onResize;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      size.current = { width, height, dpr };
      callback.current();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // A resolution query only fires once, so it is re-armed for the new ratio each time
    let query: MediaQueryList | undefined;
    const watchScale = () => {
      query?.removeEventListener("change", onScaleChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener("change", onScaleChange);
    };
    const onScaleChange = () => {
      resize();
      watchScale();
    };
    watchScale();

    return () => {
      observer.disconnect();
      query?.removeEventListener("change", onScaleChange);
    };
  }, []);

  return { ref, size };
}
