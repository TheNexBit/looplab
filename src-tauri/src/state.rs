//! State shared by all commands.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use audio_engine::spectrum::Analyzer;
use audio_engine::{Engine, Pcm, SharedPeaks};

use crate::commands::AppError;
use crate::voice::VoiceLanguage;

#[derive(Default)]
pub struct AppState {
    engine: Mutex<Option<Arc<Engine>>>,
    /// Waveform data of the open track, growing while it loads
    peaks: Mutex<Option<SharedPeaks>>,
    /// The finished waveform already in the binary layout: built once, not at every request
    peaks_bytes: Mutex<Option<Arc<Vec<u8>>>>,
    /// Stops the background loading of the open track when another one is opened
    load_cancel: Mutex<Option<Arc<AtomicBool>>>,
    /// Same for the other take of the song (its backing track)
    other_cancel: Mutex<Option<Arc<AtomicBool>>>,
    /// Audio of the open track (shared with the engine), for exports and the spectrum
    track: Mutex<Option<Arc<Pcm>>>,
    /// Set to stop the export in progress
    pub export_cancel: AtomicBool,
    /// FFT set up for the note view, reused between calls (with the rate it was made for)
    analyzer: Mutex<Option<(u32, Analyzer)>>,
    /// Imported sound of each kind of click (accent, beat, subdivision, cross), if any
    click_samples: Mutex<[Option<PathBuf>; 4]>,
    /// Language of the metronome's counting voice
    voice_language: Mutex<VoiceLanguage>,
    /// The beat-tracking network, loaded at the first tempo analysis (it takes a moment)
    tempo_analyzer: Mutex<Option<Arc<beat_detect::Analyzer>>>,
    /// The stem separation network, loaded at the first separation
    stem_separator: Mutex<Option<Arc<stem_split::Separator>>>,
    /// Set to stop the separation in progress
    stems_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

/// A mutex's data, even after a thread panicked while holding it (the data is still usable).
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
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
        // The counting voice's words, at the rate of this device
        let language = *lock(&self.voice_language);
        started.set_voice(crate::voice::bank(language, started.sample_rate()));
        // …and the imported click sounds, also after the device was lost and restarted
        let samples = lock(&self.click_samples).clone();
        if samples.iter().any(Option::is_some) {
            started.set_click_samples(crate::commands::load_click_samples(
                &samples,
                started.sample_rate(),
            ));
        }
        *engine = Some(Arc::clone(&started));
        Ok(started)
    }

    pub fn set_click_sample_paths(&self, paths: [Option<PathBuf>; 4]) {
        *lock(&self.click_samples) = paths;
    }

    pub fn set_voice_language(&self, language: VoiceLanguage) {
        *lock(&self.voice_language) = language;
    }

    pub fn click_sample_paths(&self) -> [Option<PathBuf>; 4] {
        lock(&self.click_samples).clone()
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

    /// Like `new_load`, for the other take of the song.
    pub fn new_other_load(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(previous) = lock(&self.other_cancel).replace(Arc::clone(&flag)) {
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

    /// The stem separator, loading the model from `model` the first time.
    pub fn stem_separator(
        &self,
        model: &std::path::Path,
    ) -> Result<Arc<stem_split::Separator>, stem_split::NetworkError> {
        let mut slot = lock(&self.stem_separator);
        if let Some(separator) = slot.as_ref() {
            return Ok(Arc::clone(separator));
        }
        let network = stem_split::Network::load(model)?;
        let separator = Arc::new(stem_split::Separator::new(
            network,
            stem_split::SOURCES.len(),
        ));
        *slot = Some(Arc::clone(&separator));
        Ok(separator)
    }

    /// A new separation: the one before it (if any) is told to stop.
    pub fn new_stems_job(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(old) = lock(&self.stems_cancel).replace(Arc::clone(&flag)) {
            old.store(true, Ordering::Relaxed);
        }
        flag
    }

    pub fn cancel_stems_job(&self) {
        if let Some(flag) = lock(&self.stems_cancel).as_ref() {
            flag.store(true, Ordering::Relaxed);
        }
    }

    /// The tempo analyzer, loading the model from `model` the first time.
    pub fn tempo_analyzer(
        &self,
        model: &std::path::Path,
    ) -> Result<Arc<beat_detect::Analyzer>, beat_detect::ModelError> {
        let mut slot = lock(&self.tempo_analyzer);
        if let Some(analyzer) = slot.as_ref() {
            return Ok(Arc::clone(analyzer));
        }
        let analyzer = Arc::new(beat_detect::Analyzer::new(model)?);
        *slot = Some(Arc::clone(&analyzer));
        Ok(analyzer)
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
