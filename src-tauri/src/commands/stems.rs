//! "Separate instruments": the open song split into voice, drums, bass, guitar, piano and
//! the rest (crate `stem-split`, HTDemucs), once per song; the tracks stay in the cache
//! next to the decoded song and the engine mixes them with their own levels.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use audio_engine::resample::StreamResampler;
use audio_engine::{MAX_STEMS, Pcm, StemLevels, Stems};
use serde::{Deserialize, Serialize};
use stem_split::{SAMPLE_RATE, SOURCES};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use super::{AppError, ErrorKind};
use crate::state::AppState;

/// The model, in `models/` next to the app or in `src-tauri/models` while developing
/// (`scripts/11-modello-strumenti.cmd` puts it there).
const MODEL_FILE: &str = "htdemucs_6s.onnx";
/// Conversion to 44.1 kHz, then the network: its share of the progress bar is the rest.
const PREPARE_SHARE: f32 = 0.03;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StemsRequest {
    /// The open song's file (the cache is keyed on it)
    pub path: String,
}

/// The separated tracks of the open song, in the order the levels are given.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StemsInfo {
    /// "drums", "bass", "other", "vocals", "guitar", "piano"
    pub names: Vec<String>,
}

fn model_path(app: &AppHandle) -> Option<PathBuf> {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("models").join(MODEL_FILE));
    if let Some(path) = bundled.filter(|p| p.is_file()) {
        return Some(path);
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("models")
            .join(MODEL_FILE);
        if dev.is_file() {
            return Some(dev);
        }
    }
    None
}

/// Cache file of one separated track: next to the decoded song, `<key>.stem-vocals.pcm`.
fn stem_file(stem: &Path, name: &str, partial: bool) -> PathBuf {
    let ending = if partial { "partial" } else { "pcm" };
    stem.with_extension(format!("stem-{name}.{ending}"))
}

/// The cache key of `path` at the engine's rate, as `open_file` makes it.
fn cache_stem(app: &AppHandle, path: &Path, rate: u32) -> Result<PathBuf, AppError> {
    let cache = super::cache_dir(app)?;
    let folder = crate::cache::CacheKind::Decoded.folder();
    crate::media::cache_path(&cache, folder, path, &format!("-{rate}")).map_err(AppError::internal)
}

/// The separated tracks already in the cache, all of them or none.
fn open_stems(stem: &Path, rate: u32) -> Option<Vec<Pcm>> {
    SOURCES
        .iter()
        .map(|name| {
            let file = stem_file(stem, name, false);
            let pcm = Pcm::open_file(&file, rate)?;
            crate::cache::touch(&file);
            Some(pcm)
        })
        .collect()
}

fn info() -> StemsInfo {
    StemsInfo {
        names: SOURCES.iter().map(|s| (*s).to_string()).collect(),
    }
}

/// The open song's separated tracks if they are in the cache: the engine gets them and
/// the answer names them; None when the song has not been separated yet.
#[tauri::command]
#[specta::specta]
pub async fn load_stems(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StemsRequest,
) -> Result<Option<StemsInfo>, AppError> {
    let engine = state.engine()?;
    let rate = engine.sample_rate();
    let stem = cache_stem(&app, Path::new(&request.path), rate)?;
    let found = tauri::async_runtime::spawn_blocking(move || open_stems(&stem, rate))
        .await
        .map_err(AppError::internal)?;
    Ok(found.map(|tracks| {
        engine.set_stems(Some(Arc::new(Stems::new(tracks))));
        info()
    }))
}

/// Separates the open song (a minute or so for five minutes of music), saves the tracks in
/// the cache and gives them to the engine. `on_progress` receives 0..1. Stops, with
/// `Cancelled`, when another song is opened or `cancel_stems` is called.
#[tauri::command]
#[specta::specta]
pub async fn separate_stems(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StemsRequest,
    on_progress: Channel<f32>,
) -> Result<StemsInfo, AppError> {
    let engine = state.engine()?;
    let rate = engine.sample_rate();
    let pcm = state
        .track()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if !pcm.is_complete() {
        return Err(AppError::new(
            ErrorKind::StillLoading,
            "track still loading",
        ));
    }
    let model =
        model_path(&app).ok_or_else(|| AppError::new(ErrorKind::StemModelMissing, MODEL_FILE))?;
    let separator = state.stem_separator(&model).map_err(AppError::internal)?;
    let stem = cache_stem(&app, Path::new(&request.path), rate)?;
    // Room in the cache: six tracks as large as the decoded song
    let track_bytes = pcm.frames() * 4;
    crate::cache::trim_decoded(&super::cache_dir(&app)?, track_bytes * SOURCES.len() as u64);
    let cancel = state.new_stems_job();
    let job_track = Arc::clone(&pcm);
    let app_state = app.clone();

    let tracks = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Pcm>, AppError> {
        let report = |p: f32| {
            let _ = on_progress.send(p.clamp(0.0, 1.0));
        };
        let still_wanted = || {
            let state = app_state.state::<AppState>();
            !cancel.load(std::sync::atomic::Ordering::Relaxed)
                && state.track().is_some_and(|t| Arc::ptr_eq(&t, &job_track))
        };
        let [left, right] = to_model_rate(&job_track, |p| report(p * PREPARE_SHARE))?;

        // One cache file per track, written as the separation goes, then renamed: a
        // half-done separation never looks finished
        let capacity = job_track.frames() + u64::from(rate);
        let mut outputs = Vec::with_capacity(SOURCES.len());
        for name in SOURCES {
            let pcm = Pcm::create_file(
                &stem_file(&stem, name, true),
                rate,
                capacity,
                job_track.frames(),
            )
            .map_err(AppError::internal)?;
            let resampler = StreamResampler::new(SAMPLE_RATE, rate).map_err(AppError::from)?;
            outputs.push((pcm, resampler));
        }
        let mut interleaved = Vec::new();
        let mut failure = None;
        let finished = separator
            .separate_into(
                &left,
                &right,
                |p| {
                    report(PREPARE_SHARE + p * (1.0 - PREPARE_SHARE));
                    still_wanted()
                },
                |block| {
                    for ((pcm, resampler), piece) in outputs.iter_mut().zip(block) {
                        interleaved.clear();
                        for (l, r) in piece[0].iter().zip(&piece[1]) {
                            interleaved.extend_from_slice(&[*l, *r]);
                        }
                        if let Err(e) = resampler.push(&interleaved, &mut |out| {
                            pcm.append(out);
                        }) {
                            failure.get_or_insert(e);
                        }
                    }
                },
            )
            .map_err(AppError::internal)?;
        if let Some(e) = failure {
            return Err(AppError::from(e));
        }
        for (name, (pcm, resampler)) in SOURCES.iter().zip(outputs) {
            if finished {
                resampler
                    .finish(&mut |out| {
                        pcm.append(out);
                    })
                    .map_err(AppError::from)?;
                pcm.finish().map_err(AppError::internal)?;
            }
            drop(pcm);
            let partial = stem_file(&stem, name, true);
            if finished {
                std::fs::rename(&partial, stem_file(&stem, name, false))
                    .map_err(AppError::internal)?;
            } else {
                let _ = std::fs::remove_file(&partial);
            }
        }
        if !finished {
            return Err(AppError::new(ErrorKind::Cancelled, "separation stopped"));
        }
        open_stems(&stem, rate)
            .ok_or_else(|| AppError::internal("separated tracks unreadable after writing"))
    })
    .await
    .map_err(AppError::internal)??;

    engine.set_stems(Some(Arc::new(Stems::new(tracks))));
    Ok(info())
}

