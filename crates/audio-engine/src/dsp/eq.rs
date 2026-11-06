//! Five-band parametric equaliser with click-free changes and an A/B bypass.
//!
//! Every parameter glides towards its new value chunk by chunk, and switching a
//! band (or the whole EQ) on or off crossfades between the filtered and the dry sound.

use super::biquad::{Coefficients, State};
use crate::pcm::CHANNELS;

pub const BANDS: usize = 5;
/// Share of the remaining change applied per chunk (~20 ms to settle).
const GLIDE: f32 = 0.3;

#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BandKind {
    LowShelf,
    Peak,
    HighShelf,
    HighPass,
    LowPass,
}

#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Band {
    pub enabled: bool,
    pub kind: BandKind,
    /// Hz
    pub frequency: f32,
    /// dB (shelves and peaks only)
    pub gain: f32,
    pub q: f32,
}

impl Band {
    const fn new(kind: BandKind, frequency: f32, q: f32) -> Self {
        Self {
            enabled: true,
            kind,
            frequency,
            gain: 0.0,
            q,
        }
    }

    fn coefficients(&self, sample_rate: u32) -> Coefficients {
        Coefficients::new(self.kind, self.frequency, self.gain, self.q, sample_rate)
    }
}

#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase", default))]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EqSettings {
    /// A/B comparison: true plays the original sound
    pub bypass: bool,
    pub bands: [Band; BANDS],
}

impl Default for EqSettings {
    /// Flat: every band at 0 dB, spread over the spectrum.
    fn default() -> Self {
        Self {
            bypass: false,
            bands: [
                Band::new(BandKind::LowShelf, 100.0, 0.7),
                Band::new(BandKind::Peak, 300.0, 1.0),
                Band::new(BandKind::Peak, 1_000.0, 1.0),
                Band::new(BandKind::Peak, 3_000.0, 1.0),
                Band::new(BandKind::HighShelf, 8_000.0, 0.7),
            ],
        }
    }
}

impl EqSettings {
    /// Total gain in dB at each frequency, for drawing the curve (bypass ignored).
    pub fn response(&self, frequencies: &[f32], sample_rate: u32) -> Vec<f32> {
        let filters: Vec<Coefficients> = self
            .bands
            .iter()
            .filter(|band| band.enabled)
            .map(|band| band.coefficients(sample_rate))
            .collect();
        frequencies
            .iter()
            .map(|&f| filters.iter().map(|c| c.magnitude_db(f, sample_rate)).sum())
            .collect()
    }
}

/// Moves `current` a step towards `target`; snaps when close enough to stop the glide.
fn glide(current: &mut f32, target: f32, close: f32) -> bool {
    if (*current - target).abs() <= close {
        let changed = *current != target;
        *current = target;
        return changed;
    }
    *current += (target - *current) * GLIDE;
    true
}

/// Real-time state: lives in the audio thread, never allocates.
pub struct Eq {
    sample_rate: u32,
    target: EqSettings,
    current: [Band; BANDS],
    /// 0 = band off, 1 = band on; crossfades when toggled
    band_mix: [f32; BANDS],
    /// 0 = bypassed, 1 = equalised
    wet: f32,
    coefficients: [Coefficients; BANDS],
    states: [[State; CHANNELS]; BANDS],
}

impl Eq {
    pub fn new(sample_rate: u32) -> Self {
        let settings = EqSettings::default();
        Self {
            sample_rate,
            target: settings,
            current: settings.bands,
            band_mix: [1.0; BANDS],
            wet: 1.0,
            coefficients: settings.bands.map(|band| band.coefficients(sample_rate)),
            states: [[State::default(); CHANNELS]; BANDS],
        }
    }

    /// Already at `settings`, with no glide: for offline rendering, where the start must be exact.
    pub fn with_settings(sample_rate: u32, settings: EqSettings) -> Self {
        let mut eq = Self::new(sample_rate);
        eq.target = settings;
        eq.current = settings.bands;
        eq.band_mix = settings
            .bands
            .map(|band| if band.enabled { 1.0 } else { 0.0 });
        eq.wet = if settings.bypass { 0.0 } else { 1.0 };
        eq.coefficients = settings.bands.map(|band| band.coefficients(sample_rate));
        eq
    }

