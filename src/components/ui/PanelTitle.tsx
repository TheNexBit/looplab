import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ShortcutId } from "@/lib/shortcuts";
import { Tooltip } from "./Tooltip";

/**
 * The title of a panel (video, score, overview), the same everywhere: on the left, the arrow
 * (down = open, right = folded, as the courses of the lesson Home), the panel's icon and name.
 * A click on it folds or opens the panel. Without `onToggle` it is a plain title, no arrow.
 */
export function PanelTitle({
  label,
  icon,
  open = true,
  onToggle,
  foldLabel,
  openLabel,
  shortcut,
  hideName = false,
}: {
  label: string;
  icon?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  /** Hints over the title: what a click does */
  foldLabel?: string;
  openLabel?: string;
  shortcut?: ShortcutId;
  /** Narrow bar: only the arrow and the icon (the name stays for screen readers) */
  hideName?: boolean;
}) {
  const content = (
    <>
      {onToggle &&
        (open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        ))}
      {icon}
      {hideName ? <span className="sr-only">{label}</span> : label}
    </>
  );
  const look =
    "flex h-6 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide text-fg-subtle uppercase";
  if (!onToggle) {
    return (
      <span className={look} title={hideName ? label : undefined}>
        {content}
      </span>
    );
  }
  const hint = open ? (foldLabel ?? label) : (openLabel ?? label);
  return (
    <Tooltip label={hint} shortcut={shortcut}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={hint}
        onClick={onToggle}
        className={`${look} -ml-1 rounded-control pr-1.5 pl-1 transition-colors hover:text-fg`}
      >
        {content}
      </button>
    </Tooltip>
  );
}
