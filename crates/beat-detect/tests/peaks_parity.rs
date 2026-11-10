//! Peak picking against Beat This!'s minimal postprocessing (`tools/peaks_golden.py`).

use std::path::PathBuf;

use beat_detect::{FrameLogits, peaks};

fn golden(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden")
        .join(name)
}

#[test]
fn beats_match_postp_minimal() {
    let bytes = std::fs::read(golden("long.final0.logits.f32")).unwrap();
    let values: Vec<f32> = bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect();
    let logits: Vec<FrameLogits> = values
        .as_chunks::<2>()
        .0
        .iter()
        .map(|l| FrameLogits {
            beat: l[0],
            downbeat: l[1],
        })
        .collect();
    let expected: Vec<(f64, bool)> = std::fs::read_to_string(golden("long.final0.beats.txt"))
        .unwrap()
        .lines()
        .map(|line| {
            let (t, d) = line.split_once(' ').unwrap();
            (t.parse().unwrap(), d == "1")
        })
        .collect();
    let ours = peaks::beats(&logits);
    assert_eq!(ours.len(), expected.len(), "beat count");
    for (i, (b, (t, d))) in ours.iter().zip(&expected).enumerate() {
        assert!((b.time - t).abs() < 1e-6, "beat {i}: {} vs {t}", b.time);
        assert_eq!(b.downbeat, *d, "beat {i} at {t}: downbeat");
    }
}
