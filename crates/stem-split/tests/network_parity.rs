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

fn golden_dir() -> Option<(PathBuf, PathBuf)> {
    let golden = PathBuf::from(r"D:\sandbox\tempo-ref\stems-golden");
    let model = PathBuf::from(r"D:\sandbox\tempo-ref\models\htdemucs_6s.onnx");
    (model.exists() && golden.exists()).then_some((golden, model))
}

#[test]
fn the_spectrogram_matches_torch() {
    let Some((golden, _)) = golden_dir() else {
        return;
    };
    let mix = read(&golden.join("htdemucs_6s.mix.f32"));
    let theirs = read(&golden.join("htdemucs_6s.mag.f32"));
    let length = mix.len() / 2;
    let frames = stem_split::spec::frames(length);
    let spec = stem_split::spec::Spectrogram::new();
    let bins = stem_split::spec::BINS;
    let mut ours = vec![0.0f32; theirs.len()];
    for c in 0..2 {
        let z = spec.forward(&mix[c * length..(c + 1) * length]);
        for t in 0..frames {
            for f in 0..bins {
                ours[((2 * c) * bins + f) * frames + t] = z[t * bins + f].re;
                ours[((2 * c + 1) * bins + f) * frames + t] = z[t * bins + f].im;
            }
        }
    }
    let (d, s) = worst(&ours, &theirs);
    println!("mag: max diff {d:e} on values up to {s}");
    assert!(d < 1e-4 * s.max(1.0), "mag off by {d}");
}

#[test]
fn one_whole_segment_matches_the_model() {
    let Some((golden, model)) = golden_dir() else {
        return;
    };
    let mix = read(&golden.join("htdemucs_6s.mix.f32"));
    let length = mix.len() / 2;
    let separator = stem_split::Separator::new(stem_split::Network::load(&model).unwrap(), 6);
    let sources = separator.segment(&mix[..length], &mix[length..]).unwrap();
    let ours: Vec<f32> = sources
        .iter()
        .flat_map(|s| s.iter().flatten().copied())
        .collect();
    let (d, s) = worst(&ours, &read(&golden.join("htdemucs_6s.full.f32")));
    println!("segment: max diff {d:e} on values up to {s}");
    assert!(d < 1e-3 * s.max(1.0), "segment off by {d}");
}

#[test]
fn forty_seconds_match_demucs_separate_tensor() {
    let Some((golden, model)) = golden_dir() else {
        return;
    };
    let excerpt = read(&golden.join("excerpt.f32"));
    let theirs = read(&golden.join("excerpt.htdemucs_6s.f32"));
    let length = excerpt.len() / 2;
    let separator = stem_split::Separator::new(stem_split::Network::load(&model).unwrap(), 6);
    let started = Instant::now();
    let mut steps = 0;
    let sources = separator
        .separate(&excerpt[..length], &excerpt[length..], |_| steps += 1)
        .unwrap();
    println!("40 s in {:?}, {steps} segments", started.elapsed());
    let ours: Vec<f32> = sources
        .iter()
        .flat_map(|s| s.iter().flatten().copied())
        .collect();
    let (d, s) = worst(&ours, &theirs);
    println!("40 s: max diff {d:e} on values up to {s}");
    assert!(d < 1e-3 * s.max(1.0), "excerpt off by {d}");
}
