import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";
import type { ShortcutId } from "@/lib/shortcuts";
import { Kbd } from "./Kbd";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
    {children}
  </RadixTooltip.Provider>
);

interface TooltipProps {
  label: string;
  shortcut?: ShortcutId;
  children: ReactNode;
}

/** Name of the control plus its shortcut, shown on hover and keyboard focus. */
export function Tooltip({ label, shortcut, children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-control border border-edge bg-bg-from px-2.5 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.6)]"
        >
          {label}
          {shortcut && <Kbd shortcut={shortcut} />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
