use std::fmt::Display;

use audio_engine::{EngineError, LoadError};
use serde::{Deserialize, Serialize};

/// What went wrong, as a stable code: the UI turns it into a translated message.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    FileNotFound,
    FileUnreadable,
    UnsupportedFormat,
    UnsupportedCodec,
    NoAudioTrack,
    EmptyFile,
    CorruptFile,
    AudioDevice,
    NoTrack,
    ProjectFile,
    FfmpegMissing,
    FfmpegFailed,
    /// The user stopped it: not a problem, never shown as one
    Cancelled,
    ExportFailed,
    /// The track is still loading in the background
    StillLoading,
    /// The beat-tracking model is not installed (scripts/10-modello-tempo.cmd)
    TempoModelMissing,
    /// The stem separation model is not installed (scripts/11-modello-strumenti.cmd)
    StemModelMissing,
    /// The open song has no separated tracks to export
    NotSeparated,
    /// The library (libreria.db) could not be read or written
    Library,
    /// A backup could not be made or put back
    Backup,
    /// A score file over the size limit (200 MB)
    ScoreTooLarge,
    /// The library's copy of a linked score is gone
    ScoreMissing,
    Internal,
}

/// Error returned by every command. `detail` is technical text for logs, not for the user.
#[derive(Debug, Serialize, specta::Type)]
pub struct AppError {
    pub kind: ErrorKind,
    pub detail: String,
}

impl AppError {
    /// Every error is written to the log, except "no track" (a key pressed early) and "cancelled".
    pub fn new(kind: ErrorKind, detail: impl Display) -> Self {
        let detail = detail.to_string();
        if !matches!(kind, ErrorKind::NoTrack | ErrorKind::Cancelled) {
            crate::log::error("command", &format!("{kind:?}: {detail}"));
        }
        Self { kind, detail }
    }

    pub fn internal(detail: impl Display) -> Self {
        Self::new(ErrorKind::Internal, detail)
    }
}

impl From<LoadError> for AppError {
    fn from(err: LoadError) -> Self {
        let kind = match &err {
            LoadError::Io(io) if io.kind() == std::io::ErrorKind::NotFound => {
                ErrorKind::FileNotFound
            }
            LoadError::Io(_) => ErrorKind::FileUnreadable,
            LoadError::UnsupportedFormat => ErrorKind::UnsupportedFormat,
            LoadError::UnsupportedCodec => ErrorKind::UnsupportedCodec,
            LoadError::NoAudioTrack => ErrorKind::NoAudioTrack,
            LoadError::Empty => ErrorKind::EmptyFile,
            LoadError::Corrupt(_) => ErrorKind::CorruptFile,
            LoadError::Cancelled => ErrorKind::Cancelled,
        };
        Self::new(kind, err)
    }
}

impl From<crate::media::MediaError> for AppError {
    fn from(err: crate::media::MediaError) -> Self {
        let kind = match err {
            crate::media::MediaError::Missing => ErrorKind::FfmpegMissing,
            _ => ErrorKind::FfmpegFailed,
        };
        Self::new(kind, err)
    }
}

impl From<EngineError> for AppError {
    fn from(err: EngineError) -> Self {
        Self::new(ErrorKind::AudioDevice, err)
    }
}
