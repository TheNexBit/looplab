import * as alphaTab from "@coderline/alphatab";
// The music font (Bravura, SIL OFL) bundled by Vite from the package: nothing copied around
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import type { AlignedBar } from "@/lib/bindings";
import { themeColor } from "@/lib/theme";
import type { ProjectScore, ScoreTrack, SyncPoint } from "@/stores/score";
import { useSettingsStore } from "@/stores/settings";
import { BarSync } from "./barSync";
import { tidyHeader, tidyTexts } from "./scoreHeader";
import {
  alignBars,
  type NeckChord,
  neckChords,
  syncFromAligned,
  synthNotes,
  type TabNote,
} from "./scoreNotes";
import type { BarSpan } from "./timeline";

type Api = alphaTab.AlphaTabApi;
type Beat = alphaTab.model.Beat;

/** What the engine reads of the player: Looplab's engine keeps the time, alphaTab follows. */
export interface ScoreHost {
  /** Seconds of the recording */
  duration: () => number;
  position: () => number;
  playing: () => boolean;
}

export interface ScoreEvents {
  loaded: (tracks: ScoreTrack[], barCount: number, fileSync: SyncPoint[]) => void;
  /** Bars and beats are drawn (again): overlays must be placed again */
  rendered: () => void;
  failed: (message: string) => void;
  /** Bars and sync are known (again): where each bar falls in the recording may have moved */
  timed: () => void;
}

/** A rectangle in the score's drawing, in CSS pixels from its top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STAVES: Record<ProjectScore["staves"], alphaTab.StaveProfile> = {
  both: alphaTab.StaveProfile.Default,
  tab: alphaTab.StaveProfile.Tab,
  notation: alphaTab.StaveProfile.Score,
};
const LAYOUTS: Record<ProjectScore["layout"], alphaTab.LayoutMode> = {
  page: alphaTab.LayoutMode.Page,
  horizontal: alphaTab.LayoutMode.Horizontal,
};
const FOLLOW: Record<ProjectScore["follow"], alphaTab.ScrollMode> = {
  continuous: alphaTab.ScrollMode.Continuous,
  paged: alphaTab.ScrollMode.OffScreen,
  off: alphaTab.ScrollMode.Off,
};

/** A theme colour as alphaTab's Color (any CSS colour, normalised by the canvas). */
const probe =
  typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
function color(css: string, alpha = 1): alphaTab.model.Color {
  let hex = "#888888";
  if (probe) {
    probe.fillStyle = "#888888";
    probe.fillStyle = css;
    hex = String(probe.fillStyle);
  }
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const rgba = /rgba?\(([^)]+)\)/
    .exec(hex)?.[1]
    ?.split(",")
    .map((v) => Number.parseFloat(v));
  const [r, g, b, a] = match
    ? [
        Number.parseInt(match[1] ?? "88", 16),
        Number.parseInt(match[2] ?? "88", 16),
        Number.parseInt(match[3] ?? "88", 16),
        1,
      ]
    : [rgba?.[0] ?? 136, rgba?.[1] ?? 136, rgba?.[2] ?? 136, rgba?.[3] ?? 1];
  return new alphaTab.model.Color(r, g, b, Math.round(255 * a * alpha));
}

/** Ink on light paper: like a printed page, the same in every theme. */
const PRINTED = { main: "#1b1917", secondary: "#4a4540", lines: "#8c857c", numbers: "#7a736a" };

