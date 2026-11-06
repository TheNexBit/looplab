//! Loading a file: decode → resample to the output rate → keep for playback → waveform peaks.
//!
//! `open` is how the app loads tracks, like Reaper: the decoded audio goes into a cache file,
//! playback can start after the first seconds while a background thread decodes the rest,
//! and the next opening of the same file reuses the cache at once. `load` decodes everything
//! into memory first (files of unknown length, tests).

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use crate::decode::Decoder;
use crate::pcm::{CHANNELS, Pcm};
use crate::peaks::{Peaks, PeaksBuilder};
use crate::resample::StreamResampler;

#[derive(Debug)]
pub enum LoadError {
    Io(std::io::Error),
    /// The container is not recognised (or not a media file at all)
    UnsupportedFormat,
    /// The container is fine but its audio codec cannot be decoded (e.g. Opus)
    UnsupportedCodec,
    NoAudioTrack,
    /// The file decodes to nothing
    Empty,
    Corrupt(String),
    /// Another file was opened before this one finished loading
    Cancelled,
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(err) => write!(f, "cannot read the file: {err}"),
            Self::UnsupportedFormat => f.write_str("unsupported file format"),
            Self::UnsupportedCodec => f.write_str("unsupported audio codec"),
            Self::NoAudioTrack => f.write_str("the file has no audio track"),
            Self::Empty => f.write_str("the file contains no audio"),
            Self::Corrupt(detail) => write!(f, "the file is damaged: {detail}"),
            Self::Cancelled => f.write_str("loading cancelled"),
        }
    }
}

impl std::error::Error for LoadError {}

impl From<std::io::Error> for LoadError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

pub struct LoadedTrack {
    /// Audio at the output device rate, ready for the engine
    pub pcm: Arc<Pcm>,
    pub peaks: Peaks,
    /// Original rate of the file, shown in the UI
    pub source_sample_rate: u32,
}

/// Share of the progress bar spent decoding; the rest is the waveform analysis.
const DECODE_SHARE: f32 = 0.95;

/// Loads `path` converted to `output_rate`. `progress` receives values from 0.0 to 1.0.
pub fn load(
    path: &Path,
    output_rate: u32,
    mut progress: impl FnMut(f32),
) -> Result<LoadedTrack, LoadError> {
    let decoder = Decoder::open(path)?;
    let source_sample_rate = decoder.sample_rate();
    let mut resampler = StreamResampler::new(source_sample_rate, output_rate)?;

    let estimated_frames = decoder.total_frames().map_or(0, |frames| {
        (frames as f64 * f64::from(output_rate) / f64::from(source_sample_rate)) as usize
    });
    let mut pcm = Pcm::with_capacity(output_rate, estimated_frames + 4096);

    decoder.run(
        |frames| resampler.push(frames, &mut |out| pcm.extend_from_f32(out)),
        |fraction| progress(fraction * DECODE_SHARE),
    )?;
    resampler.finish(&mut |out| pcm.extend_from_f32(out))?;

    if pcm.frames() == 0 {
        return Err(LoadError::Empty);
    }
    pcm.shrink_to_fit();
    let peaks = Peaks::from_pcm(&pcm);
    progress(1.0);

    Ok(LoadedTrack {
        pcm: Arc::new(pcm),
        peaks,
        source_sample_rate,
    })
}

/// Waveform data of a track, growing while it loads; shared with the app, which sends it to the UI.
pub type SharedPeaks = Arc<Mutex<PeaksBuilder>>;

/// A track that can be played already. While `pcm.is_complete()` is false, a background
/// thread is still adding audio and waveform data.
pub struct OpenedTrack {
    pub pcm: Arc<Pcm>,
    pub peaks: SharedPeaks,
    pub source_sample_rate: u32,
}

/// News from the background loader, roughly four times a second and once at the end.
#[derive(Debug)]
pub enum LoadEvent {
    Progress {
        ready_frames: u64,
    },
    /// Finished; on error, what was decoded so far stays playable
    Done {
        frames: u64,
        error: Option<LoadError>,
    },
}

/// Seconds of audio decoded before `open` returns and playback may start.
const FIRST_SECONDS: u64 = 3;
/// Room for a longer decode than the container announced (resampling rounding, odd files).
const SPARE_SHARE: u64 = 50;
const SPARE_SECONDS: u64 = 2;
const EVENT_INTERVAL: Duration = Duration::from_millis(250);

/// Paths of the cache files of a track: the decoded audio and its waveform.
pub fn cache_files(stem: &Path) -> (PathBuf, PathBuf) {
    (stem.with_extension("pcm"), stem.with_extension("peaks"))
}

/// Writes the finished waveform next to the audio, atomically: a half-written file never exists.
fn save_peaks(path: &Path, peaks: &Peaks) -> std::io::Result<()> {
    let partial = path.with_extension("peaks.partial");
    std::fs::write(&partial, peaks.to_bytes())?;
    std::fs::rename(&partial, path)
}

