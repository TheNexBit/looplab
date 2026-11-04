//! Looplab audio engine.
//!
//! Pure Rust library with no dependency on Tauri, so it can be tested and
//! reused on its own. The Tauri app only calls into it through thin commands.

pub mod time;

/// Engine version, shown in the UI to prove the Rust ↔ UI link works.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
