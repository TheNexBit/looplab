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

/** The parts of a score that carry free text over the staves (alphaTab's model, read loosely). */
interface ScoreTexts {
  masterBars: { section?: { text: string; marker: string } | null }[];
  tracks: { staves: { bars: { voices: { beats: { text?: string | null }[] }[] }[] }[] }[];
}

/** Longest annotation joined on one line: a longer one would run past the page and be cut. */
const ONE_LINE_MAX = 40;

/**
 * Same trouble over the staves: a beat's text or a section name with line breaks is spaced
 * tightly, so its lines touch. A short one is joined on one line; a long one ("Position
 * shifts!⏎…") keeps its lines, since alphaTab never wraps and clips what runs past the page:
 * lines that touch still read, words cut off do not.
 */
export function tidyTexts(score: ScoreTexts) {
  const oneLine = (text: string) => {
    if (!/[\r\n]/.test(text)) return text;
    const joined = split(text).join(" ");
    return joined.length <= ONE_LINE_MAX ? joined : text;
  };
  for (const bar of score.masterBars) {
    if (bar.section) {
      bar.section.text = oneLine(bar.section.text);
      bar.section.marker = oneLine(bar.section.marker);
    }
  }
  for (const track of score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats) if (beat.text) beat.text = oneLine(beat.text);
}
