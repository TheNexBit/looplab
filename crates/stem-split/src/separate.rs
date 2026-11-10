//! A whole song into its sources, as Demucs's `Separator.separate_tensor` with
//! `apply_model(split=True, overlap=0.25, shifts=0)`: the song normalised by the mean and
//! deviation of its mono mix, cut into segments of the network's length overlapping by a
//! quarter, each separated (`HTDemucs.forward`), and put back weighted by a triangle so
//! the joins never show.

use realfft::num_complex::Complex;

use crate::network::{Network, NetworkError};
use crate::spec::{self, BINS, Spectrogram};

/// Sample rate the model works at.
pub const SAMPLE_RATE: u32 = 44_100;
/// Samples of one segment (7.8 s, the length HTDemucs was trained on).
pub const SEGMENT: usize = 343_980;
/// Share of a segment shared with the next one.
const OVERLAP: f64 = 0.25;

/// Sources of htdemucs_6s, in the order of the network's outputs.
pub const SOURCES: [&str; 6] = ["drums", "bass", "other", "vocals", "guitar", "piano"];

pub struct Separator {
    network: Network,
    spectrogram: Spectrogram,
    sources: usize,
}

impl Separator {
    pub fn new(network: Network, sources: usize) -> Self {
        Self {
            network,
            spectrogram: Spectrogram::new(),
            sources,
        }
    }

    /// One segment of exactly [`SEGMENT`] samples, `left` and `right`: every source as
    /// (left, right). This is `HTDemucs.forward` (the network in between).
    pub fn segment(&self, left: &[f32], right: &[f32]) -> Result<Vec<[Vec<f32>; 2]>, NetworkError> {
        let length = left.len();
        let frames = spec::frames(length);
        let z = [
            self.spectrogram.forward(left),
            self.spectrogram.forward(right),
        ];
        // Complex as channels: re/im of the left, re/im of the right, (4, bins, frames)
        let mut mag = vec![0.0f32; 4 * BINS * frames];
        for (c, channel) in z.iter().enumerate() {
            for t in 0..frames {
                for f in 0..BINS {
                    let value = channel[t * BINS + f];
                    mag[((2 * c) * BINS + f) * frames + t] = value.re;
                    mag[((2 * c + 1) * BINS + f) * frames + t] = value.im;
                }
            }
        }
        let mut mix = Vec::with_capacity(2 * length);
        mix.extend_from_slice(left);
        mix.extend_from_slice(right);
        let out = self.network.run(&mix, &mag, BINS, frames)?;

        let plane = BINS * frames;
        let mut sources = Vec::with_capacity(self.sources);
        for s in 0..self.sources {
            let mut both: [Vec<f32>; 2] = [Vec::new(), Vec::new()];
            for (c, slot) in both.iter_mut().enumerate() {
                let re = &out.spec[(s * 4 + 2 * c) * plane..][..plane];
                let im = &out.spec[(s * 4 + 2 * c + 1) * plane..][..plane];
                // Back to frame-major complex for the inverse transform
                let mut spectrum = vec![Complex::new(0.0, 0.0); plane];
                for f in 0..BINS {
                    for t in 0..frames {
                        spectrum[t * BINS + f] =
                            Complex::new(re[f * frames + t], im[f * frames + t]);
                    }
                }
                let mut signal = self.spectrogram.inverse(&spectrum, length);
                let wave = &out.wave[(s * 2 + c) * length..][..length];
                for (x, w) in signal.iter_mut().zip(wave) {
                    *x += w;
                }
                *slot = signal;
            }
            sources.push(both);
        }
        Ok(sources)
    }

    /// The whole song (`left`, `right` at [`SAMPLE_RATE`]): every source as (left, right).
    /// `progress` gets the share done after each segment.
    pub fn separate(
        &self,
        left: &[f32],
        right: &[f32],
        mut progress: impl FnMut(f32),
    ) -> Result<Vec<[Vec<f32>; 2]>, NetworkError> {
        let length = left.len();
        // Normalised by the mono mix's mean and (unbiased) deviation, as Demucs does
        let mono: Vec<f64> = left
            .iter()
            .zip(right)
            .map(|(l, r)| (f64::from(*l) + f64::from(*r)) / 2.0)
            .collect();
        let mean = mono.iter().sum::<f64>() / length.max(1) as f64;
        let variance =
            mono.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (length.max(2) - 1) as f64;
        let std = variance.sqrt() + 1e-8;
        let normal = |x: &f32| ((f64::from(*x) - mean) / std) as f32;
        let left: Vec<f32> = left.iter().map(normal).collect();
        let right: Vec<f32> = right.iter().map(normal).collect();

        // Triangle weights, highest in the middle of a segment
        let half = SEGMENT / 2;
        let weight: Vec<f32> = (1..=half)
            .chain((1..=SEGMENT - half).rev())
            .map(|w| w as f32 / half.max(SEGMENT - half) as f32)
            .collect();
        let stride = ((1.0 - OVERLAP) * SEGMENT as f64) as usize;
        let offsets: Vec<usize> = (0..length).step_by(stride).collect();

        let mut out: Vec<[Vec<f32>; 2]> = (0..self.sources)
            .map(|_| [vec![0.0; length], vec![0.0; length]])
            .collect();
        let mut total = vec![0.0f32; length];
        for (done, &offset) in offsets.iter().enumerate() {
            // The chunk, centred in a segment with the song around it (zeros past its ends)
            let chunk = SEGMENT.min(length - offset);
            let delta = SEGMENT - chunk;
            let start = offset as isize - (delta / 2) as isize;
            let take = |signal: &[f32]| -> Vec<f32> {
                (0..SEGMENT as isize)
                    .map(|i| {
                        let at = start + i;
                        if at >= 0 && (at as usize) < length {
                            signal[at as usize]
                        } else {
                            0.0
                        }
                    })
                    .collect()
            };
            let separated = self.segment(&take(&left), &take(&right))?;
            // center_trim back to the chunk, then weighted into the song
            let trim = delta / 2;
            for (source, result) in out.iter_mut().zip(&separated) {
                for c in 0..2 {
                    let piece = &result[c][trim..trim + chunk];
                    for (i, value) in piece.iter().enumerate() {
                        source[c][offset + i] += weight[i] * value;
                    }
                }
            }
            for (i, w) in weight[..chunk].iter().enumerate() {
                total[offset + i] += w;
            }
            progress((done + 1) as f32 / offsets.len() as f32);
        }
        for source in &mut out {
            for channel in source.iter_mut() {
                for (x, w) in channel.iter_mut().zip(&total) {
                    *x = ((f64::from(*x / w)) * std + mean) as f32;
                }
            }
        }
        Ok(out)
    }
}
