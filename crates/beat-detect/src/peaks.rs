//! Beats and downbeats from the network's logits: Beat This!'s "minimal"
//! postprocessing (`Postprocessor.postp_minimal`), reproduced exactly.
//!
//! A frame is a peak when its logit is positive and the largest within ±3 frames;
//! peaks at most one frame apart are merged into their mean; each downbeat is moved
//! onto the nearest beat.

use crate::model::FrameLogits;
use crate::spectrogram::FPS;

/// Half the window of `max_pool1d(kernel 7)`.
const HALF_WINDOW: usize = 3;

/// A detected beat.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Beat {
    /// Seconds from the start of the audio
    pub time: f64,
    /// Whether the network also put a downbeat here
    pub downbeat: bool,
    /// Beat logit at the peak: how sure the network is
    pub strength: f32,
    /// Downbeat logit at the same frame
    pub downbeat_strength: f32,
}

/// Peak frames of one logit track, already merged (fractional when merged).
fn peak_frames(values: impl Fn(usize) -> f32, len: usize) -> Vec<f64> {
    let mut frames = Vec::new();
    for t in 0..len {
        let v = values(t);
        if v <= 0.0 {
            continue;
        }
        let window = t.saturating_sub(HALF_WINDOW)..(t + HALF_WINDOW + 1).min(len);
        if window.into_iter().all(|u| values(u) <= v) {
            frames.push(t);
        }
    }
    deduplicate(&frames)
}

/// `deduplicate_peaks(width=1)`: runs of peaks each within one frame of the running mean
/// become that mean.
fn deduplicate(frames: &[usize]) -> Vec<f64> {
    let mut out = Vec::new();
    let mut iter = frames.iter();
    let Some(&first) = iter.next() else {
        return out;
    };
    let (mut mean, mut count) = (first as f64, 1.0);
    for &next in iter {
        let next = next as f64;
        if next - mean <= 1.0 {
            count += 1.0;
            mean += (next - mean) / count;
        } else {
            out.push(mean);
            mean = next;
            count = 1.0;
        }
    }
    out.push(mean);
    out
}

/// Beats in time order, each flagged when a downbeat lands on it.
pub fn beats(logits: &[FrameLogits]) -> Vec<Beat> {
    let len = logits.len();
    let fps = f64::from(FPS);
    let at = |frame: f64, pick: fn(&FrameLogits) -> f32| {
        pick(&logits[(frame.round() as usize).min(len.saturating_sub(1))])
    };
    let beat_frames = peak_frames(|t| logits[t].beat, len);
    let mut beats: Vec<Beat> = beat_frames
        .iter()
        .map(|&f| Beat {
            time: f / fps,
            downbeat: false,
            strength: at(f, |l| l.beat),
            downbeat_strength: at(f, |l| l.downbeat),
        })
        .collect();
    if beats.is_empty() {
        return beats;
    }
    for frame in peak_frames(|t| logits[t].downbeat, len) {
        let time = frame / fps;
        // np.argmin: the first of two equally near beats
        let nearest = beats
            .iter()
            .enumerate()
            .fold((0, f64::INFINITY), |best, (i, b)| {
                let d = (b.time - time).abs();
                if d < best.1 { (i, d) } else { best }
            })
            .0;
        let beat = &mut beats[nearest];
        beat.downbeat = true;
        beat.downbeat_strength = beat.downbeat_strength.max(at(frame, |l| l.downbeat));
    }
    beats
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(beat_frames: &[usize], downbeat_frames: &[usize], len: usize) -> Vec<FrameLogits> {
        (0..len)
            .map(|t| FrameLogits {
                beat: if beat_frames.contains(&t) { 3.0 } else { -3.0 },
                downbeat: if downbeat_frames.contains(&t) {
                    3.0
                } else {
                    -3.0
                },
            })
            .collect()
    }

    #[test]
    fn adjacent_peaks_merge_into_their_mean() {
        // As in Python the distance is from the running mean: 12 is 1.5 from 10.5
        assert_eq!(
            deduplicate(&[10, 11, 12, 20, 22]),
            vec![10.5, 12.0, 20.0, 22.0]
        );
        assert_eq!(deduplicate(&[]), Vec::<f64>::new());
    }

    #[test]
    fn downbeats_snap_to_the_nearest_beat() {
        let beats = beats(&track(&[10, 35, 60, 85], &[37, 84], 100));
        let times: Vec<_> = beats.iter().map(|b| (b.time, b.downbeat)).collect();
        assert_eq!(
            times,
            vec![(0.2, false), (0.7, true), (1.2, false), (1.7, true)]
        );
    }

    #[test]
    fn negative_logits_are_never_beats() {
        assert!(beats(&track(&[], &[5], 50)).is_empty());
    }
}