    pub fn set(&mut self, settings: EqSettings) {
        for (index, band) in settings.bands.iter().enumerate() {
            // A new filter type cannot glide from the old one: restart it cleanly
            if band.kind != self.current[index].kind {
                self.current[index] = *band;
                self.states[index] = [State::default(); CHANNELS];
                self.coefficients[index] = band.coefficients(self.sample_rate);
            }
        }
        self.target = settings;
    }

    /// Filters an interleaved stereo block in place.
    pub fn process(&mut self, block: &mut [f32]) {
        self.advance();
        let wet = self.wet;
        if wet == 0.0 && self.band_mix.iter().all(|&m| m == 0.0 || m == 1.0) {
            // Fully bypassed: skip the work. The filters resume from older memory when the
            // EQ comes back, which the wet fade-in hides
            return;
        }
        for frame in block.as_chunks_mut::<CHANNELS>().0 {
            for (channel, sample) in frame.iter_mut().enumerate() {
                let dry = *sample;
                let mut x = dry;
                for band in 0..BANDS {
                    let mix = self.band_mix[band];
                    if mix == 0.0 {
                        continue;
                    }
                    let y = self.states[band][channel].process(&self.coefficients[band], x);
                    x += mix * (y - x);
                }
                *sample = dry + wet * (x - dry);
            }
        }
    }

    /// One glide step per block for every parameter, recomputing only the filters that moved.
    fn advance(&mut self) {
        glide(
            &mut self.wet,
            if self.target.bypass { 0.0 } else { 1.0 },
            0.01,
        );
        for index in 0..BANDS {
            let target = self.target.bands[index];
            let band = &mut self.current[index];
            glide(
                &mut self.band_mix[index],
                if target.enabled { 1.0 } else { 0.0 },
                0.01,
            );
            let mut moved = glide(&mut band.gain, target.gain, 0.01);
            // Frequency and Q glide on a log scale, like the ear hears them
            let mut log_frequency = band.frequency.ln();
            moved |= glide(&mut log_frequency, target.frequency.ln(), 0.001);
            band.frequency = log_frequency.exp();
            let mut log_q = band.q.ln();
            moved |= glide(&mut log_q, target.q.ln(), 0.001);
            band.q = log_q.exp();
            if moved {
                self.coefficients[index] = band.coefficients(self.sample_rate);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn tone(hz: f32, frames: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = (i as f32 * hz * std::f32::consts::TAU / RATE as f32).sin() * 0.25;
                [s, s]
            })
            .collect()
    }

    /// Peak level in dB of the last half of `samples` after `blocks` passes through the EQ.
    fn level_after(eq: &mut Eq, hz: f32) -> f32 {
        let mut peak = 0.0_f32;
        for block in 0..80 {
            let mut chunk = tone(hz, 256);
            eq.process(&mut chunk);
            if block > 60 {
                peak = chunk.iter().fold(peak, |m, s| m.max(s.abs()));
            }
        }
        20.0 * (peak / 0.25).log10()
    }

    #[test]
    fn flat_settings_change_nothing() {
        let mut eq = Eq::new(RATE);
        assert!(level_after(&mut eq, 440.0).abs() < 0.1);
    }

    #[test]
    fn a_boost_reaches_its_target_level() {
        let mut eq = Eq::new(RATE);
        let mut settings = EqSettings::default();
        settings.bands[2].gain = 9.0;
        eq.set(settings);
        let level = level_after(&mut eq, 1_000.0);
        assert!((level - 9.0).abs() < 0.3, "level {level} dB");
    }

    #[test]
    fn bypass_restores_the_original() {
        let mut eq = Eq::new(RATE);
        let mut settings = EqSettings::default();
        settings.bands[2].gain = 9.0;
        settings.bypass = true;
        eq.set(settings);
        assert!(level_after(&mut eq, 1_000.0).abs() < 0.1);
    }

    #[test]
    fn response_adds_up_the_bands() {
        let mut settings = EqSettings::default();
        settings.bands[1].gain = 6.0;
        settings.bands[3].enabled = false;
        settings.bands[3].gain = 12.0;
        let response = settings.response(&[300.0, 3_000.0], RATE);
        assert!((response[0] - 6.0).abs() < 0.3);
        assert!(response[1].abs() < 0.5, "a disabled band adds nothing");
    }

    #[test]
    fn changes_glide_instead_of_jumping() {
        let mut eq = Eq::new(RATE);
        let mut settings = EqSettings::default();
        settings.bands[2].gain = 12.0;
        eq.set(settings);
        eq.advance();
        assert!(eq.current[2].gain > 0.0 && eq.current[2].gain < 12.0);
    }
}
