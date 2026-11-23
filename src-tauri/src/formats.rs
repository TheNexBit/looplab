//! The media files Looplab opens, by extension: one list for the whole app. The UI reads it
//! through the bindings (`AUDIO_FORMATS`, `VIDEO_FORMATS`), the lesson Home and the takes use
//! it here. Only containers and codecs the audio engine decodes (symphonia: MP3, AAC, ALAC,
//! FLAC, PCM, Vorbis in MP4, Matroska, Ogg, RIFF and AIFF) and the video view plays.

/// Audio files.
pub const AUDIO: &[&str] = &[
    "mp3", "wav", "wave", "flac", "m4a", "m4b", "aac", "ogg", "oga", "aiff", "aif", "mka",
];
/// Video files (their sound plays through the engine, their picture in the video view).
pub const VIDEO: &[&str] = &["mp4", "m4v", "mov", "mkv", "webm"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_are_lower_case_and_never_overlap() {
        for ext in AUDIO.iter().chain(VIDEO) {
            assert_eq!(*ext, ext.to_lowercase());
        }
        assert!(AUDIO.iter().all(|ext| !VIDEO.contains(ext)));
    }
}
