//! Reference tone: a steady note to tune an instrument by ear (no microphone).
//!
//! A few harmonics over the fundamental, so even a low bass string is heard on small speakers
//! and the beating against the instrument is easy to follow. It fades in and out, so switching
//! it on, off or to another note never clicks.

use std::f32::consts::TAU;

/// Seconds of the fade when the tone starts, stops or changes level.
const FADE_SECONDS: f32 = 0.03;
/// Relative amplitude of the fundamental and of its first harmonics.
const HARMONICS: [f32; 4] = [1.0, 0.5, 0.3, 0.15];
/// Keeps the sum of the harmonics below full scale at level 1.
const HEADROOM: f32 = 0.35;

/// What the tone plays: `hz` 0 (or less) is silence.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ToneSettings {
    pub hz: f32,
    /// 0..1
    pub level: f32,
}

pub(crate) struct ToneVoice {
    sample_rate: f32,
    phase: f32,
    hz: f32,
    gain: f32,
    target: f32,
    step: f32,
}

impl ToneVoice {
    pub fn new(sample_rate: u32) -> Self {
        let rate = sample_rate.max(1) as f32;
        Self {
            sample_rate: rate,
            phase: 0.0,
            hz: 0.0,
            gain: 0.0,
            target: 0.0,
            step: 1.0 / (FADE_SECONDS * rate).max(1.0),
        }
    }

    pub fn set(&mut self, settings: ToneSettings) {
        if settings.hz > 0.0 && settings.hz.is_finite() {
            // The phase carries on, so a new note glides in without a click
            self.hz = settings
                .hz
                .min(self.sample_rate / 2.0 / HARMONICS.len() as f32);
            self.target = settings.level.clamp(0.0, 1.0);
        } else {
            self.target = 0.0;
        }
    }

    #[inline]
    pub fn next(&mut self) -> f32 {
        if self.gain < self.target {
            self.gain = (self.gain + self.step).min(self.target);
        } else if self.gain > self.target {
            self.gain = (self.gain - self.step).max(self.target);
        }
        if self.gain == 0.0 {
            return 0.0;
        }
        let mut sample = 0.0;
        for (index, amplitude) in HARMONICS.iter().enumerate() {
            sample += (self.phase * (index + 1) as f32).sin() * amplitude;
        }
        self.phase = (self.phase + TAU * self.hz / self.sample_rate) % TAU;
        sample * self.gain * HEADROOM
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn play(voice: &mut ToneVoice, frames: usize) -> Vec<f32> {
        (0..frames).map(|_| voice.next()).collect()
    }

    fn peak(samples: &[f32]) -> f32 {
        samples.iter().fold(0.0, |max, s| max.max(s.abs()))
    }

    #[test]
    fn silent_until_set_and_after_off() {
        let mut voice = ToneVoice::new(RATE);
        assert_eq!(peak(&play(&mut voice, 1000)), 0.0);
        voice.set(ToneSettings {
            hz: 440.0,
            level: 1.0,
        });
        assert!(peak(&play(&mut voice, RATE as usize / 10)) > 0.3);
        voice.set(ToneSettings {
            hz: 0.0,
            level: 1.0,
        });
        play(&mut voice, RATE as usize / 10);
        assert_eq!(peak(&play(&mut voice, 1000)), 0.0);
    }

    #[test]
    fn fades_in_and_stays_in_range() {
        let mut voice = ToneVoice::new(RATE);
        voice.set(ToneSettings {
            hz: 82.41,
            level: 1.0,
        });
        let samples = play(&mut voice, RATE as usize);
        // No jump at the start
        assert!(samples[..10].iter().all(|s| s.abs() < 0.01));
        assert!(peak(&samples) <= 1.0);
    }

    #[test]
    fn repeats_at_the_requested_pitch() {
        let mut voice = ToneVoice::new(RATE);
        voice.set(ToneSettings {
            hz: 100.0,
            level: 1.0,
        });
        play(&mut voice, RATE as usize / 10);
        // One period is 480 frames at 100 Hz
        let period = play(&mut voice, 960);
        for i in 0..480 {
            assert!((period[i] - period[i + 480]).abs() < 1e-3);
        }
    }

    #[test]
    fn the_level_scales_the_tone() {
        let mut loud = ToneVoice::new(RATE);
        let mut soft = ToneVoice::new(RATE);
        loud.set(ToneSettings {
            hz: 440.0,
            level: 1.0,
        });
        soft.set(ToneSettings {
            hz: 440.0,
            level: 0.5,
        });
        let (a, b) = (
            play(&mut loud, RATE as usize),
            play(&mut soft, RATE as usize),
        );
        assert!((peak(&b) - peak(&a) * 0.5).abs() < 0.01);
    }
}
