//! Playback: the handle the app talks to, and the audio stream it drives.
//!
//! The audio callback (see `render.rs`) never allocates, locks or does I/O.
//! Commands reach it through a lock-free ring buffer; position and state come
//! back through atomics. Replaced tracks are sent back to be freed outside the audio thread.

use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, StreamConfig};

use crate::click::{ClickSamples, ClickSettings};
use crate::dsp::channels::ChannelMode;
use crate::dsp::eq::EqSettings;
use crate::metronome::{MetronomeSettings, Sequence};
use crate::pattern::ClickKind;
use crate::pcm::Pcm;
use crate::render::Renderer;
use crate::stems::{OtherTake, StemLevels, Stems};
use crate::synth::{Note, SynthSettings};
use crate::tempo_map::TempoMap;
use crate::tone::ToneSettings;
use crate::voice::VoiceBank;

/// Speeds the playback chain is sized for. The UI may offer a narrower range.
pub const MIN_SPEED: f32 = 0.25;
pub const MAX_SPEED: f32 = 2.0;

const COMMAND_SLOTS: usize = 64;
const GARBAGE_SLOTS: usize = 16;

/// Loop region and options, in frames of the track.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct LoopSettings {
    pub enabled: bool,
    pub start: u64,
    pub end: u64,
    /// Played before `start` on every repetition
    pub lead_in: u64,
    /// Silence between repetitions
    pub gap: u64,
}

impl LoopSettings {
    /// A loop is only active when it is enabled and has a usable length.
    pub fn is_active(&self) -> bool {
        self.enabled && self.end > self.start
    }

    /// Where every repetition starts: the loop start minus the lead-in.
    pub fn restart_at(&self) -> u64 {
        self.start.saturating_sub(self.lead_in)
    }
}

// The metronome's settings (its rhythm grid) make one variant large. Boxing it would free
// memory on the audio thread; a few hundred bytes per ring-buffer slot cost nothing.
#[allow(clippy::large_enum_variant)]
pub(crate) enum Command {
    SetTrack(Arc<Pcm>),
    Play,
    Pause,
    Seek(u64),
    SetSpeed(f32),
    SetTranspose(f32),
    SetLoop(LoopSettings),
    SetEq(EqSettings),
    SetChannelMode(ChannelMode),
    /// Level of the track alone (0..1), so the clicks can be heard over a loud mix
    SetTrackVolume(f32),
    /// Separated tracks of the song (None: there are none)
    SetStems(Option<Arc<Stems>>),
    /// Their levels, mute and solo applied
    SetStemLevels(StemLevels),
    /// Another take of the song, lined up with it (None removes it)
    SetOtherTake(Option<Arc<OtherTake>>),
    /// Hear the other take instead of the song
    SetOtherTakeOn(bool),
    SetClick(ClickSettings),
    /// Plays one click of a kind now, to hear its sound (also while paused)
    PreviewClick(ClickKind),
    /// Imported sounds used instead of the synthesised ones
    SetClickSamples(Arc<ClickSamples>),
    /// Where tempo and meter change in the track: the clicks and count-ins follow it
    SetTempoMap(Arc<TempoMap>),
    /// Reference note to tune by ear, heard also while paused
    SetTone(ToneSettings),
    /// Level of the synth playing the score's notes over the track
    SetSynth(SynthSettings),
    /// The score's notes, by start frame
    SetNotes(Arc<Vec<Note>>),
    /// The metronome on its own (no track): its bar, tempo and sounds…
    SetMetronome(MetronomeSettings),
    /// …started from its count-in, or stopped
    RunMetronome(bool),
    /// Parts played one after the other by the metronome on its own; None: back to its bar
    SetSequence(Option<Arc<Sequence>>),
    /// The words of the metronome's counting voice
    SetVoice(Arc<VoiceBank>),
}

