//! Playback: the real-time audio thread and the handle the app talks to.
//!
//! The audio callback never allocates, locks or does I/O. Commands reach it
//! through a lock-free ring buffer; position and state come back through atomics.
//! Replaced tracks are sent back to be freed outside the audio thread.

use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, StreamConfig};

use crate::pcm::Pcm;

/// Fade applied on play, pause and seek, so they never click.
const FADE_SECONDS: f32 = 0.005;
const COMMAND_SLOTS: usize = 64;
const GARBAGE_SLOTS: usize = 16;

enum Command {
    SetTrack(Arc<Pcm>),
    Play,
    Pause,
    Seek(u64),
}

/// Written by the audio thread, read by everyone else.
#[derive(Default)]
struct Shared {
    position: AtomicU64,
    playing: AtomicBool,
    /// Set when the output device fails (unplugged, disabled…)
    lost: AtomicBool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Status {
    pub position_frames: u64,
    pub playing: bool,
}

#[derive(Debug)]
pub enum EngineError {
    NoDevice,
    Device(String),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoDevice => f.write_str("no audio output device"),
            Self::Device(detail) => write!(f, "audio device error: {detail}"),
        }
    }
}

impl std::error::Error for EngineError {}

pub struct Engine {
    _stream: cpal::Stream,
    sample_rate: u32,
    shared: Arc<Shared>,
    control: Mutex<Control>,
}

/// Non-real-time side of the ring buffers.
struct Control {
    commands: rtrb::Producer<Command>,
    garbage: rtrb::Consumer<Arc<Pcm>>,
}

impl Engine {
    /// Opens the default output device and starts a stream that plays silence until a track is set.
    pub fn start() -> Result<Self, EngineError> {
        let device = cpal::default_host().default_output_device().ok_or(EngineError::NoDevice)?;
        let supported = device.default_output_config().map_err(device_error)?;
        let format = supported.sample_format();
        let config: StreamConfig = supported.into();
        let sample_rate = config.sample_rate;

        let (control, shared, renderer) = channel(sample_rate);
        let stream = match format {
            SampleFormat::F32 => build_stream::<f32>(&device, config, renderer, &shared),
            SampleFormat::I16 => build_stream::<i16>(&device, config, renderer, &shared),
            SampleFormat::I32 => build_stream::<i32>(&device, config, renderer, &shared),
            other => Err(EngineError::Device(format!("unsupported sample format {other}"))),
        }?;
        stream.play().map_err(device_error)?;

        Ok(Self { _stream: stream, sample_rate, shared, control: Mutex::new(control) })
    }

    /// Rate of the output device: tracks must be converted to it before `set_track`.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// True once the output device has failed: the engine must be recreated.
    pub fn is_lost(&self) -> bool {
        self.shared.lost.load(Ordering::Relaxed)
    }

    pub fn status(&self) -> Status {
        Status {
            position_frames: self.shared.position.load(Ordering::Relaxed),
            playing: self.shared.playing.load(Ordering::Relaxed),
        }
    }

    /// Replaces the track; playback stops at the start of the new one.
    pub fn set_track(&self, pcm: Arc<Pcm>) {
        self.send(Command::SetTrack(pcm));
    }

    pub fn play(&self) {
        self.send(Command::Play);
    }

    pub fn pause(&self) {
        self.send(Command::Pause);
    }

    pub fn seek(&self, frame: u64) {
        self.send(Command::Seek(frame));
    }

    fn send(&self, command: Command) {
        let mut control = self.control.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        // Free tracks the audio thread has let go of
        while control.garbage.pop().is_ok() {}
        // A full queue means the audio thread is stalled; dropping the command is the safe choice
        let _ = control.commands.push(command);
    }
}

fn device_error(err: impl fmt::Display) -> EngineError {
    EngineError::Device(err.to_string())
}

