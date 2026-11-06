import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "./theme";

const css = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8");

/** Colour names declared in `@theme` whose value comes from the palettes. */
const themed = [...css.matchAll(/(--color-[\w-]+):\s*currentColor;/g)].map((m) => m[1]);

/** The declarations of the palette block of `theme`. */
function palette(theme: string): Map<string, string> {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
  return new Map(
    [...(block?.[1] ?? "").matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1] ?? "",
      m[2] ?? "",
    ]),
  );
}

describe("theme palettes", () => {
  it("name the theme colours", () => {
    expect(themed.length).toBeGreaterThan(40);
  });

  it.each(THEMES)("%s sets every theme colour, and nothing else", (theme) => {
    const colours = palette(theme);
    expect([...colours.keys()].sort()).toEqual([...themed].sort());
    for (const value of colours.values()) expect(value).not.toBe("currentColor");
  });
});
