//! Beats to tempo map on synthetic logits: what a perfect (or slightly wrong) network
//! would output for pieces whose tempo map is known.

use beat_detect::tempo::tempo_map;
use beat_detect::{FPS, FrameLogits, Hints, Options, TempoMarker};

/// One bar: its beats and their length in seconds.
#[derive(Clone, Copy)]
struct Bar {
    beats: usize,
    beat_seconds: f64,
}

/// Beat times and downbeat flags of consecutive bars, from `start` seconds.
fn score(start: f64, bars: &[Bar]) -> Vec<(f64, bool)> {
    let mut t = start;
    let mut out = Vec::new();
    for bar in bars {
        for k in 0..bar.beats {
            out.push((t, k == 0));
            t += bar.beat_seconds;
        }
    }
    out
}

fn bars(count: usize, beats: usize, bpm_of_beat: f64) -> Vec<Bar> {
    vec![
        Bar {
            beats,
            beat_seconds: 60.0 / bpm_of_beat
        };
        count
    ]
}

/// Logits a network would give: a bump on each beat (and downbeat), negative elsewhere.
fn logits(score: &[(f64, bool)]) -> Vec<FrameLogits> {
    let fps = f64::from(FPS);
    let len = (score.last().unwrap().0 * fps) as usize + 50;
    let mut out = vec![
        FrameLogits {
            beat: -6.0,
            downbeat: -6.0
        };
        len
    ];
    for &(time, down) in score {
        let centre = time * fps;
        let first = (centre as usize).saturating_sub(2);
        let last = (centre as usize + 3).min(len);
        for (frame, value) in out[first..last].iter_mut().enumerate() {
            let bump = 5.0 - 2.0 * (((first + frame) as f64 - centre).abs() as f32);
            value.beat = value.beat.max(bump);
            if down {
                value.downbeat = value.downbeat.max(bump);
            }
        }
    }
    out
}

fn analyse(score: &[(f64, bool)], hints: &Hints) -> Vec<TempoMarker> {
    tempo_map(&logits(score), hints, &Options::default())
}

/// Every beat of the score lies on the grid of the markers, and every bar start on a
/// bar line, within `tolerance` seconds.
fn assert_on_grid(markers: &[TempoMarker], score: &[(f64, bool)], tolerance: f64) {
    let first = markers[0].time;
    for &(time, down) in score.iter().filter(|b| b.0 >= first - tolerance) {
        let i = markers.partition_point(|m| m.time <= time + tolerance) - 1;
        let m = markers[i];
        let beat = m.beat_seconds();
        let beats_in = (time - m.time) / beat;
        let off_beat = (beats_in - beats_in.round()).abs() * beat;
        assert!(
            off_beat < tolerance,
            "beat at {time:.3}: {off_beat:.3} s off the grid of {m:?}"
        );
        if down {
            let bar = f64::from(m.beats_per_bar);
            let bars_in = beats_in.round() / bar;
            assert!(
                (bars_in - bars_in.round()).abs() < 1e-6,
                "downbeat at {time:.3} is beat {} of a {}-beat bar of {m:?}",
                beats_in.round() as i64 % m.beats_per_bar as i64 + 1,
                m.beats_per_bar
            );
        }
    }
}

#[test]
fn a_click_track_is_one_marker() {
    let s = score(0.5, &bars(30, 4, 120.0));
    let m = analyse(&s, &Hints::default());
    assert_eq!(m.len(), 1, "{m:?}");
    assert!((m[0].bpm - 120.0).abs() < 0.05, "{m:?}");
    assert_eq!((m[0].beats_per_bar, m[0].beat_unit), (4, 4));
    assert!((m[0].time - 0.5).abs() < 0.011);
    assert_on_grid(&m, &s, 0.02);
}