fn build_stream<T>(
    device: &cpal::Device,
    config: StreamConfig,
    mut renderer: Renderer,
    shared: &Arc<Shared>,
) -> Result<cpal::Stream, EngineError>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = usize::from(config.channels);
    let shared = Arc::clone(shared);
    device
        .build_output_stream(
            config,
            move |out: &mut [T], _| renderer.render(out, channels),
            move |_| shared.lost.store(true, Ordering::Relaxed),
            None,
        )
        .map_err(device_error)
}

fn channel(sample_rate: u32) -> (Control, Arc<Shared>, Renderer) {
    let (commands, command_rx) = rtrb::RingBuffer::new(COMMAND_SLOTS);
    let (garbage_tx, garbage) = rtrb::RingBuffer::new(GARBAGE_SLOTS);
    let shared = Arc::new(Shared::default());
    let renderer = Renderer {
        commands: command_rx,
        garbage: garbage_tx,
        shared: Arc::clone(&shared),
        track: None,
        position: 0,
        playing: false,
        pending_seek: None,
        gain: 0.0,
        gain_step: 1.0 / (FADE_SECONDS * sample_rate as f32).max(1.0),
    };
    (Control { commands, garbage }, shared, renderer)
}

/// Lives inside the audio callback. Everything here must be real-time safe.
struct Renderer {
    commands: rtrb::Consumer<Command>,
    garbage: rtrb::Producer<Arc<Pcm>>,
    shared: Arc<Shared>,
    track: Option<Arc<Pcm>>,
    position: u64,
    /// What the user asked for; the actual sound fades towards it
    playing: bool,
    /// A seek waits for the fade-out, then jumps and fades back in
    pending_seek: Option<u64>,
    gain: f32,
    gain_step: f32,
}

impl Renderer {
    fn render<T: Sample + FromSample<f32>>(&mut self, out: &mut [T], channels: usize) {
        self.apply_commands();
        for frame in out.chunks_exact_mut(channels) {
            let [left, right] = self.next_frame();
            if let [first, second, rest @ ..] = frame {
                *first = T::from_sample(left);
                *second = T::from_sample(right);
                rest.fill(T::EQUILIBRIUM);
            } else if let [mono] = frame {
                *mono = T::from_sample((left + right) * 0.5);
            }
        }
        self.shared.position.store(self.position, Ordering::Relaxed);
        self.shared.playing.store(self.playing, Ordering::Relaxed);
    }

    fn apply_commands(&mut self) {
        while let Ok(command) = self.commands.pop() {
            match command {
                Command::SetTrack(pcm) => {
                    if let Some(old) = self.track.replace(pcm)
                        && let Err(rtrb::PushError::Full(old)) = self.garbage.push(old)
                    {
                        // Never free memory here: leaking is better than a glitch
                        std::mem::forget(old);
                    }
                    self.position = 0;
                    self.playing = false;
                    self.pending_seek = None;
                    self.gain = 0.0;
                }
                Command::Play => {
                    if self.track.as_ref().is_some_and(|t| self.position >= t.frames()) {
                        self.position = 0;
                    }
                    self.playing = self.track.is_some();
                }
                Command::Pause => self.playing = false,
                Command::Seek(frame) => {
                    let end = self.track.as_ref().map_or(0, |t| t.frames());
                    self.pending_seek = Some(frame.min(end));
                }
            }
        }
    }

