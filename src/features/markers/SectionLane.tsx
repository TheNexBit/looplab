import { useRef } from "react";
import { t } from "@/i18n";
import { sectionColor, sectionRanges, useMarkersStore } from "@/stores/markers";
import { usePlayerStore } from "@/stores/player";
import { useViewStore } from "@/stores/view";
import { dragAlongTime } from "./dragAlongTime";
import { SectionMenu } from "./SectionMenu";
import { clampToTrack, loopSection } from "./sectionActions";
import { snapTime } from "./snap";

/**
 * Coloured strip of sections above the detailed waveform, aligned with its time axis.
 * Click a section to loop it, drag its left edge to move its start, right-click for more.
 */
export function SectionLane() {
  const laneRef = useRef<HTMLElement>(null);
  const sections = useMarkersStore((s) => s.sections);
  const duration = usePlayerStore((s) => s.track?.duration ?? 0);
  const start = useViewStore((s) => s.start);
  const span = useViewStore((s) => s.span);
  const percent = (time: number) => ((time - start) / span) * 100;

  return (
    <section
      ref={laneRef}
      className="relative h-7 shrink-0 overflow-hidden rounded-control border border-border bg-surface"
      aria-label={t.markers.sections}
    >
      {sections.length === 0 && (
        <p className="absolute inset-0 flex items-center px-3 text-xs text-fg-subtle">
          {t.markers.noSections}
        </p>
      )}
      {sectionRanges(sections, duration).map((range) => {
        const left = percent(range.start);
        const width = percent(range.end) - left;
        if (left > 100 || left + width < 0) return null;
        return (
          <SectionMenu key={range.id} range={range}>
            <button
              type="button"
              title={`${range.name} — ${t.markers.loopSection}`}
              onClick={() => loopSection(range)}
              className="absolute top-0 bottom-0 flex items-center overflow-hidden border-l-2 px-2 text-left text-xs font-medium text-fg transition-[filter] hover:brightness-125"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                borderColor: sectionColor(range.color),
                background: `color-mix(in srgb, ${sectionColor(range.color)} 22%, transparent)`,
              }}
            >
              <span className="truncate">{range.name}</span>
              {/* Grab the edge to move where the section starts */}
              <span
                aria-hidden
                className="absolute top-0 bottom-0 -left-0.5 w-2 cursor-ew-resize"
                onPointerDown={(event) =>
                  dragAlongTime(event, laneRef.current, (time) =>
                    useMarkersStore
                      .getState()
                      .moveSection(
                        range.id,
                        clampToTrack(snapTime(time, laneRef.current, { sectionId: range.id })),
                      ),
                  )
                }
              />
            </button>
          </SectionMenu>
        );
      })}
    </section>
  );
}
