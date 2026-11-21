import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

/**
 * How a bar fits its room: every key with its name ("full"), keys reduced to their icon and
 * lamp ("compact", the name in the hover hint), then a second row ("wrap"). No key is ever
 * hidden for lack of room.
 */
export type FitMode = "full" | "compact" | "wrap";

const FitContext = createContext<FitMode>("full");

/** The mode of the bar a key sits in ("full" outside any FitBar). */
export const useFitMode = () => useContext(FitContext);

/** True when the keys of the bar must show only their icon. */
export const useCompact = () => useContext(FitContext) !== "full";

const ORDER: readonly FitMode[] = ["full", "compact", "wrap"];

/**
 * A row of keys that fits any width without dropping one: it measures the room it really has
 * (not the window's width) and steps down to compact keys, then to two rows; it steps back up
 * as soon as the width it measured for a fuller mode is there again.
 */
export function FitBar({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FitMode>("full");
  // Width each mode needed when it was last on screen in one row
  const needs = useRef<Partial<Record<FitMode, number>>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setTick((tick) => tick + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Runs after every render: a key that grew (a longer name) is measured at once
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const room = element.clientWidth;
    const index = ORDER.indexOf(mode);
    if (mode !== "wrap") {
      const need = element.scrollWidth;
      needs.current[mode] = need;
      if (need > room + 1) {
        setMode(ORDER[index + 1] ?? "wrap");
        return;
      }
    }
    // Back to a fuller mode when its width (or a first try, if never measured) fits
    const fuller = ORDER[index - 1];
    if (fuller) {
      const need = needs.current[fuller];
      if (need === undefined || need <= room) setMode(fuller);
    }
  });

  return (
    <FitContext.Provider value={mode}>
      <div
        ref={ref}
        data-fit={mode}
        className={cn(
          "flex min-w-0 items-center",
          mode === "wrap" ? "flex-wrap gap-y-1" : "flex-nowrap overflow-hidden",
          className,
        )}
      >
        {children}
      </div>
    </FitContext.Provider>
  );
}
