//! Metronome and count-in clicks.
//!
//! Beats are found while the track is read (in track time, before the stretcher) and
//! queued with the input frame they belong to. The click itself is synthesised on the
//! output side, when that frame is heard: it keeps its pitch and sharpness at any speed
//! or transposition. Real-time safe: fixed-size queue, no allocation.
//! The sounds are synthesised (`ClickSound`): accents, beats, subdivisions and the cross
//! rhythm each pick theirs. The shape of the bar is a `BarPattern`.

use std::f32::consts::TAU;
use std::sync::Arc;

use crate::pattern::ClickKind;
use crate::voice::{prepare, read_wav};

/// Click options over a track. Where the beats fall comes from its tempo map (`tempo_map.rs`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClickSettings {
    /// Bars counted in before playback starts and before every loop repetition, in the meter
    /// and tempo where playback starts
    pub count_in: u32,
    /// Click on every beat while the track plays
    pub metronome: bool,
    /// 0..1
    pub volume: f32,
    pub sounds: ClickSounds,
}

/// Sound and level (0..1) of each kind of click, like the metronome settings of Reaper.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClickSounds {
    pub accent: (ClickSound, f32),
    pub beat: (ClickSound, f32),
    pub sub: (ClickSound, f32),
    pub cross: (ClickSound, f32),
}

impl Default for ClickSounds {
    fn default() -> Self {
        Self {
            accent: (ClickSound::BeepHigh, 1.0),
            beat: (ClickSound::BeepLow, 1.0),
            // Quieter than the beats, so the pulse stays clear
            sub: (ClickSound::WoodLow, 0.45),
            // Lower than the beats: a cross rhythm is followed against them
            cross: (ClickSound::Cowbell, 0.7),
        }
    }
}

impl ClickSounds {
    pub(crate) fn of(&self, kind: ClickKind) -> (ClickSound, f32) {
        match kind {
            ClickKind::Accent => self.accent,
            ClickKind::Beat => self.beat,
            ClickKind::Sub => self.sub,
            ClickKind::Cross => self.cross,
        }
    }
}

impl Default for ClickSettings {
    fn default() -> Self {
        Self {
            count_in: 0,
            metronome: false,
            volume: 0.0,
            sounds: ClickSounds::default(),
        }
    }
}

impl ClickSettings {
    /// Sound and level of a kind of click.
    pub(crate) fn sound(&self, kind: ClickKind) -> (ClickSound, f32) {
        self.sounds.of(kind)
    }
}

const CAPACITY: usize = 32;

/// A click waiting to be heard: the input frame (stretcher feed count) it belongs to.
#[derive(Clone, Copy)]
struct Pending {
    fed: u64,
    kind: ClickKind,
}

impl Default for Pending {
    fn default() -> Self {
        Self {
            fed: 0,
            kind: ClickKind::Beat,
        }
    }
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
    pub fn push(&mut self, fed: u64, kind: ClickKind) {
        if self.len < CAPACITY {
            self.items[(self.head + self.len) % CAPACITY] = Pending { fed, kind };
            self.len += 1;
        }
    }

    /// The oldest click if it is due at `heard_fed`.
    pub fn pop_due(&mut self, heard_fed: f64) -> Option<ClickKind> {
        if self.len == 0 {
            return None;
        }
        let first = self.items[self.head];
        if first.fed as f64 > heard_fed {
            return None;
        }
        self.head = (self.head + 1) % CAPACITY;
        self.len -= 1;
        Some(first.kind)
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

/// Longest imported sound kept, in seconds: a click, not a loop.
pub const MAX_SAMPLE_SECONDS: f32 = 2.0;

/// Imported sounds used instead of the synthesised ones, one slot per kind of click (accent,
/// beat, subdivision, cross rhythm); an empty slot keeps the chosen synthesised sound.
/// Prepared off the audio thread: trimmed of silence, levelled, at the output rate.
#[derive(Debug, Default, PartialEq)]
pub struct ClickSamples {
    slots: [Vec<f32>; 4],
}

const fn slot(kind: ClickKind) -> usize {
    match kind {
        ClickKind::Accent => 0,
        ClickKind::Beat => 1,
        ClickKind::Sub => 2,
        ClickKind::Cross => 3,
    }
}

impl ClickSamples {
    /// From WAV files (16-bit PCM, as `import_sample` writes them): accent, beat,
    /// subdivision, cross rhythm; None (or a file that cannot be read) keeps the synth.
    pub fn from_wavs(wavs: [Option<&[u8]>; 4], sample_rate: u32) -> Self {
        Self {
            slots: wavs.map(|wav| {
                wav.and_then(read_wav)
                    .map(|(samples, rate)| prepare(&samples, rate, sample_rate))
                    .unwrap_or_default()
            }),
        }
    }

    fn of(&self, kind: ClickKind) -> &[f32] {
        &self.slots[slot(kind)]
    }
}

/// An imported sound made into a click: mono, from its first sound, at most
/// `MAX_SAMPLE_SECONDS`, faded out at the end. `stereo` is interleaved left / right.
pub fn click_from_stereo(stereo: &[f32], sample_rate: u32) -> Vec<f32> {
    let mono: Vec<f32> = stereo
        .as_chunks::<2>()
        .0
        .iter()
        .map(|[l, r]| (l + r) * 0.5)
        .collect();
    let start = mono.iter().position(|s| s.abs() > 0.02).unwrap_or(0);
    let max = (MAX_SAMPLE_SECONDS * sample_rate as f32) as usize;
    let mut click: Vec<f32> = mono[start..].iter().take(max).copied().collect();
    let fade = (sample_rate as usize / 100).min(click.len());
    let length = click.len();
    for i in 0..fade {
        click[length - 1 - i] *= i as f32 / fade as f32;
    }
    click
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
    /// Imported sounds, and the one being played: its kind and where it is
    samples: Arc<ClickSamples>,
    sample: Option<(ClickKind, usize)>,
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
            samples: Arc::new(ClickSamples::default()),
            sample: None,
        }
    }

