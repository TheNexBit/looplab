//! Metronome and count-in clicks.
//!
//! Beats are found while the track is read (in track time, before the stretcher) and
//! queued with the input frame they belong to. The click itself is synthesised on the
//! output side, when that frame is heard: it keeps its pitch and sharpness at any speed
//! or transposition. Real-time safe: fixed-size queue, no allocation.
//! The sounds are synthesised (`ClickSound`): accent and other beats each pick theirs.

use std::f32::consts::TAU;

/// Tempo grid and click options, in frames of the track.
#[derive(Debug, Clone, Copy, PartialEq)]
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
    /// Sound and level (0..1) of the first beat of a bar
    pub accent_sound: ClickSound,
    pub accent_level: f32,
    /// Sound and level of the other beats
    pub beat_sound: ClickSound,
    pub beat_level: f32,
}

impl Default for ClickSettings {
    fn default() -> Self {
        Self {
            beat: 0,
            anchor: 0,
            count_in: 0,
            metronome: false,
            beats_per_bar: 0,
            volume: 0.0,
            accent_sound: ClickSound::BeepHigh,
            accent_level: 1.0,
            beat_sound: ClickSound::BeepLow,
            beat_level: 1.0,
        }
    }
}

impl ClickSettings {
    /// Sound and level of an accented or ordinary beat.
    pub(crate) fn sound(&self, accent: bool) -> (ClickSound, f32) {
        if accent {
            (self.accent_sound, self.accent_level)
        } else {
            (self.beat_sound, self.beat_level)
        }
    }

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

/// Metronome sounds, synthesised (no samples to ship). Each beat kind — the accented first
/// beat of a bar and the others — picks its own, like the metronome settings of Reaper.
#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClickSound {
    /// Short sine beep, high: the classic accent
    BeepHigh,
    /// Short sine beep, lower: the classic beat
    BeepLow,
    WoodHigh,
    WoodLow,
    Cowbell,
    /// Side stick on a snare rim
    Stick,
    HiHat,
    Clave,
}

impl ClickSound {
    pub const ALL: [Self; 8] = [
        Self::BeepHigh,
        Self::BeepLow,
        Self::WoodHigh,
        Self::WoodLow,
        Self::Cowbell,
        Self::Stick,
        Self::HiHat,
        Self::Clave,
    ];

    fn recipe(self) -> Recipe {
        let beep = |hz| Recipe {
            tones: [(hz, 1.0), (0.0, 0.0)],
            tone_decay: 0.008,
            noise: 0.0,
            noise_decay: 0.001,
            seconds: 0.035,
        };
        let wood = |hz: f32| Recipe {
            tones: [(hz, 0.65), (hz * 2.12, 0.18)],
            tone_decay: 0.012,
            noise: 0.25,
            noise_decay: 0.0015,
            seconds: 0.06,
        };
        match self {
            Self::BeepHigh => beep(1_760.0),
            Self::BeepLow => beep(1_320.0),
            Self::WoodHigh => wood(1_250.0),
            Self::WoodLow => wood(900.0),
            Self::Cowbell => Recipe {
                tones: [(562.0, 0.5), (845.0, 0.45)],
                tone_decay: 0.07,
                noise: 0.1,
                noise_decay: 0.002,
                seconds: 0.25,
            },
            Self::Stick => Recipe {
                tones: [(1_800.0, 0.45), (0.0, 0.0)],
                tone_decay: 0.01,
                noise: 0.7,
                noise_decay: 0.006,
                seconds: 0.05,
            },
            Self::HiHat => Recipe {
                tones: [(0.0, 0.0), (0.0, 0.0)],
                tone_decay: 0.001,
                noise: 0.9,
                noise_decay: 0.03,
                seconds: 0.12,
            },
            Self::Clave => Recipe {
                tones: [(2_500.0, 0.95), (0.0, 0.0)],
                tone_decay: 0.02,
                noise: 0.08,
                noise_decay: 0.001,
                seconds: 0.07,
            },
        }
    }
}

/// How a sound is made: up to two decaying sine tones plus a burst of bright noise.
#[derive(Clone, Copy)]
struct Recipe {
    /// (frequency in Hz, amplitude); a 0 Hz tone is unused
    tones: [(f32, f32); 2],
    /// Seconds for the tones to fall to 1/e
    tone_decay: f32,
    noise: f32,
    noise_decay: f32,
    /// Total length; the sound is already near silence by then
    seconds: f32,
}