/** Dark paper takes the theme's own ink; light paper is printed black (see `.score-paper`). */
function themeResources(resources: alphaTab.RenderingResources) {
  if (!useSettingsStore.getState().scoreDark) {
    resources.mainGlyphColor = color(PRINTED.main);
    resources.secondaryGlyphColor = color(PRINTED.secondary);
    resources.scoreInfoColor = color(PRINTED.main);
    resources.staffLineColor = color(PRINTED.lines);
    resources.barSeparatorColor = color(PRINTED.lines);
    resources.barNumberColor = color(PRINTED.numbers);
    return;
  }
  resources.mainGlyphColor = color(themeColor("fg"));
  resources.secondaryGlyphColor = color(themeColor("fg-muted"));
  resources.scoreInfoColor = color(themeColor("fg"));
  resources.staffLineColor = color(themeColor("fg-subtle"), 0.8);
  resources.barSeparatorColor = color(themeColor("fg-subtle"));
  resources.barNumberColor = color(themeColor("fg-subtle"));
}

/**
 * One alphaTab view of a score, driven by Looplab's player. alphaTab draws (in a worker, only
 * what comes into view) and moves its cursor from the positions it is given; it never plays a
 * sound. Clicks, loops and sync go through `timeline`, built from the score's own bars.
 */
export class ScoreEngine extends BarSync {
  private readonly api: Api;
  private readonly output: alphaTab.synth.IExternalMediaSynthOutput;
  private lastSent = Number.NaN;
  private view: ProjectScore;
  private destroyed = false;
  /** The notes of the shown tracks, read once per load / track choice */
  private tabNotes: TabNote[] | null = null;

  constructor(
    element: HTMLElement,
    scroller: HTMLElement,
    view: ProjectScore,
    private readonly host: ScoreHost,
    private readonly events: ScoreEvents,
  ) {
    super();
    this.view = view;
    this.sync = view.sync;
    const settings = new alphaTab.Settings();
    settings.core.useWorkers = true;
    // SVG: alphaTab's canvas engine loses its drawing context on some bends (alphaTab 1.9)
    settings.core.engine = "svg";
    settings.core.enableLazyLoading = true;
    settings.core.smuflFontSources = new Map([[alphaTab.FontFileFormat.Woff2, bravuraWoff2]]);
    settings.display.layoutMode = LAYOUTS[view.layout];
    settings.display.staveProfile = STAVES[view.staves];
    settings.display.scale = view.zoom;
    themeResources(settings.display.resources);
    settings.player.playerMode = alphaTab.PlayerMode.EnabledExternalMedia;
    settings.player.enableCursor = true;
    settings.player.enableAnimatedBeatCursor = true;
    settings.player.enableElementHighlighting = false;
    // Clicks and drags are Looplab's (seek, loop), not alphaTab's own selection
    settings.player.enableUserInteraction = false;
    settings.player.scrollElement = scroller;
    settings.player.scrollMode = FOLLOW[view.follow];
    settings.player.scrollOffsetY = -24;
    settings.player.scrollSpeed = 250;
    this.api = new alphaTab.AlphaTabApi(element, settings);
    this.output = this.api.player?.output as unknown as alphaTab.synth.IExternalMediaSynthOutput;
    this.output.handler = this.handler();

    // A bar that fits in the upper half of the view with the page at its very top is shown from
    // the top: the title stays in sight at opening, instead of a scroll down to the first system
    const ui = this.api.uiFacade;
    const scrollToY = ui.scrollToY.bind(ui);
    ui.scrollToY = (container, offset, speed) =>
      scrollToY(container, offset < scroller.clientHeight * 0.5 ? 0 : offset, speed);

    this.api.scoreLoaded.on((score) => {
      if (this.destroyed) return;
      tidyHeader(score);
      tidyTexts(score);
      const tracks: ScoreTrack[] = score.tracks.map((track) => ({
        index: track.index,
        name: track.name || track.shortName || `Traccia ${track.index + 1}`,
        percussion: track.isPercussion,
      }));
      const fileSync: SyncPoint[] = score.exportFlatSyncPoints().map((p) => ({
        bar: p.barIndex,
        occurrence: p.barOccurence,
        position: p.barPosition,
        time: p.millisecondOffset / 1000,
      }));
      // The song's own sync rules, not the file's (that one is only offered in the menu); the
      // song's is applied once the bars are known and its points can be checked
      score.applyFlatSyncPoints([]);
      events.loaded(tracks, score.masterBars.length, fileSync);
    });
    this.api.midiLoaded.on(() => {
      if (this.destroyed) return;
      this.tabNotes = null;
      this.setSpans(this.readSpans());
      this.applySync(this.sync);
      // alphaTab hands the score's sync points to its player only after this event: applied
      // again once it is done, or a song reopened would follow the written tempo instead
      setTimeout(() => {
        if (!this.destroyed) this.applySync(this.sync);
      }, 0);
      this.setPlaying(host.playing());
    });
    this.api.postRenderFinished.on(() => {
      if (!this.destroyed) events.rendered();
    });
    this.api.error.on((error) => {
      if (!this.destroyed) events.failed(error.message);
    });
  }

