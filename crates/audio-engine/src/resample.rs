//! Streaming sample-rate conversion of interleaved stereo audio.
//!
//! Runs once while a file loads, so the audio thread only has to copy samples.
//! Audio arrives packet by packet and leaves in fixed chunks: memory stays at a
//! few chunks instead of a second copy of the whole song.

use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Indexing, Resampler};

use crate::load::LoadError;
use crate::pcm::CHANNELS;

const CHUNK_FRAMES: usize = 1024;

pub struct StreamResampler {
    /// `None` when input and output rates match: frames pass straight through
    inner: Option<Fft<f32>>,
    input: Vec<f32>,
    output: Vec<f32>,
    /// Leading output frames that are only resampler latency, dropped
    delay_left: usize,
    frames_in: u64,
    frames_out: u64,
    from_rate: u64,
    to_rate: u64,
}

impl StreamResampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Result<Self, LoadError> {
        let inner = if from_rate == to_rate {
            None
        } else {
            let fft = Fft::<f32>::new(
                from_rate as usize,
                to_rate as usize,
                CHUNK_FRAMES,
                CHANNELS,
                FixedSync::Both,
            )
            .map_err(|err| LoadError::Corrupt(err.to_string()))?;
            Some(fft)
        };
        let delay_left = inner.as_ref().map_or(0, Resampler::output_delay);
        Ok(Self {
            inner,
            input: Vec::new(),
            output: Vec::new(),
            delay_left,
            frames_in: 0,
            frames_out: 0,
            from_rate: u64::from(from_rate),
            to_rate: u64::from(to_rate),
        })
    }

    pub fn push(&mut self, frames: &[f32], sink: &mut impl FnMut(&[f32])) -> Result<(), LoadError> {
        if self.inner.is_none() {
            sink(frames);
            return Ok(());
        }
        self.input.extend_from_slice(frames);
        self.frames_in += (frames.len() / CHANNELS) as u64;
        while let Some(needed) = self.inner.as_ref().map(Resampler::input_frames_next)
            && self.input.len() / CHANNELS >= needed
        {
            self.process_chunk(None, sink)?;
        }
        Ok(())
    }

    /// Flushes the remaining input and the resampler's internal latency.
    pub fn finish(mut self, sink: &mut impl FnMut(&[f32])) -> Result<(), LoadError> {
        if self.inner.is_none() {
            return Ok(());
        }
        let remaining = self.input.len() / CHANNELS;
        if remaining > 0 {
            self.process_chunk(Some(remaining), sink)?;
        }
        while self.frames_out < self.expected_output() {
            self.process_chunk(Some(0), sink)?;
        }
        Ok(())
    }

    /// Exact converted length, in integers: floats would round 44100 × 48000/44100 up to 48001.
    fn expected_output(&self) -> u64 {
        (self.frames_in * self.to_rate).div_ceil(self.from_rate)
    }

    fn process_chunk(
        &mut self,
        partial_len: Option<usize>,
        sink: &mut impl FnMut(&[f32]),
    ) -> Result<(), LoadError> {
        let Some(resampler) = self.inner.as_mut() else {
            return Ok(());
        };
        let to_error = |err: &dyn std::fmt::Display| LoadError::Corrupt(err.to_string());

        let in_frames = self.input.len() / CHANNELS;
        let out_capacity = resampler.output_frames_max();
        self.output.resize(out_capacity * CHANNELS, 0.0);

        let input = InterleavedSlice::new(&self.input[..], CHANNELS, in_frames)
            .map_err(|e| to_error(&e))?;
        let mut output = InterleavedSlice::new_mut(&mut self.output[..], CHANNELS, out_capacity)
            .map_err(|e| to_error(&e))?;
        let indexing = Indexing {
            input_offset: 0,
            output_offset: 0,
            partial_len,
            active_channels_mask: None,
        };
        let (used, produced) = resampler
            .process_into_buffer(&input, &mut output, Some(&indexing))
            .map_err(|e| to_error(&e))?;

        self.input.drain(..used.min(in_frames) * CHANNELS);

        let skip = self.delay_left.min(produced);
        self.delay_left -= skip;
        // Never emit more than the exact converted length: the tail is padding
        let wanted = self.expected_output().saturating_sub(self.frames_out);
        let emit = (produced - skip).min(if partial_len.is_some() {
            wanted as usize
        } else {
            usize::MAX
        });
        if emit > 0 {
            sink(&self.output[skip * CHANNELS..(skip + emit) * CHANNELS]);
            self.frames_out += emit as u64;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(frames: usize, rate: f32, hz: f32) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = (i as f32 * hz * std::f32::consts::TAU / rate).sin() * 0.5;
                [s, s]
            })
            .collect()
    }

    fn run(from: u32, to: u32, input: &[f32]) -> Vec<f32> {
        let mut out = Vec::new();
        let mut resampler = StreamResampler::new(from, to).unwrap();
        // Feed in uneven packets, like a decoder does
        for packet in input.chunks(1152 * CHANNELS) {
            resampler
                .push(packet, &mut |f| out.extend_from_slice(f))
                .unwrap();
        }
        resampler.finish(&mut |f| out.extend_from_slice(f)).unwrap();
        out
    }

    fn zero_crossings(interleaved: &[f32]) -> usize {
        let left: Vec<f32> = interleaved.iter().step_by(CHANNELS).copied().collect();
        left.windows(2)
            .filter(|w| w[0] < 0.0 && w[1] >= 0.0)
            .count()
    }

    #[test]
    fn same_rate_passes_through() {
        let input = sine(5_000, 48_000.0, 440.0);
        assert_eq!(run(48_000, 48_000, &input), input);
    }

    #[test]
    fn converts_length_exactly() {
        let input = sine(44_100, 44_100.0, 440.0);
        let out = run(44_100, 48_000, &input);
        assert_eq!(out.len() / CHANNELS, 48_000);
    }

    #[test]
    fn keeps_pitch() {
        let input = sine(44_100, 44_100.0, 440.0);
        let out = run(44_100, 48_000, &input);
        // One second of 440 Hz: about 440 upward zero crossings at any sample rate
        let crossings = zero_crossings(&out);
        assert!((438..=441).contains(&crossings), "crossings: {crossings}");
    }
}
