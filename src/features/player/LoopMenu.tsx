import { BookmarkPlus, ChevronDown, Download, Flag, Repeat, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { OptionsPanel, useOptions } from "@/components/ui/OptionsKey";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { formatTime } from "@/lib/time";
import { useLoopStore } from "@/stores/loop";
import { useMarkersStore } from "@/stores/markers";
import { trackDuration } from "@/stores/player";
import { usePracticeStore } from "@/stores/practice";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { SETTING_CHOICES, useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { GAP, LEAD_IN } from "./limits";

const formatSeconds = (value: number) => `${value.toFixed(1)} ${t.transport.seconds}`;

/** Loop on/off, plus a menu with lead-in, gap between repetitions and removal. */
export function LoopMenu({ disabled }: { disabled: boolean }) {
  const loop = useLoopStore();
  const region = loop.region();
  const repetitions = usePracticeStore((s) => s.repetitions);
  const afterLoop = useSettingsStore((s) => s.afterLoop);
  // Both the ▾ key and a right-click on the Loop key open the options
  const { open, setOpen, onContextMenu } = useOptions();

  return (
    <div className="flex items-center">
      <Tooltip
        label={t.transport.loop}
        shortcut="loopToggle"
        rightClick={t.transport.loopRightClick}
      >
        <Button
          variant="hardware"
          size="key"
          led="green"
          options
          disabled={disabled || !region}
          active={loop.enabled && region !== null}
          onClick={loop.toggle}
          onContextMenu={onContextMenu}
          aria-label={t.transport.loop}
          aria-pressed={loop.enabled}
          className="rounded-r-none"
        >
          <Repeat className="size-4" />
        </Button>
      </Tooltip>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Tooltip label={t.transport.loopOptions}>
          <Popover.Trigger asChild>
            <Button
              variant="hardware"
              disabled={disabled}
              aria-label={t.transport.loopOptions}
              className="h-12 gap-2 rounded-l-none border-l-0 px-2.5"
            >
              {/* Loop range readout; the key opens the loop options */}
              <span className="flex flex-col items-start gap-px">
                <span className="panel-label">
                  {t.transport.loop}
                  {/* Repetitions played, like the counter of a looper pedal: on the label's
                      line, so a long count never widens the dock */}
                  {region && repetitions > 0 && (
                    <span className="ml-1.5 font-mono normal-case tracking-normal text-readout tabular">
                      ×{repetitions + 1}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs whitespace-nowrap text-fg tabular">
                  {region ? `${formatTime(region.start)} → ${formatTime(region.end)}` : "—"}
                </span>
              </span>
              <ChevronDown className="size-3.5" />
            </Button>
          </Popover.Trigger>
        </Tooltip>
        <OptionsPanel className="w-80 space-y-4 p-4">
          <p className="font-mono text-xs text-readout tabular">
            {region
              ? `${formatTime(region.start)} – ${formatTime(region.end)}`
              : t.transport.noLoop}
          </p>
          <div className="space-y-1">
            <Slider
              label={t.transport.leadIn}
              value={loop.leadIn}
              defaultValue={LEAD_IN.default}
              min={LEAD_IN.min}
              max={LEAD_IN.max}
              step={LEAD_IN.step}
              onChange={loop.setLeadIn}
              format={formatSeconds}
              trackClassName="flex-1"
              className="justify-between"
            />
            <p className="text-xs text-fg-subtle">{t.transport.leadInHint}</p>
          </div>
          <div className="space-y-1">
            <Slider
              label={t.transport.gap}
              value={loop.gap}
              defaultValue={GAP.default}
              min={GAP.min}
              max={GAP.max}
              step={GAP.step}
              onChange={loop.setGap}
              format={formatSeconds}
              trackClassName="flex-1"
              className="justify-between"
            />
            <p className="text-xs text-fg-subtle">{t.transport.gapHint}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-fg">{t.settings.afterLoop}</p>
            <ChoiceKeys
              label={t.settings.afterLoop}
              value={afterLoop}
              choices={SETTING_CHOICES.afterLoop.map(
                (choice) => [choice, t.settings.choices.afterLoop[choice]] as const,
              )}
              onChange={(next) => useSettingsStore.getState().update({ afterLoop: next })}
            />
            <p className="text-xs text-fg-subtle">{t.settings.afterLoopHint}</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="hardware"
              onClick={() => useSavedLoopsStore.getState().saveCurrent()}
              disabled={!region}
            >
              <BookmarkPlus className="size-4" />
              {t.savedLoops.save}
            </Button>
            <Button variant="hardware" onClick={loop.clear} disabled={!region}>
              <Trash2 className="size-4" />
              {t.transport.clearLoop}
            </Button>
            <Tooltip label={t.shortcuts.sectionFromLoop} shortcut="sectionFromLoop">
              <Button
                variant="hardware"
                onClick={() =>
                  region &&
                  useMarkersStore.getState().addSection(region.start, region.end, trackDuration())
                }
                disabled={!region}
              >
                <Flag className="size-4" />
                {t.markers.makeSection}
              </Button>
            </Tooltip>
            <Button
              variant="hardware"
              onClick={() => useUiStore.getState().openExport({ kind: "loop" })}
              disabled={!region}
            >
              <Download className="size-4" />
              {t.export.exportLoop}
            </Button>
          </div>
        </OptionsPanel>
      </Popover.Root>
    </div>
  );
}
