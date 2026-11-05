//! Decoded audio kept in memory for playback.
//!
//! Storage is 16-bit interleaved stereo: half the RAM of f32 with no audible
//! difference for ear training. Only this file knows the storage format, so it
//! can change later (f32, memory-mapped file, …) without touching any caller.

use crate::time;

/// Every track is stored as stereo; mono and multichannel sources are converted on load.
pub const CHANNELS: usize = 2;

const TO_I16: f32 = i16::MAX as f32;
const FROM_I16: f32 = 1.0 / 32768.0;

pub struct Pcm {
    samples: Vec<i16>,
    sample_rate: u32,
}

impl Pcm {
    pub fn with_capacity(sample_rate: u32, frames: usize) -> Self {
        Self {
            samples: Vec::with_capacity(frames * CHANNELS),
            sample_rate,
        }
    }

    /// Appends interleaved stereo f32 frames (values in -1.0..=1.0, clipped beyond).
    pub fn extend_from_f32(&mut self, interleaved: &[f32]) {
        debug_assert_eq!(interleaved.len() % CHANNELS, 0);
        self.samples.extend(
            interleaved
                .iter()
                .map(|&s| (s.clamp(-1.0, 1.0) * TO_I16).round() as i16),
        );
    }

    /// Releases the spare capacity reserved while loading.
    pub fn shrink_to_fit(&mut self) {
        self.samples.shrink_to_fit();
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn frames(&self) -> u64 {
        (self.samples.len() / CHANNELS) as u64
    }

    pub fn duration_seconds(&self) -> f64 {
        time::frames_to_seconds(self.frames(), self.sample_rate)
    }

    /// Left and right sample of one frame. `index` must be below `frames()`.
    #[inline]
    pub fn frame(&self, index: usize) -> [f32; CHANNELS] {
        let i = index * CHANNELS;
        [
            f32::from(self.samples[i]) * FROM_I16,
            f32::from(self.samples[i + 1]) * FROM_I16,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_frames_with_16_bit_precision() {
        let mut pcm = Pcm::with_capacity(48_000, 3);
        pcm.extend_from_f32(&[0.0, 0.5, -0.25, 1.0, -1.0, 0.123]);
        assert_eq!(pcm.frames(), 3);
        let [l, r] = pcm.frame(1);
        assert!((l + 0.25).abs() < 1e-4 && (r - 1.0).abs() < 1e-4);
        assert!((pcm.frame(2)[1] - 0.123).abs() < 1e-4);
    }

    #[test]
    fn clips_out_of_range_values() {
        let mut pcm = Pcm::with_capacity(44_100, 1);
        pcm.extend_from_f32(&[3.0, -3.0]);
        let [l, r] = pcm.frame(0);
        assert!(l <= 1.0 && r >= -1.0);
    }

    #[test]
    fn duration_follows_sample_rate() {
        let mut pcm = Pcm::with_capacity(44_100, 44_100);
        pcm.extend_from_f32(&vec![0.0; 44_100 * CHANNELS]);
        assert!((pcm.duration_seconds() - 1.0).abs() < 1e-9);
    }
}
