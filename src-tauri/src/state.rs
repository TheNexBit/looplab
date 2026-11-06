//! State shared by all commands.

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, MutexGuard};

use audio_engine::spectrum::Analyzer;
use audio_engine::{Engine, Pcm};

use crate::commands::AppError;

#[derive(Default)]
pub struct AppState {
    engine: Mutex<Option<Arc<Engine>>>,
    /// Waveform data of the open track, already in the binary layout sent to the UI
    peaks: Mutex<Option<Arc<Vec<u8>>>>,
    /// Audio of the open track (shared with the engine), for exports and the spectrum
    track: Mutex<Option<Arc<Pcm>>>,
    /// Set to stop the export in progress
    pub export_cancel: AtomicBool,
    /// FFT set up for the note view, reused between calls (with the rate it was made for)
    analyzer: Mutex<Option<(u32, Analyzer)>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl AppState {
    /// The audio engine, started (or restarted after a device failure) when needed.
    pub fn engine(&self) -> Result<Arc<Engine>, AppError> {
        let mut engine = lock(&self.engine);
        if let Some(running) = engine.as_ref().filter(|e| !e.is_lost()) {
            return Ok(Arc::clone(running));
        }
        let started = Arc::new(Engine::start()?);
        *engine = Some(Arc::clone(&started));
        Ok(started)
    }

    /// The engine only if it is already running: never starts the audio device.
    pub fn running_engine(&self) -> Option<Arc<Engine>> {
        lock(&self.engine).clone()
    }

    pub fn set_peaks(&self, bytes: Vec<u8>) {
        *lock(&self.peaks) = Some(Arc::new(bytes));
    }

    pub fn peaks(&self) -> Option<Arc<Vec<u8>>> {
        lock(&self.peaks).clone()
    }

    pub fn set_track(&self, pcm: Arc<Pcm>) {
        *lock(&self.track) = Some(pcm);
    }

    pub fn track(&self) -> Option<Arc<Pcm>> {
        lock(&self.track).clone()
    }

    /// The note analyzer for `rate`, if one is ready; give it back with `keep_analyzer`.
    pub fn take_analyzer(&self, rate: u32) -> Option<Analyzer> {
        lock(&self.analyzer)
            .take()
            .and_then(|(made_for, analyzer)| (made_for == rate).then_some(analyzer))
    }

    pub fn keep_analyzer(&self, rate: u32, analyzer: Analyzer) {
        *lock(&self.analyzer) = Some((rate, analyzer));
    }
}
