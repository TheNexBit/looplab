//! From the network's activations to a tempo map: Looplab's own postprocessing, in place
//! of the DBN Beat This! offers (which only knows 3/4 and 4/4 above 55 BPM).
//!
//! 1. Beats ([`track`]): one steady chain through the piece, at one beat level (never
//!    100 BPM here and 200 there), with no BPM range.
//! 2. Bars ([`meter`]): decided for the whole piece at once, any meter from 2 to 16 beats;
//!    a meter change only where the music keeps it up.
//! 3. Markers: a marker holds while its straight line (least squares over its beats)
//!    keeps every beat close; when the meter changes or the beats drift away, a new
//!    marker starts at that bar — as many as a band needs, one for a click track.
//!
//! What the user fixed by hand guides the rest: a bar start they set is one for sure, and
//! the network's bar lines are moved into that phase up to the next one they set; markers
//! they lock are kept as they are.

use crate::meter;
use crate::model::FrameLogits;
use crate::track::{self, Tracked};

/// A tempo marker as the app stores it (`TempoMarker` in `features/practice/tempo.ts`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TempoMarker {
    /// Seconds: the first beat of a bar
    pub time: f64,
    /// Quarter notes per minute
    pub bpm: f64,
    /// Time signature: beats in a bar over the note value of a beat
    pub beats_per_bar: u32,
    pub beat_unit: u32,
}

impl TempoMarker {
    /// Seconds per beat: a quarter in x/4, an eighth in x/8.
    pub fn beat_seconds(&self) -> f64 {
        60.0 / self.bpm * 4.0 / f64::from(self.beat_unit)
    }
}

/// What the user already decided.
#[derive(Debug, Clone, Default)]
pub struct Hints {
    /// Seconds where a bar starts for sure
    pub downbeats: Vec<f64>,
    /// Markers kept exactly as they are
    pub locked: Vec<TempoMarker>,
}

#[derive(Debug, Clone, Copy)]
pub struct Options {
    /// A marker holds while its beats stay this close to its grid (seconds, on average
    /// over a bar)…
    pub mean_error: f64,
    /// …and none of them further than this
    pub max_error: f64,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            mean_error: 0.020,
            max_error: 0.040,
        }
    }
}

/// A beat is "on" a hinted bar start within this distance (seconds).
const HINT_SNAP: f64 = 0.07;
/// A network bar line up to this many beats from a user's bar start is the same bar line
/// heard out of phase.
const HINT_REACH: usize = 3;
/// A beat whose downbeat probability is above this is a bar line the network heard.
const HEARD_DOWNBEAT: f32 = 0.5;

/// The beats and the tempo map of a piece from the network's activations.
pub fn analyze(
    logits: &[FrameLogits],
    hints: &Hints,
    options: &Options,
) -> (Vec<Tracked>, Vec<TempoMarker>) {
    let mut beats = track::track(logits);
    let forced = apply_downbeat_hints(&mut beats, &hints.downbeats);
    let down: Vec<f32> = beats.iter().map(|b| b.down).collect();
    let times: Vec<f64> = beats.iter().map(|b| b.time).collect();
    let bars = meter::bar_starts(&down, &forced, level(&times));
    let mut markers = markers(&times, &bars, options);
    merge_locked(&mut markers, &hints.locked);
    (beats, markers)
}

/// The tempo map alone.
pub fn tempo_map(logits: &[FrameLogits], hints: &Hints, options: &Options) -> Vec<TempoMarker> {
    analyze(logits, hints, options).1
}

/// Whether the tracked beats are quarters or eighths, from their typical interval.
fn level(times: &[f64]) -> meter::Level {
    let mut intervals: Vec<f64> = times.windows(2).map(|w| w[1] - w[0]).collect();
    intervals.sort_by(f64::total_cmp);
    match intervals.get(intervals.len() / 2) {
        Some(&x) if 60.0 / x >= FAST_BEATS => meter::Level::Eighths,
        _ => meter::Level::Quarters,
    }
}

/// Puts the user's bar starts among the beats (on the nearest one, or as a new beat) and
/// moves the network's bar lines after each of them into its phase, up to the next one.
/// Returns which beats are bar starts for sure.
fn apply_downbeat_hints(beats: &mut Vec<Tracked>, hints: &[f64]) -> Vec<bool> {
    let mut fixed_times = Vec::new();
    for &time in hints {
        let nearest = beats
            .iter()
            .enumerate()
            .min_by(|a, b| (a.1.time - time).abs().total_cmp(&(b.1.time - time).abs()))
            .map(|(i, b)| (i, (b.time - time).abs()));
        match nearest {
            Some((i, d)) if d <= HINT_SNAP => fixed_times.push(beats[i].time),
            _ => {
                let at = beats.partition_point(|b| b.time < time);
                beats.insert(at, Tracked { time, down: 1.0 });
                fixed_times.push(time);
            }
        }
    }
    let mut forced = vec![false; beats.len()];
    let mut fixed: Vec<usize> = fixed_times
        .iter()
        .filter_map(|&t| beats.iter().position(|b| b.time == t))
        .collect();
    fixed.sort_unstable();
    fixed.dedup();
    for &i in &fixed {
        forced[i] = true;
    }
    let heard = |b: &Tracked| b.down > HEARD_DOWNBEAT;
    for (n, &hint) in fixed.iter().enumerate() {
        let previous = if n > 0 { fixed[n - 1] + 1 } else { 0 };
        let next = fixed.get(n + 1).copied().unwrap_or(beats.len());
        let nearest = (hint.saturating_sub(HINT_REACH).max(previous)
            ..(hint + HINT_REACH + 1).min(next))
            .filter(|&i| i != hint && heard(&beats[i]))
            .min_by_key(|&i| i.abs_diff(hint));
        let Some(nearest) = nearest else { continue };
        let shift = hint as isize - nearest as isize;
        // The downbeat evidence of the section, moved by `shift` beats
        let old: Vec<f32> = beats.iter().map(|b| b.down).collect();
        for (i, beat) in beats.iter_mut().enumerate().take(next).skip(hint + 1) {
            let from = i as isize - shift;
            beat.down = if from >= 0 && (from as usize) < old.len() {
                old[from as usize]
            } else {
                0.0
            };
        }
    }
    forced
}

