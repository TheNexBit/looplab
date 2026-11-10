//! A steady beat through the whole piece, from the network's beat activation.
//!
//! The network's own peaks are good beats, but on some sections it hears quarters and on
//! others eighths (100 and 200 BPM in the same song), it misses beats in breaks and adds
//! a few in fills. Here the beats are tracked again with dynamic programming (Ellis,
//! "Beat tracking by dynamic programming", 2007): the chain of beats that collects the
//! most activation while keeping close to a period, which comes from the network's own
//! peaks folded onto one octave, so it follows real tempo changes but never jumps to
//! half or double. No BPM range: the period is whatever the piece has.

use crate::model::FrameLogits;
use crate::peaks;
use crate::spectrogram::FPS;

/// A tracked beat.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tracked {
    /// Seconds, refined between frames
    pub time: f64,
    /// Probability that a bar starts here (0..1), from the downbeat activation around it
    pub down: f32,
}

/// How much a step that is not the period costs: `TIGHTNESS × ln(step / period)²`, against
/// up to 1 of activation per beat. A step 10% off costs about 0.9: through a solo full of
/// fast notes the beat keeps going instead of chasing them.
const TIGHTNESS: f32 = 100.0;
/// Shortest and longest step, relative to the period.
const STEP_RANGE: (f32, f32) = (0.75, 1.33);
/// Intervals between network peaks taken into account (seconds): 20 to 400 BPM.
const INTERVAL_RANGE: (f64, f64) = (0.15, 3.0);
/// A beat at the very start or end with less activation than this is outside the music.
const EDGE_ACTIVATION: f32 = 0.3;
/// Two intervals are "alike" within this log-ratio (about 10%).
const STEADY: f64 = 0.1;

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

/// The commonest interval between the network's beats (seconds): a histogram over
/// log-time, smoothed, so 0.30 and 0.31 count together.
pub fn main_period(intervals: &[f64]) -> Option<f64> {
    const BINS_PER_OCTAVE: f64 = 50.0;
    let (lo, hi) = INTERVAL_RANGE;
    let bin = |x: f64| ((x / lo).log2() * BINS_PER_OCTAVE) as usize;
    let mut histogram = vec![0.0f64; bin(hi) + 1];
    for &x in intervals.iter().filter(|&&x| x >= lo && x < hi) {
        histogram[bin(x)] += 1.0;
    }
    let smoothed: Vec<f64> = (0..histogram.len())
        .map(|i| {
            histogram[i.saturating_sub(2)..(i + 3).min(histogram.len())]
                .iter()
                .sum()
        })
        .collect();
    let (best, &count) = smoothed
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.total_cmp(b.1))?;
    if count <= 0.0 {
        return None;
    }
    // The bin says where; the median of the intervals around it says exactly
    let rough = lo * 2f64.powf((best as f64 + 0.5) / BINS_PER_OCTAVE);
    let mut near: Vec<f64> = intervals
        .iter()
        .copied()
        .filter(|&x| (x / rough).ln().abs() < 0.08)
        .collect();
    near.sort_by(f64::total_cmp);
    Some(near.get(near.len() / 2).copied().unwrap_or(rough))
}

/// `value` moved by octaves (×2, ÷2) to within √2 of `reference`.
fn fold(mut value: f64, reference: f64) -> f64 {
    while value > reference * std::f64::consts::SQRT_2 {
        value /= 2.0;
    }
    while value < reference / std::f64::consts::SQRT_2 {
        value *= 2.0;
    }
    value
}

/// Period in frames at every frame: the local median interval of the network's peaks,
/// folded onto the octave of the main period.
fn local_periods(peak_times: &[f64], main: f64, frames: usize) -> Vec<f32> {
    let fps = f64::from(FPS);
    let intervals: Vec<f64> = peak_times.windows(2).map(|w| w[1] - w[0]).collect();
    let mut periods = vec![(main * fps) as f32; frames];
    if intervals.is_empty() {
        return periods;
    }
    // Only steady stretches tell the tempo: an interval like both its neighbours. In a
    // solo of fast notes the intervals jump about (0.1, 0.16, 0.3…) and folding them by
    // octaves would give nonsense (0.1 s becomes 0.4 s); a real tempo change is steady
    let close = |a: f64, b: f64| (a / b).ln().abs() < STEADY;
    let steady: Vec<bool> = (0..intervals.len())
        .map(|i| {
            let x = intervals[i];
            (INTERVAL_RANGE.0..INTERVAL_RANGE.1).contains(&x)
                && i.checked_sub(1).is_none_or(|j| close(intervals[j], x))
                && intervals.get(i + 1).is_none_or(|&y| close(x, y))
        })
        .collect();
    let mut last = main;
    let local: Vec<f64> = (0..intervals.len())
        .map(|i| {
            let from = i.saturating_sub(16);
            let to = (i + 17).min(intervals.len());
            let mut window: Vec<f64> = (from..to)
                .filter(|&j| steady[j])
                .map(|j| fold(intervals[j], main))
                .collect();
            // Through a long unsteady stretch, the last steady tempo carries on
            if window.len() >= 4 {
                window.sort_by(f64::total_cmp);
                last = window[window.len() / 2];
            }
            last
        })
        .collect();
    // Each frame takes the period of the interval it falls in (before the first and
    // after the last, the nearest one)
    let mut i = 0;
    for (frame, period) in periods.iter_mut().enumerate() {
        let time = frame as f64 / fps;
        while i + 1 < local.len() && peak_times[i + 1] <= time {
            i += 1;
        }
        *period = (local[i] * fps) as f32;
    }
    periods
}

