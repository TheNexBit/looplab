//! State shared by all commands.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use audio_engine::spectrum::Analyzer;
use audio_engine::{Engine, Pcm, SharedPeaks};

use crate::commands::AppError;

#[derive(Default)]
pub struct AppState {
    engine: Mutex<Option<Arc<Engine>>>,
    /// Waveform data of the open track, growing while it loads
    peaks: Mutex<Option<SharedPeaks>>,
    /// The finished waveform already in the binary layout: built once, not at every request
    peaks_bytes: Mutex<Option<Arc<Vec<u8>>>>,
    /// Stops the background loading of the open track when another one is opened
    load_cancel: Mutex<Option<Arc<AtomicBool>>>,
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

    pub fn set_peaks(&self, peaks: SharedPeaks) {
        *lock(&self.peaks) = Some(peaks);
        *lock(&self.peaks_bytes) = None;
    }

    /// The waveform as loaded so far, in the binary layout sent to the UI. Once the track has
    /// loaded the bytes are kept, so later requests copy them instead of rebuilding them.
    pub fn peaks_bytes(&self) -> Option<Vec<u8>> {
        if let Some(ready) = lock(&self.peaks_bytes).as_ref() {
            return Some(ready.as_ref().clone());
        }
        let peaks = lock(&self.peaks).clone()?;
        let (bytes, finished) = {
            let builder = lock(&peaks);
            (builder.peaks().to_bytes(), builder.is_finished())
        };
        if finished {
            *lock(&self.peaks_bytes) = Some(Arc::new(bytes.clone()));
        }
        Some(bytes)
    }

    /// Stops the loader of the previous track and returns the flag for the next one.
    pub fn new_load(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(previous) = lock(&self.load_cancel).replace(Arc::clone(&flag)) {
            previous.store(true, Ordering::Relaxed);
        }
        flag
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
