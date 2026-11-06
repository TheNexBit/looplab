import { create } from "zustand";
import { readStored, writeStored } from "@/lib/storage";
import { applyTheme, DEFAULT_THEME, isTheme, type ThemeId } from "@/lib/theme";

const KEY = "looplab.theme";

/** The theme chosen on this PC (default when none was chosen or it no longer exists). */
export function storedTheme(): ThemeId {
  const stored = readStored(KEY);
  return isTheme(stored) ? stored : DEFAULT_THEME;
}

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

/**
 * Colour theme of this PC, like the Theme menu of Ableton or the theme of Reaper: applied at
 * once and remembered. Kept apart from the other settings, so "Default values" leaves it alone.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: storedTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    writeStored(KEY, theme);
    set({ theme });
  },
}));
