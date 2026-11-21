import { type RefObject, useEffect } from "react";
import { useScoreStore } from "@/stores/score";

/**
 * Ctrl + wheel over the score zooms it, as in a DAW (one step per notch); the plain wheel
 * still scrolls. The listener is not passive, so the page itself never zooms instead.
 */
export function useWheelZoom(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      useScoreStore.getState().zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [ref]);
}
