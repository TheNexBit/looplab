//! Stem separation for Looplab: HTDemucs (Défossez, Demucs v4; code MIT, weights' licence
//! unclear, see docs/ROADMAP.md phase 18). The network runs from its ONNX export with
//! rten; the spectrograms, the mask and the overlap-add of segments are done here, as in
//! Demucs itself.

pub mod network;

pub use network::{Network, NetworkError};
