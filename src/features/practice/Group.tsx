import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

/** A section of the tab; its explanation shows on hover over the title, so the panel stays clean. */
export function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  /** Key or link on the right of the title */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Tooltip label={hint}>
          <h3 className="panel-label cursor-help">{title}</h3>
        </Tooltip>
        {action}
      </div>
      {children}
    </section>
  );
}
