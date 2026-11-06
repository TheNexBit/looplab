import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hide the title visually (still read by screen readers) */
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}

/** Centred modal window with a short fade, closed by Esc, the backdrop or the × button. */
export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  className,
  children,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-bg-to/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed top-24 left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-panel border border-edge bg-bg-from shadow-[0_20px_50px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.06)]",
                  className,
                )}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className={cn(
                    "flex items-center border-b border-edge bg-[linear-gradient(var(--color-raised-from),var(--color-raised-to))] px-4 py-1.5",
                    hideTitle && "sr-only",
                  )}
                >
                  <RadixDialog.Title className="panel-label flex-1 text-fg-muted">
                    {title}
                  </RadixDialog.Title>
                  <RadixDialog.Close asChild>
                    <Button size="icon" aria-label={t.library.dismiss}>
                      <X className="size-4" />
                    </Button>
                  </RadixDialog.Close>
                </div>
                {children}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
