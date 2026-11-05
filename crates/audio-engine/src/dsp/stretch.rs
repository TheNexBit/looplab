//! Safe Rust handle around Signalsmith Stretch (C++, MIT): time-stretch and pitch-shift.
//!
//! Only `new` allocates. Every other call is real-time safe as long as lengths stay
//! within `max_block()` frames.

use std::ffi::c_int;
use std::ptr::NonNull;

use crate::pcm::CHANNELS;

#[repr(C)]
struct RawStretch {
    _private: [u8; 0],
}

unsafe extern "C" {
    fn looplab_stretch_new(channels: c_int, sample_rate: f32) -> *mut RawStretch;
    fn looplab_stretch_free(handle: *mut RawStretch);
    fn looplab_stretch_reset(handle: *mut RawStretch);
    fn looplab_stretch_input_latency(handle: *const RawStretch) -> c_int;
    fn looplab_stretch_output_latency(handle: *const RawStretch) -> c_int;
    fn looplab_stretch_max_block(handle: *const RawStretch) -> c_int;
    fn looplab_stretch_set_transpose(handle: *mut RawStretch, factor: f32);
    fn looplab_stretch_seek(handle: *mut RawStretch, input: *const f32, frames: c_int, rate: f64);
    fn looplab_stretch_process(
        handle: *mut RawStretch,
        input: *const f32,
        input_frames: c_int,
        output: *mut f32,
        output_frames: c_int,
    );
}

/// Stereo stretcher. Buffers are interleaved stereo; lengths are in frames.
pub struct Stretch {
    raw: NonNull<RawStretch>,
}

// The C++ object has no thread affinity: it only must not be used from two threads at once,
// which `&mut self` on every call already guarantees.
unsafe impl Send for Stretch {}

impl Stretch {
    pub fn new(sample_rate: u32) -> Self {
        // SAFETY: plain constructor; a null result would mean allocation failure
        let raw = unsafe { looplab_stretch_new(CHANNELS as c_int, sample_rate as f32) };
        Self {
            raw: NonNull::new(raw).expect("Signalsmith Stretch allocation failed"),
        }
    }

    /// Frames of input the stretcher needs ahead of the point being processed.
    pub fn input_latency(&self) -> usize {
        // SAFETY: `raw` is valid for the lifetime of `self`
        unsafe { looplab_stretch_input_latency(self.raw.as_ptr()) as usize }
    }

    /// Frames of output between the point being processed and what is heard.
    pub fn output_latency(&self) -> usize {
        // SAFETY: as above
        unsafe { looplab_stretch_output_latency(self.raw.as_ptr()) as usize }
    }

    /// Largest number of frames one call may take or give without allocating.
    pub fn max_block(&self) -> usize {
        // SAFETY: as above
        unsafe { looplab_stretch_max_block(self.raw.as_ptr()) as usize }
    }

    pub fn reset(&mut self) {
        // SAFETY: as above
        unsafe { looplab_stretch_reset(self.raw.as_ptr()) }
    }

    /// Pitch multiplier: 2.0 is one octave up, 1.0 leaves the pitch alone.
    pub fn set_transpose(&mut self, factor: f32) {
        // SAFETY: as above
        unsafe { looplab_stretch_set_transpose(self.raw.as_ptr(), factor) }
    }

    /// Restarts from a new place: `input` is the audio from there on (`input_latency()` frames
    /// is the ideal length), so the next `process` output is aligned with it.
    pub fn seek(&mut self, input: &[f32], rate: f64) {
        let frames = self.checked_frames(input.len());
        // SAFETY: `input` holds `frames` interleaved stereo frames
        unsafe { looplab_stretch_seek(self.raw.as_ptr(), input.as_ptr(), frames, rate) }
    }

