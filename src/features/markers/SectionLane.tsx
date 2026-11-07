import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { withRightClick } from "@/components/ui/Tooltip";
import { DRAG_PX, timeAtX } from "@/features/waveform/pointer";
import { percentOfTrack, useTimeStrip } from "@/features/waveform/useTimeStrip";
import { t } from "@/i18n";
import { followPointer } from "@/lib/followPointer";
import { clamp } from "@/lib/time";
import { useAnimationFrame } from "@/lib/useAnimationFrame";
import {
  roomAround,
  type SectionData,
  sectionColor,
  sortedSections,
  useMarkersStore,
} from "@/stores/markers";
import { currentPosition, trackDuration, usePlayerStore } from "@/stores/player";
import { dragAlongTime } from "./dragAlongTime";
import { SectionMenu } from "./SectionMenu";
import { loopSection } from "./sectionActions";
import { snapTime } from "./snap";

const m = t.markers;

/** Placement of a stretch of the track on the strip, in percent of the track. */
const place = (start: number, end: number, duration: number) => {
  const left = percentOfTrack(start, duration);
  return { left: `${left}%`, width: `${percentOfTrack(end, duration) - left}%` };
};

/** Moves a whole section with the pointer, keeping its length, inside its free room. */
function dragSection(event: ReactPointerEvent, area: HTMLElement | null, section: SectionData) {
  if (!area) return;
  const grab = timeAtX(area, event.clientX) - section.start;
  const length = section.end - section.start;
  dragAlongTime(
    event,
    area,
    (time) => {
      const markers = useMarkersStore.getState();
      const { min, max } = roomAround(markers.sections, section.id, trackDuration());
      const wanted = snapTime(time - grab, area, { sectionId: section.id });
      const start = clamp(wanted, min, Math.max(min, max - length));
      markers.setSectionBounds(section.id, start, start + length, trackDuration());
    },
    // A click without moving: the playhead goes to the section, like a Reaper region
    () => usePlayerStore.getState().seek(section.start),
  );
}

/** Drags one edge of a section: its start (`"start"`) or its end. */
function dragEdge(
  event: ReactPointerEvent,
  area: HTMLElement | null,
  section: SectionData,
  edge: "start" | "end",
) {
  dragAlongTime(event, area, (time) => {
    const snapped = snapTime(time, area, { sectionId: section.id });
    const current = useMarkersStore.getState().sections.find((s) => s.id === section.id);
    if (!current) return;
    const start = edge === "start" ? Math.min(snapped, current.end) : current.start;
    const end = edge === "end" ? Math.max(snapped, current.start) : current.end;
    useMarkersStore.getState().setSectionBounds(section.id, start, end, trackDuration());
  });
}

/** The section opened with S and not closed yet: it grows with the playhead. */
function PendingSection() {
  const ref = useRef<HTMLDivElement>(null);
  const pending = useMarkersStore((s) => s.pendingSection);
  useAnimationFrame(() => {
    const element = ref.current;
    if (!element || pending === null) return;
    const position = currentPosition();
    const { left, width } = place(
      Math.min(pending, position),
      Math.max(pending, position),
      trackDuration(),
    );
    element.style.left = left;
    element.style.width = width;
  });
  if (pending === null) return null;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 bottom-0 flex items-center overflow-hidden rounded-[2px] border border-dashed border-accent bg-accent/15 px-1.5 text-[10px] font-semibold tracking-[0.04em] text-accent uppercase"
    >
      <span className="truncate">{m.sectionOpen}</span>
    </div>
  );
}

/**
 * Coloured strip of sections above the detailed waveform, aligned with its time axis, like
 * Reaper's region lane. Drag in an empty stretch to make a section; click one to go there,
 * double-click to loop it, drag it to move it, drag an edge to change it, right-click for more.
 * The sections sit on a strip that follows the view, so scrolling never re-renders them.
 */
export function SectionLane() {
  const laneRef = useRef<HTMLElement>(null);
  const sections = useMarkersStore((s) => s.sections);
  const pending = useMarkersStore((s) => s.pendingSection);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const strip = useTimeStrip();
  /** A new section being drawn in an empty stretch */
  const [drawing, setDrawing] = useState<{ a: number; b: number } | null>(null);

  // Press in an empty stretch (sections stop their own presses): draw a new section, or
  // with a plain click move the playhead there
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const onPointerDown = (event: PointerEvent) => {
      // Presses on a section are its own (they reach this native listener first)
      if (event.button !== 0 || (event.target as Element).closest("button")) return;
      const anchor = snapTime(timeAtX(lane, event.clientX), lane);
      const startX = event.clientX;
      let moved = false;
      followPointer(
        { pointerId: event.pointerId, currentTarget: lane },
        (e) => {
          if (!moved && Math.abs(e.clientX - startX) <= DRAG_PX) return;
          moved = true;
          setDrawing({ a: anchor, b: snapTime(timeAtX(lane, e.clientX), lane) });
        },
        (e) => {
          setDrawing(null);
          if (!moved) {
            usePlayerStore.getState().seek(anchor);
            return;
          }
          const end = snapTime(timeAtX(lane, e.clientX), lane);
          useMarkersStore.getState().addSection(anchor, end, trackDuration());
        },
      );
    };
    lane.addEventListener("pointerdown", onPointerDown);
    return () => lane.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <section
      ref={laneRef}
      className="relative h-6 shrink-0 cursor-crosshair overflow-hidden rounded-control bg-well"
      aria-label={m.sections}
      title={m.laneHint}
    >
      {sections.length === 0 && pending === null && !drawing && (
        <p className="pointer-events-none absolute inset-0 flex items-center px-3 text-xs text-fg-subtle">
          {m.noSections}
        </p>
      )}
      <div ref={strip} className="absolute top-0 bottom-0">
        {sortedSections(sections).map((section) => (
          <SectionMenu key={section.id} range={section}>
            <button
              type="button"
              title={withRightClick(
                [`${section.name} — ${m.sectionClick}`, section.memo].filter(Boolean).join("\n"),
                m.sectionRightClick,
              )}
              onPointerDown={(event) => dragSection(event, laneRef.current, section)}
              onDoubleClick={() => loopSection(section)}
              className="absolute top-0 bottom-0 flex cursor-grab items-center overflow-hidden rounded-[2px] border-x border-t-2 border-x-black px-1.5 text-left text-[10px] font-semibold tracking-[0.04em] text-fg uppercase transition-[filter] hover:brightness-125 active:cursor-grabbing"
              style={{
                ...place(section.start, section.end, duration),
                borderTopColor: sectionColor(section.color),
                background: `color-mix(in srgb, ${sectionColor(section.color)} 20%, var(--color-well))`,
              }}
            >
              <span className="pointer-events-none truncate">{section.name}</span>
              {/* Grab an edge to change where the section starts or ends */}
              <span
                aria-hidden
                className="absolute top-0 bottom-0 -left-0.5 w-2 cursor-ew-resize"
                onPointerDown={(event) => dragEdge(event, laneRef.current, section, "start")}
              />
              <span
                aria-hidden
                className="absolute top-0 -right-0.5 bottom-0 w-2 cursor-ew-resize"
                onPointerDown={(event) => dragEdge(event, laneRef.current, section, "end")}
              />
            </button>
          </SectionMenu>
        ))}
        {drawing && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 rounded-[2px] border border-dashed border-accent bg-accent/15"
            style={place(Math.min(drawing.a, drawing.b), Math.max(drawing.a, drawing.b), duration)}
          />
        )}
        <PendingSection />
      </div>
    </section>
  );
}
