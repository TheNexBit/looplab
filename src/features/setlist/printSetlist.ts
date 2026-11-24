import { t } from "@/i18n";
import type { Setlist_Serialize as Setlist } from "@/lib/bindings";
import { formatLength } from "@/lib/time";
import { isBreak, playLength, setLength, songNumbers } from "./setlistMath";

const s = t.setlist;

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** The page printed for the stage: big titles, number, key and length, breaks as dividers. */
export function printableSetlist(setlist: Setlist): string {
  const numbers = songNumbers(setlist.songs);
  const rows = setlist.songs
    .map((song) => {
      const length = playLength(song);
      const time = length === null ? "" : formatLength(length);
      if (isBreak(song)) {
        return `<tr class="break"><td></td><td>— ${escapeHtml(song.title)} —</td><td></td><td>${time}</td></tr>`;
      }
      const notes = song.notes ? `<div class="notes">${escapeHtml(song.notes)}</div>` : "";
      const segue = song.segue ? ' <span class="segue">→</span>' : "";
      return `<tr><td class="n">${numbers.get(song.id) ?? ""}</td><td><div class="title">${escapeHtml(
        song.title,
      )}${segue}</div>${notes}</td><td class="key">${escapeHtml(song.key ?? "")}</td><td class="time">${time}</td></tr>`;
    })
    .join("");
  const date = setlist.date
    ? new Date(`${setlist.date}T12:00:00`).toLocaleDateString(s.locale, { dateStyle: "full" })
    : "";
  const details = [date, setlist.venue].filter(Boolean).map(escapeHtml).join(" · ");
  const total = formatLength(setLength(setlist.songs).seconds);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(setlist.name)}</title>
<style>
@page { margin: 14mm; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #000; }
h1 { font-size: 26pt; margin: 0; }
.details { font-size: 12pt; color: #444; margin: 2pt 0 10pt; }
table { width: 100%; border-collapse: collapse; }
td { padding: 5pt 4pt; border-bottom: 1px solid #bbb; vertical-align: top; }
.n { width: 26pt; font-size: 16pt; color: #555; text-align: right; }
.title { font-size: 20pt; font-weight: 700; }
.notes { font-size: 11pt; color: #333; white-space: pre-wrap; }
.key { width: 46pt; font-size: 16pt; font-weight: 700; text-align: center; }
.time { width: 54pt; font-size: 13pt; text-align: right; font-variant-numeric: tabular-nums; }
.break td { font-size: 14pt; font-style: italic; color: #555; border-bottom: 2px dashed #888; }
.segue { font-size: 14pt; color: #555; }
.total { margin-top: 8pt; font-size: 12pt; text-align: right; }
</style></head><body>
<h1>${escapeHtml(setlist.name || s.untitled)}</h1>
<div class="details">${details}</div>
<table>${rows}</table>
<div class="total">${s.printTotal(total)}</div>
</body></html>`;
}

/** Opens the system print dialog (printer or «Save as PDF») with the stage page of the setlist. */
export function printSetlist(setlist: Setlist) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  frame.srcdoc = printableSetlist(setlist);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Removed once the dialog is closed (print() returns then)
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}
