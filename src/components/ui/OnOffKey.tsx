import { t } from "@/i18n";
import { cn } from "@/lib/cn";

interface OnOffKeyProps {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}

/** On/off key with its lamp, like the switches of a DAW: a click turns it on or off. */
export function OnOffKey({ label, on, onChange, disabled = false }: OnOffKeyProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "hw inline-flex h-6 w-14 shrink-0 items-center justify-center gap-1.5 rounded-control text-[10px] font-semibold tracking-[0.08em] uppercase transition-[color,filter]",
        "hover:brightness-125 active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        on ? "text-accent" : "text-fg-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          on ? "bg-accent shadow-[0_0_6px_var(--color-accent)]" : "bg-led-off",
        )}
      />
      {on ? t.common.on : t.common.off}
    </button>
  );
}
