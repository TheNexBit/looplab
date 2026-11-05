import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutId } from "./shortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

const SLIDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** Text fields keep every key; a focused slider keeps only the keys that move it. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
    return true;
  }
  return target.getAttribute("role") === "slider" && SLIDER_KEYS.includes(key);
}

/** Runs the handler of every registered shortcut pressed while the window has focus. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const current = useRef(handlers);
  current.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat && event.key === " ") return;
      if (ownsKey(event.target, event.key)) return;
      const id = matchShortcut(event);
      const handler = id && current.current[id];
      if (!handler) return;
      event.preventDefault();
      // Otherwise Space would also "click" the focused button
      if (event.key === " " && document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.blur();
      }
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
