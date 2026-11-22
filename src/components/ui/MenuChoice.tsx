import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { menuItem } from "./menu";

/**
 * One choice inside a dropdown radio group: a tick marks the chosen one, and its text is
 * amber. Highlighted, it reads on-accent ink like any item (see theme.css), never amber on amber.
 */
export function MenuChoice({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      className={cn(menuItem, "data-[state=checked]:text-accent", className)}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.RadioItem>
  );
}
