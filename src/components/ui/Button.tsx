import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost";
type Size = "md" | "icon" | "lg-icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
};

const sizes: Record<Size, string> = {
  md: "h-8 px-3 gap-2 text-sm",
  icon: "size-8",
  "lg-icon": "size-12",
};

export function Button({
  variant = "ghost",
  size = "md",
  active = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        active && "bg-accent-soft text-accent",
        className,
      )}
      {...props}
    />
  );
}
