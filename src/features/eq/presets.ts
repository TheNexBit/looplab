import { t } from "@/i18n";
import type { BandData, EqData } from "@/stores/eq";

const band = (kind: BandData["kind"], frequency: number, gain: number, q: number): BandData => ({
  enabled: true,
  kind,
  frequency,
  gain,
  q,
});

export interface Preset {
  id: "flat" | "bass" | "guitar" | "voice";
  label: string;
  /** `null` means "the flat settings from Rust" */
  settings: EqData | null;
}

/** Starting points for listening to one instrument; tweak freely afterwards. */
export const PRESETS: Preset[] = [
  { id: "flat", label: t.eq.presets.flat, settings: null },
  {
    id: "bass",
    label: t.eq.presets.bass,
    settings: {
      bypass: false,
      bands: [
        band("lowShelf", 120, 6, 0.7),
        band("peak", 250, 3, 1),
        band("peak", 800, -4, 1),
        band("peak", 2_500, -8, 1),
        band("lowPass", 1_500, 0, 0.7),
      ],
    },
  },
  {
    id: "guitar",
    label: t.eq.presets.guitar,
    settings: {
      bypass: false,
      bands: [
        band("highPass", 150, 0, 0.7),
        band("peak", 400, 2, 1),
        band("peak", 1_200, 3, 1),
        band("peak", 2_800, 5, 1.2),
        band("highShelf", 7_000, -4, 0.7),
      ],
    },
  },
  {
    id: "voice",
    label: t.eq.presets.voice,
    settings: {
      bypass: false,
      bands: [
        band("highPass", 180, 0, 0.7),
        band("peak", 300, -3, 1),
        band("peak", 1_000, 3, 1),
        band("peak", 3_000, 4, 1),
        band("highShelf", 9_000, -3, 0.7),
      ],
    },
  },
];