fn shared(peaks: Peaks, rate: u32) -> SharedPeaks {
    let mut builder = PeaksBuilder::new(rate, 0);
    builder.restore(peaks);
    Arc::new(Mutex::new(builder))
}

/// Opens `path` for playback at `output_rate`, using the cache files at `cache_stem`
/// (see `cache_files`). Returns once the first seconds are playable; `on_event` then follows
/// the background loading. Setting `cancel` stops it (when another track is opened).
pub fn open(
    path: &Path,
    output_rate: u32,
    cache_stem: &Path,
    cancel: Arc<AtomicBool>,
    mut on_event: impl FnMut(LoadEvent) + Send + 'static,
) -> Result<OpenedTrack, LoadError> {
    let (audio_file, peaks_file) = cache_files(cache_stem);
    let decoder = Decoder::open(path)?;
    let source_sample_rate = decoder.sample_rate();

    // Opened before: both cache files are complete, nothing to decode
    if let Some(pcm) = Pcm::open_file(&audio_file, output_rate)
        && let Some(peaks) = std::fs::read(&peaks_file)
            .ok()
            .and_then(|bytes| Peaks::from_bytes(&bytes))
    {
        on_event(LoadEvent::Done {
            frames: pcm.frames(),
            error: None,
        });
        return Ok(OpenedTrack {
            pcm: Arc::new(pcm),
            peaks: shared(peaks, output_rate),
            source_sample_rate,
        });
    }

    // Decoded into memory first, as before: for files of unknown length (no cache file can be
    // sized for them) and when the cache file is still in use (the same track reopened while
    // loading: Windows cannot rewrite a mapped file)
    let mut in_memory = |decoder: Decoder| -> Result<OpenedTrack, LoadError> {
        drop(decoder);
        let loaded = load(path, output_rate, |_| {})?;
        on_event(LoadEvent::Done {
            frames: loaded.pcm.frames(),
            error: None,
        });
        Ok(OpenedTrack {
            pcm: loaded.pcm,
            peaks: shared(loaded.peaks, output_rate),
            source_sample_rate,
        })
    };
    let Some(source_frames) = decoder.total_frames().filter(|&f| f > 0) else {
        return in_memory(decoder);
    };

    let estimate = source_frames * u64::from(output_rate) / u64::from(source_sample_rate);
    let capacity = estimate + estimate / SPARE_SHARE + u64::from(output_rate) * SPARE_SECONDS;
    let Ok(pcm) = Pcm::create_file(&audio_file, output_rate, capacity, estimate) else {
        return in_memory(decoder);
    };
    let pcm = Arc::new(pcm);
    let peaks: SharedPeaks = Arc::new(Mutex::new(PeaksBuilder::new(output_rate, estimate)));
    let mut resampler = StreamResampler::new(source_sample_rate, output_rate)?;

    let (first_tx, first_rx) = mpsc::channel::<()>();
    let first_frames = (u64::from(output_rate) * FIRST_SECONDS).min(estimate);
    let (thread_pcm, thread_peaks) = (Arc::clone(&pcm), Arc::clone(&peaks));
    std::thread::Builder::new()
        .name("looplab-loader".into())
        .spawn(move || {
            let mut first = Some(first_tx);
            let mut last_event = Instant::now();
            let mut store = |out: &[f32]| {
                let written = thread_pcm.append(out);
                thread_peaks
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .push(&out[..written * CHANNELS]);
            };
            let mut step = |frames: &[f32]| -> Result<(), LoadError> {
                if cancel.load(Ordering::Relaxed) {
                    return Err(LoadError::Cancelled);
                }
                resampler.push(frames, &mut store)?;
                let ready = thread_pcm.ready_frames();
                if ready >= first_frames
                    && let Some(tx) = first.take()
                {
                    let _ = tx.send(());
                }
                if last_event.elapsed() >= EVENT_INTERVAL {
                    last_event = Instant::now();
                    on_event(LoadEvent::Progress {
                        ready_frames: ready,
                    });
                }
                Ok(())
            };
            let result = decoder.run(&mut step, |_| {});
            drop(step);
            let result = result.and_then(|()| resampler.finish(&mut store));

            let mut builder = thread_peaks.lock().unwrap_or_else(|p| p.into_inner());
            builder.finish();
            let error = match result {
                // Only a complete decode is kept for the next opening
                Ok(()) => thread_pcm
                    .finish()
                    .and_then(|()| save_peaks(&peaks_file, builder.peaks()))
                    .err()
                    .map(LoadError::Io),
                Err(err) => {
                    thread_pcm.stop();
                    Some(err)
                }
            };
            drop(builder);
            on_event(LoadEvent::Done {
                frames: thread_pcm.frames(),
                error,
            });
            drop(first);
        })
        .map_err(LoadError::Io)?;

    // Playable once the first seconds are in, or once the loader stopped (short or broken file)
    let _ = first_rx.recv();
    if pcm.ready_frames() == 0 && pcm.is_complete() {
        return Err(LoadError::Empty);
    }
    Ok(OpenedTrack {
        pcm,
        peaks,
        source_sample_rate,
    })
}
