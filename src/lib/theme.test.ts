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

  /**
   * WCAG contrast ratio of two #rrggbb colours: 1 (none) to 21 (black on white). Text needs
   * 4.5 to be read comfortably, 7 is the strict level.
   */
  const contrast = (a: string, b: string) => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  /** Pairs every theme must keep readable: [text, background, minimum ratio]. */
  const readable: [string, string, number][] = [
    ["--color-fg", "--color-bg-from", 7],
    ["--color-fg-muted", "--color-bg-from", 4.5],
    ["--color-fg-subtle", "--color-bg-from", 4.5],
    ["--color-lcd-fg", "--color-lcd", 4.5],
    ["--color-lcd-dim", "--color-lcd", 3],
    // Studio light's lit keys sit at 3.3: the floor, not the goal
    ["--color-on-accent", "--color-accent", 3],
  ];

  it.each(THEMES)("%s keeps its text readable", (theme) => {
    const colours = palette(theme);
    for (const [text, background, minimum] of readable) {
      const ratio = contrast(colours.get(text) ?? "", colours.get(background) ?? "");
      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });
});
