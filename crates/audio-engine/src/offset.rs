//! How far apart two recordings of the same take are: the sound of a lesson's video and its mp3,
//! two camera angles, the recording and its backing track.
//!
//! Both are turned into "attack curves" (how much louder the sound just got, every 10 ms) and
//! compared at every shift with one FFT: the shift where the attacks line up best is the
//! offset, found to within a few milliseconds. The waveforms are then compared directly
//! around it, on the loudest stretches, for the last millisecond. A backing track lines up
//! with the full recording the same way: its drums and bass are in both.

use std::sync::Arc;

use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};

use crate::pcm::Pcm;

/// Rate both recordings are read at for the comparison.
pub const RATE: u32 = 22_050;
/// Step of the attack curves (about 10 ms).
const HOP: usize = 220;
const WINDOW: usize = 1024;
/// Largest shift looked for, either way.
const MAX_SHIFT_SECONDS: f64 = 90.0;
/// The attack curve minus its average over this long: only what stands out counts.
const BASELINE_SECONDS: f64 = 0.4;
/// Below this likeness the two files are not the same take.
const MIN_SCORE: f32 = 0.3;
/// The best shift must beat any other (farther than `RIVAL_GAP`) by this much.
const MIN_DISTINCT: f32 = 1.25;
const RIVAL_GAP_SECONDS: f64 = 0.25;
/// Fine step: the waveforms compared this far around the coarse shift.
const FINE_SPAN_SECONDS: f64 = 0.012;
/// Stretches of the first recording compared sample by sample (the loudest ones).
const FINE_PIECES: usize = 8;
const FINE_PIECE_SECONDS: f64 = 1.0;

/// The result: things heard at `t` in the first recording are heard at `t + seconds` in the
/// second one.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Offset {
    pub seconds: f64,
    /// Likeness of the attacks at that shift (0..1)
    pub score: f32,
    /// How much better that shift is than any other one (1 = no better)
    pub distinct: f32,
}

impl Offset {
    /// The two are the same take: the shift can be trusted.
    pub fn matches(&self) -> bool {
        self.score >= MIN_SCORE && self.distinct >= MIN_DISTINCT
    }
}

/// A recording read for the comparison: mono at [`RATE`].
pub struct Sound {
    samples: Vec<f32>,
    attacks: Vec<f32>,
}

impl Sound {
    pub fn from_pcm(pcm: &Pcm) -> Self {
        Self::from_mono(mono_at(pcm, RATE))
    }

    /// Mono samples already at [`RATE`].
    pub fn from_mono(samples: Vec<f32>) -> Self {
        let attacks = attack_curve(&samples);
        Self { samples, attacks }
    }

    pub fn seconds(&self) -> f64 {
        self.samples.len() as f64 / f64::from(RATE)
    }

    /// True when there is next to nothing to hear (a video with a silent track).
    pub fn is_silent(&self) -> bool {
        let loud = self.samples.iter().fold(0.0_f32, |m, s| m.max(s.abs()));
        loud < 1e-3
    }
}

/// The track as mono at `rate`: every output sample is the average of the frames it covers
/// (which also keeps high frequencies from folding down).
pub fn mono_at(pcm: &Pcm, rate: u32) -> Vec<f32> {
    let frames = pcm.frames() as usize;
    let step = f64::from(pcm.sample_rate()) / f64::from(rate);
    let count = (frames as f64 / step) as usize;
    let mut out = Vec::with_capacity(count);
    for n in 0..count {
        let from = (n as f64 * step) as usize;
        let to = (((n + 1) as f64 * step) as usize).clamp(from + 1, frames);
        let mut sum = 0.0;
        for i in from..to {
            let [l, r] = pcm.frame(i);
            sum += l + r;
        }
        out.push(sum * 0.5 / (to - from) as f32);
    }
    out
}

