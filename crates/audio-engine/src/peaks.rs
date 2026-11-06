//! Multi-resolution waveform data, like map tiles at different zoom levels.
//!
//! Level 0 holds the min/max of every `BASE_BIN_FRAMES` frames; each next level
//! halves the resolution. The UI picks the level that gives about one bin per
//! pixel, so drawing cost does not depend on the song length or the zoom.
//!
//! Peaks are built while the track loads (`PeaksBuilder`), so the waveform fills in as the
//! audio arrives. Values are on a fixed scale (±127 = full scale): the UI scales quiet songs up.

use crate::pcm::{CHANNELS, Pcm};

pub const BASE_BIN_FRAMES: u32 = 32;
/// Coarser levels stop once they have this few bins: enough for the overview.
const MIN_BINS: usize = 512;

#[derive(Debug, Clone, PartialEq)]
pub struct Level {
    pub bin_frames: u32,
    /// Interleaved (min, max) per bin; ±127 is full scale
    pub data: Vec<i8>,
}

impl Level {
    pub fn bins(&self) -> usize {
        self.data.len() / 2
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Peaks {
    pub sample_rate: u32,
    pub levels: Vec<Level>,
}

#[inline]
fn to_i8(value: f32) -> i8 {
    (value.clamp(-1.0, 1.0) * 127.0).round() as i8
}

/// Number of levels for a track of `frames`: halving until `MIN_BINS` or fewer remain.
fn level_count(frames: u64) -> usize {
    let mut bins = frames.div_ceil(u64::from(BASE_BIN_FRAMES)).max(1);
    let mut count = 1;
    while bins > MIN_BINS as u64 {
        bins = bins.div_ceil(2);
        count += 1;
    }
    count
}

/// Waveform data built frame by frame while a track loads.
pub struct PeaksBuilder {
    peaks: Peaks,
    /// Min and max of the base bin being filled, and how many frames it has
    lo: f32,
    hi: f32,
    filled: u32,
    finished: bool,
}

impl PeaksBuilder {
    /// `expected_frames` fixes the number of levels; reserving room avoids reallocations.
    pub fn new(sample_rate: u32, expected_frames: u64) -> Self {
        let mut bin_frames = BASE_BIN_FRAMES;
        let mut bins = expected_frames.div_ceil(u64::from(BASE_BIN_FRAMES)) as usize;
        let levels = (0..level_count(expected_frames))
            .map(|_| {
                let level = Level {
                    bin_frames,
                    data: Vec::with_capacity(bins * 2 + 2),
                };
                bin_frames *= 2;
                bins = bins.div_ceil(2);
                level
            })
            .collect();
        Self {
            peaks: Peaks {
                sample_rate,
                levels,
            },
            lo: f32::MAX,
            hi: f32::MIN,
            filled: 0,
            finished: false,
        }
    }

    /// Adds interleaved stereo frames.
    pub fn push(&mut self, interleaved: &[f32]) {
        for frame in interleaved.as_chunks::<CHANNELS>().0 {
            for &s in frame {
                self.lo = self.lo.min(s);
                self.hi = self.hi.max(s);
            }
            self.filled += 1;
            if self.filled == BASE_BIN_FRAMES {
                self.close_bin();
            }
        }
    }

    fn close_bin(&mut self) {
        let (lo, hi) = (to_i8(self.lo), to_i8(self.hi));
        (self.lo, self.hi, self.filled) = (f32::MAX, f32::MIN, 0);
        self.add(0, lo, hi);
    }

    /// Adds a bin to `level`; every second bin also completes one of the next level.
    fn add(&mut self, level: usize, lo: i8, hi: i8) {
        let Some(data) = self.peaks.levels.get_mut(level).map(|l| &mut l.data) else {
            return;
        };
        data.extend_from_slice(&[lo, hi]);
        if data.len().is_multiple_of(4) {
            let n = data.len();
            let (lo, hi) = (data[n - 4].min(data[n - 2]), data[n - 3].max(data[n - 1]));
            self.add(level + 1, lo, hi);
        }
    }

    /// Closes the last, partial bins: called once the track is fully loaded.
    pub fn finish(&mut self) {
        if self.finished {
            return;
        }
        self.finished = true;
        if self.filled > 0 {
            self.close_bin();
        }
        // An odd bin at the end of a level still makes a bin of the next one
        for level in 0..self.peaks.levels.len().saturating_sub(1) {
            let data = &self.peaks.levels[level].data;
            if data.len() % 4 == 2 {
                let n = data.len();
                let (lo, hi) = (data[n - 2], data[n - 1]);
                self.peaks.levels[level + 1]
                    .data
                    .extend_from_slice(&[lo, hi]);
                // Propagating it further is done by the next turn of this loop
                let next = &self.peaks.levels[level + 1].data;
                if next.len().is_multiple_of(4) && level + 2 < self.peaks.levels.len() {
                    let m = next.len();
                    let (lo, hi) = (next[m - 4].min(next[m - 2]), next[m - 3].max(next[m - 1]));
                    self.add(level + 2, lo, hi);
                }
            }
        }
    }

    /// True once the track has fully loaded: the peaks will not change any more.
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    /// Replaces the content with finished peaks (read from the cache).
    pub fn restore(&mut self, peaks: Peaks) {
        self.peaks = peaks;
        self.finished = true;
    }

    pub fn peaks(&self) -> &Peaks {
        &self.peaks
    }

    pub fn into_peaks(mut self) -> Peaks {
        self.finish();
        self.peaks
    }
}

impl Peaks {
    pub fn from_pcm(pcm: &Pcm) -> Self {
        let frames = pcm.frames();
        let mut builder = PeaksBuilder::new(pcm.sample_rate(), frames);
        let mut block = Vec::with_capacity(4096 * CHANNELS);
        for start in (0..frames as usize).step_by(4096) {
            block.clear();
            for index in start..(start + 4096).min(frames as usize) {
                block.extend_from_slice(&pcm.frame(index));
            }
            builder.push(&block);
        }
        builder.into_peaks()
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

    /// Reads back `to_bytes` (peaks saved in the cache); `None` if the data is damaged.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let u32_at = |at: usize| -> Option<u32> {
            Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
        };
        let sample_rate = u32_at(0)?;
        let count = u32_at(4)? as usize;
        let mut offset = 8;
        let mut levels = Vec::with_capacity(count.min(64));
        for _ in 0..count {
            let bin_frames = u32_at(offset)?;
            let bins = u32_at(offset + 4)? as usize;
            let data = bytes.get(offset + 8..offset + 8 + bins * 2)?;
            levels.push(Level {
                bin_frames,
                data: data.iter().map(|&v| v as i8).collect(),
            });
            offset += 8 + bins * 2;
        }
        (offset == bytes.len() && !levels.is_empty()).then_some(Self {
            sample_rate,
            levels,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn values_are_on_a_fixed_scale() {
        let pcm = pcm_from(64, |i| if i == 40 { -0.25 } else { 0.5 });
        let peaks = Peaks::from_pcm(&pcm);
        assert_eq!(peaks.levels[0].data[2], -32); // -0.25 * 127
        assert_eq!(peaks.levels[0].data[1], 64); // 0.5 * 127
    }

    #[test]
    fn levels_halve_until_small() {
        let pcm = pcm_from(32 * 4_001, |i| (i as f32 * 0.01).sin());
        let peaks = Peaks::from_pcm(&pcm);
        for pair in peaks.levels.windows(2) {
            assert_eq!(pair[1].bin_frames, pair[0].bin_frames * 2);
            assert_eq!(pair[1].bins(), pair[0].bins().div_ceil(2));
        }
        assert!(peaks.levels.last().unwrap().bins() <= MIN_BINS);
    }

    #[test]
    fn built_in_pieces_matches_a_direct_min_max_at_every_level() {
        let frames = 32 * 3_001 + 7;
        let value = |i: usize| ((i * 31) % 200) as f32 / 200.0 - 0.5;
        let mut builder = PeaksBuilder::new(48_000, frames as u64);
        let samples: Vec<f32> = (0..frames).flat_map(|i| [value(i); CHANNELS]).collect();
        for piece in samples.chunks(2 * 999) {
            builder.push(piece);
        }
        let peaks = builder.into_peaks();
        for level in &peaks.levels {
            let size = level.bin_frames as usize;
            let expected: Vec<i8> = (0..frames)
                .step_by(size)
                .flat_map(|start| {
                    let bin = start..(start + size).min(frames);
                    // Each base bin is rounded first, as the builder does
                    let base = |f: fn(f32, f32) -> f32, init: f32| {
                        bin.clone().step_by(32).map(move |b| {
                            let end = (b + 32).min(frames);
                            to_i8((b..end).map(value).fold(init, f))
                        })
                    };
                    [
                        base(f32::min, f32::MAX).min().unwrap(),
                        base(f32::max, f32::MIN).max().unwrap(),
                    ]
                })
                .collect();
            assert_eq!(level.data, expected, "level of {size} frames");
        }
    }

    #[test]
    fn binary_layout_matches_the_ui_reader_and_reads_back() {
        let peaks = Peaks::from_pcm(&pcm_from(64, |_| 0.5));
        let bytes = peaks.to_bytes();
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 48_000);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 32);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 2);
        assert_eq!(bytes.len(), 16 + 4);
        assert_eq!(Peaks::from_bytes(&bytes), Some(peaks));
        assert_eq!(Peaks::from_bytes(&bytes[..bytes.len() - 1]), None);
    }
}
