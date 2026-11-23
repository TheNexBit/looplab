//! Offline rendering of part of the track, through the same chain as playback:
//! reader (with the loop crossfade) → stretch (speed, pitch) → EQ → channels.
//!
//! Runs on an ordinary thread, as fast as the CPU allows; nothing here touches the audio device.

use std::fmt;
use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::click::{ClickQueue, ClickSettings};
use crate::dsp::channels::{ChannelMode, Channels};
use crate::dsp::eq::{Eq, EqSettings};
use crate::dsp::stretch::Stretch;
use crate::engine::{LoopSettings, MAX_SPEED, MIN_SPEED};
use crate::pcm::{CHANNELS, Pcm};
use crate::render::{Reader, SPLICE_SECONDS};
use crate::stems::Source;
use crate::wav::{BitDepth, WavWriter};

/// What to render, in frames of the track.
#[derive(Debug, Clone, Copy)]
pub struct ExportSettings {
    pub start: u64,
    pub end: u64,
    /// The region played this many times in a row (≥ 1), joined like the loop
    pub repeats: u32,
    /// 1 = original speed
    pub speed: f32,
    /// Semitones; fractions are cents
    pub semitones: f32,
    pub eq: EqSettings,
    pub channels: ChannelMode,
}

#[derive(Debug)]
pub enum ExportError {
    /// The region has no length
    Empty,
    Cancelled,
    Io(io::Error),
}

impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => f.write_str("nothing to export"),
            Self::Cancelled => f.write_str("export cancelled"),
            Self::Io(err) => write!(f, "cannot write the file: {err}"),
        }
    }
}

impl std::error::Error for ExportError {}

impl From<io::Error> for ExportError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

/// Output frames per step.
const BLOCK: usize = 512;

/// Renders `settings` from `pcm`, handing interleaved stereo blocks to `sink`.
/// `progress` receives 0..1; setting `cancel` stops at the next block. Returns the frames written.
pub fn render(
    pcm: &Pcm,
    settings: &ExportSettings,
    mut sink: impl FnMut(&[f32]) -> io::Result<()>,
    mut progress: impl FnMut(f32),
    cancel: &AtomicBool,
) -> Result<u64, ExportError> {
    let end = settings.end.min(pcm.frames());
    let start = settings.start.min(end);
    if end == start {
        return Err(ExportError::Empty);
    }
    let rate = pcm.sample_rate();
    let repeats = settings.repeats.max(1);
    let speed = f64::from(settings.speed.clamp(MIN_SPEED, MAX_SPEED));
    let total = ((end - start) as f64 / speed * f64::from(repeats)).round() as u64;

    // Repetitions wrap exactly like the loop during playback
    let region = LoopSettings {
        enabled: repeats > 1,
        start,
        end,
        lead_in: 0,
        gap: 0,
    };
    // Exports carry no clicks: no metronome, and an empty tempo map
    let click = ClickSettings::default();
    let tempo = crate::tempo_map::TempoMap::default();
    let mut clicks = ClickQueue::new();
    let mut notes = crate::synth::NoteQueue::new();
    let mut reader = Reader::new(rate);
    reader.jump(start);
    let mut fed = 0_u64;
    let mut read = |reader: &mut Reader, fed: &mut u64, out: &mut [f32]| {
        let rules = crate::render::Rules {
            settings: &region,
            click: &click,
            tempo: &tempo,
            notes: &[],
        };
        reader.read(
            &Source::track(Some(pcm)),
            rules,
            *fed,
            &mut clicks,
            &mut notes,
            out,
        );
        *fed += (out.len() / CHANNELS) as u64;
    };

    // At the original speed and pitch the audio is copied untouched
    let mut stretch = ((speed - 1.0).abs() > 1e-6 || settings.semitones != 0.0).then(|| {
        let mut stretch = Stretch::new(rate);
        stretch.set_transpose(2_f32.powf(settings.semitones / 12.0));
        stretch
    });
    let max_input = (BLOCK as f64 * f64::from(MAX_SPEED)).ceil() as usize + 1;
    let mut input =
        vec![0.0; max_input.max(stretch.as_ref().map_or(0, Stretch::input_latency)) * CHANNELS];
    // Output frames that come before `start` because of the stretcher latency
    let mut skip = 0;
    if let Some(stretch) = stretch.as_mut() {
        let preroll = stretch.input_latency();
        read(&mut reader, &mut fed, &mut input[..preroll * CHANNELS]);
        stretch.seek(&input[..preroll * CHANNELS], speed);
        skip = stretch.output_latency();
    }

    let mut eq = Eq::with_settings(rate, settings.eq);
    let mut channels = Channels::with_mode(rate, settings.channels);
    let fade = ((SPLICE_SECONDS * rate as f32) as u64).max(1);
    let mut block = vec![0.0; BLOCK * CHANNELS];
    let mut input_debt = 0.0_f64;
    let mut written = 0_u64;

    while written < total {
        if cancel.load(Ordering::Relaxed) {
            return Err(ExportError::Cancelled);
        }
        match stretch.as_mut() {
            Some(stretch) => {
                input_debt += BLOCK as f64 * speed;
                let frames = input_debt.floor() as usize;
                input_debt -= frames as f64;
                read(&mut reader, &mut fed, &mut input[..frames * CHANNELS]);
                stretch.process(&input[..frames * CHANNELS], &mut block);
            }
            None => read(&mut reader, &mut fed, &mut block),
        }
        eq.process(&mut block);
        channels.process(&mut block);

        let skipped = skip.min(BLOCK);
        skip -= skipped;
        let frames = (BLOCK - skipped).min((total - written) as usize);
        let out = &mut block[skipped * CHANNELS..(skipped + frames) * CHANNELS];
        // Short fades at both ends: the cut never clicks
        for (index, frame) in out.as_chunks_mut::<CHANNELS>().0.iter_mut().enumerate() {
            let at = written + index as u64;
            let edge = at.min(total - 1 - at);
            if edge < fade {
                let gain = edge as f32 / fade as f32;
                for s in frame.iter_mut() {
                    *s *= gain;
                }
            }
        }
        sink(out)?;
        written += frames as u64;
        progress(written as f32 / total as f32);
    }
    Ok(written)
}