  /**
   * alphaTab only shows: it never drives the player. Clicks and drags are Looplab's own, and
   * the seek/pause alphaTab sends by itself (its "song" ends where the score ends, earlier
   * than the recording) must not reach the engine.
   */
  private handler(): alphaTab.synth.IExternalMediaHandler {
    const host = this.host;
    return {
      get backingTrackDuration() {
        return host.duration() * 1000;
      },
      // Speed is the engine's: the positions given already are in recording time
      get playbackRate() {
        return 1;
      },
      set playbackRate(_rate: number) {},
      get masterVolume() {
        return 1;
      },
      set masterVolume(_volume: number) {},
      seekTo() {},
      play() {},
      pause() {},
    };
  }

  /** Every pass through every bar, in playback order, from alphaTab's MIDI. */
  private readSpans(): BarSpan[] {
    const lookups = this.api.tickCache?.masterBars ?? [];
    const passes = new Map<number, number>();
    return lookups.map((lookup) => {
      const bar = lookup.masterBar.index;
      const occurrence = passes.get(bar) ?? 0;
      passes.set(bar, occurrence + 1);
      const tempos = [{ tick: lookup.start, bpm: lookup.tempo }];
      for (const change of lookup.tempoChanges) {
        if (change.tick > lookup.start) tempos.push({ tick: change.tick, bpm: change.tempo });
        else if (tempos[0]) tempos[0].bpm = change.tempo;
      }
      return {
        bar,
        occurrence,
        startTick: lookup.start,
        endTick: lookup.end,
        tempos,
        beatsPerBar: lookup.masterBar.timeSignatureNumerator,
        beatUnit: lookup.masterBar.timeSignatureDenominator,
      };
    });
  }

  /** Every note of the shown tracks (drums left out), in playback order. */
  private notes(): TabNote[] {
    if (this.tabNotes) return this.tabNotes;
    const score = this.api.score;
    if (!score || this.spans.length === 0) return [];
    const shown = (this.view.tracks.length > 0 ? this.view.tracks : [0])
      .map((i) => score.tracks[i])
      .filter((track) => track !== undefined);
    const notes: TabNote[] = [];
    this.spans.forEach((span, index) => {
      for (const track of shown) {
        for (const staff of track.staves) {
          if (staff.isPercussion) continue;
          const strings = staff.isStringed ? staff.tuning.length : 0;
          const bar = staff.bars[span.bar];
          if (!bar) continue;
          for (const voice of bar.voices) {
            for (const beat of voice.beats) {
              if (beat.isRest) continue;
              const tick = span.startTick + beat.playbackStart;
              for (const note of beat.notes) {
                // A tied note goes on ringing: it is not struck again
                if (note.isTieDestination) continue;
                notes.push({
                  span: index,
                  tick,
                  endTick: tick + beat.playbackDuration,
                  midi: note.realValue,
                  velocity: 0.35 + (Number(note.dynamics) / 7) * 0.65,
                  string: strings > 0 ? note.string : 0,
                  fret: note.fret,
                  strings,
                  dead: note.isDead,
                });
              }
            }
          }
        }
      }
    });
    notes.sort((a, b) => a.tick - b.tick || a.string - b.string);
    this.tabNotes = notes;
    return notes;
  }

