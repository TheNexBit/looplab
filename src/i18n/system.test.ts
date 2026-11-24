import { afterEach, describe, expect, it, vi } from "vitest";
import { systemLanguage } from "./system";

const withLanguages = (languages: string[]) =>
  vi.spyOn(globalThis.navigator, "languages", "get").mockReturnValue(languages);

describe("first start language", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is Italian on an Italian Windows", () => {
    withLanguages(["it-IT", "en-US"]);
    expect(systemLanguage()).toBe("it");
  });

  it("is English on any other system", () => {
    withLanguages(["de-DE", "it-IT"]);
    expect(systemLanguage()).toBe("en");
    withLanguages(["en-GB"]);
    expect(systemLanguage()).toBe("en");
  });
});
