import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutId } from "./shortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Runs the handler of every registered shortcut pressed while the window has focus. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const current = useRef(handlers);
  current.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat && event.key === " ") return;
      if (isTyping(event.target)) return;
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