  /** Strings of the first shown track (lowest first, MIDI), or empty if it has none. */
  tuning(): number[] {
    const score = this.api.score;
    const track = score?.tracks[this.view.tracks[0] ?? 0];
    const staff = track?.staves.find((s) => s.isStringed && !s.isPercussion);
    // alphaTab lists the strings from the highest
    return staff ? [...staff.tuning].reverse() : [];
  }

  /** The notes for the synth over the track (seconds of the recording, transposed). */
  synthNotes(semitones: number) {
    const timeline = this.timeline;
    return timeline ? synthNotes(this.notes(), timeline, semitones) : [];
  }

  /** The chords the neck lights up, in seconds of the recording. */
  neckChords(): NeckChord[] {
    const timeline = this.timeline;
    return timeline ? neckChords(this.notes(), timeline) : [];
  }

  /** What the automatic sync needs: bars at the written tempo with their notes. */
  alignBars() {
    return alignBars(this.spans, this.notes());
  }

  /** Sync points from the bar starts the automatic sync found, and the bars to check. */
  syncFromAligned(found: AlignedBar[]) {
    return syncFromAligned(this.spans, found);
  }

  load(bytes: Uint8Array) {
    this.api.load(bytes, this.view.tracks.length > 0 ? this.view.tracks : [0]);
  }

  /** Applies what changed in the view (staves, layout, follow, zoom, tracks) and redraws. */
  setView(view: ProjectScore) {
    const before = this.view;
    this.view = view;
    const settings = this.api.settings;
    let redraw = false;
    if (view.staves !== before.staves) {
      settings.display.staveProfile = STAVES[view.staves];
      redraw = true;
    }
    if (view.layout !== before.layout) {
      settings.display.layoutMode = LAYOUTS[view.layout];
      redraw = true;
    }
    if (view.zoom !== before.zoom) {
      settings.display.scale = view.zoom;
      redraw = true;
    }
    if (view.follow !== before.follow) settings.player.scrollMode = FOLLOW[view.follow];
    this.api.updateSettings();
    const score = this.api.score;
    if (score && view.tracks.join() !== before.tracks.join()) {
      const tracks = (view.tracks.length > 0 ? view.tracks : [0])
        .map((i) => score.tracks[i])
        .filter((track) => track !== undefined);
      this.tabNotes = null;
      this.api.renderTracks(tracks);
    } else if (redraw) this.api.render();
    if (view.sync !== this.sync) this.applySync(view.sync);
  }

  /** New theme colours or paper: drawn again. */
  retheme() {
    themeResources(this.api.settings.display.resources);
    this.api.updateSettings();
    this.api.render();
  }

  private applySync(saved: SyncPoint[]) {
    // Points that contradict each other (two at the same second…) are left out: they would
    // stall alphaTab. With no bars known yet (before midiLoaded) nothing is applied
    const sync = this.setSync(saved);
    const score = this.api.score;
    if (!score || this.spans.length === 0) return;
    score.applyFlatSyncPoints(
      sync.map((p) => ({
        barIndex: p.bar,
        barOccurence: p.occurrence,
        barPosition: p.position,
        millisecondOffset: p.time * 1000,
      })),
    );
    this.api.updateSyncPoints();
    this.lastSent = Number.NaN;
    this.follow(this.host.position());
    this.events.timed();
  }

  /** Moves the cursor to `seconds` of the recording (called on every display frame). */
  follow(seconds: number) {
    const timeline = this.timeline;
    if (!timeline || seconds === this.lastSent) return;
    this.lastSent = seconds;
    // Past the score's end the cursor rests on its last beat (alphaTab would start over)
    const end = timeline.seconds(timeline.endTick) - 0.005;
    this.output.updatePosition(Math.min(seconds, end) * 1000);
  }

