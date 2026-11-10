//! The network run by rten against PyTorch (`tools/export_demucs.py`). Model and
//! reference data are large and live outside the repository; without them this test
//! says so and passes.

use std::path::{Path, PathBuf};
use std::time::Instant;

fn read(path: &Path) -> Vec<f32> {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}

fn worst(ours: &[f32], theirs: &[f32]) -> (f32, f32) {
    assert_eq!(ours.len(), theirs.len());
    let diff = ours
        .iter()
        .zip(theirs)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f32::max);
    let scale = theirs.iter().map(|v| v.abs()).fold(0.0, f32::max);
    (diff, scale)
}

#[test]
fn one_segment_matches_pytorch() {
    let golden = PathBuf::from(r"D:\sandbox\tempo-ref\stems-golden");
    let model = PathBuf::from(r"D:\sandbox\tempo-ref\models\htdemucs_6s.onnx");
    if !model.exists() || !golden.exists() {
        eprintln!("SKIPPED: no model or reference data");
        return;
    }
    let net = stem_split::Network::load(&model).expect("loads");
    let mix = read(&golden.join("htdemucs_6s.mix.f32"));
    let mag = read(&golden.join("htdemucs_6s.mag.f32"));
    let frames = mag.len() / (4 * 2048);
    let started = Instant::now();
    let out = net.run(&mix, &mag, 2048, frames).expect("runs");
    println!("one 7.8 s segment in {:?}", started.elapsed());
    let (d, s) = worst(&out.spec, &read(&golden.join("htdemucs_6s.spec.f32")));
    println!("spec: max diff {d:e} on values up to {s}");
    assert!(d < 1e-3 * s.max(1.0), "spec off by {d}");
    let (d, s) = worst(&out.wave, &read(&golden.join("htdemucs_6s.wave.f32")));
    println!("wave: max diff {d:e} on values up to {s}");
    assert!(d < 1e-3 * s.max(1.0), "wave off by {d}");
}