/// Spectral flux every `HOP` samples, minus its local average, scaled to unit size.
fn attack_curve(samples: &[f32]) -> Vec<f32> {
    let rows = samples.len() / HOP;
    if rows < 2 {
        return Vec::new();
    }
    let fft: Arc<dyn RealToComplex<f32>> = RealFftPlanner::new().plan_fft_forward(WINDOW);
    let window: Vec<f32> = (0..WINDOW)
        .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / WINDOW as f32).cos())
        .collect();
    let mut input = fft.make_input_vec();
    let mut output = fft.make_output_vec();
    let mut scratch = fft.make_scratch_vec();
    let mut previous = vec![0.0_f32; output.len()];
    let mut flux = Vec::with_capacity(rows);
    for row in 0..rows {
        let center = row * HOP;
        for (i, slot) in input.iter_mut().enumerate() {
            let sample = (center + i)
                .checked_sub(WINDOW / 2)
                .and_then(|at| samples.get(at))
                .copied()
                .unwrap_or(0.0);
            *slot = sample * window[i];
        }
        if fft
            .process_with_scratch(&mut input, &mut output, &mut scratch)
            .is_err()
        {
            flux.push(0.0);
            continue;
        }
        let mut rise = 0.0;
        for (bin, value) in output.iter().enumerate().skip(1) {
            let level = (1.0 + 100.0 * value.norm()).ln();
            rise += (level - previous[bin]).max(0.0);
            previous[bin] = level;
        }
        flux.push(rise);
    }
    // Minus the running average: a steady loud passage is not a string of attacks
    let half = ((BASELINE_SECONDS * f64::from(RATE) / HOP as f64) as usize / 2).max(1);
    let mut prefix = vec![0.0_f64; flux.len() + 1];
    for (i, v) in flux.iter().enumerate() {
        prefix[i + 1] = prefix[i] + f64::from(*v);
    }
    let mut curve: Vec<f32> = (0..flux.len())
        .map(|i| {
            let from = i.saturating_sub(half);
            let to = (i + half + 1).min(flux.len());
            let mean = (prefix[to] - prefix[from]) / (to - from) as f64;
            (flux[i] - mean as f32).max(0.0)
        })
        .collect();
    let mean = curve.iter().sum::<f32>() / curve.len() as f32;
    let spread = (curve.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / curve.len() as f32)
        .sqrt()
        .max(1e-9);
    for v in &mut curve {
        *v = (*v - mean) / spread;
    }
    curve
}

/// Where `b` lines up with `a`. `None` when either is too short or silent.
pub fn find(a: &Sound, b: &Sound) -> Option<Offset> {
    if a.attacks.len() < 50 || b.attacks.len() < 50 || a.is_silent() || b.is_silent() {
        return None;
    }
    let hop_seconds = HOP as f64 / f64::from(RATE);
    let (corr, n) = cross_correlation(&a.attacks, &b.attacks);
    let max_shift = ((MAX_SHIFT_SECONDS / hop_seconds) as usize).min(n / 2 - 1);
    // corr[k] = Σ a[t]·b[t+k]; negative k wrap around to the end
    let at = |shift: isize| -> f32 {
        let index = if shift >= 0 {
            shift as usize
        } else {
            n - shift.unsigned_abs()
        };
        corr[index]
    };
    let shifts = -(max_shift as isize)..=(max_shift as isize);
    let best = shifts.clone().max_by(|&x, &y| at(x).total_cmp(&at(y)))?;
    let gap = (RIVAL_GAP_SECONDS / hop_seconds) as isize;
    let rival = shifts
        .filter(|s| (s - best).abs() > gap)
        .map(at)
        .fold(f32::MIN, f32::max)
        .max(1e-6);
    let peak = at(best);
    // Likeness: the correlation over the overlap, as a share of a perfect match
    let overlap = overlap_len(a.attacks.len(), b.attacks.len(), best) as f32;
    let score = (peak / overlap.max(1.0)).clamp(0.0, 1.0);
    // Between steps: the top of a parabola through the best one and its neighbours
    let (l, c, r) = (at(best - 1), peak, at(best + 1));
    let bend = l - 2.0 * c + r;
    let fraction = if bend < 0.0 {
        f64::from((0.5 * (l - r) / bend).clamp(-0.5, 0.5))
    } else {
        0.0
    };
    let coarse = (best as f64 + fraction) * hop_seconds;
    Some(Offset {
        seconds: refine(a, b, coarse),
        score,
        distinct: peak / rival,
    })
}

fn overlap_len(a: usize, b: usize, shift: isize) -> usize {
    // a[t] meets b[t + shift] for 0 <= t < a and 0 <= t + shift < b
    let from = (-shift).max(0) as usize;
    let to = (a as isize).min(b as isize - shift).max(0) as usize;
    to.saturating_sub(from)
}

/// Circular cross-correlation of the two curves, padded so no shift in range wraps onto
/// another; returns it with its length.
fn cross_correlation(a: &[f32], b: &[f32]) -> (Vec<f32>, usize) {
    let n = (a.len() + b.len()).next_power_of_two();
    let mut planner = RealFftPlanner::<f32>::new();
    let forward = planner.plan_fft_forward(n);
    let inverse = planner.plan_fft_inverse(n);
    let spectrum = |curve: &[f32]| {
        let mut input = vec![0.0; n];
        input[..curve.len()].copy_from_slice(curve);
        let mut out = forward.make_output_vec();
        let _ = forward.process(&mut input, &mut out);
        out
    };
    let fa = spectrum(a);
    let fb = spectrum(b);
    let mut product: Vec<Complex<f32>> = fa.iter().zip(&fb).map(|(x, y)| x.conj() * y).collect();
    // Real signals: the first and last bins carry no imaginary part
    if let Some(first) = product.first_mut() {
        first.im = 0.0;
    }
    if let Some(last) = product.last_mut() {
        last.im = 0.0;
    }
    let mut out = vec![0.0; n];
    let _ = inverse.process(&mut product, &mut out);
    let scale = 1.0 / n as f32;
    for v in &mut out {
        *v *= scale;
    }
    (out, n)
}

