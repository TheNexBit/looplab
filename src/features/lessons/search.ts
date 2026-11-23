/**
 * The lesson search: words in any order, case and accents aside, and which letters of a name
 * to light so the eye finds why it matched.
 */

/** Lower case, accents taken off: «Arpège» and «arpege» are the same word. */
export function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The words of a search ("Légato  01" → legato, 01). */
export function searchWords(query: string): string[] {
  return plain(query).split(/\s+/).filter(Boolean);
}

/** True when every word is somewhere in `text`, in any order. */
export function matches(text: string, words: readonly string[]): boolean {
  const haystack = plain(text);
  return words.every((word) => haystack.includes(word));
}

/** `text` cut into pieces, the ones holding a searched word marked `lit`. */
export function litParts(text: string, words: readonly string[]): { text: string; lit: boolean }[] {
  const chars = [...text];
  // Accents off one letter at a time, so every place in the folded text is the same letter
  const folded = chars.map((ch) => plain(ch).slice(0, 1) || ch).join("");
  const lit = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    let at = folded.indexOf(word);
    while (at >= 0) {
      for (let i = at; i < at + word.length; i++) lit[i] = true;
      at = folded.indexOf(word, at + 1);
    }
  }
  const parts: { text: string; lit: boolean }[] = [];
  chars.forEach((ch, i) => {
    const on = lit[i] ?? false;
    const last = parts.at(-1);
    if (last && last.lit === on) last.text += ch;
    else parts.push({ text: ch, lit: on });
  });
  return parts;
}
