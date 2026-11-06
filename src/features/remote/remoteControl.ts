import { shortcutHandlers } from "@/app/shortcutHandlers";
import { t } from "@/i18n";
import { commands, events, type MediaKeyKind, type MidiTrigger } from "@/lib/bindings";
import type { ShortcutId } from "@/lib/shortcuts";
import { type MidiSignature, useKeymapStore } from "@/stores/keymap";
import { useSettingsStore } from "@/stores/settings";

const midiSignature = ({ kind, channel, number }: MidiTrigger): MidiSignature =>
  `${kind}:${channel}:${number}`;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** "note:1:60" → "Nota C4 · can. 1", for the settings. */
export function midiLabel(signature: MidiSignature): string {
  const [kind, channel, number] = signature.split(":");
  const n = Number(number);
  const m = t.remote;
  const what =
    kind === "note"
      ? `${m.note} ${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
      : kind === "cc"
        ? `${m.cc} ${n}`
        : `${m.program} ${n}`;
  return `${what} · ${m.channel} ${channel}`;
}

const MEDIA_ACTIONS: Record<MediaKeyKind, ShortcutId> = {
  playPause: "playPause",
  next: "nextMarker",
  previous: "previousMarker",
};

/**
 * Pedals and remote keys: MIDI triggers run the action they are assigned to (or get
 * assigned while "learn" is on), media keys pressed in other programs run play/pause and
 * marker jumps when the setting allows it. Started once by the app shell.
 */
export function startRemoteControl(): () => void {
  const onMidi = events.midiTrigger.listen(({ payload }) => {
    const signature = midiSignature(payload);
    const keymap = useKeymapStore.getState();
    if (keymap.learning) {
      keymap.setMidi(keymap.learning, signature);
      return;
    }
    const action = (Object.keys(keymap.midi) as ShortcutId[]).find(
      (id) => keymap.midi[id] === signature,
    );
    if (action) shortcutHandlers[action]();
  });
  const onMediaKey = events.mediaKey.listen(({ payload }) =>
    shortcutHandlers[MEDIA_ACTIONS[payload.key]](),
  );

  const applyMediaKeys = (enabled: boolean) => void commands.setGlobalMediaKeys(enabled);
  applyMediaKeys(useSettingsStore.getState().globalMediaKeys);
  const stopSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.globalMediaKeys !== previous.globalMediaKeys) applyMediaKeys(state.globalMediaKeys);
  });

  return () => {
    void onMidi.then((stop) => stop());
    void onMediaKey.then((stop) => stop());
    stopSettings();
  };
}
