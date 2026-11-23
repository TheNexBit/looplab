import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, sanitizeAppearance } from "@/stores/appearance";
import { appearanceVariables, colorVariables } from "./appearance";

describe("custom colours", () => {
  it("set the picked colour with the shades made from it", () => {
    const variables = colorVariables({ accent: "#42a5f5" });
    expect(variables["--color-accent"]).toBe("#42a5f5");
    expect(variables["--color-accent-soft"]).toBe("rgb(66 165 245 / 0.14)");
    expect(variables["--color-on-accent"]).toBeDefined();
    expect(Object.keys(colorVariables({}))).toEqual([]);
  });

  it("apply only the colours of the current theme", () => {
    const variables = appearanceVariables({
      ...DEFAULT_APPEARANCE,
      theme: "night",
      colors: { rack: { wave: "#ff0000" }, night: { loop: "#00ff00" } },
    });
    expect(variables["--color-loop"]).toBe("#00ff00");
    expect(variables["--color-wave"]).toBeUndefined();
    expect(variables["--radius-control"]).toBe("3px");
  });
});

describe("a stored appearance", () => {
  it("keeps valid values and drops damaged ones", () => {
    const stored = sanitizeAppearance({
      theme: "light",
      colors: { light: { accent: "#123456", wave: "red" }, gone: { accent: "#ffffff" } },
      font: "comic",
      corners: "round",
      uiScale: 9,
    });
    expect(stored.theme).toBe("light");
    expect(stored.colors).toEqual({ light: { accent: "#123456" } });
    expect(stored.font).toBe("inter");
    expect(stored.corners).toBe("round");
    expect(stored.uiScale).toBe(1.5);
  });

  it("starts from the defaults when nothing is stored", () => {
    expect(sanitizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
  });

  it("reads the old overview steps as pixels and keeps dragged heights within their limits", () => {
    expect(sanitizeAppearance({ overviewHeight: "tall" }).overviewHeight).toBe(88);
    expect(sanitizeAppearance({ overviewHeight: 71.6 }).overviewHeight).toBe(72);
    expect(sanitizeAppearance({ overviewHeight: 5 }).overviewHeight).toBe(36);
    expect(sanitizeAppearance({ detailHeight: 9999 }).detailHeight).toBe(600);
    expect(sanitizeAppearance({ detailHeight: "big" }).detailHeight).toBe(140);
  });
});
