//! The log-mel spectrogram Beat This! is trained on, identical to its `LogMelSpect`:
//! torchaudio `MelSpectrogram(sample_rate=22050, n_fft=1024, hop_length=441, f_min=30,
//! f_max=11000, n_mels=128, mel_scale="slaney", normalized="frame_length", power=1)`
//! followed by `log1p(1000 · x)`.
//!
//! Spelled out: periodic Hann window of 1024 samples, frames every 441 samples (50 per
//! second), the signal padded by 512 samples on each side by reflection (`center=True`),
//! magnitude of the real FFT divided by √1024, 128 triangular mel filters on the Slaney
//! scale without area normalisation, then `ln(1 + 1000 · x)`.

use std::sync::Arc;

use realfft::{RealFftPlanner, RealToComplex};

/// Sample rate the model expects: the input must be mono at this rate.
pub const SAMPLE_RATE: u32 = 22_050;
/// Samples per FFT window.
pub const N_FFT: usize = 1024;
/// Samples between two frames.
pub const HOP: usize = 441;
/// Spectrogram frames per second.
pub const FPS: u32 = SAMPLE_RATE / HOP as u32;
/// Mel bands per frame.
pub const N_MELS: usize = 128;
/// Frequency bins of the real FFT.
pub const N_BINS: usize = N_FFT / 2 + 1;

const F_MIN: f64 = 30.0;
const F_MAX: f64 = 11_000.0;
const LOG_MULTIPLIER: f32 = 1000.0;

/// One triangular filter: its weights on the bins `first..first + weights.len()`, the
/// only ones where it is not zero.
struct Filter {
    first: usize,
    weights: Vec<f32>,
}

/// Computes the spectrogram; build it once and reuse it, it keeps the FFT plan.
pub struct LogMelSpectrogram {
    fft: Arc<dyn RealToComplex<f32>>,
    window: Vec<f32>,
    filters: Vec<Filter>,
}

impl Default for LogMelSpectrogram {
    fn default() -> Self {
        Self::new()
    }
}

impl LogMelSpectrogram {
    pub fn new() -> Self {
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(N_FFT);
        let window = (0..N_FFT)
            .map(|n| {
                let phase = 2.0 * std::f64::consts::PI * n as f64 / N_FFT as f64;
                (0.5 - 0.5 * phase.cos()) as f32
            })
            .collect();
        let fbank = mel_filterbank();
        let filters = (0..N_MELS)
            .map(|m| {
                let column: Vec<f32> = (0..N_BINS).map(|b| fbank[b * N_MELS + m]).collect();
                let first = column.iter().position(|&w| w > 0.0).unwrap_or(0);
                let last = column.iter().rposition(|&w| w > 0.0).unwrap_or(0);
                Filter {
                    first,
                    weights: column[first..=last.max(first)].to_vec(),
                }
            })
            .collect();
        Self {
            fft,
            window,
            filters,
        }
    }

    /// Number of frames for a signal of `len` samples: one every hop, plus the first.
    pub fn frames(len: usize) -> usize {
        1 + len / HOP
    }

    /// The spectrogram of a mono signal at [`SAMPLE_RATE`], `frames × N_MELS` row-major.
    ///
    /// Reflection padding needs more than [`N_FFT`]/2 samples; a shorter signal (under
    /// 23 ms) is padded with zeros first, where PyTorch would refuse it.
    pub fn compute(&self, signal: &[f32]) -> Vec<f32> {
        let half = N_FFT / 2;
        // Frames follow the real length, even when the signal is padded below
        let frames = Self::frames(signal.len());
        let mut owned;
        let signal = if signal.len() <= half {
            owned = signal.to_vec();
            owned.resize(half + 1, 0.0);
            &owned[..]
        } else {
            signal
        };
        let len = signal.len();
        // Index into the padded signal, reflecting at both ends without repeating the edge
        let padded = |i: usize| -> f32 {
            if i < half {
                signal[half - i]
            } else if i - half < len {
                signal[i - half]
            } else {
                signal[2 * len - 2 - (i - half)]
            }
        };

        let norm = 1.0 / (N_FFT as f32).sqrt();
        let mut out = vec![0.0f32; frames * N_MELS];
        let mut input = self.fft.make_input_vec();
        let mut spectrum = self.fft.make_output_vec();
        let mut scratch = self.fft.make_scratch_vec();
        let mut magnitude = vec![0.0f32; N_BINS];

        for (frame, row) in out.as_chunks_mut::<N_MELS>().0.iter_mut().enumerate() {
            let start = frame * HOP;
            for (n, slot) in input.iter_mut().enumerate() {
                *slot = padded(start + n) * self.window[n];
            }
            self.fft
                .process_with_scratch(&mut input, &mut spectrum, &mut scratch)
                .expect("buffers come from the plan");
            for (m, c) in magnitude.iter_mut().zip(&spectrum) {
                *m = c.norm() * norm;
            }
            for (value, filter) in row.iter_mut().zip(&self.filters) {
                let bins = &magnitude[filter.first..filter.first + filter.weights.len()];
                let energy: f32 = bins.iter().zip(&filter.weights).map(|(a, w)| a * w).sum();
                *value = (LOG_MULTIPLIER * energy).ln_1p();
            }
        }
        out
    }
}

