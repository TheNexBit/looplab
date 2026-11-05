use std::fmt::Display;

use audio_engine::{EngineError, LoadError};
use serde::Serialize;

/// What went wrong, as a stable code: the UI turns it into a translated message.
#[derive(Debug, Clone, Copy, Serialize, specta::Type)]
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
    Internal,
}

/// Error returned by every command. `detail` is technical text for logs, not for the user.
#[derive(Debug, Serialize, specta::Type)]
pub struct AppError {
    pub kind: ErrorKind,
    pub detail: String,
}

impl AppError {
    pub fn new(kind: ErrorKind, detail: impl Display) -> Self {
        Self {
            kind,
            detail: detail.to_string(),
        }
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
        };
        Self::new(kind, err)
    }
}

impl From<EngineError> for AppError {
    fn from(err: EngineError) -> Self {
        Self::new(ErrorKind::AudioDevice, err)
    }
}
