//! Metronome and count-in clicks.
//!
//! Beats are found while the track is read (in track time, before the stretcher) and
//! queued with the input frame they belong to. The click itself is synthesised on the
//! output side, when that frame is heard: it keeps its pitch and sharpness at any speed
//! or transposition. Real-time safe: fixed-size queue, no allocation.

use std::f32::consts::TAU;

/// Tempo grid and click options, in frames of the track.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ClickSettings {
    /// Frames per beat; 0 when the tempo is unknown (no clicks at all)
    pub beat: u64,
    /// A frame that falls on a beat (the first beat of a bar)
    pub anchor: u64,
    /// Beats counted in before playback starts and before every loop repetition
    pub count_in: u32,
    /// Click on every beat while the track plays
    pub metronome: bool,
    /// Beats in a bar: the first one is accented (0 counts as 4)
    pub beats_per_bar: u32,
    /// 0..1
    pub volume: f32,
}

impl ClickSettings {
    /// Length of the count-in, in track frames (0 when off or without a tempo).
    pub fn count_in_frames(&self) -> u64 {
        self.beat * u64::from(self.count_in)
    }

    /// Beats in a bar (the default when none is set).
    pub(crate) fn bar_length(&self) -> u64 {
        if self.beats_per_bar == 0 {
            DEFAULT_BEATS_PER_BAR
        } else {
            u64::from(self.beats_per_bar)
        }
    }

    /// Whether the track frame `position` falls on a metronome beat, and if it starts a bar.
    pub(crate) fn beat_at(&self, position: u64) -> Option<bool> {
        if !self.metronome || self.beat == 0 || position < self.anchor {
            return None;
        }
        let offset = position - self.anchor;
        offset
            .is_multiple_of(self.beat)
            .then(|| (offset / self.beat).is_multiple_of(self.bar_length()))
    }
}

/// Bar length when none is set.
const DEFAULT_BEATS_PER_BAR: u64 = 4;
const CAPACITY: usize = 32;

/// A click waiting to be heard: the input frame (stretcher feed count) it belongs to.
#[derive(Clone, Copy, Default)]
struct Pending {
    fed: u64,
    accent: bool,
}

/// Clicks found by the reader, oldest first.
pub(crate) struct ClickQueue {
    items: [Pending; CAPACITY],
    head: usize,
    len: usize,
}

impl ClickQueue {
    pub fn new() -> Self {
        Self {
            items: [Pending::default(); CAPACITY],
            head: 0,
            len: 0,
        }
    }

    /// Queues a click; dropped when the queue is full (it never is at musical tempos).
    pub fn push(&mut self, fed: u64, accent: bool) {
        if self.len < CAPACITY {
            self.items[(self.head + self.len) % CAPACITY] = Pending { fed, accent };
            self.len += 1;
        }
    }

    /// The oldest click if it is due at `heard_fed`.
    pub fn pop_due(&mut self, heard_fed: f64) -> Option<bool> {
        if self.len == 0 {
            return None;
        }
        let first = self.items[self.head];
        if first.fed as f64 > heard_fed {
            return None;
        }
        self.head = (self.head + 1) % CAPACITY;
        self.len -= 1;
        Some(first.accent)
    }

    pub fn clear(&mut self) {
        self.head = 0;
        self.len = 0;
    }
}

/// Length and decay of one click.
const CLICK_SECONDS: f32 = 0.035;
const DECAY_SECONDS: f32 = 0.008;
const HIGH_HZ: f32 = 1_760.0;
const LOW_HZ: f32 = 1_320.0;

/// The sound of a click: a short sine burst with a fast decay, higher on the first beat.
pub(crate) struct ClickVoice {
    sample_rate: f32,
    length: usize,
    left: usize,
    step: f32,
}

impl ClickVoice {
    pub fn new(sample_rate: u32) -> Self {
        let sample_rate = sample_rate as f32;
        Self {
            sample_rate,
            length: (CLICK_SECONDS * sample_rate) as usize,
            left: 0,
            step: 0.0,
        }
    }

    pub fn start(&mut self, accent: bool) {
        self.left = self.length;
        self.step = (if accent { HIGH_HZ } else { LOW_HZ }) * TAU / self.sample_rate;
    }

    pub fn stop(&mut self) {
        self.left = 0;
    }

    /// Next sample of the click (0 when silent).
    #[inline]
    pub fn next(&mut self, volume: f32) -> f32 {
        if self.left == 0 {
            return 0.0;
        }
        let t = (self.length - self.left) as f32;
        self.left -= 1;
        let envelope = (-t / (DECAY_SECONDS * self.sample_rate)).exp();
        (t * self.step).sin() * envelope * volume
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beats_fall_on_the_grid_with_the_bar_accented() {
        let settings = ClickSettings {
            beat: 100,
            anchor: 50,
            metronome: true,
            ..ClickSettings::default()
        };
        assert_eq!(settings.beat_at(50), Some(true));
        assert_eq!(settings.beat_at(150), Some(false));
        assert_eq!(settings.beat_at(450), Some(true));
        assert_eq!(settings.beat_at(151), None);
        assert_eq!(settings.beat_at(0), None, "nothing before the anchor");
    }

    #[test]
    fn odd_meters_accent_every_bar() {
        let seven = ClickSettings {
            beat: 10,
            metronome: true,
            beats_per_bar: 7,
            ..ClickSettings::default()
        };
        assert_eq!(seven.beat_at(0), Some(true));
        assert_eq!(seven.beat_at(40), Some(false));
        assert_eq!(seven.beat_at(70), Some(true));
    }

    #[test]
    fn no_tempo_or_metronome_off_means_no_beats() {
        let off = ClickSettings {
            beat: 100,
            ..ClickSettings::default()
        };
        assert_eq!(off.beat_at(0), None);
        let no_tempo = ClickSettings {
            metronome: true,
            count_in: 4,
            ..ClickSettings::default()
        };
        assert_eq!(no_tempo.beat_at(0), None);
        assert_eq!(no_tempo.count_in_frames(), 0);
    }

    #[test]
    fn queue_releases_clicks_in_order_when_due() {
        let mut queue = ClickQueue::new();
        queue.push(10, true);
        queue.push(20, false);
        assert_eq!(queue.pop_due(5.0), None);
        assert_eq!(queue.pop_due(10.0), Some(true));
        assert_eq!(queue.pop_due(15.0), None);
        assert_eq!(queue.pop_due(25.0), Some(false));
        assert_eq!(queue.pop_due(100.0), None);
    }
}