/// Stops the separation in progress (it ends with `Cancelled`).
#[tauri::command]
#[specta::specta]
pub fn cancel_stems(state: State<'_, AppState>) {
    state.cancel_stems_job();
}

/// Levels of the separated tracks, 0..1, in the order of `StemsInfo::names`, mute and solo
/// already applied. All at 1 plays the original song.
#[tauri::command]
#[specta::specta]
pub fn set_stem_levels(state: State<'_, AppState>, levels: Vec<f32>) -> Result<(), AppError> {
    let mut gains = StemLevels::default();
    for (slot, level) in gains.gains.iter_mut().zip(levels.iter().take(MAX_STEMS)) {
        *slot = level.clamp(0.0, 1.0);
    }
    state.engine()?.set_stem_levels(gains);
    Ok(())
}

/// The separated tracks saved as WAV files.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportedStems {
    /// The song's folder
    pub folder: String,
    pub files: Vec<String>,
}

/// Saves the open song's separated tracks as WAV files in the chosen folder (by default
/// `Documents\Looplab\Tracce separate`), one folder per song, as they came out of the
/// separation: no level, speed or EQ applied.
#[tauri::command]
#[specta::specta]
pub async fn export_stems(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StemsRequest,
) -> Result<ExportedStems, AppError> {
    let rate = state.engine()?.sample_rate();
    let song = PathBuf::from(&request.path);
    let stem = cache_stem(&app, &song, rate)?;
    let library = app.state::<crate::db::Library>();
    let root = library.with(|conn| Ok(crate::stems_out::root(conn, library.places())?))?;
    let files = tauri::async_runtime::spawn_blocking(move || {
        let tracks = open_stems(&stem, rate)
            .ok_or_else(|| AppError::new(ErrorKind::NotSeparated, "no separated tracks"))?;
        let named: Vec<(&str, Pcm)> = SOURCES.iter().copied().zip(tracks).collect();
        crate::stems_out::save(&root, &song, &named)
            .map_err(|err| AppError::new(ErrorKind::ExportFailed, err))
    })
    .await
    .map_err(AppError::internal)??;
    Ok(ExportedStems {
        folder: files
            .first()
            .and_then(|f| f.parent())
            .map(|d| d.to_string_lossy().into_owned())
            .unwrap_or_default(),
        files: files
            .iter()
            .map(|f| f.to_string_lossy().into_owned())
            .collect(),
    })
}

/// The song as the model wants it: left and right at 44.1 kHz.
fn to_model_rate(pcm: &Pcm, mut progress: impl FnMut(f32)) -> Result<[Vec<f32>; 2], AppError> {
    const CHUNK: usize = 8192;
    let frames = pcm.frames() as usize;
    let mut resampler =
        StreamResampler::new(pcm.sample_rate(), SAMPLE_RATE).map_err(AppError::from)?;
    let capacity = frames * SAMPLE_RATE as usize / pcm.sample_rate().max(1) as usize + CHUNK;
    let (mut left, mut right) = (Vec::with_capacity(capacity), Vec::with_capacity(capacity));
    let mut sink = |chunk: &[f32]| {
        for [l, r] in chunk.as_chunks::<2>().0 {
            left.push(*l);
            right.push(*r);
        }
    };
    let mut interleaved = Vec::with_capacity(CHUNK * 2);
    for start in (0..frames).step_by(CHUNK) {
        interleaved.clear();
        for i in start..(start + CHUNK).min(frames) {
            interleaved.extend_from_slice(&pcm.frame(i));
        }
        resampler
            .push(&interleaved, &mut sink)
            .map_err(AppError::from)?;
        progress(start as f32 / frames.max(1) as f32);
    }
    resampler.finish(&mut sink).map_err(AppError::from)?;
    Ok([left, right])
}
