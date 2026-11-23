//! The Rust spectrogram against the values Beat This! computes in Python
//! (`tests/golden/make_golden.py`, run once with the reference environment).

mod common;

use beat_detect::N_MELS;
use beat_detect::spectrogram::{LogMelSpectrogram, N_BINS, mel_filterbank};
use common::golden;

/// Largest absolute difference, and where it is.
fn worst(ours: &[f32], theirs: &[f32]) -> (f32, usize) {
    assert_eq!(ours.len(), theirs.len(), "different sizes");
    ours.iter()
        .zip(theirs)
        .map(|(a, b)| (a - b).abs())
        .enumerate()
        .fold((0.0, 0), |acc, (i, d)| if d > acc.0 { (d, i) } else { acc })
}

#[test]
fn filterbank_matches_torchaudio() {
    let theirs = golden("mel_fbank.f32");
    assert_eq!(theirs.len(), N_BINS * N_MELS);
    let (diff, at) = worst(&mel_filterbank(), &theirs);
    assert!(
        diff < 1e-6,
        "filter weight off by {diff} at bin {}, band {}",
        at / N_MELS,
        at % N_MELS
    );
}

#[test]
fn spectrogram_matches_beat_this() {
    let spect = LogMelSpectrogram::new();
    for case in ["mixed", "short", "silence", "loud"] {
        let input = golden(&format!("{case}.input.f32"));
        let theirs = golden(&format!("{case}.spect.f32"));
        let ours = spect.compute(&input);
        let (diff, at) = worst(&ours, &theirs);
        println!("{case}: {} frames, max diff {diff:e}", ours.len() / N_MELS);
        // Values go up to ~8; two float32 FFT implementations agree to ~1e-5
        assert!(
            diff < 5e-5,
            "{case}: off by {diff} at frame {}, band {} ({} vs {})",
            at / N_MELS,
            at % N_MELS,
            ours[at],
            theirs[at]
        );
    }
}
