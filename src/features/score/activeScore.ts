import type { ScoreEngine } from "./scoreEngine";

/**
 * The score engine on screen (one score view at a time), for the sync menu. Kept apart from
 * the view so the toolbar does not pull alphaTab in: it loads only when a score is shown.
 */
export const activeScore: { engine: ScoreEngine | null } = { engine: null };
