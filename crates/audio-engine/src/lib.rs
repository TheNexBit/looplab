//! Looplab audio engine.
//!
//! Library with no dependency on Tauri, so it can be tested and reused on its own.
//! Signalsmith Stretch (C++, vendored) is the only non-Rust part, behind `dsp::stretch`.
//! The Tauri app only calls into it through thin commands.
//!
//! Loading: `decode` (file → stereo f32) → `resample` (→ output device rate)
//! → `pcm` (kept in memory) + `peaks` (waveform data).
//! Playback: `engine` (handle) drives `render` (audio thread): reader → stretch → device.

pub mod click;
pub mod decode;
pub mod dsp;
pub mod engine;
pub mod exercises;
pub mod export;
pub mod load;
pub mod metronome;
pub mod pattern;
pub mod pcm;
pub mod peaks;
mod render;
pub mod resample;
pub mod spectrum;
pub mod stems;
pub mod tempo_map;
pub mod time;
pub mod tone;
pub mod voice;
pub mod wav;

pub use click::{
    ClickSamples, ClickSettings, ClickSound, ClickSounds, MAX_SAMPLE_SECONDS, click_from_stereo,
};
pub use dsp::channels::ChannelMode;
pub use dsp::eq::{BANDS, Band, BandKind, EqSettings};
pub use engine::{Engine, EngineError, LoopSettings, MAX_SPEED, MIN_SPEED, Status};
pub use exercises::{Exercises, Gap, MAX_STEPS, Rhythm, RhythmStep, Trainer};
pub use export::{ExportError, ExportSettings};
pub use load::{LoadError, LoadEvent, LoadedTrack, OpenedTrack, SharedPeaks, load, open};
pub use metronome::{MetronomeSettings, Segment, Sequence};
pub use pattern::{BarPattern, BeatState, ClickKind};
pub use pcm::Pcm;
pub use peaks::Peaks;
pub use stems::{MAX_STEMS, StemLevels, Stems};
pub use tempo_map::{TempoMap, TempoSegment};
pub use tone::ToneSettings;
pub use voice::{CountVoice, Syllable, VoiceBank};
pub use wav::BitDepth;

/// Engine version, shown in the UI to prove the Rust ↔ UI link works.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
