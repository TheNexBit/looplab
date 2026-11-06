import { PRESETS } from "@/features/eq/presets";
import { formatSpeed, SPEED_PRESETS } from "@/features/player/limits";
import { detachVideo, dockVideo } from "@/features/video/detach";
import { t } from "@/i18n";
import { type ShortcutId, shortcutLabel, shortcuts } from "@/lib/shortcuts";
import { THEMES } from "@/lib/theme";
import { CHANNEL_MODES, useEqStore } from "@/stores/eq";
import { usePlayerStore } from "@/stores/player";
import { useRecentStore } from "@/stores/recent";
import { useSavedLoopsStore } from "@/stores/savedLoops";
import { useThemeStore } from "@/stores/theme";
import { useUiStore } from "@/stores/ui";
import { useVideoStore } from "@/stores/video";
import { shortcutHandlers } from "./shortcutHandlers";

export interface Action {
  id: string;
  label: string;
  group: string;
  shortcut?: ShortcutId;
  run: () => void;
}

/** Lower case without accents, so "velocita" finds "Velocità". */
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Actions whose every typed word appears in the label or group. */
export function filterActions(actions: Action[], query: string): Action[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return actions.filter((action) => {
    const text = normalize(`${action.label} ${action.group}`);
    return words.every((word) => text.includes(word));
  });
}

/** Everything the command palette can do, built fresh each time it opens. */
export function buildActions(): Action[] {
  const g = t.palette.groups;
  const fromShortcuts = (Object.keys(shortcuts) as ShortcutId[])
    .filter((id) => id !== "commandPalette")
    .map((id) => ({
      id,
      label: shortcutLabel(id),
      group: g.shortcuts,
      shortcut: id,
      run: shortcutHandlers[id],
    }));

  const player = usePlayerStore.getState();
  const eq = useEqStore.getState();
  const ui = useUiStore.getState();
  const video = useVideoStore.getState();

  const actions: Action[] = [
    ...fromShortcuts,
    ...SPEED_PRESETS.map((speed) => ({
      id: `speed-${speed}`,
      label: `${t.transport.speed} ${formatSpeed(speed)}`,
      group: g.playback,
      run: () => player.setSpeed(speed),
    })),
    {
      id: "pitch-reset",
      label: t.palette.resetPitch,
      group: g.playback,
      run: () => player.setPitch(0, 0),
    },
    { id: "panel", label: t.app.toggleSidePanel, group: g.view, run: ui.toggleSidePanel },
    {
      id: "tab-sections",
      label: t.sidePanel.sections,
      group: g.view,
      run: () => ui.setSidePanelTab("sections"),
    },
    { id: "tab-eq", label: t.sidePanel.eq, group: g.view, run: () => ui.setSidePanelTab("eq") },
    {
      id: "eq-bypass",
      label: `${t.eq.title}: ${t.eq.bypass}`,
      group: g.sound,
      run: () => eq.setBypass(!eq.settings.bypass),
    },
    ...PRESETS.map((preset) => ({
      id: `preset-${preset.id}`,
      label: `${t.eq.presets.title}: ${preset.label}`,
      group: g.sound,
      run: () => {
        const settings = preset.settings ?? eq.flat;
        if (settings) eq.setSettings({ ...settings, bypass: false });
      },
    })),
    ...CHANNEL_MODES.map((mode) => ({
      id: `channels-${mode}`,
      label: `${t.eq.channels.title}: ${t.eq.channels[mode]}`,
      group: g.sound,
      run: () => eq.setChannels(mode),
    })),
    ...useSavedLoopsStore.getState().loops.map((loop) => ({
      id: `saved-loop-${loop.id}`,
      label: loop.name,
      group: g.savedLoops,
      run: () => useSavedLoopsStore.getState().recall(loop.id),
    })),
    ...useRecentStore
      .getState()
      .files.filter((file) => file.exists)
      .map((file) => ({
        id: `recent-${file.path}`,
        label: file.name,
        group: t.recent.title,
        run: () => void player.open(file.path),
      })),
    ...THEMES.map((theme) => ({
      id: `theme-${theme}`,
      label: `${t.palette.groups.theme}: ${t.settings.appearance.themes[theme].name}`,
      group: g.app,
      run: () => useThemeStore.getState().setTheme(theme),
    })),
    { id: "diary", label: t.diary.title, group: g.app, run: () => ui.openDialog("diary") },
    { id: "about", label: t.about.title, group: g.app, run: () => ui.openDialog("about") },
    { id: "updates", label: t.updates.check, group: g.app, run: () => ui.openDialog("about") },
  ];

  if (video.status !== "none") {
    actions.push(
      video.detached
        ? { id: "video-dock", label: t.video.dockTop, group: g.view, run: () => void dockVideo() }
        : {
            id: "video-detach",
            label: t.video.detach,
            group: g.view,
            run: () => void detachVideo(),
          },
    );
  }
  return actions;
}
