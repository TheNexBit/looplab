import type { BarSync } from "./barSync";

/**
 * The bars and sync of the score on screen (a tab's engine or a PDF's clock), for the sync
 * menu, the flags and tap mode. Kept apart from the views so the toolbar does not pull alphaTab
 * or pdf.js in: they load only when a score is shown.
 */
export const activeScore: { engine: BarSync | null } = { engine: null };
