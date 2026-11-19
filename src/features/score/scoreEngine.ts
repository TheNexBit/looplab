import * as alphaTab from "@coderline/alphatab";
// The music font (Bravura, SIL OFL) bundled by Vite from the package: nothing copied around
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import { themeColor } from "@/lib/theme";
import type { ProjectScore, ScoreTrack, SyncPoint } from "@/stores/score";
import { type BarSpan, buildTimeline, type Timeline } from "./timeline";

type Api = alphaTab.AlphaTabApi;
type Beat = alphaTab.model.Beat;

/** What the engine asks of the player: Looplab's engine keeps the time, alphaTab follows. */
export interface ScoreHost {
  /** Seconds of the recording */
  duration: () => number;
  position: () => number;
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

export interface ScoreEvents {
  loaded: (tracks: ScoreTrack[], barCount: number, fileSync: SyncPoint[]) => void;
  /** Bars and beats are drawn (again): overlays must be placed again */
  rendered: () => void;
  failed: (message: string) => void;
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

function themeResources(resources: alphaTab.RenderingResources) {
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
export class ScoreEngine {
  private readonly api: Api;
  private readonly output: alphaTab.synth.IExternalMediaSynthOutput;
  private timeline: Timeline | null = null;
  private spans: BarSpan[] = [];
  /** alphaTab's play/pause/seek calls caused by Looplab itself are not sent back */
  private echo = false;
  private lastSent = Number.NaN;
  private view: ProjectScore;
  private sync: SyncPoint[];
  private destroyed = false;

  constructor(
    element: HTMLElement,
    scroller: HTMLElement,
    view: ProjectScore,
    private readonly host: ScoreHost,
    events: ScoreEvents,
  ) {
    this.view = view;
    this.sync = view.sync;
    const settings = new alphaTab.Settings();
    settings.core.useWorkers = true;
    settings.core.engine = "html5";
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

    this.api.scoreLoaded.on((score) => {
      if (this.destroyed) return;
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
      this.applySync(this.sync);
      events.loaded(tracks, score.masterBars.length, fileSync);
    });
    this.api.midiLoaded.on(() => {
      if (this.destroyed) return;
      this.spans = this.readSpans();
      this.timeline = buildTimeline(this.spans, this.sync);
      this.lastSent = Number.NaN;
      this.follow(host.position());
    });
    this.api.postRenderFinished.on(() => {
      if (!this.destroyed) events.rendered();
    });
    this.api.error.on((error) => {
      if (!this.destroyed) events.failed(error.message);
    });
  }

  private handler(): alphaTab.synth.IExternalMediaHandler {
    const host = this.host;
    const self = this;
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
      seekTo(time: number) {
        if (!self.echo) host.seek(time / 1000);
      },
      play() {
        if (!self.echo) host.play();
      },
      pause() {
        if (!self.echo) host.pause();
      },
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
      return { bar, occurrence, startTick: lookup.start, endTick: lookup.end, tempos };
    });
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
      this.api.renderTracks(tracks);
    } else if (redraw) this.api.render();
    if (view.sync !== this.sync) this.applySync(view.sync);
  }

  /** New theme colours: drawn again. */
  retheme() {
    themeResources(this.api.settings.display.resources);
    this.api.updateSettings();
    this.api.render();
  }

  private applySync(sync: SyncPoint[]) {
    this.sync = sync;
    const score = this.api.score;
    if (!score) return;
    score.applyFlatSyncPoints(
      sync.map((p) => ({
        barIndex: p.bar,
        barOccurence: p.occurrence,
        barPosition: p.position,
        millisecondOffset: p.time * 1000,
      })),
    );
    this.api.updateSyncPoints();
    if (this.spans.length > 0) this.timeline = buildTimeline(this.spans, sync);
    this.lastSent = Number.NaN;
    this.follow(this.host.position());
  }

  /** Moves the cursor to `seconds` of the recording (called on every display frame). */
  follow(seconds: number) {
    if (!this.timeline || seconds === this.lastSent) return;
    this.lastSent = seconds;
    this.output.updatePosition(seconds * 1000);
  }

  /** Tells alphaTab the player started or stopped, so its cursor glides or rests. */
  setPlaying(playing: boolean) {
    if (!this.api.isReadyForPlayback) return;
    const isPlaying = this.api.playerState === alphaTab.synth.PlayerState.Playing;
    if (playing === isPlaying) return;
    this.echo = true;
    try {
      if (playing) this.api.play();
      else this.api.pause();
    } finally {
      this.echo = false;
    }
  }

  /** The engine's speed, so the cursor's glide lasts as long as the beat really does. */
  setSpeed(speed: number) {
    this.echo = true;
    try {
      this.api.playbackSpeed = speed;
    } finally {
      this.echo = false;
    }
  }

  get ready() {
    return this.timeline !== null;
  }

  get bars(): readonly BarSpan[] {
    return this.spans;
  }

  /** The bar pass heard at `seconds`, and how far through it (0..1). */
  placeAt(seconds: number): SyncPoint | null {
    const timeline = this.timeline;
    if (!timeline) return null;
    const tick = timeline.tick(seconds);
    const span = timeline.spanAt(tick);
    if (!span) return null;
    const length = span.endTick - span.startTick;
    return {
      bar: span.bar,
      occurrence: span.occurrence,
      position: length > 0 ? (tick - span.startTick) / length : 0,
      time: seconds,
    };
  }

  /** Seconds where a place of the score is heard. */
  timeOf(bar: number, occurrence: number, position: number): number | null {
    const tick = this.timeline?.tickOf(bar, occurrence, position);
    return tick == null || !this.timeline ? null : this.timeline.seconds(tick);
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
        const beatStart = beat.start;
        const beatEnd = beat.end;
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
