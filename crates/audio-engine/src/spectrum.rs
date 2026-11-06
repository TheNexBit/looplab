//! Note view: how loud each note of the piano range is in part of the track.
//!
//! A large FFT (about a third of a second) is read on a musical scale: five points per
//! semitone from A0 to C8, so the UI can draw a curve over a keyboard and light up the keys.
//! Several windows are averaged over a longer span (a loop), which steadies the picture.

use std::sync::Arc;

use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};

use crate::dsp::channels::{ChannelMode, apply};
use crate::pcm::Pcm;

/// Lowest and highest MIDI note shown: the 88 keys of a piano.
pub const LOWEST_NOTE: u8 = 21;
pub const HIGHEST_NOTE: u8 = 108;
pub const NOTES: usize = (HIGHEST_NOTE - LOWEST_NOTE + 1) as usize;
/// Points per semitone: the middle one sits on the note, the others 20 and 40 cents away.
pub const POINTS_PER_NOTE: usize = 5;
/// Level reported for silence, in dB.
pub const FLOOR_DB: f32 = -100.0;

/// FFT length at 44.1/48 kHz: ~0.35 s, the usual compromise of transcription tools
/// between telling low notes apart and following quick changes.
const BASE_SIZE: usize = 16_384;
/// Most windows averaged over a long span; more would only cost time.
const MAX_WINDOWS: usize = 48;

pub struct Analyzer {
    size: usize,
    fft: Arc<dyn RealToComplex<f32>>,
    window: Vec<f32>,
    input: Vec<f32>,
    output: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    power: Vec<f32>,
    sample_rate: u32,
}

impl Analyzer {
    pub fn new(sample_rate: u32) -> Self {
        // Same time span at any rate: 32768 points at 88.2/96 kHz
        let size = if sample_rate > 50_000 {
            BASE_SIZE * 2
        } else {
            BASE_SIZE
        };
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(size);
        let window = (0..size)
            .map(|i| {
                let phase = std::f32::consts::TAU * i as f32 / size as f32;
                0.5 - 0.5 * phase.cos()
            })
            .collect();
        Self {
            input: fft.make_input_vec(),
            output: fft.make_output_vec(),
            scratch: fft.make_scratch_vec(),
            power: vec![0.0; size / 2 + 1],
            fft,
            window,
            size,
            sample_rate,
        }
    }

    /// Levels in dB (0 = a full-scale sine) at `NOTES * POINTS_PER_NOTE` points from A0 up,
    /// averaged over the frames `start..end` (one window centred on `start` if the span is
    /// shorter than a window). `mode` is the channel choice of the EQ panel; `semitones`
    /// shifts the scale like the pitch control, so the keys match what is heard.
    pub fn analyze(
        &mut self,
        pcm: &Pcm,
        start: u64,
        end: u64,
        mode: ChannelMode,
        semitones: f32,
    ) -> Vec<f32> {
        let size = self.size as u64;
        let centres: Vec<i64> = if end <= start + size {
            vec![start as i64]
        } else {
            let span = end - start - size;
            let count = (span / (size / 2) + 1).min(MAX_WINDOWS as u64);
            (0..=count)
                .map(|i| (start + size / 2 + span * i / count.max(1)) as i64)
                .collect()
        };

        self.power.fill(0.0);
        for &centre in &centres {
            self.add_window(pcm, centre - size as i64 / 2, mode);
        }
        let windows = centres.len() as f32;
        // A full-scale sine through a Hann window peaks at size / 4
        let reference = (self.size as f32 / 4.0).powi(2);
        let ratio = 2_f32.powf(semitones / 12.0);
        let bin_hz = self.sample_rate as f32 / self.size as f32;

        (0..NOTES * POINTS_PER_NOTE)
            .map(|point| {
                let note = f32::from(LOWEST_NOTE) + (point as f32 - 2.0) / POINTS_PER_NOTE as f32;
                // The point shows what is heard: before the pitch shift it was this much lower
                let hz = 440.0 * 2_f32.powf((note - 69.0) / 12.0) / ratio;
                let power = self.power_near(hz / bin_hz, 2_f32.powf(0.5 / 60.0)) / windows;
                if power > 0.0 {
                    (10.0 * (power / reference).log10()).max(FLOOR_DB)
                } else {
                    FLOOR_DB
                }
            })
            .collect()
    }