  /**
   * Tells alphaTab the player started or stopped, so its cursor glides or rests. Its speed
   * stays 1: the positions it gets are already in recording time, whatever the engine's speed.
   */
  setPlaying(playing: boolean) {
    if (!this.api.isReadyForPlayback) return;
    const isPlaying = this.api.playerState === alphaTab.synth.PlayerState.Playing;
    if (playing === isPlaying) return;
    if (playing) this.api.play();
    else this.api.pause();
  }

  /** The beat under a point of the drawing (CSS pixels from its top left). */
  beatAt(x: number, y: number): Beat | null {
    return this.api.renderer.boundsLookup?.getBeatAtPos(x, y) ?? null;
  }

  /**
   * Where `beat` is heard: seconds of its start and end. A beat in a repeated bar is heard
   * more than once: the pass nearest `near` (seconds) is taken.
   */
  beatTime(beat: Beat, near: number): { start: number; end: number } | null {
    const timeline = this.timeline;
    if (!timeline) return null;
    const bar = beat.voice.bar.index;
    let best: { start: number; end: number } | null = null;
    for (const span of this.spans) {
      if (span.bar !== bar) continue;
      const start = timeline.seconds(span.startTick + beat.playbackStart);
      const end = timeline.seconds(span.startTick + beat.playbackStart + beat.playbackDuration);
      if (!best || Math.abs(start - near) < Math.abs(best.start - near)) best = { start, end };
    }
    return best;
  }

  /**
   * Rectangles covering what is heard from `start` to `end` seconds, one per system ("row")
   * it crosses, and the rest of each system (`outside`), for the loop's band and its dimming.
   */
  regionRects(start: number, end: number): { inside: Rect[]; outside: Rect[] } {
    const lookup = this.api.renderer.boundsLookup;
    const timeline = this.timeline;
    const tickCache = this.api.tickCache;
    if (!lookup || !timeline || !tickCache) return { inside: [], outside: [] };
    const from = timeline.tick(start);
    const to = timeline.tick(end);
    const covered = new Map<alphaTab.rendering.StaffSystemBounds, { min: number; max: number }>();
    for (const bar of tickCache.masterBars) {
      if (bar.end <= from || bar.start >= to) continue;
      for (let beat = bar.firstBeat; beat; beat = beat.nextBeat) {
        // A beat's ticks count from the start of its bar
        const beatStart = bar.start + beat.start;
        const beatEnd = bar.start + beat.end;
        if (beatEnd <= from || beatStart >= to) {
          if (beat === bar.lastBeat) break;
          continue;
        }
        for (const item of beat.highlightedBeats) {
          const bounds = lookup.findBeat(item.beat);
          const system = bounds?.barBounds.masterBarBounds.staffSystemBounds;
          if (!bounds || !system) continue;
          const left = bounds.realBounds.x;
          const right = left + bounds.realBounds.w;
          const seen = covered.get(system);
          covered.set(system, {
            min: Math.min(seen?.min ?? left, left),
            max: Math.max(seen?.max ?? right, right),
          });
        }
        if (beat === bar.lastBeat) break;
      }
    }
    const inside: Rect[] = [];
    const outside: Rect[] = [];
    for (const system of lookup.staffSystems) {
      const { x, y, w, h } = system.realBounds;
      const part = covered.get(system);
      if (!part) {
        outside.push({ x, y, w, h });
        continue;
      }
      inside.push({ x: part.min, y, w: part.max - part.min, h });
      if (part.min > x) outside.push({ x, y, w: part.min - x, h });
      if (part.max < x + w) outside.push({ x: part.max, y, w: x + w - part.max, h });
    }
    return { inside, outside };
  }

  destroy() {
    this.destroyed = true;
    this.output.handler = undefined;
    this.api.destroy();
  }
}
