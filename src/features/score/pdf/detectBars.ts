/**
 * Finds the bars of a printed page of music (standard notation, tab, or both), from its pixels.
 *
 * No note is read: only lines. Staff lines are long horizontal runs; 4 to 6 evenly spaced ones
 * make a staff (5 = notation, 6 = guitar tab, 4 = bass tab). Staves joined by a line at their
 * left edge are one system. A barline is a column dark across the whole height of every staff
 * of its system (a note stem crosses one staff at most, and is not that tall in tab). Between two
 * barlines lies a bar. Printed scores and tab exports are clean enough for this; a scan that is
 * crooked or faint can miss some, and the user can then fix them by hand.
 */

/** A rectangle, in pixels of the analysed image or in 0..1 of the page. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Line {
  y: number;
  x0: number;
  x1: number;
}

interface Staff {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  lines: number;
}

/** Luma below this is ink. */
const INK = 150;
/** A staff line runs over at least this share of the page width. */
const LINE_SHARE = 0.4;
/** A barline is dark over at least this share of each staff's height. */
const BARLINE_FILL = 0.92;
/** Bars narrower than this share of the page width are not bars (double barlines, noise). */
const MIN_BAR_SHARE = 0.025;
/** A page with more ink than this share is a picture, not music (printed music is ~5-15 %). */
const MAX_INK_SHARE = 0.35;

/** Runs shorter than this (pixels) are letters or note heads, not pieces of a line. */
const MIN_PIECE = 12;

/**
 * Ink of row `y` in dark runs of at least `MIN_PIECE` pixels, and where the first and last
 * such run start and end; null with none.
 */
function rowSpan(gray: Uint8ClampedArray, width: number, y: number) {
  let ink = 0;
  let x0 = -1;
  let x1 = -1;
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const dark = x < width && (gray[y * width + x] ?? 255) < INK;
    if (dark && start < 0) start = x;
    if (!dark && start >= 0) {
      if (x - start >= MIN_PIECE) {
        ink += x - start;
        if (x0 < 0) x0 = start;
        x1 = x - 1;
      }
      start = -1;
    }
  }
  return x0 < 0 ? null : { ink, x0, x1 };
}

/** The staff lines of the page, thick ones merged (one per drawn line). */
function staffLines(gray: Uint8ClampedArray, width: number, height: number): Line[] {
  const lines: Line[] = [];
  let current: (Line & { rows: number; sum: number }) | null = null;
  for (let y = 0; y < height; y++) {
    // Tab numbers cut the lines into pieces: what counts is how much of the row is ink,
    // between the first and the last piece longer than a few pixels
    const run = rowSpan(gray, width, y);
    const isLine = run !== null && run.ink >= width * LINE_SHARE;
    if (isLine && run) {
      if (current && y - (current.y + current.rows) <= 1) {
        current.rows++;
        current.sum += y;
        current.x0 = Math.min(current.x0, run.x0);
        current.x1 = Math.max(current.x1, run.x1);
      } else {
        if (current) lines.push({ y: current.sum / current.rows, x0: current.x0, x1: current.x1 });
        current = { y, rows: 1, sum: y, x0: run.x0, x1: run.x1 };
      }
    }
  }
  if (current) lines.push({ y: current.sum / current.rows, x0: current.x0, x1: current.x1 });
  return lines;
}

/**
 * True if most rows inside a staff are paper (a staff, not a dark picture with stripes). Rows
 * are counted over the whole staff: a beam may lie right across the gap between two lines.
 */
function mostlyPaper(gray: Uint8ClampedArray, width: number, group: Line[]) {
  const first = group[0] as Line;
  const last = group.at(-1) as Line;
  const from = Math.round(Math.max(...group.map((l) => l.x0)));
  const to = Math.round(Math.min(...group.map((l) => l.x1)));
  if (to <= from) return false;
  let rows = 0;
  let paper = 0;
  for (let y = Math.ceil(first.y); y <= Math.floor(last.y); y++) {
    let ink = 0;
    for (let x = from; x <= to; x++) if ((gray[y * width + x] ?? 255) < INK) ink++;
    rows++;
    if (ink / (to - from + 1) < 0.3) paper++;
  }
  return rows > 0 && paper / rows >= 0.4;
}

