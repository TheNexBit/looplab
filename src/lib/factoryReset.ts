import { forgetAllBut } from "@/lib/storage";
import { applyUiScale } from "@/stores/appearance";

/**
 * What a factory reset keeps: what the user made, not how the app looks or behaves. Courses,
 * tracks, loops, markers, the diary and the backups live in the library, not in these
 * preferences, so they stay anyway.
 */
const KEPT = new Set(["looplab.metronomeLibrary"]);

/**
 * Back to the factory state (docs/VALORI-DI-FABBRICA.md): settings, look, keys, panel sizes
 * and the metronome's setup are forgotten, then the app starts again from its defaults.
 */
export async function factoryReset() {
  await forgetAllBut(KEPT);
  // The zoom of the page outlives a reload: back to 100% first
  applyUiScale(1);
  window.location.reload();
}
