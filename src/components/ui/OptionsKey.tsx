import { Popover } from "radix-ui";
import { type ComponentProps, type ReactNode, useCallback, useState } from "react";
import type { ShortcutId } from "@/lib/shortcuts";
import { Button } from "./Button";
import { floatingPanel } from "./menu";
import { Tooltip } from "./Tooltip";

/**
 * Options opened with the right button, like the options of a DAW's keys: whether they are
 * open, and the handler that opens them (it also keeps the browser's menu away).
 */
export function useOptions() {
  const [open, setOpen] = useState(false);
  const onContextMenu = useCallback((event: { preventDefault: () => void }) => {
    event.preventDefault();
    setOpen(true);
  }, []);
  return { open, setOpen, onContextMenu };
}

/** The panel of a key's options, above the dock like every menu there. */
export function OptionsPanel({
  className,
  align,
  children,
}: {
  className: string;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  return (
    <Popover.Portal>
      <Popover.Content
        side="top"
        align={align}
        sideOffset={8}
        className={`${floatingPanel} ${className}`}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

interface OptionsKeyProps extends Omit<ComponentProps<typeof Button>, "options"> {
  /** Hover hint: name of the key, its shortcut and what the right button opens */
  label: string;
  shortcut?: ShortcutId;
  rightClick: string;
  /** What the right button opens */
  panel: ReactNode;
  panelClassName: string;
}

/**
 * Hardware key whose click does its job and whose right-click opens its options: the corner
 * triangle and the second line of its hint say so.
 */
export function OptionsKey({
  label,
  shortcut,
  rightClick,
  panel,
  panelClassName,
  ...button
}: OptionsKeyProps) {
  const { open, setOpen, onContextMenu } = useOptions();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span>
          <Tooltip label={label} shortcut={shortcut} rightClick={rightClick}>
            <Button
              variant="hardware"
              size="key"
              options
              onContextMenu={onContextMenu}
              {...button}
            />
          </Tooltip>
        </span>
      </Popover.Anchor>
      <OptionsPanel className={panelClassName}>{panel}</OptionsPanel>
    </Popover.Root>
  );
}