    /// Adds the power spectrum of the window starting at frame `first` (silence outside the track).
    fn add_window(&mut self, pcm: &Pcm, first: i64, mode: ChannelMode) {
        let frames = pcm.frames() as i64;
        for (i, (sample, weight)) in self.input.iter_mut().zip(&self.window).enumerate() {
            let frame = first + i as i64;
            *sample = if (0..frames).contains(&frame) {
                let [l, r] = apply(mode, pcm.frame(frame as usize));
                (l + r) * 0.5 * weight
            } else {
                0.0
            };
        }
        if self
            .fft
            .process_with_scratch(&mut self.input, &mut self.output, &mut self.scratch)
            .is_ok()
        {
            for (power, bin) in self.power.iter_mut().zip(&self.output) {
                *power += bin.norm_sqr();
            }
        }
    }

    /// Strongest power within a factor `spread` of the fractional bin `centre`; between
    /// bins (low notes, where bins are wider than a semitone) it is interpolated.
    fn power_near(&self, centre: f32, spread: f32) -> f32 {
        let last = self.power.len() - 1;
        let low = (centre / spread).ceil() as usize;
        let high = ((centre * spread).floor() as usize).min(last);
        if low <= high {
            return self.power[low..=high].iter().copied().fold(0.0, f32::max);
        }
        let below = (centre.floor() as usize).min(last);
        let above = (below + 1).min(last);
        let t = centre - below as f32;
        self.power[below] * (1.0 - t) + self.power[above] * t
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn tone(hz: f32, seconds: f32) -> Pcm {
        let frames = (seconds * RATE as f32) as usize;
        let mut pcm = Pcm::with_capacity(RATE, frames);
        let samples: Vec<f32> = (0..frames)
            .flat_map(|i| {
                let s = (std::f32::consts::TAU * hz * i as f32 / RATE as f32).sin() * 0.5;
                [s, s]
            })
            .collect();
        pcm.extend_from_f32(&samples);
        pcm
    }

    /// MIDI note of the loudest point.
    fn loudest_note(levels: &[f32]) -> f32 {
        let index = levels
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map_or(0, |(i, _)| i);
        f32::from(LOWEST_NOTE) + (index as f32 - 2.0) / POINTS_PER_NOTE as f32
    }

    #[test]
    fn a_440_lights_up_the_a_above_middle_c() {
        let pcm = tone(440.0, 2.0);
        let mut analyzer = Analyzer::new(RATE);
        let levels = analyzer.analyze(&pcm, RATE as u64, RATE as u64, ChannelMode::Stereo, 0.0);
        assert_eq!(levels.len(), NOTES * POINTS_PER_NOTE);
        assert!((loudest_note(&levels) - 69.0).abs() < 0.01);
        // Half amplitude: about -6 dB
        let peak = levels.iter().copied().fold(f32::MIN, f32::max);
        assert!((peak + 6.0).abs() < 1.0, "peak {peak} dB");
    }

    #[test]
    fn the_scale_follows_the_pitch_shift() {
        let pcm = tone(440.0, 2.0);
        let mut analyzer = Analyzer::new(RATE);
        let levels = analyzer.analyze(&pcm, RATE as u64, RATE as u64, ChannelMode::Stereo, 2.0);
        assert!(
            (loudest_note(&levels) - 71.0).abs() < 0.01,
            "two semitones up: B4"
        );
    }

    #[test]
    fn long_spans_average_several_windows_and_silence_is_the_floor() {
        let pcm = tone(110.0, 4.0);
        let mut analyzer = Analyzer::new(RATE);
        let levels = analyzer.analyze(&pcm, 0, 4 * RATE as u64, ChannelMode::Stereo, 0.0);
        assert!((loudest_note(&levels) - 45.0).abs() < 0.21, "A2");
        let removed = analyzer.analyze(&pcm, 0, RATE as u64, ChannelMode::RemoveCenter, 0.0);
        assert!(
            removed.iter().all(|&v| v == FLOOR_DB),
            "a centred tone cancels out"
        );
    }
}
