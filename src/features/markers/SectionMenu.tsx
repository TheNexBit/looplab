import { Repeat, Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import type { ReactNode } from "react";
import { menuContent, menuItem, menuLabel, menuSeparator } from "@/components/ui/menu";
import { t } from "@/i18n";
import { SECTION_COLORS, type SectionRange, sectionColor, useMarkersStore } from "@/stores/markers";
import { loopSection } from "./sectionActions";

/** Right-click menu of a section: loop it, pick a colour, delete it. */
export function SectionMenu({ range, children }: { range: SectionRange; children: ReactNode }) {
  const { recolorSection, removeSection } = useMarkersStore.getState();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent}>
          <ContextMenu.Item className={menuItem} onSelect={() => loopSection(range)}>
            <Repeat className="size-4" />
            {t.markers.loopSection}
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparator} />
          <ContextMenu.Label className={menuLabel}>{t.markers.color}</ContextMenu.Label>
          <div className="flex gap-1.5 px-2.5 py-1.5">
            {Array.from({ length: SECTION_COLORS }, (_, color) => (
              <ContextMenu.Item
                // biome-ignore lint/suspicious/noArrayIndexKey: the palette is fixed
                key={color}
                onSelect={() => recolorSection(range.id, color)}
                aria-label={`${t.markers.color} ${color + 1}`}
                className="size-5 rounded-full outline-none ring-offset-2 ring-offset-bg-from data-[highlighted]:ring-2 data-[highlighted]:ring-fg"
                style={{ background: sectionColor(color) }}
              />
            ))}
          </div>
          <ContextMenu.Separator className={menuSeparator} />
          <ContextMenu.Item className={menuItem} onSelect={() => removeSection(range.id)}>
            <Trash2 className="size-4" />
            {t.markers.remove}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