/** How far a staff wanders from even spacing: the largest gap off the mean, as a share of it. */
function unevenness(group: Line[]): number {
  if (group.length < 2) return 1;
  const first = group[0] as Line;
  const mean = ((group.at(-1) as Line).y - first.y) / (group.length - 1);
  let worst = 0;
  for (let k = 1; k < group.length; k++) {
    const gap = (group[k] as Line).y - (group[k - 1] as Line).y;
    worst = Math.max(worst, Math.abs(gap - mean) / mean);
  }
  return worst;
}

/** A line this close to where the next staff line is due (share of the spacing) is on the grid. */
const ON_GRID = 0.15;
/** The lines of one staff start and end together, within this share of the page width. */
const SAME_EDGES = 0.02;
/** Spacings tried from a line: to each of the next few (a beam may lie right under it). */
const SPACING_TRIES = 3;

/**
 * The longest evenly spaced run of up to 6 lines starting at `lines[i]`. Only lines with the
 * same left and right ends join: beams, tuplet brackets and 8va lines run long too, but they
 * start and stop with the notes, and taking them in would bend the staff (and lose its barlines).
 */
function staffFrom(
  width: number,
  lines: Line[],
  i: number,
  height: number,
): { group: Line[]; last: number } {
  const first = lines[i] as Line;
  const edges = width * SAME_EDGES;
  const fits = (line: Line) =>
    Math.abs(line.x0 - first.x0) <= edges && Math.abs(line.x1 - first.x1) <= edges;
  let best: { group: Line[]; last: number } = { group: [first], last: i };
  for (let j = i + 1; j <= i + SPACING_TRIES && j < lines.length; j++) {
    const spacing = (lines[j] as Line).y - first.y;
    if (spacing <= 0 || spacing >= height * 0.05 || !fits(lines[j] as Line)) continue;
    const group = [first];
    let last = i;
    while (group.length < 6) {
      const previous = group.at(-1) as Line;
      // The spacing so far (it settles as lines are added)
      const step = group.length > 1 ? (previous.y - first.y) / (group.length - 1) : spacing;
      const due = previous.y + step;
      let pick = -1;
      for (let k = last + 1; k < lines.length; k++) {
        const line = lines[k] as Line;
        if (line.y > due + step * ON_GRID) break;
        const off = Math.abs(line.y - due);
        if (
          off <= step * ON_GRID &&
          fits(line) &&
          (pick < 0 || off < Math.abs((lines[pick] as Line).y - due))
        ) {
          pick = k;
        }
      }
      if (pick < 0) break;
      group.push(lines[pick] as Line);
      last = pick;
    }
    const better =
      group.length > best.group.length ||
      (group.length === best.group.length && unevenness(group) < unevenness(best.group));
    if (better) best = { group, last };
  }
  return best;
}

/** Staves: evenly spaced runs of 4 to 6 lines (5 = notation, 6 = guitar tab, 4 = bass tab). */
function staves(gray: Uint8ClampedArray, width: number, lines: Line[], height: number): Staff[] {
  const found: Staff[] = [];
  let i = 0;
  while (i < lines.length) {
    const { group, last } = staffFrom(width, lines, i, height);
    if (group.length < 4 || !mostlyPaper(gray, width, group)) {
      i += 1;
      continue;
    }
    found.push({
      top: (group[0] as Line).y,
      bottom: (group.at(-1) as Line).y,
      x0: Math.min(...group.map((l) => l.x0)),
      x1: Math.max(...group.map((l) => l.x1)),
      lines: group.length,
    });
    i = last + 1;
  }
  return found;
}

/** Share of column `x` that is ink from `top` to `bottom` (rows, included). */
function columnFill(
  gray: Uint8ClampedArray,
  width: number,
  x: number,
  top: number,
  bottom: number,
) {
  let ink = 0;
  const from = Math.round(top);
  const to = Math.round(bottom);
  for (let y = from; y <= to; y++) if ((gray[y * width + x] ?? 255) < INK) ink++;
  return to >= from ? ink / (to - from + 1) : 0;
}