/// Hertz to mel on the Slaney scale: linear below 1 kHz, logarithmic above.
fn hz_to_mel(hz: f64) -> f64 {
    let min_log_hz = 1000.0;
    let min_log_mel = min_log_hz * 3.0 / 200.0;
    let log_step = 6.4f64.ln() / 27.0;
    if hz >= min_log_hz {
        min_log_mel + (hz / min_log_hz).ln() / log_step
    } else {
        hz * 3.0 / 200.0
    }
}

#[cfg(test)]
fn mel_to_hz(mel: f64) -> f64 {
    let min_log_hz = 1000.0;
    let min_log_mel = min_log_hz * 3.0 / 200.0;
    let log_step = 6.4f64.ln() / 27.0;
    if mel >= min_log_mel {
        min_log_hz * (log_step * (mel - min_log_mel)).exp()
    } else {
        mel * 200.0 / 3.0
    }
}

/// torchaudio's `melscale_fbanks(513, 30, 11000, 128, 22050, norm=None, "slaney")`,
/// `N_BINS × N_MELS` row-major. The bins span 0..sample_rate // 2 (integer division,
/// as torchaudio does).
///
/// Like torchaudio, the band edges are converted in double precision and everything
/// after that in single precision, so the weights match bit for bit or nearly.
pub fn mel_filterbank() -> Vec<f32> {
    let freqs = linspace_f32(0.0, (SAMPLE_RATE / 2) as f32, N_BINS);
    let mels = linspace_f32(hz_to_mel(F_MIN) as f32, hz_to_mel(F_MAX) as f32, N_MELS + 2);
    let points: Vec<f32> = mels.into_iter().map(mel_to_hz_f32).collect();
    let mut fbank = vec![0.0f32; N_BINS * N_MELS];
    for (bin, &freq) in freqs.iter().enumerate() {
        for m in 0..N_MELS {
            let down = (freq - points[m]) / (points[m + 1] - points[m]);
            let up = (points[m + 2] - freq) / (points[m + 2] - points[m + 1]);
            fbank[bin * N_MELS + m] = down.min(up).max(0.0);
        }
    }
    fbank
}

/// `torch.linspace` in float32: the first half counted from the start, the second
/// half back from the end, with the step in single precision.
fn linspace_f32(start: f32, end: f32, steps: usize) -> Vec<f32> {
    let step = (end - start) / (steps - 1) as f32;
    let halfway = steps / 2;
    (0..steps)
        .map(|i| {
            if i < halfway {
                start + step * i as f32
            } else {
                end - step * (steps - i - 1) as f32
            }
        })
        .collect()
}

/// [`mel_to_hz`] as torchaudio computes it on a float32 tensor.
fn mel_to_hz_f32(mel: f32) -> f32 {
    let min_log_hz = 1000.0f32;
    let min_log_mel = (1000.0f64 * 3.0 / 200.0) as f32;
    let log_step = (6.4f64.ln() / 27.0) as f32;
    if mel >= min_log_mel {
        min_log_hz * (log_step * (mel - min_log_mel)).exp()
    } else {
        (200.0f64 / 3.0) as f32 * mel
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_count_matches_torch_center_padding() {
        assert_eq!(LogMelSpectrogram::frames(154_350), 351);
        assert_eq!(LogMelSpectrogram::frames(1000), 3);
        assert_eq!(LogMelSpectrogram::frames(440), 1);
    }

    #[test]
    fn slaney_scale_round_trips() {
        for hz in [0.0, 30.0, 999.0, 1000.0, 4321.0, 11_000.0] {
            assert!((mel_to_hz(hz_to_mel(hz)) - hz).abs() < 1e-9);
        }
    }

    #[test]
    fn a_very_short_signal_still_gives_one_frame() {
        let spect = LogMelSpectrogram::new().compute(&[0.5; 10]);
        assert_eq!(spect.len(), N_MELS);
        assert!(spect.iter().all(|v| v.is_finite() && *v >= 0.0));
    }
}
