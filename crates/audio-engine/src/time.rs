//! Conversions between time (seconds) and audio frames.
//!
//! A frame is one sample per channel at a given instant: a stereo frame holds
//! two samples. Positions inside the engine are always frames; seconds are only
//! used at the boundary with the UI.

/// Converts a frame position to seconds.
pub fn frames_to_seconds(frames: u64, sample_rate: u32) -> f64 {
    frames as f64 / f64::from(sample_rate)
}

/// Converts seconds to the nearest frame position. Negative or non-finite input maps to 0.
pub fn seconds_to_frames(seconds: f64, sample_rate: u32) -> u64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds * f64::from(sample_rate)).round() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_is_exact_on_whole_frames() {
        for frames in [0_u64, 1, 44_100, 48_000 * 600 + 7] {
            let seconds = frames_to_seconds(frames, 48_000);
            assert_eq!(seconds_to_frames(seconds, 48_000), frames);
        }
    }

    #[test]
    fn one_second_matches_sample_rate() {
        assert_eq!(seconds_to_frames(1.0, 44_100), 44_100);
        assert!((frames_to_seconds(22_050, 44_100) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn invalid_seconds_clamp_to_zero() {
        assert_eq!(seconds_to_frames(-3.0, 48_000), 0);
        assert_eq!(seconds_to_frames(f64::NAN, 48_000), 0);
        assert_eq!(seconds_to_frames(f64::INFINITY, 48_000), 0);
    }
}