    #[inline]
    fn next_frame(&mut self) -> [f32; 2] {
        let target = if self.playing && self.pending_seek.is_none() { 1.0 } else { 0.0 };
        if self.gain < target {
            self.gain = (self.gain + self.gain_step).min(1.0);
        } else if self.gain > target {
            self.gain = (self.gain - self.gain_step).max(0.0);
        }

        if self.gain == 0.0 {
            if let Some(frame) = self.pending_seek.take() {
                self.position = frame;
            }
            if !self.playing {
                return [0.0; 2];
            }
        }

        let Some(track) = &self.track else { return [0.0; 2] };
        if self.position >= track.frames() {
            self.playing = false;
            self.gain = 0.0;
            return [0.0; 2];
        }
        let [left, right] = track.frame(self.position as usize);
        self.position += 1;
        [left * self.gain, right * self.gain]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1_000; // 5 ms fade = 5 frames: keeps the numbers readable

    /// Track whose every sample equals 0.5, `frames` long.
    fn track(frames: usize) -> Arc<Pcm> {
        let mut pcm = Pcm::with_capacity(RATE, frames);
        pcm.extend_from_f32(&vec![0.5; frames * 2]);
        Arc::new(pcm)
    }

    fn render(renderer: &mut Renderer, frames: usize) -> Vec<f32> {
        let mut out = vec![0.0_f32; frames * 2];
        renderer.render(&mut out, 2);
        out
    }

    fn setup(frames: usize) -> (Control, Arc<Shared>, Renderer) {
        let (mut control, shared, renderer) = channel(RATE);
        control.commands.push(Command::SetTrack(track(frames))).ok();
        (control, shared, renderer)
    }

    #[test]
    fn silent_until_play() {
        let (_control, shared, mut r) = setup(100);
        assert!(render(&mut r, 10).iter().all(|&s| s == 0.0));
        assert_eq!(shared.position.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn play_fades_in_and_advances() {
        let (mut control, shared, mut r) = setup(100);
        control.commands.push(Command::Play).ok();
        let out = render(&mut r, 20);
        assert!(out[0] > 0.0 && out[0] < 0.5, "starts with a fade");
        assert!((out[38] - 0.5).abs() < 1e-3, "full level after the fade");
        assert_eq!(shared.position.load(Ordering::Relaxed), 20);
        assert!(shared.playing.load(Ordering::Relaxed));
    }

    #[test]
    fn pause_fades_out_and_stops() {
        let (mut control, shared, mut r) = setup(100);
        control.commands.push(Command::Play).ok();
        render(&mut r, 20);
        control.commands.push(Command::Pause).ok();
        let out = render(&mut r, 20);
        assert!(out[0] > 0.0, "fade-out, not a hard cut");
        assert!(out[30..].iter().all(|&s| s == 0.0));
        let stopped_at = shared.position.load(Ordering::Relaxed);
        render(&mut r, 20);
        assert_eq!(shared.position.load(Ordering::Relaxed), stopped_at);
    }

    #[test]
    fn seek_jumps_after_fade_out() {
        let (mut control, shared, mut r) = setup(1_000);
        control.commands.push(Command::Play).ok();
        render(&mut r, 20);
        control.commands.push(Command::Seek(500)).ok();
        render(&mut r, 20);
        let position = shared.position.load(Ordering::Relaxed);
        assert!((500..520).contains(&position), "position {position}");
    }

    #[test]
    fn seek_while_paused_is_immediate() {
        let (mut control, shared, mut r) = setup(1_000);
        control.commands.push(Command::Seek(300)).ok();
        render(&mut r, 1);
        assert_eq!(shared.position.load(Ordering::Relaxed), 300);
    }

    #[test]
    fn stops_at_the_end_and_restarts_on_play() {
        let (mut control, shared, mut r) = setup(30);
        control.commands.push(Command::Play).ok();
        render(&mut r, 50);
        assert!(!shared.playing.load(Ordering::Relaxed));
        assert_eq!(shared.position.load(Ordering::Relaxed), 30);
        control.commands.push(Command::Play).ok();
        render(&mut r, 5);
        assert_eq!(shared.position.load(Ordering::Relaxed), 5);
    }

    #[test]
    fn replaced_track_is_freed_outside_the_audio_thread() {
        let (mut control, _shared, mut r) = setup(10);
        render(&mut r, 1);
        control.commands.push(Command::SetTrack(track(10))).ok();
        render(&mut r, 1);
        assert!(control.garbage.pop().is_ok());
    }
}
