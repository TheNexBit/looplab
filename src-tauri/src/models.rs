//! The neural network models of "Analyse tempo" and "Separate instruments". They are not in the
//! installer or the portable ZIP: the app downloads each one once, when it is first needed, from
//! Looplab's own GitHub release, checks it against its SHA-256 and keeps it in the data folder
//! (`models\` beside the library; `dati\models` in the portable version).

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

/// Where the models are published (a release of Looplab's repository).
const BASE_URL: &str = "https://github.com/TheNexBit/looplab/releases/download/models-v1";

/// A model the app can download.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Model {
    /// Beat This! (beat and tempo analysis)
    Tempo,
    /// HTDemucs with 6 tracks (instrument separation)
    Stems,
}

/// What the app knows about a model's file.
pub struct ModelFile {
    pub file: &'static str,
    pub sha256: &'static str,
    pub bytes: u64,
}

impl Model {
    pub const fn file(self) -> ModelFile {
        match self {
            Self::Tempo => ModelFile {
                file: "beat_this-final0.onnx",
                sha256: "474ec0d3f127175236373666f5cb0077fef31d05d0d6e3581c2eebdd00aa0071",
                bytes: 83_162_644,
            },
            Self::Stems => ModelFile {
                file: "htdemucs_6s.onnx",
                sha256: "ed197a0d613c4734f1aeb893d69df6a37660ad8863b73a0cd6f9820094b87908",
                bytes: 114_560_299,
            },
        }
    }
}

/// The folder downloaded models are kept in.
pub fn dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(crate::paths::places(app)?.user.join("models"))
}

/// The model's file if it is there: downloaded, bundled beside the app, or (while developing)
/// in `src-tauri/models`.
pub fn find(app: &AppHandle, model: Model) -> Option<PathBuf> {
    let file = model.file().file;
    let downloaded = dir(app).ok().map(|dir| dir.join(file));
    downloaded
        .filter(|path| path.is_file())
        .or_else(|| crate::paths::model_file(app, file))
}

/// Why a download did not end with a good file.
#[derive(Debug)]
pub enum DownloadError {
    Cancelled,
    /// The server or the connection failed
    Network(String),
    /// The file arrived, but not the one expected (size or SHA-256)
    Damaged,
    Io(std::io::Error),
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancelled => f.write_str("download cancelled"),
            Self::Network(detail) => write!(f, "download failed: {detail}"),
            Self::Damaged => f.write_str("the downloaded model is not the expected file"),
            Self::Io(err) => write!(f, "cannot write the model: {err}"),
        }
    }
}

impl From<std::io::Error> for DownloadError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// Checks what was downloaded and gives it its name; a wrong file is removed.
pub fn finish(
    partial: &Path,
    target: &Path,
    expected: &ModelFile,
    sha256: &str,
    bytes: u64,
) -> Result<(), DownloadError> {
    if bytes != expected.bytes || !sha256.eq_ignore_ascii_case(expected.sha256) {
        let _ = std::fs::remove_file(partial);
        return Err(DownloadError::Damaged);
    }
    std::fs::rename(partial, target)?;
    Ok(())
}

/// Downloads `model` into `dir` (first as `.partial`), reporting 0..1 to `progress`; `cancel`
/// stops it. Nothing is left behind unless the file is complete and its SHA-256 matches.
pub async fn download(
    dir: &Path,
    model: Model,
    cancel: &AtomicBool,
    mut progress: impl FnMut(f32),
) -> Result<PathBuf, DownloadError> {
    let expected = model.file();
    std::fs::create_dir_all(dir)?;
    let target = dir.join(expected.file);
    let partial = dir.join(format!("{}.partial", expected.file));
    // The same TLS setup as the updater: installing it twice is harmless
    let _ = rustls::crypto::ring::default_provider().install_default();
    let network = |err: reqwest::Error| DownloadError::Network(err.to_string());
    let mut response = reqwest::Client::new()
        .get(format!("{BASE_URL}/{}", expected.file))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(network)?;
    let result = async {
        let mut file = std::fs::File::create(&partial)?;
        let mut hash = Sha256::new();
        let mut written = 0_u64;
        while let Some(chunk) = response.chunk().await.map_err(network)? {
            if cancel.load(Ordering::Relaxed) {
                return Err(DownloadError::Cancelled);
            }
            file.write_all(&chunk)?;
            hash.update(&chunk);
            written += chunk.len() as u64;
            progress((written as f64 / expected.bytes as f64).min(1.0) as f32);
        }
        file.flush()?;
        drop(file);
        let sha256 = format!("{:x}", hash.finalize());
        finish(&partial, &target, &expected, &sha256, written)
    }
    .await;
    if result.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    result.map(|()| target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn only_the_expected_file_takes_the_models_name() {
        let dir = temp_dir("models-finish");
        let expected = ModelFile {
            file: "m.onnx",
            sha256: "abc",
            bytes: 3,
        };
        let partial = dir.join("m.onnx.partial");
        let target = dir.join("m.onnx");
        std::fs::write(&partial, b"xyz").unwrap();
        assert!(matches!(
            finish(&partial, &target, &expected, "abd", 3),
            Err(DownloadError::Damaged)
        ));
        assert!(
            !partial.exists() && !target.exists(),
            "a wrong file is removed"
        );
        std::fs::write(&partial, b"xyz").unwrap();
        assert!(matches!(
            finish(&partial, &target, &expected, "abc", 2),
            Err(DownloadError::Damaged)
        ));
        std::fs::write(&partial, b"xyz").unwrap();
        finish(&partial, &target, &expected, "ABC", 3).unwrap();
        assert!(target.is_file() && !partial.exists());
    }

    #[test]
    fn the_known_hashes_are_well_formed() {
        for model in [Model::Tempo, Model::Stems] {
            let file = model.file();
            assert_eq!(file.sha256.len(), 64);
            assert!(file.sha256.chars().all(|c| c.is_ascii_hexdigit()));
            assert!(file.bytes > 1_000_000 && file.file.ends_with(".onnx"));
        }
    }
}