/// Least-squares line through (beat number, time): start time and seconds per beat.
fn fit(points: &[(f64, f64)]) -> (f64, f64) {
    let n = points.len() as f64;
    if points.len() < 2 {
        return (points.first().map_or(0.0, |p| p.1), 0.0);
    }
    let (sx, sy) = points
        .iter()
        .fold((0.0, 0.0), |(a, b), p| (a + p.0, b + p.1));
    let (mx, my) = (sx / n, sy / n);
    let (sxx, sxy) = points.iter().fold((0.0, 0.0), |(a, b), p| {
        (a + (p.0 - mx).powi(2), b + (p.0 - mx) * (p.1 - my))
    });
    let slope = if sxx > 0.0 { sxy / sxx } else { 0.0 };
    (my - slope * mx, slope)
}

/// Whether every bar of a fitted stretch stays on the line.
fn fits(points: &[(f64, f64)], bar_ends: &[usize], options: &Options) -> bool {
    let (start, period) = fit(points);
    if period <= 0.0 {
        return false;
    }
    let error = |p: &(f64, f64)| (start + period * p.0 - p.1).abs();
    let mut from = 0;
    for &to in bar_ends {
        let bar = &points[from..to];
        let mean = bar.iter().map(error).sum::<f64>() / bar.len().max(1) as f64;
        if mean > options.mean_error || bar.iter().any(|p| error(p) > options.max_error) {
            return false;
        }
        from = to;
    }
    true
}

/// How a bar of `beats` counted beats is written: (beats per bar, note value). Counted
/// beats this fast are eighths, and the tempo is always given in quarters, so a song
/// reads 100 BPM throughout instead of 200 in 4/4 and 100 in 7/8: an odd bar of
/// eighths is n/8, an even one is (n/2)/4 (8 eighths = 4/4).
fn notation(beats: usize, beats_per_minute: f64) -> (u32, u32) {
    let n = beats as u32;
    if beats_per_minute < FAST_BEATS {
        (n, 4)
    } else if n % 2 == 1 || n == 2 {
        (n, 8)
    } else {
        (n / 2, 4)
    }
}

/// Counted beats at least this many per minute are eighths.
const FAST_BEATS: f64 = 180.0;

fn markers(beats: &[f64], bars: &[usize], options: &Options) -> Vec<TempoMarker> {
    let Some(&first) = bars.first() else {
        return Vec::new();
    };
    // Bars as beat ranges; the last runs to the last beat
    let mut ranges: Vec<(usize, usize)> = bars.windows(2).map(|w| (w[0], w[1])).collect();
    if let Some(&last) = bars.last()
        && last + 1 < beats.len()
    {
        ranges.push((last, beats.len()));
    }
    if ranges.is_empty() {
        ranges.push((first, beats.len()));
    }
    // The last, incomplete bar keeps the meter before it
    let meter = |j: usize| {
        let (a, b) = ranges[j];
        if j + 1 == ranges.len() && j > 0 && bars.last() == Some(&a) {
            ranges[j - 1].1 - ranges[j - 1].0
        } else {
            b - a
        }
    };

    let mut markers = Vec::new();
    let mut j = 0;
    while j < ranges.len() {
        let meter_here = meter(j);
        let origin = ranges[j].0;
        let mut end = j + 1;
        while end < ranges.len() && meter(end) == meter_here {
            let points: Vec<(f64, f64)> = (origin..ranges[end].1)
                .map(|i| ((i - origin) as f64, beats[i]))
                .collect();
            let bar_ends: Vec<usize> = ranges[j..=end].iter().map(|r| r.1 - origin).collect();
            if !fits(&points, &bar_ends, options) {
                break;
            }
            end += 1;
        }
        let points: Vec<(f64, f64)> = (origin..ranges[end - 1].1)
            .map(|i| ((i - origin) as f64, beats[i]))
            .collect();
        let (start, mut period) = fit(&points);
        if period <= 0.0 {
            // A single beat: borrow the previous marker's tempo, or the next interval
            period = beats.get(origin + 1).map_or(0.5, |b| b - beats[origin]);
        }
        let per_minute = 60.0 / period;
        let (beats_per_bar, unit) = notation(meter_here, per_minute);
        // In x/4 written from eighths a quarter is two counted beats
        let quarters = if unit == 4 && per_minute >= FAST_BEATS {
            per_minute / 2.0
        } else {
            per_minute * 4.0 / f64::from(unit)
        };
        markers.push(TempoMarker {
            time: start.max(0.0),
            bpm: quarters,
            beats_per_bar,
            beat_unit: unit,
        });
        j = end;
    }
    markers
}

/// Locked markers replace whatever the analysis put within half a bar of them.
fn merge_locked(markers: &mut Vec<TempoMarker>, locked: &[TempoMarker]) {
    for lock in locked {
        let reach = lock.beat_seconds() * f64::from(lock.beats_per_bar) / 2.0;
        markers.retain(|m| (m.time - lock.time).abs() >= reach);
        let at = markers.partition_point(|m| m.time < lock.time);
        markers.insert(at, *lock);
    }
}
