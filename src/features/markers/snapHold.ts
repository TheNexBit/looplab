import { create } from "zustand";

interface SnapHoldState {
  /** Shift is held down */
  shift: boolean;
  /** The left button is down: something may be being dragged */
  pressing: boolean;
}

/**
 * Shift held suspends the magnet, as in Reaper: while it is down loops, markers and sections
 * follow the mouse pixel by pixel, and the magnet is back as soon as it is let go. Shift+click
 * (stretching the loop) follows the same rule. Kept for the whole window, so every drag
 * reads it the same way.
 */
export const useSnapHoldStore = create<SnapHoldState>(() => ({ shift: false, pressing: false }));

/** True while Shift suspends the magnet. */
export const snapSuspended = () => useSnapHoldStore.getState().shift;

/**
 * Follows Shift and the left button for the whole window. A key let go in another window
 * never reaches this one, so losing the focus counts as letting everything go.
 * Started once by the app shell; returns what stops it.
 */
export function watchSnapHold(): () => void {
  const set = (patch: Partial<SnapHoldState>) => {
    const state = useSnapHoldStore.getState();
    if (Object.entries(patch).some(([key, value]) => state[key as keyof SnapHoldState] !== value)) {
      useSnapHoldStore.setState(patch);
    }
  };
  const onKey = (event: KeyboardEvent) => set({ shift: event.shiftKey });
  const onPointer = (event: PointerEvent) =>
    set({ shift: event.shiftKey, pressing: (event.buttons & 1) === 1 });
  const onBlur = () => set({ shift: false, pressing: false });

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("pointermove", onPointer, true);
  window.addEventListener("pointerup", onPointer, true);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    window.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("pointermove", onPointer, true);
    window.removeEventListener("pointerup", onPointer, true);
    window.removeEventListener("blur", onBlur);
  };
}
