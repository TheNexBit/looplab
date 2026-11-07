import { StickyNote } from "lucide-react";
import { useState } from "react";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import { type Memo, memoNow } from "./memo";

/** `memoNow`, followed frame by frame (React re-renders only when it changes). */
export function useCurrentMemo(): Memo | null {
  const [memo, setMemo] = useState<Memo | null>(null);
  useAnimationFrame(() => {
    const now = memoNow();
    setMemo((shown) => (shown?.text === now?.text && shown?.name === now?.name ? shown : now));
  });
  return memo;
}

/** The memo of what is playing, over the top of the detailed waveform. */
export function CurrentMemo({ top }: { top: number }) {
  const memo = useCurrentMemo();
  if (!memo) return null;
  return (
    <div
      className="pointer-events-none absolute left-2 z-10 flex max-w-[60%] items-start gap-1.5 rounded-control border border-accent/40 bg-bg-from/90 px-2 py-1 text-xs text-fg shadow-[0_4px_12px_rgb(0_0_0/0.4)]"
      style={{ top: top + 6 }}
    >
      <StickyNote className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold text-accent">{memo.name}</span>{" "}
        <span className="whitespace-pre-line">{memo.text}</span>
      </span>
    </div>
  );
}
