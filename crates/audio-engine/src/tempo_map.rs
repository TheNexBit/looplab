//! The tempo map of a track: where tempo and meter change, like the tempo markers of Reaper.
//!
//! A map is a list of segments, each starting on the first beat of a bar and lasting until
//! the next one, with its own beat length and bar. A track played to a click has one; a band
//! that speeds up, or a prog song that keeps changing meter, has many (the automatic
//! analysis may even put one on every bar, so the grid follows a drifting band).
//! Built off the audio thread and shared, like the sequences of the metronome: replacing it
//! never frees memory on the audio thread.

use crate::pattern::{BarPattern, Hits};

/// One stretch of constant tempo and meter.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TempoSegment {
    /// Track frame of its first downbeat
    pub start: u64,
    /// Frames per beat (fractional: rounding them would drift over a long segment)
    pub beat_frames: f64,
    /// Beats in its bars, and their accents
    pub pattern: BarPattern,
}

/// Where tempo and meter change. Empty when the tempo of the track is unknown.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TempoMap {
    segments: Vec<TempoSegment>,
}

impl TempoMap {
    /// Sorts the segments by start and drops the unusable ones (no beat length) and the
    /// duplicates (two segments on the same frame: the later in the list wins).
    pub fn new(mut segments: Vec<TempoSegment>) -> Self {
        segments.retain(|s| s.beat_frames.is_finite() && s.beat_frames >= 1.0);
        segments.sort_by_key(|s| s.start);
        let mut kept: Vec<TempoSegment> = Vec::with_capacity(segments.len());
        for segment in segments {
            match kept.last_mut() {
                Some(last) if last.start == segment.start => *last = segment,
                _ => kept.push(segment),
            }
        }
        Self { segments: kept }
    }

    /// A single tempo from `anchor` on: what a track with one BPM has.
    pub fn constant(anchor: u64, beat_frames: f64, pattern: BarPattern) -> Self {
        Self::new(vec![TempoSegment {
            start: anchor,
            beat_frames,
            pattern,
        }])
    }

    pub fn is_empty(&self) -> bool {
        self.segments.is_empty()
    }

    pub fn segments(&self) -> &[TempoSegment] {
        &self.segments
    }

    /// The segment in force at `frame`; None before the first one.
    pub fn segment_at(&self, frame: u64) -> Option<&TempoSegment> {
        let after = self.segments.partition_point(|s| s.start <= frame);
        after.checked_sub(1).map(|i| &self.segments[i])
    }

    /// The segment a count-in starting at `frame` counts in: the one in force there, or the
    /// first one when playback starts before it.
    pub(crate) fn count_in_segment(&self, frame: u64) -> Option<&TempoSegment> {
        self.segment_at(frame).or_else(|| self.segments.first())
    }

    /// The clicks that start on track frame `position`. Before the first segment its grid runs
    /// back to the start of the track, as in Reaper and as the waveform grid shows it.
    /// Real-time safe: a binary search, no allocation.
    pub(crate) fn hits_at(&self, position: u64) -> Hits {
        let Some(segment) = self.segment_at(position).or_else(|| self.segments.first()) else {
            return Hits::default();
        };
        let mut offset = position as f64 - segment.start as f64;
        if offset < 0.0 {
            // Whole bars earlier, so the pattern (accents, cross pulses) sees a bar like any other
            let bar = f64::from(segment.pattern.pulses()) * segment.beat_frames;
            offset += (-offset / bar).ceil() * bar;
        }
        segment.pattern.hits(
            offset / segment.beat_frames,
            (offset + 1.0) / segment.beat_frames,
        )
    }

    /// Frames of `bars` bars counted in before `frame` (0 without a tempo).
    pub fn count_in_frames(&self, frame: u64, bars: u32) -> u64 {
        self.count_in_segment(frame).map_or(0, |segment| {
            let beats = f64::from(segment.pattern.pulses()) * f64::from(bars);
            (beats * segment.beat_frames).round() as u64
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::ClickKind::{Accent, Beat};

    fn segment(start: u64, beat_frames: f64, pulses: u32) -> TempoSegment {
        TempoSegment {
            start,
            beat_frames,
            pattern: BarPattern::regular(pulses),
        }
    }

    /// Every frame with a main click in `0..frames`, with its kind.
    fn clicks(map: &TempoMap, frames: u64) -> Vec<(u64, crate::pattern::ClickKind)> {
        (0..frames)
            .filter_map(|f| map.hits_at(f).main.map(|kind| (f, kind)))
            .collect()
    }

    #[test]
    fn a_constant_tempo_clicks_from_its_anchor() {
        let map = TempoMap::constant(50, 100.0, BarPattern::regular(4));
        let heard = clicks(&map, 500);
        assert_eq!(heard[0], (50, Accent));
        assert_eq!(heard[1], (150, Beat));
        assert_eq!(heard[4], (450, Accent), "a new bar every four beats");
    }

    #[test]
    fn before_the_first_marker_its_grid_runs_back_to_the_start() {
        // 4/4 at 100 frames a beat from frame 650: bar lines at 250 and 650 earlier, too
        let map = TempoMap::constant(650, 100.0, BarPattern::regular(4));
        let heard = clicks(&map, 700);
        assert_eq!(heard[0], (50, Beat), "the last beat of the bar before 250");
        assert_eq!(heard[2], (250, Accent));
        assert_eq!(heard[6], (650, Accent));
        assert_eq!(heard.len(), 7);
    }

    #[test]
    fn the_meter_and_the_tempo_change_on_the_marker() {
        // One bar of 3 at 100 frames a beat, then 2/4 at 50 frames a beat from frame 300
        let map = TempoMap::new(vec![segment(300, 50.0, 2), segment(0, 100.0, 3)]);
        let heard = clicks(&map, 500);
        assert_eq!(
            heard,
            vec![
                (0, Accent),
                (100, Beat),
                (200, Beat),
                (300, Accent),
                (350, Beat),
                (400, Accent),
                (450, Beat),
            ]
        );
    }

    #[test]
    fn a_fractional_beat_never_drifts() {
        // 120 BPM at 44.1 kHz: 22,050 frames a beat; at 100.3 BPM the beat is fractional
        let beat = 44_100.0 * 60.0 / 100.3;
        let map = TempoMap::constant(0, beat, BarPattern::regular(4));
        // Beat 400 is exactly where 400 beats of that length end, rounded to a frame
        let target = (400.0 * beat).ceil() as u64;
        assert!(map.hits_at(target).main.is_some() || map.hits_at(target - 1).main.is_some());
    }

    #[test]
    fn count_ins_use_the_bar_where_playback_starts() {
        let map = TempoMap::new(vec![segment(0, 100.0, 4), segment(1_000, 50.0, 7)]);
        assert_eq!(map.count_in_frames(500, 1), 400, "one bar of 4 at 100");
        assert_eq!(map.count_in_frames(2_000, 2), 700, "two bars of 7 at 50");
        assert_eq!(
            TempoMap::default().count_in_frames(0, 2),
            0,
            "no tempo, no count-in"
        );
    }

    #[test]
    fn unusable_and_duplicate_segments_are_dropped() {
        let map = TempoMap::new(vec![
            segment(0, 0.0, 4),
            segment(100, 80.0, 4),
            segment(100, 90.0, 3),
        ]);
        assert_eq!(map.segments().len(), 1);
        assert_eq!(map.segments()[0].beat_frames, 90.0);
    }
}
