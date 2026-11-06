//! Decoded audio kept for playback.
//!
//! Storage is 16-bit interleaved stereo, either in memory or in a file of the cache mapped into
//! memory: a three-hour lesson then lives on disk and the operating system reads in only what
//! is played. Only this file knows the storage format.
//!
//! A mapped track can still be growing: one loader thread appends frames while the audio
//! thread plays the part already decoded (`ready_frames`). Beyond it, frames read as silence.

use std::fs::{File, OpenOptions};
use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use memmap2::MmapRaw;

use crate::time;

/// Every track is stored as stereo; mono and multichannel sources are converted on load.
pub const CHANNELS: usize = 2;
const FRAME_BYTES: u64 = (CHANNELS * size_of::<i16>()) as u64;

const TO_I16: f32 = i16::MAX as f32;
const FROM_I16: f32 = 1.0 / 32768.0;

/// Layout of a cache file: this header, then the frames.
const MAGIC: &[u8; 8] = b"LLPCM\0\0\x01";
const HEADER_BYTES: u64 = 64;
const RATE_AT: usize = 8;
const FRAMES_AT: usize = 16;
const COMPLETE_AT: usize = 24;

enum Storage {
    Memory(Vec<i16>),
    /// A cache file; `capacity` frames fit after the header
    Mapped {
        map: MmapRaw,
        capacity: u64,
    },
}

pub struct Pcm {
    storage: Storage,
    sample_rate: u32,
    /// Length of the track: an estimate while it loads, exact once complete
    total: AtomicU64,
    /// Frames already decoded and readable
    ready: AtomicU64,
    complete: AtomicBool,
}

#[inline]
fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * TO_I16).round() as i16
}

impl Pcm {
    /// An empty track in memory, filled with `extend_from_f32` (tests, files of unknown length).
    pub fn with_capacity(sample_rate: u32, frames: usize) -> Self {
        Self {
            storage: Storage::Memory(Vec::with_capacity(frames * CHANNELS)),
            sample_rate,
            total: AtomicU64::new(0),
            ready: AtomicU64::new(0),
            complete: AtomicBool::new(true),
        }
    }

    /// Appends interleaved stereo f32 frames to a track in memory (values clipped to -1..1).
    pub fn extend_from_f32(&mut self, interleaved: &[f32]) {
        debug_assert_eq!(interleaved.len() % CHANNELS, 0);
        let Storage::Memory(samples) = &mut self.storage else {
            panic!("extend_from_f32 is for tracks in memory");
        };
        samples.extend(interleaved.iter().map(|&s| to_i16(s)));
        let frames = (samples.len() / CHANNELS) as u64;
        self.total.store(frames, Ordering::Relaxed);
        self.ready.store(frames, Ordering::Release);
    }

    /// Releases the spare capacity reserved while loading (tracks in memory only).
    pub fn shrink_to_fit(&mut self) {
        if let Storage::Memory(samples) = &mut self.storage {
            samples.shrink_to_fit();
        }
    }

