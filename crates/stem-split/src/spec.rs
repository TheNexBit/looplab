//! HTDemucs's spectrograms, as `HTDemucs._spec` / `_ispec` compute them with torch:
//! the signal padded by reflection (1536 samples, then `center=True` adds 2048 more),
//! periodic Hann window of 4096, hop 1024, `normalized=True` (÷ √4096 forward, × √4096
//! back), the last frequency bin dropped and two frames trimmed on each side so the
//! spectrogram has exactly `ceil(length / 1024)` frames.

use std::sync::Arc;

use realfft::num_complex::Complex;
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};

pub const N_FFT: usize = 4096;
pub const HOP: usize = N_FFT / 4;
/// Frequency bins kept (the Nyquist bin is dropped)
pub const BINS: usize = N_FFT / 2;
/// HTDemucs's own padding, before torch's centring
const PAD: usize = HOP / 2 * 3;

/// Frames of the spectrogram of `length` samples.
pub fn frames(length: usize) -> usize {
    length.div_ceil(HOP)
}

/// Index into a signal extended by reflection at both ends (without repeating the edge).
fn reflect(i: isize, len: usize) -> usize {
    let n = len as isize;
    let mut i = i;
    // One reflection is all torch allows (the pad is shorter than the signal); loop anyway
    while i < 0 || i >= n {
        if i < 0 {
            i = -i;
        }
        if i >= n {
            i = 2 * (n - 1) - i;
        }
    }
    i as usize
}

pub struct Spectrogram {
    forward: Arc<dyn RealToComplex<f32>>,
    inverse: Arc<dyn ComplexToReal<f32>>,
    window: Vec<f32>,
}

impl Default for Spectrogram {
    fn default() -> Self {
        Self::new()
    }
}

impl Spectrogram {
    pub fn new() -> Self {
        let mut planner = RealFftPlanner::<f32>::new();
        let window = (0..N_FFT)
            .map(|n| {
                let phase = 2.0 * std::f64::consts::PI * n as f64 / N_FFT as f64;
                (0.5 - 0.5 * phase.cos()) as f32
            })
            .collect();
        Self {
            forward: planner.plan_fft_forward(N_FFT),
            inverse: planner.plan_fft_inverse(N_FFT),
            window,
        }
    }

    /// The spectrogram of one channel: `frames(signal.len())` frames of [`BINS`] bins,
    /// frame-major.
    pub fn forward(&self, signal: &[f32]) -> Vec<Complex<f32>> {
        let len = signal.len();
        let le = frames(len);
        // HTDemucs pads by reflection to le·HOP + 2·PAD samples…
        let padded_len = le * HOP + 2 * PAD;
        let padded = |i: isize| signal[reflect(i - PAD as isize, len)];
        // …then torch centres the frames, reflecting that padded signal again
        let centred = |i: isize| padded(reflect(i - (N_FFT / 2) as isize, padded_len) as isize);

        let norm = 1.0 / (N_FFT as f32).sqrt();
        let mut input = self.forward.make_input_vec();
        let mut output = self.forward.make_output_vec();
        let mut scratch = self.forward.make_scratch_vec();
        let mut out = Vec::with_capacity(le * BINS);
        // torch gives le + 4 frames; HTDemucs keeps 2..2 + le
        for frame in 2..2 + le {
            let start = (frame * HOP) as isize;
            for (n, slot) in input.iter_mut().enumerate() {
                *slot = centred(start + n as isize) * self.window[n];
            }
            self.forward
                .process_with_scratch(&mut input, &mut output, &mut scratch)
                .expect("buffers come from the plan");
            out.extend(output[..BINS].iter().map(|c| c * norm));
        }
        out
    }

    /// One channel back from `frames(length)` frames of [`BINS`] bins (frame-major).
    pub fn inverse(&self, spectrum: &[Complex<f32>], length: usize) -> Vec<f32> {
        let le = frames(length);
        assert_eq!(spectrum.len(), le * BINS, "spectrum size");
        // HTDemucs adds the Nyquist bin back (zero) and two silent frames on each side
        let total_frames = le + 4;
        let istft_len = HOP * le + 2 * PAD;
        // torch.istft, center=True: overlap-add over the centred signal, then the first
        // N_FFT/2 samples are dropped
        let ola_len = (total_frames - 1) * HOP + N_FFT;
        let mut ola = vec![0.0f32; ola_len];
        let mut envelope = vec![0.0f32; ola_len];
        let scale = (N_FFT as f32).sqrt() / N_FFT as f32;
        let mut input = self.inverse.make_input_vec();
        let mut output = self.inverse.make_output_vec();
        let mut scratch = self.inverse.make_scratch_vec();
        for frame in 0..total_frames {
            let start = frame * HOP;
            let inner = frame.checked_sub(2).filter(|&f| f < le);
            if let Some(f) = inner {
                input[..BINS].copy_from_slice(&spectrum[f * BINS..(f + 1) * BINS]);
                input[BINS] = Complex::new(0.0, 0.0);
                // A real signal: no imaginary part at DC and Nyquist
                input[0].im = 0.0;
                self.inverse
                    .process_with_scratch(&mut input, &mut output, &mut scratch)
                    .expect("buffers come from the plan");
                for n in 0..N_FFT {
                    ola[start + n] += output[n] * scale * self.window[n];
                }
            }
            for n in 0..N_FFT {
                envelope[start + n] += self.window[n] * self.window[n];
            }
        }
        let mut signal = Vec::with_capacity(length);
        for i in 0..length {
            // Drop torch's centring, then HTDemucs's own padding
            let at = i + PAD + N_FFT / 2;
            let value = if at < ola_len && at - N_FFT / 2 < istft_len && envelope[at] > 1e-11 {
                ola[at] / envelope[at]
            } else {
                0.0
            };
            signal.push(value);
        }
        signal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reflection_does_not_repeat_the_edge() {
        assert_eq!(reflect(-1, 10), 1);
        assert_eq!(reflect(-3, 10), 3);
        assert_eq!(reflect(10, 10), 8);
        assert_eq!(reflect(4, 10), 4);
    }

    #[test]
    fn a_signal_comes_back_from_its_spectrogram_away_from_its_ends() {
        let signal: Vec<f32> = (0..20_000)
            .map(|i| ((i as f32) * 0.013).sin() * 0.5 + ((i * 7 % 13) as f32 / 13.0 - 0.5) * 0.1)
            .collect();
        let spec = Spectrogram::new();
        let back = spec.inverse(&spec.forward(&signal), signal.len());
        // HTDemucs keeps no frame centred past the ends: only the inside comes back whole
        let inside = N_FFT..signal.len() - N_FFT;
        let worst = signal[inside.clone()]
            .iter()
            .zip(&back[inside])
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f32::max);
        assert!(worst < 1e-4, "{worst}");
    }
}
