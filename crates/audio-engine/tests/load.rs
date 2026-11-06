//! End-to-end loading of real files written to the cargo temp folder (on the Dev Drive).

use std::f32::consts::TAU;
use std::path::PathBuf;

use audio_engine::{LoadError, load};

fn temp_file(name: &str, bytes: &[u8]) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    std::fs::write(&path, bytes).unwrap();
    path
}

/// Minimal 16-bit PCM WAV file.
fn wav(sample_rate: u32, channels: u16, samples: &[i16]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let block_align = channels * 2;
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * u32::from(block_align)).to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&16_u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    bytes
}

fn sine_i16(frames: usize, rate: u32) -> Vec<i16> {
    (0..frames)
        .map(|i| ((i as f32 * 440.0 * TAU / rate as f32).sin() * 16_000.0) as i16)
        .collect()
}

#[test]
fn loads_a_mono_wav_and_resamples_it() {
    let path = temp_file("mono-44k.wav", &wav(44_100, 1, &sine_i16(44_100, 44_100)));
    let mut last_progress = 0.0;
    let track = load(&path, 48_000, |p| last_progress = p).unwrap();

    assert_eq!(track.source_sample_rate, 44_100);
    assert_eq!(track.pcm.sample_rate(), 48_000);
    assert_eq!(track.pcm.frames(), 48_000);
    assert!((track.pcm.duration_seconds() - 1.0).abs() < 1e-6);
    assert_eq!(last_progress, 1.0);

    // Mono is duplicated on both sides
    let [l, r] = track.pcm.frame(1_000);
    assert!((l - r).abs() < 1e-6);
    assert!(!track.peaks.levels.is_empty());
}

#[test]
fn loads_a_stereo_wav_at_the_same_rate() {
    let mono = sine_i16(4_800, 48_000);
    let stereo: Vec<i16> = mono.iter().flat_map(|&s| [s, s / 2]).collect();
    let path = temp_file("stereo-48k.wav", &wav(48_000, 2, &stereo));
    let track = load(&path, 48_000, |_| {}).unwrap();

    assert_eq!(track.pcm.frames(), 4_800);
    let [l, r] = track.pcm.frame(100);
    assert!((l / 2.0 - r).abs() < 1e-3);
}

#[test]
fn rejects_files_that_are_not_audio() {
    let path = temp_file(
        "not-audio.mp3",
        b"this is just text, not an mp3 file at all",
    );
    assert!(matches!(
        load(&path, 48_000, |_| {}),
        Err(LoadError::UnsupportedFormat)
    ));
}

#[test]
fn reports_missing_files() {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("does-not-exist.wav");
    assert!(matches!(load(&path, 48_000, |_| {}), Err(LoadError::Io(_))));
}

/// Waits for the background loader of `open` and returns its last event.
fn open_and_wait(
    path: &std::path::Path,
    stem: &std::path::Path,
) -> (audio_engine::OpenedTrack, audio_engine::LoadEvent) {
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;
    let (tx, rx) = std::sync::mpsc::channel();
    let track = audio_engine::open(
        path,
        48_000,
        stem,
        Arc::new(AtomicBool::new(false)),
        move |e| {
            if matches!(e, audio_engine::LoadEvent::Done { .. }) {
                let _ = tx.send(e);
            }
        },
    )
    .unwrap();
    let done = rx.recv_timeout(std::time::Duration::from_secs(30)).unwrap();
    (track, done)
}

#[test]
fn open_plays_early_fills_a_cache_file_and_reuses_it() {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("open-cache");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // Ten seconds at 44.1 kHz: more than the first seconds `open` waits for
    let path = temp_file("open-10s.wav", &wav(44_100, 1, &sine_i16(441_000, 44_100)));
    let stem = dir.join("track");

    let (first, done) = open_and_wait(&path, &stem);
    assert!(
        matches!(
            done,
            audio_engine::LoadEvent::Done {
                frames: 480_000,
                error: None
            }
        ),
        "{done:?}"
    );
    assert!(first.pcm.is_complete());
    assert_eq!(first.pcm.frames(), 480_000);
    let peaks = first.peaks.lock().unwrap().peaks().clone();
    assert_eq!(peaks.levels[0].bins(), 480_000 / 32);
    let sample = first.pcm.frame(123_456);
    drop(first);

    // Second time: straight from the cache, same audio and waveform
    let (again, _) = open_and_wait(&path, &stem);
    assert!(again.pcm.is_complete());
    assert_eq!(again.pcm.frame(123_456), sample);
    assert_eq!(*again.peaks.lock().unwrap().peaks(), peaks);
}

#[test]
fn a_cancelled_open_stops_and_keeps_what_it_has() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("open-cancel");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = temp_file(
        "open-60s.wav",
        &wav(48_000, 2, &sine_i16(48_000 * 2 * 60, 48_000)),
    );
    let cancel = Arc::new(AtomicBool::new(false));
    let (tx, rx) = std::sync::mpsc::channel();
    let track = audio_engine::open(
        &path,
        48_000,
        &dir.join("t"),
        Arc::clone(&cancel),
        move |e| {
            if let audio_engine::LoadEvent::Done { error, .. } = e {
                let _ = tx.send(error);
            }
        },
    )
    .unwrap();
    cancel.store(true, Ordering::Relaxed);
    let error = rx.recv_timeout(std::time::Duration::from_secs(30)).unwrap();
    assert!(track.pcm.is_complete());
    // It either finished before noticing, or stopped with what it had
    if let Some(error) = error {
        assert!(matches!(error, LoadError::Cancelled));
        assert_eq!(track.pcm.frames(), track.pcm.ready_frames());
    }
    // Never reused: an unfinished file has no "complete" mark
    assert!(
        audio_engine::pcm::Pcm::open_file(&dir.join("t.pcm"), 48_000).is_none()
            || error_free(&track)
    );
}

fn error_free(track: &audio_engine::OpenedTrack) -> bool {
    track.pcm.frames() == 48_000 * 60
}