    /// Creates a cache file for up to `capacity` frames, to be filled through `append`.
    /// `estimate` is the expected length, reported by `frames()` until the track is complete.
    pub fn create_file(
        path: &Path,
        sample_rate: u32,
        capacity: u64,
        estimate: u64,
    ) -> io::Result<Self> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        file.set_len(HEADER_BYTES + capacity * FRAME_BYTES)?;
        let map = MmapRaw::map_raw(&file)?;
        let pcm = Self {
            storage: Storage::Mapped { map, capacity },
            sample_rate,
            total: AtomicU64::new(estimate.min(capacity)),
            ready: AtomicU64::new(0),
            complete: AtomicBool::new(false),
        };
        pcm.write_header(0, false);
        Ok(pcm)
    }

    /// Opens a complete cache file made earlier, or `None` if it is missing, unfinished or damaged.
    pub fn open_file(path: &Path, sample_rate: u32) -> Option<Self> {
        let file = File::options().read(true).write(true).open(path).ok()?;
        let map = MmapRaw::map_raw(&file).ok()?;
        let len = map.len() as u64;
        if len < HEADER_BYTES {
            return None;
        }
        // SAFETY: the map is at least HEADER_BYTES long, checked above
        let header = unsafe { std::slice::from_raw_parts(map.as_ptr(), HEADER_BYTES as usize) };
        let read_u32 =
            |at: usize| u32::from_le_bytes(header[at..at + 4].try_into().unwrap_or_default());
        let frames = u64::from_le_bytes(header[FRAMES_AT..FRAMES_AT + 8].try_into().ok()?);
        let capacity = (len - HEADER_BYTES) / FRAME_BYTES;
        let valid = &header[..8] == MAGIC
            && read_u32(RATE_AT) == sample_rate
            && header[COMPLETE_AT] == 1
            && frames > 0
            && frames <= capacity;
        valid.then(|| Self {
            storage: Storage::Mapped { map, capacity },
            sample_rate,
            total: AtomicU64::new(frames),
            ready: AtomicU64::new(frames),
            complete: AtomicBool::new(true),
        })
    }

    fn write_header(&self, frames: u64, complete: bool) {
        let Storage::Mapped { map, .. } = &self.storage else {
            return;
        };
        let mut header = [0_u8; HEADER_BYTES as usize];
        header[..8].copy_from_slice(MAGIC);
        header[RATE_AT..RATE_AT + 4].copy_from_slice(&self.sample_rate.to_le_bytes());
        header[FRAMES_AT..FRAMES_AT + 8].copy_from_slice(&frames.to_le_bytes());
        header[COMPLETE_AT] = u8::from(complete);
        // SAFETY: the header lies before any frame, and only the single loader writes it
        unsafe { std::ptr::copy_nonoverlapping(header.as_ptr(), map.as_mut_ptr(), header.len()) };
    }

    /// Appends interleaved stereo frames to a growing cache file. Returns how many fitted:
    /// fewer than given only when the file is full. Must be called by one thread at a time.
    pub fn append(&self, interleaved: &[f32]) -> usize {
        let Storage::Mapped { map, capacity } = &self.storage else {
            return 0;
        };
        let ready = self.ready.load(Ordering::Relaxed);
        let frames = ((interleaved.len() / CHANNELS) as u64).min(capacity - ready) as usize;
        let start = (HEADER_BYTES + ready * FRAME_BYTES) as usize;
        // SAFETY: the frames written lie past `ready`, inside the map, where nobody reads yet;
        // the Release store below publishes them to readers, which load `ready` with Acquire
        unsafe {
            let out = map.as_mut_ptr().add(start).cast::<i16>();
            for (i, &sample) in interleaved[..frames * CHANNELS].iter().enumerate() {
                out.add(i).write_unaligned(to_i16(sample));
            }
        }
        self.ready.store(ready + frames as u64, Ordering::Release);
        frames
    }

    /// The loader is done: the length becomes exact and the file is marked reusable.
    pub fn finish(&self) -> io::Result<()> {
        let frames = self.ready.load(Ordering::Acquire);
        self.total.store(frames, Ordering::Relaxed);
        self.complete.store(true, Ordering::Release);
        if let Storage::Mapped { map, .. } = &self.storage {
            map.flush()?;
            self.write_header(frames, true);
            map.flush()?;
        }
        Ok(())
    }

    /// The loader stopped early (error or another file opened): what is decoded is the track.
    pub fn stop(&self) {
        self.total
            .store(self.ready.load(Ordering::Acquire), Ordering::Relaxed);
        self.complete.store(true, Ordering::Release);
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Length of the track; while it loads, the expected length.
    pub fn frames(&self) -> u64 {
        self.total.load(Ordering::Relaxed)
    }

    /// Frames that can be played already.
    pub fn ready_frames(&self) -> u64 {
        self.ready.load(Ordering::Acquire)
    }

    /// False while a loader is still adding frames.
    pub fn is_complete(&self) -> bool {
        self.complete.load(Ordering::Acquire)
    }

    pub fn duration_seconds(&self) -> f64 {
        time::frames_to_seconds(self.frames(), self.sample_rate)
    }

    /// Left and right sample of one frame; silence if it is not decoded yet.
    #[inline]
    pub fn frame(&self, index: usize) -> [f32; CHANNELS] {
        if index as u64 >= self.ready.load(Ordering::Acquire) {
            return [0.0; CHANNELS];
        }
        let i = index * CHANNELS;
        let [l, r] = match &self.storage {
            Storage::Memory(samples) => [samples[i], samples[i + 1]],
            Storage::Mapped { map, .. } => {
                // SAFETY: `index` < `ready` ≤ `capacity`, so both samples lie inside the map and
                // were published by `append` before `ready` covered them
                unsafe {
                    let at = map.as_ptr().add(HEADER_BYTES as usize).cast::<i16>().add(i);
                    [at.read_unaligned(), at.add(1).read_unaligned()]
                }
            }
        };
        [f32::from(l) * FROM_I16, f32::from(r) * FROM_I16]
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

    pub(crate) fn test_dir(name: &str) -> std::path::PathBuf {
        // Never in the system temp folder (C:\): next to the shared build output
        let target = std::env::var_os("CARGO_TARGET_DIR").expect("CARGO_TARGET_DIR must be set");
        let dir = std::path::PathBuf::from(target)
            .join("tmp/looplab-tests")
            .join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_cache_file_grows_while_it_is_read_and_reopens_complete() {
        let path = test_dir("pcm-file").join("track.pcm");
        let pcm = Pcm::create_file(&path, 48_000, 10, 8).unwrap();
        assert_eq!((pcm.frames(), pcm.ready_frames()), (8, 0));
        assert_eq!(pcm.frame(0), [0.0, 0.0], "not decoded yet: silence");

        assert_eq!(pcm.append(&[0.5, -0.5, 0.25, -0.25]), 2);
        assert!((pcm.frame(1)[0] - 0.25).abs() < 1e-4);
        assert_eq!(pcm.frame(2), [0.0, 0.0]);
        assert!(!pcm.is_complete());
        assert!(
            Pcm::open_file(&path, 48_000).is_none(),
            "unfinished files are never reused"
        );

        // More than fits: only the free room is used
        assert_eq!(pcm.append(&[0.1; 2 * 9]), 8);
        pcm.finish().unwrap();
        assert_eq!(pcm.frames(), 10);
        drop(pcm);

        let reopened = Pcm::open_file(&path, 48_000).unwrap();
        assert_eq!((reopened.frames(), reopened.ready_frames()), (10, 10));
        assert!((reopened.frame(0)[1] + 0.5).abs() < 1e-4);
        assert!(
            Pcm::open_file(&path, 44_100).is_none(),
            "made for another rate"
        );
    }

    #[test]
    fn a_stopped_load_keeps_what_was_decoded() {
        let path = test_dir("pcm-stop").join("track.pcm");
        let pcm = Pcm::create_file(&path, 48_000, 100, 100).unwrap();
        pcm.append(&[0.2; 2 * 30]);
        pcm.stop();
        assert_eq!(pcm.frames(), 30);
        assert!(pcm.is_complete());
    }
}
