/** Languages the interface is translated into. */
export type UiLanguage = "it" | "en";

/**
 * The language a first start shows: Italian on an Italian Windows, English everywhere
 * else. WebView2 reports the system's display language through `navigator.languages`.
 */
export function systemLanguage(): UiLanguage {
  const nav = globalThis.navigator;
  const first = nav?.languages?.[0] ?? nav?.language ?? "";
  return first.toLowerCase().startsWith("it") ? "it" : "en";
}
