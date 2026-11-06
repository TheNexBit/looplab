import { Power } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { t } from "@/i18n";
import type { BandKind, ChannelMode } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { FREQUENCY, GAIN, hasGain, Q, useEqStore } from "@/stores/eq";
import { sectionColor } from "@/stores/markers";
import { EqCurve } from "./EqCurve";
import { PRESETS } from "./presets";
import { formatFrequency, parseFrequency } from "./scale";

const KINDS: BandKind[] = ["lowShelf", "peak", "highShelf", "highPass", "lowPass"];
const CHANNEL_MODES: ChannelMode[] = [
  "stereo",
  "left",
  "right",
  "mono",
  "removeCenter",
  "isolateCenter",
];

const chip = (active: boolean) =>
  cn(
    "h-6 rounded-control px-2 text-[11px] whitespace-nowrap transition-[color,filter]",
    active
      ? "border border-black bg-accent font-semibold text-on-accent"
      : "hw text-fg-muted hover:text-fg hover:brightness-125",
  );

/** Side panel tab: presets, A/B bypass, response curve, band settings and channel mode. */
export function EqPanel() {
  const settings = useEqStore((s) => s.settings);
  const channels = useEqStore((s) => s.channels);
  const flat = useEqStore((s) => s.flat);
  const { setBand, setBypass, setSettings, setChannels } = useEqStore.getState();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="panel-label mr-1">{t.eq.presets.title}</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={chip(false)}
            onClick={() => {
              const next = preset.settings ?? flat;
              if (next) setSettings({ ...next, bypass: false });
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="panel-label">{t.eq.title}</h3>
        <button
          type="button"
          title={t.eq.bypassHint}
          aria-pressed={settings.bypass}
          onClick={() => setBypass(!settings.bypass)}
          className={chip(settings.bypass)}
        >
          {t.eq.bypass}
        </button>
      </div>

      <EqCurve />
      <p className="-mt-2 text-[11px] text-fg-subtle">{t.eq.dragHint}</p>

      <ul className="space-y-1">
        {settings.bands.map((band, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: the five bands never move
            key={index}
            className={cn("flex items-center gap-1", !band.enabled && "opacity-50")}
          >
            <button
              type="button"
              aria-label={`${t.eq.enabled} ${t.eq.band} ${index + 1}`}
              aria-pressed={band.enabled}
              onClick={() => setBand(index, { enabled: !band.enabled })}
              className="flex size-6 shrink-0 items-center justify-center rounded-control border border-black text-bg-to"
              style={{
                background: band.enabled ? sectionColor(index) : "var(--color-surface-hover)",
              }}
            >
              <Power className="size-3" />
            </button>
            <select
              aria-label={`${t.eq.kind} ${t.eq.band} ${index + 1}`}
              value={band.kind}
              onChange={(event) => setBand(index, { kind: event.target.value as BandKind })}
              className="well h-6 w-24 rounded-control px-1 text-xs text-fg"
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t.eq.kinds[kind]}
                </option>
              ))}
            </select>
            <NumberField
              label={`${t.eq.frequency} ${t.eq.band} ${index + 1}`}
              value={band.frequency}
              min={FREQUENCY.min}
              max={FREQUENCY.max}
              step={band.frequency < 1_000 ? 10 : 100}
              onChange={(frequency) => setBand(index, { frequency: Math.round(frequency) })}
              format={formatFrequency}
              parse={parseFrequency}
              className="w-[4.5rem]"
            />
            <NumberField
              label={`${t.eq.gain} ${t.eq.band} ${index + 1}`}
              value={band.gain}
              min={GAIN.min}
              max={GAIN.max}
              step={GAIN.step}
              disabled={!hasGain(band.kind)}
              onChange={(gain) => setBand(index, { gain })}
              format={(gain) => (hasGain(band.kind) ? `${gain > 0 ? "+" : ""}${gain} dB` : "—")}
              className="w-14"
            />
            <NumberField
              label={`${t.eq.q} ${t.eq.band} ${index + 1}`}
              value={band.q}
              min={Q.min}
              max={Q.max}
              step={Q.step}
              onChange={(q) => setBand(index, { q: Math.round(q * 10) / 10 })}
              format={(q) => `Q ${q.toFixed(1)}`}
              className="w-12"
            />
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h3 className="panel-label">{t.eq.channels.title}</h3>
        <div className="grid grid-cols-3 gap-1">
          {CHANNEL_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={channels === mode}
              onClick={() => setChannels(mode)}
              className={chip(channels === mode)}
            >
              {t.eq.channels[mode]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-fg-subtle">{t.eq.channels.hint}</p>
      </section>
    </div>
  );
}