/// One click being played: real-time safe (no allocation, no locks).
pub(crate) struct ClickVoice {
    sample_rate: f32,
    left: usize,
    level: f32,
    phase: [f32; 2],
    step: [f32; 2],
    amplitude: [f32; 2],
    tone_envelope: f32,
    tone_fall: f32,
    noise: f32,
    noise_fall: f32,
    /// xorshift state and the previous sample, for the high-passed noise
    seed: u32,
    previous: f32,
}

impl ClickVoice {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate: sample_rate as f32,
            left: 0,
            level: 0.0,
            phase: [0.0; 2],
            step: [0.0; 2],
            amplitude: [0.0; 2],
            tone_envelope: 0.0,
            tone_fall: 0.0,
            noise: 0.0,
            noise_fall: 0.0,
            seed: 0x9E37_79B9,
            previous: 0.0,
        }
    }

    /// Starts `sound` at `level` (0..1), cutting the one still ringing.
    pub fn start(&mut self, (sound, level): (ClickSound, f32)) {
        let recipe = sound.recipe();
        // Envelopes fall by a fixed factor per sample: no exp() in the audio thread
        let fall = |seconds: f32| (-1.0 / (seconds * self.sample_rate)).exp();
        for (index, (hz, amplitude)) in recipe.tones.into_iter().enumerate() {
            self.phase[index] = 0.0;
            self.step[index] = hz * TAU / self.sample_rate;
            self.amplitude[index] = if hz > 0.0 { amplitude } else { 0.0 };
        }
        self.tone_envelope = 1.0;
        self.tone_fall = fall(recipe.tone_decay);
        self.noise = recipe.noise;
        self.noise_fall = fall(recipe.noise_decay);
        self.level = level.clamp(0.0, 1.0);
        self.left = (recipe.seconds * self.sample_rate) as usize;
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
        self.left -= 1;
        let mut tone = 0.0;
        for index in 0..2 {
            tone += self.phase[index].sin() * self.amplitude[index];
            self.phase[index] += self.step[index];
            if self.phase[index] > TAU {
                self.phase[index] -= TAU;
            }
        }
        // White noise, high-passed (difference of two samples) so it sounds like a tick, not a hiss
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        let white = self.seed as f32 / u32::MAX as f32 * 2.0 - 1.0;
        let bright = (white - self.previous) * 0.5;
        self.previous = white;

        let sample = tone * self.tone_envelope + bright * self.noise;
        self.tone_envelope *= self.tone_fall;
        self.noise *= self.noise_fall;
        sample * self.level * volume
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

    /// Every sample of one click of `sound` at `level`, full volume.
    fn play(sound: ClickSound, level: f32) -> Vec<f32> {
        let mut voice = ClickVoice::new(48_000);
        voice.start((sound, level));
        std::iter::from_fn(|| {
            let s = voice.next(1.0);
            (voice.left > 0 || s != 0.0).then_some(s)
        })
        .collect()
    }

    #[test]
    fn every_sound_is_heard_stays_in_range_and_fades_out() {
        for sound in ClickSound::ALL {
            let samples = play(sound, 1.0);
            let peak = samples.iter().fold(0.0_f32, |m, s| m.max(s.abs()));
            assert!(peak > 0.2, "{sound:?} too quiet: {peak}");
            assert!(peak <= 1.0, "{sound:?} clips: {peak}");
            let tail = samples[samples.len() * 9 / 10..]
                .iter()
                .fold(0.0_f32, |m, s| m.max(s.abs()));
            assert!(tail < 0.05, "{sound:?} still ringing at the end: {tail}");
        }
    }

    #[test]
    fn the_level_scales_the_click() {
        let full = play(ClickSound::WoodHigh, 1.0);
        let half = play(ClickSound::WoodHigh, 0.5);
        let peak = |s: &[f32]| s.iter().fold(0.0_f32, |m, v| m.max(v.abs()));
        assert!((peak(&half) / peak(&full) - 0.5).abs() < 0.02);
        assert!(play(ClickSound::Clave, 0.0).iter().all(|&s| s == 0.0));
    }

    #[test]
    fn accent_and_beats_use_their_own_sound() {
        let settings = ClickSettings {
            accent_sound: ClickSound::Cowbell,
            accent_level: 0.8,
            beat_sound: ClickSound::HiHat,
            beat_level: 0.4,
            ..ClickSettings::default()
        };
        assert_eq!(settings.sound(true), (ClickSound::Cowbell, 0.8));
        assert_eq!(settings.sound(false), (ClickSound::HiHat, 0.4));
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
