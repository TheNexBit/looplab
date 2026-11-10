//! From detected beats to a tempo map: Looplab's own postprocessing, in place of the
//! DBN Beat This! offers (which only knows 3/4 and 4/4 above 55 BPM).
//!
//! 1. Clean the beat list: a beat far too close to the previous one is dropped, a gap of
//!    two to four beats is filled. The reference is the local median interval, so slow
//!    tempos, fast ones and accelerandos are all fine: there is no BPM range.
//! 2. Bars run from downbeat to downbeat; their beat count is the meter, so any meter is
//!    possible (7/8, 11/8, a single 2/4 bar…). Obvious downbeat mistakes are repaired:
//!    a missed downbeat doubles a bar, a spurious one splits it in two.
//! 3. Markers: a marker holds while its straight line (least squares over its beats)
//!    keeps every beat close; when the meter changes or the beats drift away, a new
//!    marker starts at that bar — as many as a band needs, one for a click track.
//!
//! What the user fixed by hand guides the rest: bar starts they set override the
//! network's downbeats nearby, and markers they lock are kept as they are.

use crate::peaks::Beat;

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
    /// A gap longer than this many beats is a break: nothing is filled in
    pub max_gap_beats: f64,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            mean_error: 0.020,
            max_error: 0.035,
            max_gap_beats: 4.5,
        }
    }
}

/// Meter used when the network found no downbeat at all.
const DEFAULT_BEATS_PER_BAR: usize = 4;
/// A beat is "on" a hinted bar start within this distance (seconds).
const HINT_SNAP: f64 = 0.07;
/// A network downbeat up to this many beats from a user's bar start is the same bar
/// line heard out of phase.
const HINT_REACH: usize = 3;

/// The tempo map of a piece from its beats.
pub fn tempo_map(beats: &[Beat], hints: &Hints, options: &Options) -> Vec<TempoMarker> {
    let mut beats = clean_beats(beats, options);
    apply_downbeat_hints(&mut beats, &hints.downbeats);
    let bars = bars(&beats);
    let mut markers = markers(&beats, &bars, options);
    merge_locked(&mut markers, &hints.locked);
    markers
}

