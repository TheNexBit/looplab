import { Piano, RotateCcw, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { midiLabel } from "@/features/remote/remoteControl";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import {
  comboCaps,
  comboFromEvent,
  type ShortcutId,
  shortcutLabel,
  shortcuts,
} from "@/lib/shortcuts";
import { useKeymapStore } from "@/stores/keymap";
import { useSettingsStore } from "@/stores/settings";

const r = t.remote;

/** Key caps of a combo, or a dash when the action has no key. */
function Caps({ combo }: { combo: string }) {
  const caps = comboCaps(combo);
  if (caps.length === 0) return <span className="text-fg-subtle">{r.noKey}</span>;
  return (
    <span className="inline-flex gap-1">
      {caps.map((cap) => (
        <kbd
          key={cap}
          className="min-w-5 rounded-control border border-border border-b-2 bg-raised-to px-1.5 py-px text-center font-mono text-[10px] text-fg-muted"
        >
          {cap}
        </kbd>
      ))}
    </span>
  );
}

function ActionRow({
  id,
  recording,
  onRecord,
  onRecorded,
}: {
  id: ShortcutId;
  recording: boolean;
  onRecord: (id: ShortcutId | null) => void;
  onRecorded: (loser: ShortcutId | null) => void;
}) {
  const combo = useKeymapStore((s) => s.keys[id]);
  const midi = useKeymapStore((s) => s.midi[id]);
  const learning = useKeymapStore((s) => s.learning === id);
  const keymap = useKeymapStore.getState();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      onRecord(null);
      return;
    }
    const next = comboFromEvent(event.nativeEvent);
    if (!next) return;
    onRecorded(keymap.setKey(id, next));
    onRecord(null);
  };

  return (
    <li className="group flex h-9 items-center gap-2 rounded-control px-2 hover:bg-well">
      <span className="flex-1 truncate text-sm text-fg">{shortcutLabel(id)}</span>
      <button
        type="button"
        onClick={() => onRecord(recording ? null : id)}
        onKeyDown={onKeyDown}
        onBlur={() => recording && onRecord(null)}
        aria-label={`${r.changeKey}: ${shortcutLabel(id)}`}
        className={cn(
          "flex h-7 w-36 items-center justify-center rounded-control text-xs",
          recording
            ? "border border-accent bg-accent-soft text-accent"
            : "hw text-fg-muted hover:brightness-125",
        )}
      >
        {recording ? r.pressKey : <Caps combo={combo} />}
      </button>
      <Button
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:invisible"
        disabled={combo === ""}
        onClick={() => keymap.setKey(id, "")}
        aria-label={`${r.clearKey}: ${shortcutLabel(id)}`}
      >
        <X className="size-3.5" />
      </Button>
      <button
        type="button"
        onClick={() => keymap.learnMidi(learning ? null : id)}
        aria-label={`${r.learn}: ${shortcutLabel(id)}`}
        title={midi ? midiLabel(midi) : r.learn}
        className={cn(
          "flex h-7 w-40 items-center gap-1.5 truncate rounded-control px-2 text-[11px]",
          learning
            ? "border border-loop bg-loop-soft text-loop"
            : midi
              ? "well font-mono text-readout"
              : "hw text-fg-subtle hover:brightness-125",
        )}
      >
        <Piano className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{learning ? r.learning : midi ? midiLabel(midi) : r.learn}</span>
      </button>
      <Button
        size="icon"
        className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:invisible"
        disabled={!midi}
        onClick={() => keymap.setMidi(id, null)}
        aria-label={`${r.clearMidi}: ${shortcutLabel(id)}`}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );
}

/** Settings tab: the key and the MIDI trigger of every action, and media keys. */
export function KeysSettings() {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const globalMediaKeys = useSettingsStore((s) => s.globalMediaKeys);

  return (
    <div className="space-y-3 px-4 pt-3 pb-4">
      <p className="text-xs text-fg-subtle">{r.hint}</p>
      <div className="flex items-start gap-3 rounded-control px-2 py-1">
        <div className="flex-1">
          <p className="text-sm text-fg">{r.globalMediaKeys}</p>
          <p className="text-xs text-fg-subtle">{r.globalMediaKeysHint}</p>
        </div>
        <input
          type="checkbox"
          aria-label={r.globalMediaKeys}
          checked={globalMediaKeys}
          onChange={(event) =>
            useSettingsStore.getState().update({ globalMediaKeys: event.target.checked })
          }
          className="mt-1 size-4 accent-accent"
        />
      </div>
      {notice && (
        <p className="well rounded-control px-2 py-1.5 text-[11px] text-readout">{notice}</p>
      )}
      <ul className="well max-h-[50vh] overflow-y-auto rounded-panel p-1">
        {(Object.keys(shortcuts) as ShortcutId[]).map((id) => (
          <ActionRow
            key={id}
            id={id}
            recording={recording === id}
            onRecord={(next) => {
              setRecording(next);
              if (next) setNotice(null);
            }}
            onRecorded={(loser) =>
              setNotice(loser ? `${r.takenFrom} «${shortcutLabel(loser)}»` : null)
            }
          />
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          variant="hardware"
          onClick={() => {
            useKeymapStore.getState().resetAll();
            setNotice(null);
          }}
        >
          <RotateCcw className="size-3.5" />
          {r.reset}
        </Button>
      </div>
    </div>
  );
}
