import { type RefObject, useEffect, useRef } from "react";

/**
 * Calls `onStep(+1)` when the wheel turns up over `ref`'s element and `onStep(-1)` when it
 * turns down, like the value fields of DAWs. The page itself must not scroll, which needs a
 * non-passive listener (React's `onWheel` cannot prevent the default).
 */
export function useWheelSteps(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1) => void) {
  const callback = useRef(onStep);
  callback.current = onStep;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      callback.current(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [ref]);
}
