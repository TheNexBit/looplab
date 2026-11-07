//! The metronome on its own, without a track: its own clock in output frames, mixed after
//! everything else (no stretcher in the way, so it is exact at any tempo).
//!
//! Time is counted in pulses from a base point. A new tempo or bar takes over from the
//! current moment, keeping the place in the bar, so a speed trainer can change the tempo
//! while it runs without a jump. Count-in bars are the bars before 0. Real-time safe.

use crate::click::{ClickSounds, ClickVoice};
use crate::pattern::{BarPattern, ClickKind, Hits};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetronomeSettings {
    /// Output frames per pulse (the note value of the numerator)
    pub pulse_frames: f64,
    pub pattern: BarPattern,
    /// Bars counted in, plainly, before bar 0
    pub count_in_bars: u32,
    /// 0..1
    pub volume: f32,
    pub sounds: ClickSounds,
}

impl Default for MetronomeSettings {
    fn default() -> Self {
        Self {
            pulse_frames: 24_000.0,
            pattern: BarPattern::default(),
            count_in_bars: 0,
            volume: 0.8,
            sounds: ClickSounds::default(),
        }
    }
}

pub(crate) struct Metronome {
    settings: MetronomeSettings,
    running: bool,
    /// Frames played since start
    frame: u64,
    /// Pulse time at `base_frame`, where the current settings took over
    base_pulses: f64,
    base_frame: u64,
    main: ClickVoice,
    cross: ClickVoice,
}

impl Metronome {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            settings: MetronomeSettings::default(),
            running: false,
            frame: 0,
            base_pulses: 0.0,
            base_frame: 0,
            main: ClickVoice::new(sample_rate),
            cross: ClickVoice::new(sample_rate),
        }
    }

    fn pulses_at(&self, frame: u64) -> f64 {
        self.base_pulses + (frame - self.base_frame) as f64 / self.settings.pulse_frames
    }

    /// New settings take over now; while running, the place in the bar is kept.
    pub fn set(&mut self, settings: MetronomeSettings) {
        let settings = MetronomeSettings {
            pulse_frames: settings.pulse_frames.max(1.0),
            ..settings
        };
        if self.running {
            let old_pulses = f64::from(self.settings.pattern.pulses());
            let now = self.pulses_at(self.frame);
            let bar = (now / old_pulses).floor();
            let into_bar = now - bar * old_pulses;
            self.base_pulses = bar * f64::from(settings.pattern.pulses()) + into_bar;
            self.base_frame = self.frame;
        }
        self.settings = settings;
    }

    /// Starts from the count-in (or bar 0), or stops.
    pub fn run(&mut self, running: bool) {
        self.running = running;
        if running {
            self.frame = 0;
            self.base_frame = 0;
            self.base_pulses =
                -f64::from(self.settings.count_in_bars) * f64::from(self.settings.pattern.pulses());
        }
    }

    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Where the metronome is, in pulses from bar 0 (negative during the count-in).
    pub fn position(&self) -> f64 {
        self.pulses_at(self.frame)
    }

    /// Moves one frame on and returns the clicks starting in it (none when stopped).
    fn advance(&mut self) -> Hits {
        if !self.running {
            return Hits::default();
        }
        let from = self.pulses_at(self.frame);
        let to = self.pulses_at(self.frame + 1);
        self.frame += 1;
        self.settings.pattern.hits(from, to)
    }

    /// Next sample of the clicks (0 when stopped and silent).
    #[inline]
    pub fn next(&mut self) -> f32 {
        let hits = self.advance();
        if let Some(kind) = hits.main {
            self.main.start(self.settings.sounds.of(kind));
        }
        if hits.cross {
            self.cross.start(self.settings.sounds.of(ClickKind::Cross));
        }
        let volume = self.settings.volume;
        self.main.next(volume) + self.cross.next(volume)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::BeatState;

    /// Frames at which a click starts, over `frames` frames.
    fn onsets(metronome: &mut Metronome, frames: usize) -> Vec<usize> {
        (0..frames)
            .filter(|_| {
                let hits = metronome.advance();
                hits.main.is_some() || hits.cross
            })
            .collect()
    }

    fn settings(pulse_frames: f64, pulses: u32) -> MetronomeSettings {
        MetronomeSettings {
            pulse_frames,
            pattern: BarPattern::regular(pulses),
            ..MetronomeSettings::default()
        }
    }

    #[test]
    fn silent_until_started_then_clicks_on_every_pulse() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(settings(4_800.0, 4));
        assert!(onsets(&mut metronome, 10_000).is_empty());
        metronome.run(true);
        assert_eq!(
            onsets(&mut metronome, 20_000),
            [0, 4_800, 9_600, 14_400, 19_200]
        );
        // And they are heard
        metronome.run(true);
        assert!(
            (0..2_000)
                .map(|_| metronome.next().abs())
                .fold(0.0, f32::max)
                > 0.1
        );
        metronome.run(false);
        assert!(onsets(&mut metronome, 10_000).is_empty());
    }

    #[test]
    fn counts_in_before_bar_zero() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(MetronomeSettings {
            count_in_bars: 1,
            ..settings(4_800.0, 3)
        });
        metronome.run(true);
        assert!((metronome.position() + 3.0).abs() < 1e-9);
        onsets(&mut metronome, 3 * 4_800);
        assert!(metronome.position().abs() < 1e-9);
    }

    #[test]
    fn a_new_tempo_keeps_the_place_in_the_bar() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(settings(4_800.0, 4));
        metronome.run(true);
        onsets(&mut metronome, 7_200); // one and a half pulses
        metronome.set(settings(2_400.0, 4));
        assert!((metronome.position() - 1.5).abs() < 1e-9);
        // The next pulse comes half a (new) pulse later
        assert_eq!(onsets(&mut metronome, 4_000)[0], 1_200);
    }

    #[test]
    fn muted_beats_and_cross_rhythm_reach_the_output() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(MetronomeSettings {
            pattern: BarPattern::new(2, &[], &[BeatState::Muted, BeatState::Muted], 1, 0.5, 3),
            ..settings(4_800.0, 2)
        });
        metronome.run(true);
        // Only the cross rhythm sounds: 3 over a bar of 9,600 frames
        assert_eq!(onsets(&mut metronome, 9_600), [0, 3_200, 6_400]);
    }
}