/// Renders `settings` into a WAV file at `path`. The file appears only once complete:
/// a cancelled or failed export leaves nothing behind.
pub fn export_wav(
    pcm: &Pcm,
    settings: &ExportSettings,
    depth: BitDepth,
    path: &Path,
    progress: impl FnMut(f32),
    cancel: &AtomicBool,
) -> Result<u64, ExportError> {
    let partial = path.with_extension("wav.partial");
    let result = (|| {
        let mut wav = WavWriter::create(&partial, pcm.sample_rate(), depth)?;
        let frames = render(pcm, settings, |block| wav.write(block), progress, cancel)?;
        wav.finish()?;
        Ok(frames)
    })();
    match result {
        Ok(frames) => {
            std::fs::rename(&partial, path)?;
            Ok(frames)
        }
        Err(err) => {
            let _ = std::fs::remove_file(&partial);
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    /// `seconds` of quiet noise with a loud click at `click_at` seconds.
    fn track(seconds: f32, click_at: f32) -> Pcm {
        let frames = (seconds * RATE as f32) as usize;
        let click = (click_at * RATE as f32) as usize;
        let mut pcm = Pcm::with_capacity(RATE, frames);
        let samples: Vec<f32> = (0..frames)
            .flat_map(|i| {
                let s = if i == click {
                    0.9
                } else {
                    ((i * 7919 % 1000) as f32 / 1000.0 - 0.5) * 0.01
                };
                [s, s]
            })
            .collect();
        pcm.extend_from_f32(&samples);
        pcm
    }

    fn settings(start: f32, end: f32) -> ExportSettings {
        ExportSettings {
            start: (start * RATE as f32) as u64,
            end: (end * RATE as f32) as u64,
            repeats: 1,
            speed: 1.0,
            semitones: 0.0,
            eq: EqSettings::default(),
            channels: ChannelMode::Stereo,
        }
    }

    fn run(pcm: &Pcm, settings: &ExportSettings) -> Vec<f32> {
        let mut out = Vec::new();
        render(
            pcm,
            settings,
            |block| {
                out.extend_from_slice(block);
                Ok(())
            },
            |_| {},
            &AtomicBool::new(false),
        )
        .unwrap();
        out
    }

    /// Second at which the loudest sample of the left channel falls.
    fn loudest_at(samples: &[f32]) -> f32 {
        let left = samples.iter().step_by(CHANNELS).map(|s| s.abs());
        let index = left
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .map_or(0, |(i, _)| i);
        index as f32 / RATE as f32
    }

    #[test]
    fn original_speed_copies_the_region_exactly() {
        let pcm = track(3.0, 1.5);
        let out = run(&pcm, &settings(1.0, 2.0));
        assert_eq!(out.len(), RATE as usize * CHANNELS);
        // Away from the edge fades every sample is the original one
        let original = pcm.frame(RATE as usize + 24_000);
        assert_eq!(out[24_000 * CHANNELS], original[0]);
        assert!((loudest_at(&out) - 0.5).abs() < 0.001);
    }

    #[test]
    fn half_speed_doubles_the_length_and_keeps_events_in_place() {
        let pcm = track(4.0, 2.0);
        let out = run(
            &pcm,
            &ExportSettings {
                speed: 0.5,
                ..settings(1.5, 2.5)
            },
        );
        assert_eq!(out.len(), 2 * RATE as usize * CHANNELS);
        // The click was 0.5 s into the region: at half speed it comes 1 s in
        let at = loudest_at(&out);
        assert!((at - 1.0).abs() < 0.02, "click heard at {at} s");
    }

    #[test]
    fn repeats_and_pitch_keep_the_timing() {
        let pcm = track(3.0, 1.2);
        let out = run(
            &pcm,
            &ExportSettings {
                repeats: 3,
                semitones: 5.0,
                ..settings(1.0, 1.5)
            },
        );
        assert_eq!(out.len(), 3 * RATE as usize / 2 * CHANNELS);
    }

    #[test]
    fn a_cancelled_export_leaves_no_file() {
        let path = crate::pcm::tests::test_dir("export").join("cancelled.wav");
        let result = export_wav(
            &track(2.0, 1.0),
            &settings(0.0, 2.0),
            BitDepth::Pcm16,
            &path,
            |_| {},
            &AtomicBool::new(true),
        );
        assert!(matches!(result, Err(ExportError::Cancelled)));
        assert!(!path.exists() && !path.with_extension("wav.partial").exists());
    }
}
