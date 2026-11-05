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
                  "fixed top-24 left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-panel border border-border bg-bg-from shadow-2xl",
                  className,
                )}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <div className={cn("flex items-center px-4 pt-3", hideTitle && "sr-only")}>
                  <RadixDialog.Title className="flex-1 text-sm font-semibold">
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
