//! Looplab audio engine.
//!
//! Pure Rust library with no dependency on Tauri, so it can be tested and
//! reused on its own. The Tauri app only calls into it through thin commands.
//!
//! Loading: `decode` (file → stereo f32) → `resample` (→ output device rate)
//! → `pcm` (kept in memory) + `peaks` (waveform data).
//! Playback: `engine` runs the real-time audio thread on top of a `Pcm`.

pub mod decode;
pub mod engine;
pub mod load;
pub mod pcm;
pub mod peaks;
pub mod resample;
pub mod time;

pub use engine::{Engine, EngineError, Status};
pub use load::{LoadError, LoadedTrack, load};
pub use pcm::Pcm;
pub use peaks::Peaks;

/// Engine version, shown in the UI to prove the Rust ↔ UI link works.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
