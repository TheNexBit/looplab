//! Beat and downbeat detection for Looplab, ported from Beat This!
//! (Foscarin, Schlüter, Widmer, ISMIR 2024; code and weights MIT).
//!
//! The model expects exactly the log-mel spectrogram its authors trained it on, so
//! [`spectrogram`] reproduces their preprocessing number by number.

pub mod spectrogram;

pub use spectrogram::{FPS, LogMelSpectrogram, N_MELS, SAMPLE_RATE};
