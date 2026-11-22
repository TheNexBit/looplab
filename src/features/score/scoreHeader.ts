/** The header lines alphaTab draws above a score. */
export interface ScoreHeader {
  title: string;
  subTitle: string;
  artist: string;
  album: string;
  words: string;
  music: string;
  copyright: string;
  tab: string;
  instructions: string;
}

const split = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * alphaTab draws each header field as one line, sized for one line: a field holding line breaks
 * (many Guitar Pro files put "Module 02⏎Exercise 03: …" in the title) is drawn over the next one.
 * The title's first line stays the title and its other lines lead the subtitle; any other field
 * with breaks is joined on one line.
 */
export function tidyHeader(score: ScoreHeader) {
  const title = split(score.title);
  if (title.length > 1) {
    score.title = title[0] ?? "";
    score.subTitle = [...title.slice(1), ...split(score.subTitle)].join(" · ");
  }
  const fields = [
    "subTitle",
    "artist",
    "album",
    "words",
    "music",
    "copyright",
    "tab",
    "instructions",
  ] as const;
  for (const field of fields) {
    if (/[\r\n]/.test(score[field])) score[field] = split(score[field]).join(" · ");
  }
}