#[test]
fn seven_eight_then_four_four() {
    // 7/8 at 280 eighths per minute (140 quarters), then 4/4 at 120
    let mut b = bars(16, 7, 280.0);
    b.extend(bars(16, 4, 120.0));
    let s = score(1.0, &b);
    let m = analyse(&s, &Hints::default());
    assert_eq!(m.len(), 2, "{m:?}");
    assert_eq!((m[0].beats_per_bar, m[0].beat_unit), (7, 8));
    assert!((m[0].bpm - 140.0).abs() < 0.1, "{m:?}");
    assert_eq!((m[1].beats_per_bar, m[1].beat_unit), (4, 4));
    assert!((m[1].bpm - 120.0).abs() < 0.1, "{m:?}");
    assert!((m[1].time - (1.0 + 16.0 * 7.0 * 60.0 / 280.0)).abs() < 0.011);
    assert_on_grid(&m, &s, 0.02);
}

#[test]
fn an_accelerando_gets_markers_that_follow_it() {
    // 100 → 130 BPM over 32 bars of 4/4, a little faster every beat
    let mut s = Vec::new();
    let mut t = 0.2;
    for k in 0..128 {
        s.push((t, k % 4 == 0));
        t += 60.0 / (100.0 + 30.0 * k as f64 / 127.0);
    }
    let m = analyse(&s, &Hints::default());
    assert!(m.len() >= 3 && m.len() <= 32, "{} markers", m.len());
    assert!(m.windows(2).all(|w| w[1].bpm > w[0].bpm), "{m:?}");
    assert!(m.iter().all(|m| m.beats_per_bar == 4));
    assert_on_grid(&m, &s, 0.035);
}

#[test]
fn slow_tempos_have_no_floor() {
    let s = score(0.0, &bars(12, 3, 40.0));
    let m = analyse(&s, &Hints::default());
    assert_eq!(m.len(), 1, "{m:?}");
    assert!((m[0].bpm - 40.0).abs() < 0.05, "{m:?}");
    assert_eq!(m[0].beats_per_bar, 3);
}

#[test]
fn network_mistakes_are_repaired() {
    let mut s = score(0.3, &bars(24, 4, 100.0));
    // A missed beat, a missed downbeat, a spurious beat and a spurious downbeat
    s.remove(21);
    s[40].1 = false;
    s.push((s[60].0 + 0.09, false));
    s[71].1 = true;
    s.sort_by(|a, b| a.0.total_cmp(&b.0));
    let m = analyse(&s, &Hints::default());
    assert_eq!(m.len(), 1, "{m:?}");
    assert!((m[0].bpm - 100.0).abs() < 0.05, "{m:?}");
    assert_eq!(m[0].beats_per_bar, 4);
}

#[test]
fn a_bar_start_set_by_the_user_fixes_the_phase() {
    // The network hears the downbeat on beat 2 of every bar
    let s = score(0.0, &bars(20, 4, 120.0));
    let wrong: Vec<(f64, bool)> = s
        .iter()
        .enumerate()
        .map(|(i, b)| (b.0, i % 4 == 1))
        .collect();
    let before = analyse(&wrong, &Hints::default());
    assert!((before[0].time - 0.5).abs() < 0.011, "{before:?}");
    // The user puts a bar start on the real first beat of bar 3
    let hints = Hints {
        downbeats: vec![4.0],
        ..Hints::default()
    };
    let after = analyse(&wrong, &hints);
    // Before it the network's phase stays (a short bar closes it); from it on, 4/4 on
    // the beats the user meant, to the end, with no more markers
    let last = after.last().unwrap();
    assert!((last.time - 4.0).abs() < 0.011, "{after:?}");
    assert_eq!((last.beats_per_bar, last.beat_unit), (4, 4), "{after:?}");
    assert!((last.bpm - 120.0).abs() < 0.05, "{after:?}");
    assert_on_grid(&after[after.len() - 1..], &s[8..], 0.02);
}

#[test]
fn locked_markers_are_kept() {
    let s = score(0.0, &bars(16, 4, 120.0));
    let lock = TempoMarker {
        time: 0.0,
        bpm: 60.0,
        beats_per_bar: 2,
        beat_unit: 4,
    };
    let m = analyse(
        &s,
        &Hints {
            locked: vec![lock],
            ..Hints::default()
        },
    );
    assert_eq!(m[0], lock);
}