/// Median of a few values (they are copied: the windows are small).
fn median(values: &[f64]) -> f64 {
    let mut v = values.to_vec();
    v.sort_by(f64::total_cmp);
    let n = v.len();
    if n == 0 {
        0.0
    } else if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

/// Typical interval around interval `i`: the median of the 9 nearest ones.
fn local_interval(intervals: &[f64], i: usize) -> f64 {
    let from = i.saturating_sub(4);
    let to = (i + 5).min(intervals.len());
    median(&intervals[from..to])
}

fn clean_beats(beats: &[Beat], options: &Options) -> Vec<Beat> {
    let mut beats = beats.to_vec();
    // Spurious beats: drop the weaker of two that are far too close, moving its
    // downbeat flag to the survivor
    loop {
        let intervals: Vec<f64> = beats.windows(2).map(|w| w[1].time - w[0].time).collect();
        let Some(i) =
            (0..intervals.len()).find(|&i| intervals[i] < 0.55 * local_interval(&intervals, i))
        else {
            break;
        };
        let (keep, drop) = if beats[i].strength >= beats[i + 1].strength {
            (i, i + 1)
        } else {
            (i + 1, i)
        };
        if beats[drop].downbeat {
            beats[keep].downbeat = true;
            beats[keep].downbeat_strength = beats[keep]
                .downbeat_strength
                .max(beats[drop].downbeat_strength);
        }
        beats.remove(drop);
    }
    // Missed beats: a gap of about 2, 3 or 4 beats gets the missing ones, evenly spaced
    let intervals: Vec<f64> = beats.windows(2).map(|w| w[1].time - w[0].time).collect();
    let mut out = Vec::with_capacity(beats.len());
    for (i, beat) in beats.iter().enumerate() {
        out.push(*beat);
        let Some(&gap) = intervals.get(i) else {
            continue;
        };
        let typical = local_interval(&intervals, i);
        let ratio = gap / typical;
        let missing = ratio.round();
        if missing >= 2.0 && ratio <= options.max_gap_beats && (ratio - missing).abs() < 0.25 {
            for k in 1..missing as usize {
                out.push(Beat {
                    time: beat.time + gap * k as f64 / missing,
                    downbeat: false,
                    strength: 0.0,
                    downbeat_strength: f32::NEG_INFINITY,
                });
            }
        }
    }
    out
}

/// Bar starts the user set win over the network's downbeats around them.
fn apply_downbeat_hints(beats: &mut Vec<Beat>, hints: &[f64]) {
    for &time in hints {
        let nearest = beats
            .iter()
            .enumerate()
            .min_by(|a, b| (a.1.time - time).abs().total_cmp(&(b.1.time - time).abs()))
            .map(|(i, b)| (i, (b.time - time).abs()));
        let index = match nearest {
            Some((i, d)) if d <= HINT_SNAP => i,
            _ => {
                let at = beats.partition_point(|b| b.time < time);
                beats.insert(
                    at,
                    Beat {
                        time,
                        downbeat: true,
                        strength: f32::INFINITY,
                        downbeat_strength: f32::INFINITY,
                    },
                );
                at
            }
        };
        beats[index].downbeat = true;
        beats[index].downbeat_strength = f32::INFINITY;
        beats[index].strength = f32::INFINITY;
    }
    // From each bar start the user set until the next one, the network's downbeats move
    // by the same number of beats: if it heard the bar one beat late here, it did so in
    // the whole section
    let fixed: Vec<usize> = (0..beats.len())
        .filter(|&i| beats[i].downbeat_strength == f32::INFINITY)
        .collect();
    let network = |b: &Beat| b.downbeat && b.downbeat_strength.is_finite();
    for (n, &hint) in fixed.iter().enumerate() {
        let previous = if n > 0 { fixed[n - 1] + 1 } else { 0 };
        let next = fixed.get(n + 1).copied().unwrap_or(beats.len());
        let nearest = (hint.saturating_sub(HINT_REACH).max(previous)
            ..(hint + HINT_REACH + 1).min(next))
            .filter(|&i| i != hint && network(&beats[i]))
            .min_by_key(|&i| i.abs_diff(hint));
        let Some(nearest) = nearest else { continue };
        let shift = hint as isize - nearest as isize;
        let moved: Vec<(usize, f32)> = (nearest.min(hint)..next)
            .filter(|&i| i != hint && network(&beats[i]))
            .map(|i| (i, beats[i].downbeat_strength))
            .collect();
        for &(i, _) in &moved {
            beats[i].downbeat = false;
        }
        for (i, strength) in moved {
            let to = i as isize + shift;
            if to > hint as isize && (to as usize) < next {
                let b = &mut beats[to as usize];
                b.downbeat = true;
                b.downbeat_strength = b.downbeat_strength.max(strength);
            }
        }
    }
}

/// Beat indices where bars start, repaired. With no downbeat at all, bars of
/// [`DEFAULT_BEATS_PER_BAR`] from the first beat.
fn bars(beats: &[Beat]) -> Vec<usize> {
    let mut starts: Vec<usize> = (0..beats.len()).filter(|&i| beats[i].downbeat).collect();
    if starts.is_empty() {
        return (0..beats.len()).step_by(DEFAULT_BEATS_PER_BAR).collect();
    }
    let strength = |i: usize| beats[i].downbeat_strength;
    let typical = {
        let finite: Vec<f64> = starts
            .iter()
            .map(|&i| f64::from(strength(i)))
            .filter(|s| s.is_finite())
            .collect();
        median(&finite) as f32
    };
    let counts =
        |starts: &[usize]| -> Vec<usize> { starts.windows(2).map(|w| w[1] - w[0]).collect() };

    // A one-beat bar is a stray downbeat: drop the weaker of the two
    loop {
        let c = counts(&starts);
        let Some(j) = c.iter().position(|&n| n == 1) else {
            break;
        };
        let drop = if strength(starts[j]) < strength(starts[j + 1]) {
            j
        } else {
            j + 1
        };
        starts.remove(drop);
    }
    // Two neighbouring bars adding up to the meter around them, split by a weak
    // downbeat: one bar
    loop {
        let c = counts(&starts);
        let merge = (0..c.len().saturating_sub(1)).find(|&j| {
            let sum = c[j] + c[j + 1];
            let around = [j.checked_sub(1).map(|k| c[k]), c.get(j + 2).copied()];
            around.contains(&Some(sum)) && strength(starts[j + 1]) < typical
        });
        let Some(j) = merge else { break };
        starts.remove(j + 1);
    }
    // A bar twice as long as a neighbour: a missed downbeat in the middle
    let c = counts(&starts);
    let mut extra = Vec::new();
    for (j, &n) in c.iter().enumerate() {
        let neighbour = j
            .checked_sub(1)
            .map(|k| c[k])
            .filter(|&m| m >= 2 && n == 2 * m)
            .or_else(|| c.get(j + 1).copied().filter(|&m| m >= 2 && n == 2 * m));
        if let Some(m) = neighbour {
            extra.push(starts[j] + m);
        }
    }
    starts.extend(extra);
    starts.sort_unstable();
    starts
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

/// x/8 when the counted beats are fast eighths of an odd meter (7/8 at 280 eighths per
/// minute), otherwise x/4.
fn beat_unit(beats_per_bar: usize, beats_per_minute: f64) -> u32 {
    if beats_per_bar >= 5 && beats_per_bar % 2 == 1 && beats_per_minute >= 180.0 {
        8
    } else {
        4
    }
}

fn markers(beats: &[Beat], bars: &[usize], options: &Options) -> Vec<TempoMarker> {
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
                .map(|i| ((i - origin) as f64, beats[i].time))
                .collect();
            let bar_ends: Vec<usize> = ranges[j..=end].iter().map(|r| r.1 - origin).collect();
            if !fits(&points, &bar_ends, options) {
                break;
            }
            end += 1;
        }
        let points: Vec<(f64, f64)> = (origin..ranges[end - 1].1)
            .map(|i| ((i - origin) as f64, beats[i].time))
            .collect();
        let (start, mut period) = fit(&points);
        if period <= 0.0 {
            // A single beat: borrow the previous marker's tempo, or the next interval
            period = beats
                .get(origin + 1)
                .map_or(0.5, |b| b.time - beats[origin].time);
        }
        let per_minute = 60.0 / period;
        let unit = beat_unit(meter_here, per_minute);
        markers.push(TempoMarker {
            time: start.max(0.0),
            bpm: per_minute * 4.0 / f64::from(unit),
            beats_per_bar: meter_here as u32,
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
