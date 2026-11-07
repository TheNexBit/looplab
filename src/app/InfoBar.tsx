import { MouseRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/Kbd";
import { t } from "@/i18n";
import type { ShortcutId } from "@/lib/shortcuts";

interface Info {
  label: string;
  shortcut?: ShortcutId;
  rightClick?: string;
}

const isShortcut = (id: string | undefined): id is ShortcutId =>
  id !== undefined && id in t.shortcuts;

/**
 * What the pointer is over: the hint of a `Tooltip` (its `data-info` attributes), else a native
 * `title` (whose "Tasto destro: …" line becomes the right-click part), else the control's name.
 */
export function infoOf(target: EventTarget | null): Info | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest("[data-info],[title],[aria-label]");
  if (!element) return null;
  const data = element.getAttribute("data-info");
  if (data) {
    const shortcut = element.getAttribute("data-info-shortcut") ?? undefined;
    return {
      label: data,
      shortcut: isShortcut(shortcut) ? shortcut : undefined,
      rightClick: element.getAttribute("data-info-right") ?? undefined,
    };
  }
  const title = element.getAttribute("title") ?? element.getAttribute("aria-label");
  if (!title) return null;
  const [label = "", ...rest] = title.split("\n");
  const prefix = `${t.common.rightClick}: `;
  const right = rest.find((line) => line.startsWith(prefix));
  return { label, rightClick: right?.slice(prefix.length) };
}

/**
 * Info bar at the foot of the window, like Ableton's Info View: it always says what is under
 * the pointer, right button included. Switched on in Settings → Generale.
 */
export function InfoBar() {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    const onOver = (event: PointerEvent) => setInfo(infoOf(event.target));
    const onLeave = () => setInfo(null);
    document.addEventListener("pointerover", onOver);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <footer
      aria-live="off"
      className="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-edge bg-bg-from px-3 text-[11px] whitespace-nowrap"
    >
      {info ? (
        <>
          <span className="truncate text-fg">{info.label}</span>
          {info.shortcut && <Kbd shortcut={info.shortcut} />}
          {info.rightClick && (
            <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
              <MouseRight className="size-3.5 shrink-0 text-accent" aria-hidden />
              <span className="truncate">
                <span className="text-fg">{t.common.rightClick}:</span> {info.rightClick}
              </span>
            </span>
          )}
        </>
      ) : (
        <span className="text-fg-subtle">{t.app.infoBarIdle}</span>
      )}
    </footer>
  );
}
