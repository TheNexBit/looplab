import { Check, ChevronDown, Square } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ChoiceKeys } from "@/components/ui/ChoiceKeys";
import { menuContent, menuItem, menuLabel } from "@/components/ui/menu";
import { Stepper } from "@/components/ui/Stepper";
import { Tooltip } from "@/components/ui/Tooltip";
import { t } from "@/i18n";
import { commands } from "@/lib/bindings";
import { SETTING_LIMITS, useSettingsStore } from "@/stores/settings";
import { Group } from "./Group";
import {
  A_NOTE,
  INSTRUMENTS,
  localNoteName,
  noteHz,
  openStrings,
  REFERENCE_TUNING_IDS,
} from "./reference";

const p = t.practice;
const octave = (midi: number) => Math.floor(midi / 12) - 1;
const hzText = (hz: number) => hz.toFixed(1).replace(".", ",");

function TuningMenu() {
  const tuning = useSettingsStore((s) => s.referenceTuning);
  return (
    <DropdownMenu.Root>
      <Tooltip label={p.referenceTuning}>
        <DropdownMenu.Trigger asChild>
          <Chip active={tuning !== "standard"} className="inline-flex items-center gap-0.5">
            {p.referenceTunings[tuning]}
            <ChevronDown className="size-3" />
          </Chip>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} className={menuContent}>
          <DropdownMenu.Label className={menuLabel}>{p.referenceTuning}</DropdownMenu.Label>
          {REFERENCE_TUNING_IDS.map((id) => (
            <DropdownMenu.Item
              key={id}
              className={menuItem}
              onSelect={() => useSettingsStore.getState().update({ referenceTuning: id })}
            >
              <Check className={id === tuning ? "size-4" : "size-4 opacity-0"} />
              {p.referenceTunings[id]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Reference note to tune by ear, like the tone generator of a tuner: a key per open string
 * (lowest first, as on a headstock seen from the player) plus the A. A click starts the note,
 * another click or another string stops it; it also stops when the tab is left.
 */
export function ReferenceGroup() {
  const instrument = useSettingsStore((s) => s.referenceInstrument);
  const tuning = useSettingsStore((s) => s.referenceTuning);
  const a4 = useSettingsStore((s) => s.referencePitch);
  const level = useSettingsStore((s) => s.referenceLevel);
  const { update } = useSettingsStore.getState();
  /** MIDI note sounding, or null */
  const [playing, setPlaying] = useState<number | null>(null);
  const strings = openStrings(instrument, tuning);

  /** Whether a note was ever started: until then the audio device is left alone */
  const used = useRef(false);

  useEffect(() => {
    if (playing !== null) used.current = true;
    if (!used.current) return;
    void commands.setReferenceTone(playing === null ? 0 : noteHz(playing, a4), level);
  }, [playing, a4, level]);
  // Leaving the tab (or closing the panel) stops the note
  useEffect(
    () => () => {
      if (used.current) void commands.setReferenceTone(0, 0);
    },
    [],
  );
  // A string that no longer exists (other instrument or tuning) stops too
  const stringKey = strings.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the strings change
  useEffect(() => setPlaying((note) => (note === A_NOTE ? note : null)), [stringKey]);

  const toggle = (note: number) => setPlaying((current) => (current === note ? null : note));
  const L = SETTING_LIMITS;

  return (
    <Group
      title={p.reference}
      hint={p.referenceHint}
      action={
        playing !== null && (
          <Chip onClick={() => setPlaying(null)} className="inline-flex items-center gap-1">
            <Square className="size-2.5 fill-current" />
            {p.stopTone}
          </Chip>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChoiceKeys
          label={p.instrument}
          value={instrument}
          choices={INSTRUMENTS.map((id) => [id, p.instruments[id]] as const)}
          onChange={(referenceInstrument) => update({ referenceInstrument })}
        />
        <TuningMenu />
      </div>
      <div className="flex flex-wrap gap-1">
        {strings.map((note, index) => (
          <Tooltip
            // biome-ignore lint/suspicious/noArrayIndexKey: one key per string, in order
            key={index}
            label={p.stringKey(
              strings.length - index,
              localNoteName(note),
              octave(note),
              hzText(noteHz(note, a4)),
            )}
          >
            <Chip
              active={playing === note}
              aria-pressed={playing === note}
              onClick={() => toggle(note)}
              className="min-w-9"
            >
              {localNoteName(note)}
            </Chip>
          </Tooltip>
        ))}
        <Tooltip label={`${p.aNoteHint} · ${hzText(a4)} Hz`}>
          <Chip
            active={playing === A_NOTE}
            aria-pressed={playing === A_NOTE}
            onClick={() => toggle(A_NOTE)}
            className="ml-auto"
          >
            {p.aNote} {a4}
          </Chip>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tooltip label={p.referencePitchHint}>
          <span className="text-xs text-fg-muted">{p.referencePitch}</span>
        </Tooltip>
        <Stepper
          label={p.referencePitch}
          value={a4}
          min={L.referencePitch.min}
          max={L.referencePitch.max}
          step={L.referencePitch.step}
          defaultValue={L.referencePitch.default}
          onChange={(referencePitch) => update({ referencePitch })}
          format={(hz) => `${hz} Hz`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">{p.referenceLevel}</span>
        <Stepper
          label={p.referenceLevel}
          value={level}
          min={L.referenceLevel.min}
          max={L.referenceLevel.max}
          step={L.referenceLevel.step}
          defaultValue={0.5}
          onChange={(referenceLevel) => update({ referenceLevel })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
      </div>
    </Group>
  );
}
