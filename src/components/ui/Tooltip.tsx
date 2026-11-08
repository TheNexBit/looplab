import { MouseRight } from "lucide-react";
import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import type { ShortcutId } from "@/lib/shortcuts";
import { Kbd } from "./Kbd";

/**
 * Hints never get in the way: the mouse cannot rest on them (they close as soon as it leaves
 * the control, `disableHoverableContent`) and clicks go through them to the key underneath
 * (`data-hint`, see theme.css). Timing is unchanged: 0.4 s, then at once between controls.
 */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200} disableHoverableContent>
    {children}
  </RadixTooltip.Provider>
);

/** A native `title` that also says what the right button opens, on a second line. */
export const withRightClick = (title: string, opens: string) =>
  `${title}\n${t.common.rightClick}: ${opens}`;

interface TooltipProps {
  label: string;
  shortcut?: ShortcutId;
  /** What the right button opens, said on a second line ("Tasto destro: …") */
  rightClick?: string;
  children: ReactNode;
}

/**
 * Name of the control plus its shortcut, shown on hover and keyboard focus; for controls with
 * options on the right button, a second line says what it opens.
 */
export function Tooltip({ label, shortcut, rightClick, children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      {/* The same text is read by the info bar at the foot of the window (`InfoBar`) */}
      <RadixTooltip.Trigger
        asChild
        data-info={label}
        data-info-shortcut={shortcut}
        data-info-right={rightClick}
      >
        {children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          data-hint
          sideOffset={6}
          className="pointer-events-none z-50 flex max-w-80 flex-col gap-1 rounded-control border border-edge bg-bg-from px-2.5 py-1.5 text-xs text-fg shadow-[0_6px_18px_rgb(0_0_0/0.6)]"
        >
          <span className="flex items-center gap-2">
            {label}
            {shortcut && <Kbd shortcut={shortcut} />}
          </span>
          {rightClick && (
            <span className="flex items-start gap-1.5 border-t border-border pt-1 text-fg-muted">
              <MouseRight className="mt-px size-3.5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="text-fg">{t.common.rightClick}:</span> {rightClick}
              </span>
            </span>
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
