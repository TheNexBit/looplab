//! Stems from files, like Song Master's «Open as stems»: other files (a solo's backing track,
//! a click, a second guitar) played together with the open track, each on its own lane.
//!
//! Each file is decoded at the engine's rate, lined up with the open track from its sound
//! (`audio_engine::offset`, the comparison that lines up camera angles) unless its shift is
//! already known, moved onto the open track's time (`audio_engine::shifted`) and handed to the
//! engine as one more input of the stem mix. The open file is a lane too: its level is the
//! mix's `original` (see `set_stem_levels`). The waveform of every lane is kept here for
//! `get_stem_peaks`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError, Weak};

use audio_engine::offset::{self, Sound};
use audio_engine::peaks::PeaksBuilder;
use audio_engine::{LoadError, MAX_STEMS, Pcm, StemLevels, Stems, shifted};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use super::{AppError, ErrorKind};
use crate::media;
use crate::state::AppState;

/// Waveform bytes of the lanes opened last (the same layout as `get_peaks`), by lane.
static LANE_PEAKS: Mutex<Vec<Vec<u8>>> = Mutex::new(Vec::new());
/// The track the stems from files were opened for (while they are open).
static OPEN_FOR: Mutex<Option<Weak<Pcm>>> = Mutex::new(None);

/// True while stems from files are open for `track`: its separated tracks must not replace them.
pub fn open_for(track: &Arc<Pcm>) -> bool {
    OPEN_FOR
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .and_then(Weak::upgrade)
        .is_some_and(|open| Arc::ptr_eq(&open, track))
}

/// A file to open as a stem; `shift` when it was lined up before (saved in the project).
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StemFileRequest {
    pub path: String,
    pub shift: Option<f64>,
}

/// A lane as opened: what is heard at `t` of the open track is at `t + shift` in this file.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StemFileLane {
    pub path: String,
    pub shift: f64,
    /// Lined up from the sound (or a saved shift); false: it starts with the open track
    pub lined_up: bool,
}

/// A file decoded at `rate`; through FFmpeg when its own format cannot be read (a video).
fn decode(cache: &Path, path: &Path, rate: u32) -> Result<Arc<Pcm>, AppError> {
    if !path.is_file() {
        return Err(AppError::new(
            ErrorKind::FileNotFound,
            path.display().to_string(),
        ));
    }
    let loaded = match audio_engine::load(path, rate, |_| {}) {
        Err(LoadError::UnsupportedCodec | LoadError::UnsupportedFormat)
            if media::ffmpeg().is_some() =>
        {
            let extracted =
                media::extract_audio(cache, path, |_| {}).map_err(AppError::internal)?;
            audio_engine::load(&extracted, rate, |_| {})?
        }
        other => other?,
    };
    Ok(loaded.pcm)
}

fn peaks_of(pcm: &Pcm) -> Vec<u8> {
    let frames = pcm.frames();
    let mut builder = PeaksBuilder::new(pcm.sample_rate(), frames);
    // A second at a time: the builder takes interleaved stereo
    let chunk = pcm.sample_rate() as usize;
    let mut samples = Vec::with_capacity(chunk * 2);
    let mut at = 0usize;
    while (at as u64) < frames {
        samples.clear();
        let end = (at + chunk).min(frames as usize);
        for i in at..end {
            let [l, r] = pcm.frame(i);
            samples.push(l);
            samples.push(r);
        }
        builder.push(&samples);
        at = end;
    }
    builder.finish();
    builder.peaks().to_bytes()
}

