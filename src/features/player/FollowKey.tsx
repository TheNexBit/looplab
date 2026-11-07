import { LocateFixed } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { floatingPanel } from "@/components/ui/menu";
import { OnOffKey } from "@/components/ui/OnOffKey";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { SETTING_CHOICES, useSettingsStore } from "@/stores/settings";
import { useViewStore } from "@/stores/view";

const s = t.settings;

/** Follow on or off; following again at once, so switching it on is seen right away. */
export function setFollow(on: boolean) {
  useSettingsStore.getState().update({ followPlayhead: on });
  useViewStore.getState().resumeFollow();
}

/**
 * Follow key, like Reaper's auto-scroll: a click switches it on and off; a right-click opens
 * its options, among them continuous scrolling or page by page (Reaper's "Continuous scrolling").
 */
export function FollowKey() {
  const follow = useSettingsStore((state) => state.followPlayhead);
  const mode = useSettingsStore((state) => state.followMode);
  const [options, setOptions] = useState(false);
  return (
    <Popover.Root open={options} onOpenChange={setOptions}>
      <Popover.Anchor asChild>
        <span>
          <Tooltip label={t.transport.follow} shortcut="toggleFollow">
            <Button
              variant="hardware"
              size="key"
              led="amber"
              active={follow}
              onClick={() => setFollow(!follow)}
              onContextMenu={(event) => {
                event.preventDefault();
                setOptions(true);
              }}
              aria-label={t.shortcuts.toggleFollow}
              aria-pressed={follow}
            >
              <LocateFixed className="size-4" />
            </Button>
          </Tooltip>
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          className={`${floatingPanel} w-80 space-y-3 p-3`}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{s.followPlayhead}</p>
              <p className="text-[11px] leading-snug text-fg-subtle">{s.followPlayheadHint}</p>
            </div>
            <OnOffKey label={s.followPlayhead} on={follow} onChange={setFollow} />
          </div>
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-sm text-fg">{s.followMode}</p>
            <ChoiceKeys
              label={s.followMode}
              value={mode}
              choices={SETTING_CHOICES.followMode.map(
                (choice) => [choice, s.choices.followMode[choice]] as const,
              )}
              onChange={(followMode) => useSettingsStore.getState().update({ followMode })}
            />
            <p className="text-[11px] leading-snug text-fg-subtle">{s.followModeHint}</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