/// The waveforms compared sample by sample a few milliseconds around `coarse`, on the
/// loudest stretches of `a`; keeps `coarse` when they say nothing clear.
fn refine(a: &Sound, b: &Sound, coarse: f64) -> f64 {
    let rate = f64::from(RATE);
    let piece = (FINE_PIECE_SECONDS * rate) as usize;
    let span = (FINE_SPAN_SECONDS * rate) as isize;
    let center = (coarse * rate).round() as isize;
    // The loudest pieces of `a` that are inside `b` at every shift tried
    let mut pieces: Vec<(f32, usize)> = (0..a.samples.len() / piece)
        .map(|i| i * piece)
        .filter(|&start| {
            let first = start as isize + center - span;
            let last = (start + piece) as isize + center + span;
            first >= 0 && last < b.samples.len() as isize
        })
        .map(|start| {
            let energy = a.samples[start..start + piece].iter().map(|s| s * s).sum();
            (energy, start)
        })
        .collect();
    pieces.sort_by(|x, y| y.0.total_cmp(&x.0));
    pieces.truncate(FINE_PIECES);
    if pieces.is_empty() {
        return coarse;
    }
    let score = |shift: isize| -> f64 {
        pieces
            .iter()
            .map(|&(_, start)| {
                let from = (start as isize + shift) as usize;
                let x = &a.samples[start..start + piece];
                let y = &b.samples[from..from + piece];
                x.iter().zip(y).map(|(p, q)| f64::from(p * q)).sum::<f64>()
            })
            .sum()
    };
    let scores: Vec<f64> = (-span..=span).map(|d| score(center + d)).collect();
    let (index, &top) = scores
        .iter()
        .enumerate()
        .max_by(|x, y| x.1.total_cmp(y.1))
        .unwrap_or((span as usize, &0.0));
    let average = scores.iter().map(|s| s.abs()).sum::<f64>() / scores.len() as f64;
    // A clear peak only: else the attacks' answer stands
    if top <= 0.0 || top < 3.0 * average {
        return coarse;
    }
    (center + index as isize - span) as f64 / rate
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Noise bursts at irregular times: something with attacks to line up.
    fn clicks(seconds: f64, seed: u32) -> Vec<f32> {
        let len = (seconds * f64::from(RATE)) as usize;
        let mut out = vec![0.0; len];
        let mut state = seed;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            state
        };
        let mut at = 2000;
        while at + 2000 < len {
            for i in 0..1500 {
                let noise = (next() % 2000) as f32 / 1000.0 - 1.0;
                out[at + i] = noise * 0.5 * (1.0 - i as f32 / 1500.0);
            }
            at += 3000 + (next() % 9000) as usize;
        }
        out
    }

    fn shifted(samples: &[f32], by: isize, extra: f32, seed: u32) -> Vec<f32> {
        let noise = clicks(samples.len() as f64 / f64::from(RATE), seed);
        (0..samples.len())
            .map(|i| {
                let from = i as isize - by;
                let base = if from >= 0 && (from as usize) < samples.len() {
                    samples[from as usize]
                } else {
                    0.0
                };
                base + noise[i] * extra
            })
            .collect()
    }

    #[test]
    fn finds_a_later_copy_to_the_sample() {
        let a = clicks(40.0, 7);
        let by = 12_345; // 0.56 s later
        let b = shifted(&a, by, 0.0, 1);
        let found = find(&Sound::from_mono(a), &Sound::from_mono(b)).unwrap();
        assert!(found.matches(), "{found:?}");
        let expected = by as f64 / f64::from(RATE);
        assert!(
            (found.seconds - expected).abs() < 0.001,
            "{found:?} vs {expected}"
        );
    }

    #[test]
    fn finds_an_earlier_copy_with_other_sounds_on_top() {
        let a = clicks(40.0, 11);
        let by = -30_000;
        // The other file has more in it (a guitar over the backing)
        let b = shifted(&a, by, 0.6, 99);
        let found = find(&Sound::from_mono(a), &Sound::from_mono(b)).unwrap();
        assert!(found.matches(), "{found:?}");
        let expected = by as f64 / f64::from(RATE);
        assert!(
            (found.seconds - expected).abs() < 0.002,
            "{found:?} vs {expected}"
        );
    }

    #[test]
    fn different_takes_do_not_match() {
        let a = clicks(40.0, 3);
        let b = clicks(40.0, 4);
        let found = find(&Sound::from_mono(a), &Sound::from_mono(b)).unwrap();
        assert!(!found.matches(), "{found:?}");
    }

    #[test]
    fn silence_has_no_offset() {
        let a = clicks(10.0, 3);
        let b = vec![0.0; a.len()];
        assert!(find(&Sound::from_mono(a), &Sound::from_mono(b)).is_none());
    }
}
