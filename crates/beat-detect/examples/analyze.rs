//! Development tool: the whole analysis on a song, outside the app.
//!
//!     cargo run --release -p beat-detect --example analyze -- <song.f32> [model.onnx]
//!
//! `<song.f32>` is mono 22050 Hz little-endian float, e.g. from
//! `ffmpeg -i song.mp3 -ac 1 -ar 22050 -f f32le song.f32`. The network's logits are cached
//! next to it (`<song.f32>.logits`), so changing the tempo layer reruns in milliseconds.
//! Writes `<song.f32>.beats.tsv` (time, beat and downbeat logits, downbeat flag) and prints
//! the markers.

use std::path::{Path, PathBuf};

use beat_detect::{FrameLogits, Hints, LogMelSpectrogram, Options, peaks};

fn read_f32(path: &Path) -> Vec<f32> {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|b| f32::from_le_bytes(*b))
        .collect()
}

fn main() {
    let mut args = std::env::args().skip(1);
    let song = PathBuf::from(args.next().expect("usage: analyze <song.f32> [model.onnx]"));
    let model = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"D:\sandbox\tempo-ref\models\beat_this-final0.onnx"));
    let cache = song.with_extension("f32.logits");

    let logits: Vec<FrameLogits> = if cache.exists() {
        read_f32(&cache)
            .as_chunks::<2>()
            .0
            .iter()
            .map(|l| FrameLogits {
                beat: l[0],
                downbeat: l[1],
            })
            .collect()
    } else {
        let signal = read_f32(&song);
        let started = std::time::Instant::now();
        let spect = LogMelSpectrogram::new().compute(&signal);
        let net = beat_detect::BeatModel::load(&model).expect("model");
        let logits = net.predict(&spect, |_| {}).expect("runs");
        eprintln!(
            "{:.0} s of audio analysed in {:?}",
            signal.len() as f64 / 22050.0,
            started.elapsed()
        );
        let bytes: Vec<u8> = logits
            .iter()
            .flat_map(|l| [l.beat.to_le_bytes(), l.downbeat.to_le_bytes()])
            .flatten()
            .collect();
        std::fs::write(&cache, bytes).expect("cache written");
        logits
    };

    let beats = peaks::beats(&logits);
    let tsv: String = beats
        .iter()
        .map(|b| {
            format!(
                "{:.3}\t{:.2}\t{:.2}\t{}\n",
                b.time, b.strength, b.downbeat_strength, b.downbeat as u8
            )
        })
        .collect();
    std::fs::write(song.with_extension("f32.beats.tsv"), tsv).expect("tsv written");

    let (tracked, markers) =
        beat_detect::tempo::analyze(&logits, &Hints::default(), &Options::default());
    let tracked_tsv: String = tracked
        .iter()
        .map(|b| format!("{:.3}\t{:.2}\n", b.time, b.down))
        .collect();
    std::fs::write(song.with_extension("f32.tracked.tsv"), tracked_tsv).expect("tsv written");
    println!(
        "{} network beats, {} tracked beats, {} markers",
        beats.len(),
        tracked.len(),
        markers.len()
    );
    for m in &markers {
        println!(
            "{:8.2}  {:7.2} BPM  {}/{}",
            m.time, m.bpm, m.beats_per_bar, m.beat_unit
        );
    }
}