/// Sub-frame position of the peak at `frame` (parabola through it and its neighbours).
fn refine(values: impl Fn(usize) -> f32, frame: usize, len: usize) -> f64 {
    if frame == 0 || frame + 1 >= len {
        return frame as f64;
    }
    let (a, b, c) = (values(frame - 1), values(frame), values(frame + 1));
    let curvature = a - 2.0 * b + c;
    if curvature >= 0.0 {
        return frame as f64;
    }
    frame as f64 + f64::from((0.5 * (a - c) / curvature).clamp(-0.5, 0.5))
}

/// The beats of the whole piece.
pub fn track(logits: &[FrameLogits]) -> Vec<Tracked> {
    let len = logits.len();
    let fps = f64::from(FPS);
    let peak_times: Vec<f64> = peaks::beats(logits).iter().map(|b| b.time).collect();
    let intervals: Vec<f64> = peak_times.windows(2).map(|w| w[1] - w[0]).collect();
    let Some(main) = main_period(&intervals) else {
        return Vec::new();
    };
    let periods = local_periods(&peak_times, main, len);
    let activation: Vec<f32> = logits.iter().map(|l| sigmoid(l.beat)).collect();

    // score[t]: best chain of beats ending on frame t; back[t]: the beat before it
    let mut score = vec![0.0f32; len];
    let mut back = vec![usize::MAX; len];
    for t in 0..len {
        let period = periods[t];
        let shortest = (period * STEP_RANGE.0).round().max(1.0) as usize;
        let longest = (period * STEP_RANGE.1).round() as usize;
        let mut best = (0.0f32, usize::MAX);
        for step in shortest..=longest.min(t) {
            let cost = TIGHTNESS * (step as f32 / period).ln().powi(2);
            let candidate = score[t - step] - cost;
            if candidate > best.0 {
                best = (candidate, t - step);
            }
        }
        score[t] = activation[t] + best.0;
        back[t] = best.1;
    }

    // The chain ends on the best frame of the last period, and is followed back
    let last_period = periods.last().copied().unwrap_or(25.0) as usize;
    let Some(end) =
        (len.saturating_sub(last_period + 1)..len).max_by(|&a, &b| score[a].total_cmp(&score[b]))
    else {
        return Vec::new();
    };
    let mut frames = vec![end];
    while let Some(&t) = frames.last() {
        match back[t] {
            usize::MAX => break,
            previous => frames.push(previous),
        }
    }
    frames.reverse();

    // Beats before the music starts or after it ends are dropped
    let near = |t: usize, pick: fn(&FrameLogits) -> f32| {
        (t.saturating_sub(2)..(t + 3).min(len))
            .map(|u| sigmoid(pick(&logits[u])))
            .fold(0.0f32, f32::max)
    };
    let first = frames
        .iter()
        .position(|&t| near(t, |l| l.beat) >= EDGE_ACTIVATION);
    let last = frames
        .iter()
        .rposition(|&t| near(t, |l| l.beat) >= EDGE_ACTIVATION);
    let (Some(first), Some(last)) = (first, last) else {
        return Vec::new();
    };
    frames[first..=last]
        .iter()
        .map(|&t| Tracked {
            time: refine(|u| logits[u].beat, t, len) / fps,
            down: near(t, |l| l.downbeat),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_period_is_the_commonest_interval() {
        let mut intervals = vec![0.3; 40];
        intervals.extend([0.6; 25]);
        intervals.extend([0.45; 5]);
        let main = main_period(&intervals).unwrap();
        assert!((main - 0.3).abs() < 0.01, "{main}");
    }

    #[test]
    fn octaves_fold_onto_the_reference() {
        assert!((fold(0.6, 0.3) - 0.3).abs() < 1e-12);
        assert!((fold(0.15, 0.3) - 0.3).abs() < 1e-12);
        assert!(
            (fold(0.36, 0.3) - 0.36).abs() < 1e-12,
            "a real tempo change stays"
        );
    }

    #[test]
    fn half_time_sections_keep_the_beat_level() {
        // Beats every 0.3 s, but in the middle the network only hears every other one
        let len = 50 * 30;
        let mut logits = vec![
            FrameLogits {
                beat: -6.0,
                downbeat: -6.0
            };
            len
        ];
        let mut k = 0;
        let mut t = 0.5;
        while t < 29.5 {
            let half_time = (10.0..20.0).contains(&t);
            if !half_time || k % 2 == 0 {
                logits[(t * 50.0) as usize].beat = 4.0;
            }
            k += 1;
            t += 0.3;
        }
        let beats = track(&logits);
        let intervals: Vec<f64> = beats.windows(2).map(|w| w[1].time - w[0].time).collect();
        assert!(
            intervals.iter().all(|&x| (x - 0.3).abs() < 0.03),
            "{intervals:?}"
        );
        assert!((beats[0].time - 0.5).abs() < 0.02);
    }
}
