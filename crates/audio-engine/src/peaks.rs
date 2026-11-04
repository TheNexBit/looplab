//! Multi-resolution waveform data, like map tiles at different zoom levels.
//!
//! Level 0 holds the min/max of every `BASE_BIN_FRAMES` frames; each next level
//! halves the resolution. The UI picks the level that gives about one bin per
//! pixel, so drawing cost does not depend on the song length or the zoom.

use crate::pcm::Pcm;

pub const BASE_BIN_FRAMES: u32 = 32;
/// Coarser levels stop once they have this few bins: enough for the overview.
const MIN_BINS: usize = 512;

pub struct Level {
    pub bin_frames: u32,
    /// Interleaved (min, max) per bin, normalised so the loudest peak of the song is ±127
    pub data: Vec<i8>,
}

impl Level {
    pub fn bins(&self) -> usize {
        self.data.len() / 2
    }
}

pub struct Peaks {
    pub sample_rate: u32,
    pub levels: Vec<Level>,
}

impl Peaks {
    pub fn from_pcm(pcm: &Pcm) -> Self {
        let frames = pcm.frames() as usize;
        let bin = BASE_BIN_FRAMES as usize;
        let bins = frames.div_ceil(bin);

        // First pass in f32, so quiet songs still use the full i8 range once normalised
        let mut raw = Vec::with_capacity(bins * 2);
        let mut loudest = 0.0_f32;
        for start in (0..frames).step_by(bin) {
            let (mut lo, mut hi) = (f32::MAX, f32::MIN);
            for index in start..(start + bin).min(frames) {
                for s in pcm.frame(index) {
                    lo = lo.min(s);
                    hi = hi.max(s);
                }
            }
            loudest = loudest.max(lo.abs()).max(hi.abs());
            raw.push(lo);
            raw.push(hi);
        }

        let scale = if loudest > 0.0 { 127.0 / loudest } else { 0.0 };
        let base: Vec<i8> = raw.iter().map(|&v| (v * scale).round() as i8).collect();

        let mut levels = vec![Level { bin_frames: BASE_BIN_FRAMES, data: base }];
        while let Some(last) = levels.last()
            && last.bins() > MIN_BINS
        {
            let data = last
                .data
                .chunks(4)
                .flat_map(|pair| match pair {
                    [lo_a, hi_a, lo_b, hi_b] => [*lo_a.min(lo_b), *hi_a.max(hi_b)],
                    [lo, hi] => [*lo, *hi],
                    _ => unreachable!("bins are (min, max) pairs"),
                })
                .collect();
            levels.push(Level { bin_frames: last.bin_frames * 2, data });
        }

        Self { sample_rate: pcm.sample_rate(), levels }
    }

    /// Little-endian binary layout read by the UI (`src/features/waveform/peaks.ts`):
    /// `u32 sample_rate, u32 level_count`, then per level `u32 bin_frames, u32 bins, i8[bins * 2]`.
    pub fn to_bytes(&self) -> Vec<u8> {
        let size = 8 + self.levels.iter().map(|l| 8 + l.data.len()).sum::<usize>();
        let mut bytes = Vec::with_capacity(size);
        bytes.extend_from_slice(&self.sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(self.levels.len() as u32).to_le_bytes());
        for level in &self.levels {
            bytes.extend_from_slice(&level.bin_frames.to_le_bytes());
            bytes.extend_from_slice(&(level.bins() as u32).to_le_bytes());
            bytes.extend(level.data.iter().map(|&v| v as u8));
        }
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pcm::CHANNELS;

    fn pcm_from(frames: usize, value: impl Fn(usize) -> f32) -> Pcm {
        let mut pcm = Pcm::with_capacity(48_000, frames);
        let samples: Vec<f32> = (0..frames).flat_map(|i| [value(i); CHANNELS]).collect();
        pcm.extend_from_f32(&samples);
        pcm
    }

    #[test]
    fn base_level_covers_every_frame() {
        let pcm = pcm_from(100, |_| 0.1);
        let peaks = Peaks::from_pcm(&pcm);
        assert_eq!(peaks.levels[0].bins(), 4); // 100 / 32 rounded up
    }

    #[test]
    fn loudest_peak_is_normalised_to_full_scale() {
        let pcm = pcm_from(64, |i| if i == 40 { -0.25 } else { 0.05 });
        let peaks = Peaks::from_pcm(&pcm);
        assert_eq!(peaks.levels[0].data[2], -127);
        assert_eq!(peaks.levels[0].data[1], 25); // 0.05 / 0.25 * 127
    }

    #[test]
    fn levels_halve_until_small() {
        let pcm = pcm_from(32 * 4_000, |i| (i as f32 * 0.01).sin());
        let peaks = Peaks::from_pcm(&pcm);
        for pair in peaks.levels.windows(2) {
            assert_eq!(pair[1].bin_frames, pair[0].bin_frames * 2);
            assert_eq!(pair[1].bins(), pair[0].bins().div_ceil(2));
        }
        assert!(peaks.levels.last().unwrap().bins() <= MIN_BINS);
    }

    #[test]
    fn binary_layout_matches_the_ui_reader() {
        let peaks = Peaks::from_pcm(&pcm_from(64, |_| 0.5));
        let bytes = peaks.to_bytes();
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 48_000);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 32);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 2);
        assert_eq!(bytes.len(), 16 + 4);
    }
}