/// Opens `files` as stems of the open track `track` (at most `MAX_STEMS`), lining up those
/// without a known shift. Returns the lanes in the same order; their waveforms come from
/// `get_stem_peaks`. Replaces the separated tracks of the song, if any were loaded.
#[tauri::command]
#[specta::specta]
pub async fn open_stem_files(
    app: AppHandle,
    state: State<'_, AppState>,
    track: String,
    files: Vec<StemFileRequest>,
) -> Result<Vec<StemFileLane>, AppError> {
    let engine = state.engine()?;
    let rate = engine.sample_rate();
    let cache = super::cache_dir(&app)?;
    // The open track's own audio, for the comparison (decoded again only while still loading)
    let before = state.track();
    let open = before.clone().filter(|pcm| pcm.is_complete());
    let files: Vec<StemFileRequest> = files.into_iter().take(MAX_STEMS).collect();
    let main = PathBuf::from(&track);
    let (lanes, tracks, peaks) = tauri::async_runtime::spawn_blocking(move || {
        let mut base: Option<Sound> = None;
        let mut lanes = Vec::new();
        let mut tracks = Vec::new();
        let mut peaks = Vec::new();
        for file in &files {
            let pcm = decode(&cache, Path::new(&file.path), rate)?;
            let (shift, lined_up) = match file.shift {
                Some(shift) => (shift, true),
                None => {
                    if base.is_none() {
                        let pcm = match &open {
                            Some(pcm) => Arc::clone(pcm),
                            None => decode(&cache, &main, rate)?,
                        };
                        base = Some(Sound::from_pcm(&pcm));
                    }
                    let sound = Sound::from_pcm(&pcm);
                    match base.as_ref().and_then(|base| offset::find(base, &sound)) {
                        Some(found) if found.matches() => (found.seconds, true),
                        _ => (0.0, false),
                    }
                }
            };
            let frames = (shift * f64::from(rate)).round() as i64;
            let moved = shifted(&pcm, frames);
            peaks.push(peaks_of(&moved));
            tracks.push(moved);
            lanes.push(StemFileLane {
                path: file.path.clone(),
                shift,
                lined_up,
            });
        }
        Ok::<_, AppError>((lanes, tracks, peaks))
    })
    .await
    .map_err(AppError::internal)??;
    // Still the same track: a quick switch must not give its lanes to the next one
    let same = match (&before, state.track()) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, &b),
        _ => false,
    };
    if !same {
        return Err(AppError::new(
            ErrorKind::Cancelled,
            "another track was opened",
        ));
    }
    *LANE_PEAKS.lock().unwrap_or_else(PoisonError::into_inner) = peaks;
    *OPEN_FOR.lock().unwrap_or_else(PoisonError::into_inner) = before.as_ref().map(Arc::downgrade);
    engine.set_stems(Some(Arc::new(Stems::new(tracks))));
    Ok(lanes)
}

/// Back to the open track alone.
#[tauri::command]
#[specta::specta]
pub fn close_stem_files(state: State<'_, AppState>) -> Result<(), AppError> {
    LANE_PEAKS
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clear();
    *OPEN_FOR.lock().unwrap_or_else(PoisonError::into_inner) = None;
    let engine = state.engine()?;
    engine.set_stems(None);
    // The track alone at full level again: a lane muted or lowered before must not stay silent
    engine.set_stem_levels(StemLevels::default());
    Ok(())
}

/// Waveform of lane `index` of the stems opened last, as raw bytes (see `waveform.rs`).
#[tauri::command]
pub fn get_stem_peaks(index: usize) -> Result<Response, AppError> {
    let peaks = LANE_PEAKS.lock().unwrap_or_else(PoisonError::into_inner);
    let bytes = peaks
        .get(index)
        .cloned()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no such stem"))?;
    Ok(Response::new(bytes))
}

fn is_media(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            let ext = ext.to_lowercase();
            crate::formats::AUDIO.contains(&ext.as_str())
                || crate::formats::VIDEO.contains(&ext.as_str())
        })
}

/// The playable files of a folder, by name (a folder dropped or picked to open as stems).
#[tauri::command]
#[specta::specta]
pub fn media_in_folder(folder: String) -> Result<Vec<String>, AppError> {
    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err(AppError::new(ErrorKind::FileNotFound, &folder));
    }
    let mut files: Vec<String> = std::fs::read_dir(dir)
        .map_err(AppError::internal)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_media(path))
        .map(|path| path.display().to_string())
        .collect();
    files.sort_by_key(|path| path.to_lowercase());
    Ok(files)
}
