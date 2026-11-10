//! The network run by rten against PyTorch (`tools/export_onnx.py`).
//!
//! The ONNX files (83 MB each) are not in the repository: they are read from the folder
//! `BEAT_THIS_MODELS` or from the reference folder of this PC. Every checkpoint found
//! there that has golden logits is checked; without any, the tests say so and pass.

use std::path::PathBuf;
use std::time::Instant;

use beat_detect::{BeatModel, FrameLogits};

const CHECKPOINTS: [&str; 4] = ["final0", "final1", "final2", "small0"];

/// The exported checkpoints present on this machine that have reference logits.
fn models() -> Vec<(&'static str, BeatModel)> {
    let dir = std::env::var_os("BEAT_THIS_MODELS")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"D:\sandbox\tempo-ref\models"));
    let found: Vec<_> = CHECKPOINTS
        .into_iter()
        .filter(|name| golden_path(&format!("long.{name}.logits.f32")).exists())
        .filter_map(|name| {
            let path = dir.join(format!("beat_this-{name}.onnx"));
            path.exists()
                .then(|| (name, BeatModel::load(&path).expect("model loads")))
        })
        .collect();
    if found.is_empty() {
        eprintln!("SKIPPED: no exported model in {}", dir.display());
    }
    found
}

fn golden_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden")
        .join(name)
}

fn golden(name: &str) -> Vec<f32> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden")
        .join(name);
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}

fn compare(case: &str, ours: &[FrameLogits], theirs: &[f32]) {
    assert_eq!(ours.len() * 2, theirs.len(), "{case}: frame count");
    let mut worst = (0.0f32, 0);
    for (i, (o, t)) in ours.iter().zip(theirs.as_chunks::<2>().0).enumerate() {
        let d = (o.beat - t[0]).abs().max((o.downbeat - t[1]).abs());
        if d > worst.0 {
            worst = (d, i);
        }
    }
    println!(
        "{case}: {} frames, max logit diff {:e} at frame {}",
        ours.len(),
        worst.0,
        worst.1
    );
    // Logits span about -15..10; rten and PyTorch agree to ~2e-5
    assert!(
        worst.0 < 1e-3,
        "{case}: logits off by {} at frame {}",
        worst.0,
        worst.1
    );
}

#[test]
fn single_calls_match_pytorch() {
    for (name, model) in models() {
        for case in ["mixed", "loud"] {
            let spect = golden(&format!("{case}.spect.f32"));
            let ours = model.run(&spect).expect("runs");
            compare(
                &format!("{name} {case}"),
                &ours,
                &golden(&format!("{case}.{name}.logits.f32")),
            );
        }
    }
}

#[test]
fn whole_piece_matches_spect2frames() {
    let spect = golden("long.spect.f32");
    for (name, model) in models() {
        let started = Instant::now();
        let mut steps = Vec::new();
        let ours = model.predict(&spect, |p| steps.push(p)).expect("runs");
        println!("{name}: 40 s of audio in {:?}", started.elapsed());
        assert_eq!(steps, vec![0.5, 1.0]);
        compare(
            &format!("{name} long"),
            &ours,
            &golden(&format!("long.{name}.logits.f32")),
        );
    }
}

#[test]
fn the_whole_chain_runs_from_samples_to_markers() {
    let dir = std::env::var_os("BEAT_THIS_MODELS")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"D:\sandbox\tempo-ref\models"));
    let path = dir.join("beat_this-final0.onnx");
    if !path.exists() {
        eprintln!("SKIPPED: no model at {}", path.display());
        return;
    }
    let analyzer = beat_detect::Analyzer::new(&path).expect("loads");
    let signal = golden("mixed.input.f32");
    let mut last = 0.0;
    let analysis = analyzer
        .analyze(&signal, &beat_detect::Hints::default(), |p| last = p)
        .expect("runs");
    assert_eq!(last, 1.0);
    assert!(!analysis.beats.is_empty());
    assert!(
        analysis
            .markers
            .iter()
            .all(|m| m.bpm.is_finite() && m.bpm > 0.0)
    );
}