    /// New imported sounds; the old ones are handed back, to be freed off the audio thread.
    pub fn set_samples(&mut self, samples: Arc<ClickSamples>) -> Arc<ClickSamples> {
        self.sample = None;
        std::mem::replace(&mut self.samples, samples)
    }

    /// Starts the click of `kind`: its imported sound if there is one, else `sound`.
    pub fn start_kind(&mut self, kind: ClickKind, (sound, level): (ClickSound, f32)) {
        if self.samples.of(kind).is_empty() {
            self.start((sound, level));
        } else {
            self.left = 0;
            self.level = level.clamp(0.0, 1.0);
            self.sample = Some((kind, 0));
        }
    }

    /// Starts `sound` at `level` (0..1), cutting the one still ringing.
    pub fn start(&mut self, (sound, level): (ClickSound, f32)) {
        self.start_recipe(sound.recipe(), level);
    }

    /// A strum of the rhythm trainer: down fuller and lower, up brighter and shorter, so the
    /// hand's direction is heard. Always synthesised, never a chosen sound.
    pub fn start_strum(&mut self, down: bool, level: f32) {
        let recipe = if down {
            Recipe {
                tones: [(620.0, 0.75), (1_240.0, 0.2)],
                tone_decay: 0.03,
                noise: 0.35,
                noise_decay: 0.006,
                seconds: 0.12,
            }
        } else {
            Recipe {
                tones: [(960.0, 0.6), (1_920.0, 0.15)],
                tone_decay: 0.018,
                noise: 0.45,
                noise_decay: 0.004,
                seconds: 0.08,
            }
        };
        self.start_recipe(recipe, level);
    }

    fn start_recipe(&mut self, recipe: Recipe, level: f32) {
        self.sample = None;
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
        self.sample = None;
    }

    /// Next sample of the click (0 when silent).
    #[inline]
    pub fn next(&mut self, volume: f32) -> f32 {
        if let Some((kind, at)) = self.sample {
            return match self.samples.of(kind).get(at) {
                Some(&sample) => {
                    self.sample = Some((kind, at + 1));
                    sample * self.level * volume
                }
                None => {
                    self.sample = None;
                    0.0
                }
            };
        }
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

    use crate::pattern::ClickKind::{Accent, Beat, Cross};

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
    fn every_kind_of_click_uses_its_own_sound() {
        let settings = ClickSettings {
            sounds: ClickSounds {
                accent: (ClickSound::Cowbell, 0.8),
                beat: (ClickSound::HiHat, 0.4),
                ..ClickSounds::default()
            },
            ..ClickSettings::default()
        };
        assert_eq!(settings.sound(Accent), (ClickSound::Cowbell, 0.8));
        assert_eq!(settings.sound(Beat), (ClickSound::HiHat, 0.4));
        assert_eq!(settings.sound(Cross), ClickSounds::default().cross);
    }

    #[test]
    fn an_imported_sound_replaces_its_kind_only() {
        let mut voice = ClickVoice::new(48_000);
        let samples = ClickSamples {
            slots: [vec![0.5; 100], Vec::new(), Vec::new(), Vec::new()],
        };
        let _ = voice.set_samples(Arc::new(samples));
        // The accent plays the imported sound, at its level, then falls silent
        voice.start_kind(Accent, (ClickSound::Clave, 0.5));
        let heard: Vec<f32> = (0..150).map(|_| voice.next(1.0)).collect();
        assert!(heard[..100].iter().all(|&s| (s - 0.25).abs() < 1e-6));
        assert!(heard[100..].iter().all(|&s| s == 0.0));
        // A beat has no imported sound: the synthesised one
        voice.start_kind(Beat, (ClickSound::Clave, 1.0));
        let synth: Vec<f32> = (0..200).map(|_| voice.next(1.0)).collect();
        assert!(
            synth
                .iter()
                .any(|&s| (s - 0.5).abs() > 0.01 && s.abs() > 0.1)
        );
    }

    #[test]
    fn an_imported_file_is_made_a_click() {
        // 0.5 s of silence, then 3 s of sound, stereo: from the first sound, at most 2 s
        let rate = 1_000;
        let mut stereo = vec![0.0; rate];
        stereo.extend(vec![0.4; rate * 6]);
        let click = click_from_stereo(&stereo, rate as u32);
        assert_eq!(click.len(), 2 * rate);
        assert!((click[0] - 0.4).abs() < 1e-6, "starts on the sound");
        assert!(click[click.len() - 1].abs() < 0.01, "faded out");
    }

    #[test]
    fn queue_releases_clicks_in_order_when_due() {
        let mut queue = ClickQueue::new();
        queue.push(10, Accent);
        queue.push(20, Cross);
        assert_eq!(queue.pop_due(5.0), None);
        assert_eq!(queue.pop_due(10.0), Some(Accent));
        assert_eq!(queue.pop_due(15.0), None);
        assert_eq!(queue.pop_due(25.0), Some(Cross));
        assert_eq!(queue.pop_due(100.0), None);
    }
}
