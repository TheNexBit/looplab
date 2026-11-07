import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "hardware";
type Size = "md" | "icon" | "lg-icon" | "key" | "lg-key" | "play";
type Led = "amber" | "green";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
  /** Hardware keys only: a lamp under the icon, lit while `active` */
  led?: Led;
  /** The right button opens options: a small triangle in the corner says so */
  options?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-semibold hover:bg-accent-hover",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
  hardware: "hw text-fg-muted hover:brightness-125 hover:text-fg active:translate-y-px",
};

const sizes: Record<Size, string> = {
  md: "h-7 px-2.5 gap-1.5 text-xs",
  icon: "size-7",
  "lg-icon": "size-12",
  /** Dock key: tall enough for an icon over its lamp */
  key: "h-12 w-11 flex-col gap-1",
  "lg-key": "h-12 w-14 flex-col gap-1",
  /** Play key of the dock: as wide as the other keys in narrow windows */
  play: "h-12 w-11 flex-col gap-1 xl:w-14",
};

const lamps: Record<Led, string> = {
  amber: "bg-accent shadow-[0_0_6px_var(--color-accent)]",
  green: "bg-loop shadow-[0_0_6px_var(--color-loop)]",
};

/**
 * Triangle in the bottom-right corner of a key whose right button opens options, like the
 * corner marks of Logic's and Cubase's buttons and of hardware with a menu behind a key.
 */
function OptionsCorner() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-[3px] bottom-[3px] size-[5px] bg-current opacity-60 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
    />
  );
}

export function Button({
  variant = "ghost",
  size = "md",
  active = false,
  led,
  options = false,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-control font-medium transition-[color,background-color,filter]",
        "disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        // A key with a lamp shows its state on the lamp; others light up their icon
        active && !led && (variant === "hardware" ? "text-accent" : "bg-accent-soft text-accent"),
        className,
      )}
      {...props}
    >
      {children}
      {led && (
        <span
          aria-hidden
          className={cn("h-[3px] w-3.5 rounded-full", active ? lamps[led] : "bg-led-off")}
        />
      )}
      {options && <OptionsCorner />}
    </button>
  );
}
