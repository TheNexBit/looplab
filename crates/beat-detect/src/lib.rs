//! Beat and downbeat detection for Looplab, ported from Beat This!
//! (Foscarin, Schlüter, Widmer, ISMIR 2024; code and weights MIT), and the tempo
//! map built from the beats.
//!
//! The model expects exactly the log-mel spectrogram its authors trained it on, so
//! [`spectrogram`] reproduces their preprocessing number by number; [`model`] runs the
//! network (exported to ONNX) with rten and splits long pieces as they do; [`peaks`]
//! turns its logits into beats as they do; [`tempo`] is Looplab's own: beats to tempo
//! and meter markers, any meter, any tempo.

pub mod meter;
pub mod model;
pub mod peaks;
pub mod spectrogram;
pub mod tempo;
pub mod track;

use std::path::Path;

pub use model::{BeatModel, FrameLogits, ModelError};
pub use peaks::Beat;
pub use spectrogram::{FPS, LogMelSpectrogram, N_MELS, SAMPLE_RATE};
pub use tempo::{Hints, Options, TempoMarker};
pub use track::Tracked;

/// Everything needed to analyse pieces; build it once, it keeps the model loaded.
pub struct Analyzer {
    spectrogram: LogMelSpectrogram,
    model: BeatModel,
}

/// What an analysis found.
#[derive(Debug, Clone)]
pub struct Analysis {
    pub beats: Vec<Tracked>,
    pub markers: Vec<TempoMarker>,
}

impl Analyzer {
    pub fn new(model: &Path) -> Result<Self, ModelError> {
        Ok(Self {
            spectrogram: LogMelSpectrogram::new(),
            model: BeatModel::load(model)?,
        })
    }

    /// Beats and tempo map of a mono signal at [`SAMPLE_RATE`]. `progress` gets the
    /// fraction done (the network is nearly all the time).
    pub fn analyze(
        &self,
        signal: &[f32],
        hints: &Hints,
        progress: impl FnMut(f32),
    ) -> Result<Analysis, ModelError> {
        let spect = self.spectrogram.compute(signal);
        let logits = self.model.predict(&spect, progress)?;
        let (beats, markers) = tempo::analyze(&logits, hints, &Options::default());
        Ok(Analysis { beats, markers })
    }
}