    /// Consumes all of `input` and fills all of `output`; their length ratio is the speed.
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        let input_frames = self.checked_frames(input.len());
        let output_frames = self.checked_frames(output.len());
        // SAFETY: both buffers hold the stated number of interleaved stereo frames
        unsafe {
            looplab_stretch_process(
                self.raw.as_ptr(),
                input.as_ptr(),
                input_frames,
                output.as_mut_ptr(),
                output_frames,
            );
        }
    }

    fn checked_frames(&self, samples: usize) -> c_int {
        debug_assert_eq!(samples % CHANNELS, 0, "buffers are interleaved stereo");
        let frames = samples / CHANNELS;
        debug_assert!(
            frames <= self.max_block(),
            "block larger than the real-time limit"
        );
        frames as c_int
    }
}

impl Drop for Stretch {
    fn drop(&mut self) {
        // SAFETY: `raw` came from `looplab_stretch_new` and is freed exactly once
        unsafe { looplab_stretch_free(self.raw.as_ptr()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;
    const BLOCK: usize = 512;

    fn sine(frames: usize, hz: f32) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = (i as f32 * hz * std::f32::consts::TAU / RATE as f32).sin() * 0.5;
                [s, s]
            })
            .collect()
    }

    /// Runs `input` through the stretcher at `speed`, returning the output.
    fn run(stretch: &mut Stretch, input: &[f32], speed: f64) -> Vec<f32> {
        let mut output = Vec::new();
        let mut block = vec![0.0; BLOCK * CHANNELS];
        let mut consumed = 0.0_f64;
        let mut offset = 0;
        while offset < input.len() / CHANNELS {
            consumed += BLOCK as f64 * speed;
            let take = (consumed.floor() as usize - offset).min(input.len() / CHANNELS - offset);
            stretch.process(
                &input[offset * CHANNELS..(offset + take) * CHANNELS],
                &mut block,
            );
            output.extend_from_slice(&block);
            offset += take;
        }
        output
    }

    /// Upward zero crossings of the left channel, ignoring the latency at the start.
    fn crossings(interleaved: &[f32], skip_frames: usize) -> usize {
        let left: Vec<f32> = interleaved
            .iter()
            .step_by(CHANNELS)
            .skip(skip_frames)
            .copied()
            .collect();
        left.windows(2)
            .filter(|w| w[0] < 0.0 && w[1] >= 0.0)
            .count()
    }

    #[test]
    fn reports_latencies_and_block_limit() {
        let stretch = Stretch::new(RATE);
        assert!(stretch.input_latency() > 0);
        assert!(stretch.output_latency() > 0);
        assert!(
            stretch.max_block() >= BLOCK * 2,
            "two-times speed must fit in one call"
        );
    }

    #[test]
    fn half_speed_doubles_the_length() {
        let mut stretch = Stretch::new(RATE);
        let input = sine(RATE as usize, 440.0);
        let output = run(&mut stretch, &input, 0.5);
        let ratio = output.len() as f64 / input.len() as f64;
        assert!((ratio - 2.0).abs() < 0.02, "ratio {ratio}");
    }

    #[test]
    fn half_speed_keeps_the_pitch() {
        let mut stretch = Stretch::new(RATE);
        let output = run(&mut stretch, &sine(RATE as usize, 440.0), 0.5);
        // Two seconds of output, minus one second of start-up margin: still 440 Hz
        let measured = crossings(&output[..RATE as usize * 2 * CHANNELS], RATE as usize);
        assert!(
            (430..=450).contains(&measured),
            "crossings in 1 s: {measured}"
        );
    }

    #[test]
    fn transpose_shifts_the_pitch_without_changing_length() {
        let mut stretch = Stretch::new(RATE);
        stretch.set_transpose(2.0);
        let input = sine(RATE as usize * 2, 220.0);
        let output = run(&mut stretch, &input, 1.0);
        assert_eq!(
            output.len().div_ceil(BLOCK * CHANNELS),
            input.len().div_ceil(BLOCK * CHANNELS)
        );
        let measured = crossings(&output[..RATE as usize * 2 * CHANNELS], RATE as usize);
        assert!(
            (430..=450).contains(&measured),
            "220 Hz one octave up: {measured}"
        );
    }
}
