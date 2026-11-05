//! File decoding with symphonia: any supported container/codec → interleaved stereo f32.

use std::fs::File;
use std::path::Path;

use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

use crate::load::LoadError;
use crate::pcm::CHANNELS;

pub struct Decoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    sample_rate: u32,
    total_frames: Option<u64>,
    /// Reused buffers: decoded samples in the source layout, then converted to stereo
    source: Vec<f32>,
    stereo: Vec<f32>,
}

impl Decoder {
    pub fn open(path: &Path) -> Result<Self, LoadError> {
        let file = File::open(path)?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(extension);
        }

        let format = symphonia::default::get_probe()
            .probe(
                &hint,
                stream,
                FormatOptions::default(),
                MetadataOptions::default(),
            )
            .map_err(|err| match err {
                SymphoniaError::IoError(io) => LoadError::Io(io),
                _ => LoadError::UnsupportedFormat,
            })?;

        let track = format
            .default_track(TrackType::Audio)
            .ok_or(LoadError::NoAudioTrack)?;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
            .ok_or(LoadError::NoAudioTrack)?;
        let sample_rate = params.sample_rate.ok_or(LoadError::UnsupportedCodec)?;
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|_| LoadError::UnsupportedCodec)?;
        let track_id = track.id;
        let total_frames = track.num_frames;

        Ok(Self {
            format,
            decoder,
            track_id,
            sample_rate,
            total_frames,
            source: Vec::new(),
            stereo: Vec::new(),
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Length announced by the container, when it has one (used for progress and pre-allocation).
    pub fn total_frames(&self) -> Option<u64> {
        self.total_frames
    }

    /// Decodes the whole file, handing stereo frames to `sink` packet by packet.
    /// `progress` receives values from 0.0 to 1.0 when the length is known.
    pub fn run(
        mut self,
        mut sink: impl FnMut(&[f32]) -> Result<(), LoadError>,
        mut progress: impl FnMut(f32),
    ) -> Result<(), LoadError> {
        let mut decoded: u64 = 0;
        let mut reported = 0.0_f32;

        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(packet)) => packet,
                // End of stream; chained streams (ResetRequired) are treated as the end too
                Ok(None) | Err(SymphoniaError::ResetRequired) => break,
                Err(SymphoniaError::IoError(io))
                    if io.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break;
                }
                Err(err) => return Err(LoadError::Corrupt(err.to_string())),
            };
            if packet.track_id != self.track_id {
                continue;
            }

            let buffer = match self.decoder.decode(&packet) {
                Ok(buffer) => buffer,
                // A damaged packet is skipped, like every player does
                Err(SymphoniaError::DecodeError(_) | SymphoniaError::IoError(_)) => continue,
                Err(err) => return Err(LoadError::Corrupt(err.to_string())),
            };

            let channels = buffer.spec().channels().count();
            let frames = buffer.frames();
            if channels == 0 || frames == 0 {
                continue;
            }
            self.source.resize(buffer.samples_interleaved(), 0.0);
            buffer.copy_to_slice_interleaved(&mut self.source);
            to_stereo(&self.source, channels, &mut self.stereo);
            sink(&self.stereo)?;

            decoded += frames as u64;
            if let Some(total) = self.total_frames.filter(|&t| t > 0) {
                let fraction = (decoded as f32 / total as f32).min(1.0);
                if fraction - reported >= 0.01 {
                    reported = fraction;
                    progress(fraction);
                }
            }
        }
        Ok(())
    }
}

/// Mono is duplicated on both sides; with more than two channels the front pair is kept.
fn to_stereo(source: &[f32], channels: usize, out: &mut Vec<f32>) {
    out.clear();
    match channels {
        1 => out.extend(source.iter().flat_map(|&s| [s, s])),
        2 => out.extend_from_slice(source),
        _ => out.extend(
            source
                .chunks_exact(channels)
                .flat_map(|frame| [frame[0], frame[1]]),
        ),
    }
    debug_assert_eq!(out.len() % CHANNELS, 0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_channel_layouts_to_stereo() {
        let mut out = Vec::new();
        to_stereo(&[0.1, 0.2], 1, &mut out);
        assert_eq!(out, [0.1, 0.1, 0.2, 0.2]);
        to_stereo(&[0.1, 0.2, 0.3, 0.4], 2, &mut out);
        assert_eq!(out, [0.1, 0.2, 0.3, 0.4]);
        to_stereo(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0], 3, &mut out);
        assert_eq!(out, [1.0, 2.0, 4.0, 5.0]);
    }
}
