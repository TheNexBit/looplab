import { describe, expect, it } from "vitest";
import { systemLanguage } from "@/i18n/system";
import { SETTINGS_DEFAULTS, sanitize } from "./settings";

describe("factory values (docs/VALORI-DI-FABBRICA.md)", () => {
  it("a first start, or a damaged file, gets exactly the factory values", () => {
    expect(sanitize({})).toEqual(SETTINGS_DEFAULTS);
  });

  it("keeps the values chosen with the user", () => {
    expect(SETTINGS_DEFAULTS).toMatchObject({
      language: systemLanguage(),
      startup: "empty",
      trackVolume: 1,
      clickVolume: 0.8,
      trackMuted: false,
      clickMuted: false,
      metronome: false,
      countIn: false,
      countInBars: 1,
      followPlayhead: true,
      followMode: "page",
      snap: true,
      returnToStart: true,
      resumePosition: true,
      showOverview: true,
      showGrid: true,
      waveStyle: "filled",
      wheel: "zoom",
      openView: "start",
      afterLoop: "start",
      scoreDark: false,
      scoreNeck: false,
      scoreSynth: false,
      infoBar: false,
      referencePitch: 440,
      homeView: "courses",
      liveMode: "set",
      liveChangeSeconds: 10,
      setlistAutoAdvance: true,
    });
  });
});
