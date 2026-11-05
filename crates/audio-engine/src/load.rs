//! Loading a file: decode → resample to the output rate → keep in memory → waveform peaks.

use std::fmt;
use std::path::Path;
use std::sync::Arc;

use crate::decode::Decoder;
use crate::pcm::Pcm;
use crate::peaks::Peaks;
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