/// Memory the audio thread lets go of, freed by the next command sent from outside.
pub(crate) enum Garbage {
    Track(#[allow(dead_code)] Arc<Pcm>),
    Sequence(#[allow(dead_code)] Arc<Sequence>),
    Voice(#[allow(dead_code)] Arc<VoiceBank>),
    Samples(#[allow(dead_code)] Arc<ClickSamples>),
    TempoMap(#[allow(dead_code)] Arc<TempoMap>),
    Stems(#[allow(dead_code)] Arc<Stems>),
    Other(#[allow(dead_code)] Arc<OtherTake>),
    Notes(#[allow(dead_code)] Arc<Vec<Note>>),
}

/// Written by the audio thread, read by everyone else.
#[derive(Default)]
pub(crate) struct Shared {
    pub position: AtomicU64,
    pub playing: AtomicBool,
    /// Loop repetitions started since the engine began (only ever grows)
    pub loops: AtomicU64,
    /// Set when the output device fails (unplugged, disabled…)
    pub lost: AtomicBool,
    /// The metronome on its own: running, and where (pulses from bar 0, as f64 bits)
    pub metronome_running: AtomicBool,
    pub metronome_pulses: AtomicU64,
    /// Part of the sequence being played; u32::MAX without a sequence
    pub metronome_segment: AtomicU32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Status {
    /// Frame being heard right now (latency already compensated)
    pub position_frames: u64,
    pub playing: bool,
    /// Loop repetitions started so far: it grows by one every time the loop wraps around
    pub loops: u64,
    /// The metronome on its own: running, and where it is in pulses from bar 0
    /// (negative during the count-in)
    pub metronome_running: bool,
    pub metronome_pulses: f64,
    /// Part of the sequence being played (positions are counted from its start)
    pub metronome_segment: Option<u32>,
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
pub(crate) struct Control {
    pub commands: rtrb::Producer<Command>,
    pub garbage: rtrb::Consumer<Garbage>,
}

impl Engine {
    /// Opens the default output device and starts a stream that plays silence until a track is set.
    pub fn start() -> Result<Self, EngineError> {
        let device = cpal::default_host()
            .default_output_device()
            .ok_or(EngineError::NoDevice)?;
        let supported = device.default_output_config().map_err(device_error)?;
        let format = supported.sample_format();
        let config: StreamConfig = supported.into();
        let sample_rate = config.sample_rate;

        let (control, shared, renderer) = channel(sample_rate);
        let stream = match format {
            SampleFormat::F32 => build_stream::<f32>(&device, config, renderer, &shared),
            SampleFormat::I16 => build_stream::<i16>(&device, config, renderer, &shared),
            SampleFormat::I32 => build_stream::<i32>(&device, config, renderer, &shared),
            other => Err(EngineError::Device(format!(
                "unsupported sample format {other}"
            ))),
        }?;
        stream.play().map_err(device_error)?;

        Ok(Self {
            _stream: stream,
            sample_rate,
            shared,
            control: Mutex::new(control),
        })
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
            loops: self.shared.loops.load(Ordering::Relaxed),
            metronome_running: self.shared.metronome_running.load(Ordering::Relaxed),
            metronome_pulses: f64::from_bits(self.shared.metronome_pulses.load(Ordering::Relaxed)),
            metronome_segment: match self.shared.metronome_segment.load(Ordering::Relaxed) {
                u32::MAX => None,
                segment => Some(segment),
            },
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

    /// Playback speed without changing pitch; 1.0 is the original. Clamped to the supported range.
    pub fn set_speed(&self, speed: f32) {
        self.send(Command::SetSpeed(speed.clamp(MIN_SPEED, MAX_SPEED)));
    }

    /// Pitch shift in semitones (fractions are cents), without changing speed.
    pub fn set_pitch(&self, semitones: f32) {
        self.send(Command::SetTranspose(2_f32.powf(semitones / 12.0)));
    }

    pub fn set_loop(&self, settings: LoopSettings) {
        self.send(Command::SetLoop(settings));
    }

    pub fn set_eq(&self, settings: EqSettings) {
        self.send(Command::SetEq(settings));
    }

    pub fn set_channel_mode(&self, mode: ChannelMode) {
        self.send(Command::SetChannelMode(mode));
    }

    /// Level of the track (0..1, clamped); the clicks, the metronome and the reference note
    /// keep their own.
    pub fn set_track_volume(&self, volume: f32) {
        self.send(Command::SetTrackVolume(volume.clamp(0.0, 1.0)));
    }

    /// The separated tracks of the open song, at the engine's rate; None removes them.
    pub fn set_stems(&self, stems: Option<Arc<Stems>>) {
        self.send(Command::SetStems(stems));
    }

    /// Levels of the separated tracks (0..1, mute and solo already applied). Untouched
    /// (all at 1), the original song is heard.
    pub fn set_stem_levels(&self, mut levels: StemLevels) {
        for g in &mut levels.gains {
            *g = g.clamp(0.0, 1.0);
        }
        self.send(Command::SetStemLevels(levels));
    }

    /// Another take of the open song (its backing track), lined up with it; None removes it.
    /// Opening another song removes it too.
    pub fn set_other_take(&self, other: Option<Arc<OtherTake>>) {
        self.send(Command::SetOtherTake(other));
    }

    /// Hear the other take instead of the song (crossfaded), at the same point, speed and pitch.
    pub fn set_other_take_on(&self, on: bool) {
        self.send(Command::SetOtherTakeOn(on));
    }

    /// Tempo, metronome and count-in.
    pub fn set_click(&self, settings: ClickSettings) {
        self.send(Command::SetClick(settings));
    }

    /// The tempo map of the track (built off the audio thread): clicks and count-ins follow it.
    pub fn set_tempo_map(&self, map: TempoMap) {
        self.send(Command::SetTempoMap(Arc::new(map)));
    }

    /// Plays one click of `kind` at once (accent, beat, subdivision, cross rhythm).
    pub fn preview_kind(&self, kind: ClickKind) {
        self.send(Command::PreviewClick(kind));
    }

    /// Imported sounds for the clicks, in place of the synthesised ones (prepared off the
    /// audio thread); empty slots keep the synthesised sound.
    pub fn set_click_samples(&self, samples: ClickSamples) {
        self.send(Command::SetClickSamples(Arc::new(samples)));
    }

    /// The metronome on its own: bar, tempo and sounds (taking over at once while it runs).
    pub fn set_metronome(&self, settings: MetronomeSettings) {
        self.send(Command::SetMetronome(settings));
    }

    /// Plays `sequence` (its parts in order) on the metronome on its own; None: back to its bar.
    pub fn set_sequence(&self, sequence: Option<Sequence>) {
        self.send(Command::SetSequence(sequence.map(Arc::new)));
    }

    /// The recorded words of the metronome's counting voice (prepared off the audio thread).
    pub fn set_voice(&self, bank: VoiceBank) {
        self.send(Command::SetVoice(Arc::new(bank)));
    }

    /// Starts the metronome on its own from its count-in, or stops it.
    pub fn run_metronome(&self, running: bool) {
        self.send(Command::RunMetronome(running));
    }

    /// Steady reference note (`hz` 0 = off), heard over the track and while paused.
    pub fn set_tone(&self, settings: ToneSettings) {
        self.send(Command::SetTone(settings));
    }

    /// Level of the synth that plays the score's notes over the track (0 = off).
    pub fn set_synth(&self, settings: SynthSettings) {
        self.send(Command::SetSynth(settings));
    }

    /// The score's notes in track frames (sorted here, off the audio thread).
    pub fn set_notes(&self, mut notes: Vec<Note>) {
        notes.sort_by_key(|n| n.start);
        self.send(Command::SetNotes(Arc::new(notes)));
    }

    fn send(&self, command: Command) {
        let mut control = self
            .control
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
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

pub(crate) fn channel(sample_rate: u32) -> (Control, Arc<Shared>, Renderer) {
    let (commands, command_rx) = rtrb::RingBuffer::new(COMMAND_SLOTS);
    let (garbage_tx, garbage) = rtrb::RingBuffer::new(GARBAGE_SLOTS);
    let shared = Arc::new(Shared::default());
    let renderer = Renderer::new(sample_rate, command_rx, garbage_tx, Arc::clone(&shared));
    (Control { commands, garbage }, shared, renderer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loop_restarts_before_its_start_by_the_lead_in() {
        let settings = LoopSettings {
            enabled: true,
            start: 1_000,
            end: 5_000,
            lead_in: 400,
            gap: 0,
        };
        assert_eq!(settings.restart_at(), 600);
        assert_eq!(
            LoopSettings {
                lead_in: 5_000,
                ..settings
            }
            .restart_at(),
            0
        );
    }

    #[test]
    fn empty_or_disabled_loops_are_inactive() {
        let settings = LoopSettings {
            enabled: true,
            start: 1_000,
            end: 1_000,
            lead_in: 0,
            gap: 0,
        };
        assert!(!settings.is_active());
        assert!(
            !LoopSettings {
                end: 2_000,
                enabled: false,
                ..settings
            }
            .is_active()
        );
        assert!(
            LoopSettings {
                end: 2_000,
                ..settings
            }
            .is_active()
        );
    }
}
