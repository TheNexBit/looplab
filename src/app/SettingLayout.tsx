import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One setting of a Settings tab: its name and explanation on the left, its control on the right. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{label}</p>
        {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * A titled group of a Settings tab. With `rows` the children are setting rows, divided by a
 * line; otherwise they are laid out as they come, spaced.
 */
export function SettingGroup({
  title,
  hint,
  rows = false,
  children,
}: {
  title: string;
  hint?: string;
  rows?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("pt-3", !rows && "space-y-2.5")}>
      <div>
        <p className="panel-label text-fg-muted">{title}</p>
        {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
      </div>
      {rows ? <div className="divide-y divide-border">{children}</div> : children}
    </section>
  );
}
