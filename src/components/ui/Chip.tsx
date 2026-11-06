import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lit amber when it is the current choice */
  active?: boolean;
}

/** Small key for a choice among a few (speed presets, EQ presets, channel modes). */
export function Chip({ active = false, className, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      className={cn(
        "h-6 rounded-control px-2 text-[11px] whitespace-nowrap transition-[color,filter]",
        active
          ? "border border-black bg-accent font-semibold text-on-accent"
          : "hw text-fg-muted hover:text-fg hover:brightness-125",
        className,
      )}
      {...props}
    />
  );
}
