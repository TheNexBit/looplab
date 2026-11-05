//! Looplab audio engine.
//!
//! Library with no dependency on Tauri, so it can be tested and reused on its own.
//! Signalsmith Stretch (C++, vendored) is the only non-Rust part, behind `dsp::stretch`.
//! The Tauri app only calls into it through thin commands.
//!
//! Loading: `decode` (file → stereo f32) → `resample` (→ output device rate)
//! → `pcm` (kept in memory) + `peaks` (waveform data).
//! Playback: `engine` (handle) drives `render` (audio thread): reader → stretch → device.

pub mod decode;
pub mod dsp;
pub mod engine;
pub mod load;
pub mod pcm;
pub mod peaks;
mod render;
pub mod resample;
pub mod time;

pub use engine::{Engine, EngineError, LoopSettings, MAX_SPEED, MIN_SPEED, Status};
pub use load::{LoadError, LoadedTrack, load};
pub use pcm::Pcm;
pub use peaks::Peaks;

/// Engine version, shown in the UI to prove the Rust ↔ UI link works.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