/**
 * True if `upper` and `lower` are staves of one system: some column (a barline, or the line at
 * the system's start) runs dark from the top of the one to the bottom of the other. Note stems
 * never bridge two staves, so notation over tab joins and two systems do not.
 */
function joined(gray: Uint8ClampedArray, width: number, upper: Staff, lower: Staff) {
  const from = Math.round(Math.max(upper.x0, lower.x0));
  const to = Math.round(Math.min(upper.x1, lower.x1));
  for (let x = from; x <= to && x < width; x++) {
    if (columnFill(gray, width, x, upper.top, lower.bottom) >= BARLINE_FILL) return true;
  }
  return false;
}

/** Staves grouped into systems (a staff alone is a system of its own). */
function systems(gray: Uint8ClampedArray, width: number, list: Staff[]): Staff[][] {
  const out: Staff[][] = [];
  for (const staff of list) {
    const last = out.at(-1);
    const previous = last?.at(-1);
    if (last && previous && joined(gray, width, previous, staff)) last.push(staff);
    else out.push([staff]);
  }
  return out;
}

/** The barlines of a system: x of each, adjacent dark columns merged. */
function barlines(gray: Uint8ClampedArray, width: number, system: Staff[]): number[] {
  const x0 = Math.min(...system.map((s) => s.x0));
  const x1 = Math.max(...system.map((s) => s.x1));
  const xs: number[] = [];
  let runStart = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const full =
      x <= x1 && system.every((s) => columnFill(gray, width, x, s.top, s.bottom) >= BARLINE_FILL);
    if (full && runStart < 0) runStart = x;
    if (!full && runStart >= 0) {
      xs.push((runStart + x - 1) / 2);
      runStart = -1;
    }
  }
  return xs;
}

/**
 * The bars of one page, in reading order (systems top to bottom, bars left to right), as
 * boxes in 0..1 of the page. `gray` is one luma byte per pixel, rows top to bottom.
 */
export function detectBars(gray: Uint8ClampedArray, width: number, height: number): Box[] {
  // A page mostly dark (a cover, an advert, a photo) holds no staff
  let ink = 0;
  for (let i = 0; i < gray.length; i += 7) if ((gray[i] ?? 255) < INK) ink++;
  if (ink / Math.ceil(gray.length / 7) > MAX_INK_SHARE) return [];
  const minBar = width * MIN_BAR_SHARE;
  const boxes: Box[] = [];
  const found = staves(gray, width, staffLines(gray, width, height), height);
  for (const system of systems(gray, width, found)) {
    const top = (system[0] as Staff).top;
    const bottom = (system.at(-1) as Staff).bottom;
    const left = Math.min(...system.map((s) => s.x0));
    const right = Math.max(...system.map((s) => s.x1));
    // The system's own edges count as barlines when nothing is drawn there
    const edges = [left, ...barlines(gray, width, system), right].sort((a, b) => a - b);
    // A little room above and below: the notes and numbers over the lines belong to the bar
    const pad = Math.max(4, (bottom - top) * 0.15);
    for (let i = 1; i < edges.length; i++) {
      const from = edges[i - 1] as number;
      const to = edges[i] as number;
      if (to - from < minBar) continue;
      boxes.push({
        x: from / width,
        y: Math.max(0, top - pad) / height,
        w: (to - from) / width,
        h: (Math.min(height, bottom + pad) - Math.max(0, top - pad)) / height,
      });
    }
  }
  return boxes;
}

/** Luma of RGBA pixels (canvas ImageData), one byte per pixel. */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const r = rgba[i * 4] ?? 255;
    const g = rgba[i * 4 + 1] ?? 255;
    const b = rgba[i * 4 + 2] ?? 255;
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    // Transparent counts as paper
    gray[i] = Math.round(255 - a * (255 - (0.299 * r + 0.587 * g + 0.114 * b)));
  }
  return gray;
}
