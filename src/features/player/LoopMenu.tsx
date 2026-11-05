import { ChevronDown, Repeat, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { formatTime } from "@/lib/time";
import { useLoopStore } from "@/stores/loop";
import { GAP, LEAD_IN } from "./limits";

const formatSeconds = (value: number) => `${value.toFixed(1)} ${t.transport.seconds}`;

/** Loop on/off, plus a menu with lead-in, gap between repetitions and removal. */
export function LoopMenu({ disabled }: { disabled: boolean }) {
  const loop = useLoopStore();
  const region = loop.region();

  return (
    <div className="flex items-center">
      <Tooltip label={t.transport.loop} shortcut="loopToggle">
        <Button
          size="icon"
          disabled={disabled || !region}
          active={loop.enabled && region !== null}
          onClick={loop.toggle}
          aria-label={t.transport.loop}
          aria-pressed={loop.enabled}
          className="rounded-r-none"
        >
          <Repeat className="size-4" />
        </Button>
      </Tooltip>
      <Popover.Root>
        <Tooltip label={t.transport.loopOptions}>
          <Popover.Trigger asChild>
            <Button
              size="icon"
              disabled={disabled}
              aria-label={t.transport.loopOptions}
              className="w-5 rounded-l-none"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </Popover.Trigger>
        </Tooltip>
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={8}
            className="z-50 w-80 space-y-4 rounded-panel border border-border bg-bg-from p-4 text-sm shadow-lg"
          >
            <p className="text-fg-muted tabular">
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
            <Button onClick={loop.clear} disabled={!region} className="w-full">
              <Trash2 className="size-4" />
              {t.transport.clearLoop}
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
