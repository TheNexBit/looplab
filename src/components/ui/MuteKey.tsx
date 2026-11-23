import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

/**
 * The mixer's mute key: «M» with a red lamp, lit while the sound is silenced. The level stays
 * where it was, so switching it off brings the sound back as it was.
 */
export function MuteKey({
  muted,
  label,
  onChange,
}: {
  muted: boolean;
  /** What it silences, for the tooltip («Mute the track») */
  label: string;
  onChange: (muted: boolean) => void;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={muted}
        onClick={() => onChange(!muted)}
        className={cn(
          "hw inline-flex h-[18px] shrink-0 items-center gap-1 rounded-control px-1.5 text-[9px] font-semibold transition-[filter] hover:brightness-125",
          muted ? "text-fg" : "text-fg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            muted ? "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]" : "bg-led-off",
          )}
        />
        M
      </button>
    </Tooltip>
  );
}
