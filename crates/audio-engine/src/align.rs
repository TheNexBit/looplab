//! Automatic sync of a score with its recording, from the notes.
//!
//! The recording is turned into "note attacks": for every 10 ms and every semitone, how much
//! louder it just got (a spectral flux read on a musical scale). The score gives, bar by bar,
//! where its notes start and which pitches they are. A beam search then walks the bars in
//! playback order, letting each bar stretch or shrink a little, and keeps the timings whose
//! notes fall on the strongest attacks of their own pitches. The result is where every bar
//! starts in the recording, each with how well it matched.

use std::sync::Arc;

use realfft::{RealFftPlanner, RealToComplex};

use crate::pcm::Pcm;

/// Time step of the attacks, in seconds.
pub const HOP_SECONDS: f64 = 0.01;
/// Lowest and highest semitones read (MIDI): a 7-string's low B to well above a guitar's top.
const LOW: u8 = 23;
const HIGH: u8 = 100;
const NOTES: usize = (HIGH - LOW + 1) as usize;
/// FFT length at 44.1/48 kHz (~85 ms): low strings are still told apart.
const BASE_SIZE: usize = 4096;
/// How far a bar may differ from the one before (tempo drifting, a player rushing).
const STRETCH: f64 = 0.12;
/// Paths kept at every bar.
const BEAM: usize = 24;
/// Openings (start of bar 1, overall tempo) followed through the whole score.
const OPENINGS: usize = 6;
/// Overall tempo of the recording against the written one, at most this far apart.
const MIN_RATIO: f64 = 0.6;
const MAX_RATIO: f64 = 1.67;
/// Two openings this close in value (fraction) are equally likely: bar 1 is reported unsure.
const AMBIGUOUS: f64 = 0.1;
/// Weight of a tempo change between bars against the notes' score.
const CHANGE_PENALTY: f64 = 4.0;

/// When a note group of a bar starts (0..1 of the bar) and its pitches.
#[derive(Debug, Clone, PartialEq)]
pub struct Onset {
    pub at: f64,
    pub midis: Vec<u8>,
}

/// One pass through a bar of the score, in playback order.
#[derive(Debug, Clone, PartialEq)]
pub struct BarNotes {
    /// Seconds at the written tempo
    pub seconds: f64,
    pub onsets: Vec<Onset>,
}

/// Where a bar was found: its start in seconds of the recording and how sure (0..1).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Found {
    pub time: f64,
    pub confidence: f32,
}

/// Note attacks of a recording: `rows` steps of `HOP_SECONDS`, one value per semitone.
pub struct Attacks {
    rows: usize,
    /// Per step: the semitones, then the sum of all of them (overall attack)
    data: Vec<f32>,
    /// Per step: how much every semitone rose on average. A click, a drum hit or a pick noise
    /// rises everywhere at once and matches no note in particular: only a semitone rising
    /// above this counts as that note
    flat: Vec<f32>,
    /// Running sum, step by step, of how much the semitones rose above `flat`: the notes
    /// played, for telling how much music a stretch of the recording holds
    tonal: Vec<f64>,
}

const STRIDE: usize = NOTES + 1;

impl Attacks {
    /// Reads the whole track (mono mix). `progress` gets 0..1.
    pub fn from_pcm(pcm: &Pcm, mut progress: impl FnMut(f32)) -> Self {
        let rate = pcm.sample_rate();
        let frames = pcm.frames() as usize;
        let size = if rate > 64_000 {
            BASE_SIZE * 2
        } else {
            BASE_SIZE
        };
        let hop = ((f64::from(rate) * HOP_SECONDS).round() as usize).max(1);
        let rows = frames / hop + 1;
        let fft: Arc<dyn RealToComplex<f32>> = RealFftPlanner::new().plan_fft_forward(size);
        let window: Vec<f32> = (0..size)
            .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / size as f32).cos())
            .collect();
        let mut input = fft.make_input_vec();
        let mut output = fft.make_output_vec();
        let mut scratch = fft.make_scratch_vec();
        // FFT bin → semitone (bins outside the range are skipped)
        let bin_hz = f64::from(rate) / size as f64;
        let bins: Vec<Option<usize>> = (0..output.len())
            .map(|bin| {
                let hz = bin as f64 * bin_hz;
                if hz < 20.0 {
                    return None;
                }
                let midi = (69.0 + 12.0 * (hz / 440.0).log2()).round();
                (midi >= f64::from(LOW) && midi <= f64::from(HIGH))
                    .then(|| (midi as u8 - LOW) as usize)
            })
            .collect();

        let mut data = vec![0.0_f32; rows * STRIDE];
        let mut previous = vec![0.0_f32; NOTES];
        let mut loudest = 0.0_f32;
        // First the level of every semitone at every step, then how much each one rose
        for row in 0..rows {
            // Window centred on the step
            let center = row * hop;
            for (i, slot) in input.iter_mut().enumerate() {
                let at = (center + i).checked_sub(size / 2);
                let sample = match at {
                    Some(index) if index < frames => {
                        let [l, r] = pcm.frame(index);
                        (l + r) * 0.5
                    }
                    _ => 0.0,
                };
                *slot = sample * window[i];
            }
            if fft
                .process_with_scratch(&mut input, &mut output, &mut scratch)
                .is_err()
            {
                continue;
            }
            let out = &mut data[row * STRIDE..row * STRIDE + NOTES];
            out.fill(0.0);
            for (bin, value) in output.iter().enumerate() {
                if let Some(Some(note)) = bins.get(bin) {
                    out[*note] += value.norm_sqr();
                }
            }
            for &value in out.iter() {
                loudest = loudest.max(value);
            }
            if row % 512 == 0 {
                progress(row as f32 / rows as f32 * 0.95);
            }
        }
        // Levels in dB above a floor 40 dB under the loudest moment: quieter is silence, so
        // the noise of quiet semitones never looks like a note starting
        let floor = (loudest * 1e-4).max(1e-12);
        for row in 0..rows {
            let out = &mut data[row * STRIDE..(row + 1) * STRIDE];
            let mut total = 0.0;
            for note in 0..NOTES {
                let now = (out[note].max(floor) / floor).ln();
                let rise = (now - previous[note]).max(0.0);
                previous[note] = now;
                out[note] = rise;
                total += rise;
            }
            out[NOTES] = total;
        }
        let mut attacks = Self {
            rows,
            data,
            flat: Vec::new(),
            tonal: Vec::new(),
        };
        attacks.normalize();
        progress(1.0);
        attacks
    }

    #[cfg(test)]
    fn from_rows(rows: Vec<[f32; STRIDE]>) -> Self {
        let count = rows.len();
        let mut attacks = Self {
            rows: count,
            data: rows.into_iter().flatten().collect(),
            flat: Vec::new(),
            tonal: Vec::new(),
        };
        attacks.normalize();
        attacks
    }

    /// Every column scaled by its loud moments (95th percentile), so a loud bass does not
    /// outweigh a quiet melody, and the overall column ranks like a single note.
    fn normalize(&mut self) {
        // One scale for every semitone (a column of its own would blow up the rare high
        // ones: the fizz of a distorted guitar would outweigh its notes), one for the overall
        for range in [0..NOTES, NOTES..STRIDE] {
            let mut values: Vec<f32> = (0..self.rows)
                .flat_map(|r| self.data[r * STRIDE + range.start..r * STRIDE + range.end].to_vec())
                .collect();
            values.sort_by(f32::total_cmp);
            let top = values
                .get(values.len() * 98 / 100)
                .copied()
                .unwrap_or(0.0)
                .max(1e-3);
            for r in 0..self.rows {
                for v in &mut self.data[r * STRIDE + range.start..r * STRIDE + range.end] {
                    *v = (*v / top).min(3.0);
                }
            }
        }
        self.flat = (0..self.rows)
            .map(|r| {
                self.data[r * STRIDE..r * STRIDE + NOTES]
                    .iter()
                    .sum::<f32>()
                    / NOTES as f32
            })
            .collect();
        let mut sum = 0.0;
        self.tonal = std::iter::once(0.0)
            .chain((0..self.rows).map(|r| {
                let flat = self.flat[r];
                sum += self.data[r * STRIDE..r * STRIDE + NOTES]
                    .iter()
                    .map(|v| f64::from((v - flat).max(0.0)))
                    .sum::<f64>();
                sum
            }))
            .collect();
    }

    /// Notes played between two times (seconds), as the sum of pitched rises.
    fn music(&self, from: f64, to: f64) -> f64 {
        let row = |t: f64| ((t / HOP_SECONDS).round().max(0.0) as usize).min(self.rows);
        let (a, b) = (row(from), row(to));
        if b <= a {
            return 0.0;
        }
        self.tonal[b] - self.tonal[a]
    }

    /// Music of the recording falling on the notes of the score placed at `starts` (one per
    /// bar, plus the end): each note group explains what rises within 30 ms of it.
    fn explained(&self, bars: &[BarNotes], starts: &[f64]) -> f64 {
        let mut rows: Vec<usize> = Vec::new();
        for (i, bar) in bars.iter().enumerate() {
            let (Some(&from), Some(&to)) = (starts.get(i), starts.get(i + 1)) else {
                break;
            };
            for onset in &bar.onsets {
                let t = from + onset.at * (to - from);
                let center = (t / HOP_SECONDS).round() as i64;
                for row in center - 3..=center + 3 {
                    if row >= 0 && (row as usize) < self.rows {
                        rows.push(row as usize);
                    }
                }
            }
        }
        rows.sort_unstable();
        rows.dedup();
        rows.into_iter()
            .map(|r| self.tonal[r + 1] - self.tonal[r])
            .sum()
    }

    pub fn seconds(&self) -> f64 {
        self.rows as f64 * HOP_SECONDS
    }

    /// How well a note group at `seconds` matches an attack of its pitches (or, without
    /// pitches, any attack). Nearby steps count a little less: timing is never exact.
    fn score(&self, seconds: f64, midis: &[u8]) -> f64 {
        let center = (seconds / HOP_SECONDS).round() as i64;
        let mut best = 0.0_f32;
        for (offset, weight) in [(0_i64, 1.0_f32), (-1, 0.8), (1, 0.8), (-2, 0.45), (2, 0.45)] {
            let row = center + offset;
            if row < 0 || row as usize >= self.rows {
                continue;
            }
            let at = &self.data[row as usize * STRIDE..(row as usize + 1) * STRIDE];
            let flat = self.flat.get(row as usize).copied().unwrap_or(0.0);
            let mut pitched = 0.0_f32;
            let mut counted = 0;
            // What rose above the whole spectrum (a click rises everywhere: it counts nothing)
            let rise = |n: i32| -> f32 {
                if n < 0 || n as usize >= NOTES {
                    0.0
                } else {
                    (at[n as usize] - flat).max(0.0)
                }
            };
            for &midi in midis {
                if !(LOW..=HIGH).contains(&midi) {
                    continue;
                }
                let note = i32::from(midi - LOW);
                // A note is heard on its own pitch and on its first harmonics (a distorted guitar's
                // low notes are mostly harmonics). A strong rise an octave below means the note
                // played is that lower one, and this is only its harmonic
                let own = rise(note) + 0.5 * rise(note + 12) + 0.35 * rise(note + 19);
                let below = rise(note - 12);
                pitched += (own / 1.85 - 0.8 * below).max(0.0);
                counted += 1;
            }
            let pitched = if counted > 0 {
                pitched / counted as f32
            } else {
                0.0
            };
            // The overall attack only sharpens a pitched one: alone (a click) it counts nothing
            let value = pitched * (1.0 + 0.2 * at[NOTES].min(1.5));
            best = best.max(value * weight);
        }
        f64::from(best)
    }

    /// Score of a bar played from `start` lasting `length` seconds: mean over its note groups.
    fn bar_score(&self, bar: &BarNotes, start: f64, length: f64) -> f64 {
        if bar.onsets.is_empty() {
            return 0.0;
        }
        let sum: f64 = bar
            .onsets
            .iter()
            .map(|o| self.score(start + o.at * length, &o.midis))
            .sum();
        sum / bar.onsets.len() as f64
    }
}

#[derive(Clone)]
struct Path {
    /// Start of every bar placed so far, and the score of each
    starts: Vec<f64>,
    scores: Vec<f64>,
    /// Recording seconds per written second in the last bar
    ratio: f64,
    total: f64,
}

/// Finds where every bar starts. `first` fixes where bar 1 starts (seconds) if known;
/// otherwise it is searched in the first part of the recording, with the overall tempo.
/// Returns one entry per bar plus the end of the last bar; empty if there is nothing to match.
pub fn align(attacks: &Attacks, bars: &[BarNotes], first: Option<f64>) -> Vec<Found> {
    let duration = attacks.seconds();
    if bars.is_empty() || bars.iter().all(|b| b.onsets.is_empty()) || duration <= 0.0 {
        return Vec::new();
    }
    // The first bars alone can fit in more than one place (an exercise repeating a pattern):
    // the best openings are each followed to the end, and the whole score decides
    let total_bars = bars.iter().filter(|b| !b.onsets.is_empty()).count().max(1) as f64;
    let mut scored: Vec<(f64, Path)> = openings(attacks, bars, first)
        .into_iter()
        .filter_map(|(start, ratio)| follow(attacks, bars, start, ratio))
        .map(|path| {
            // Bars never reached count as not matching at all, and so does music the score
            // leaves out (before bar 1, after the end): it counts as that many bars missed
            let start = path.starts.first().copied().unwrap_or(0.0);
            let end = path.starts.last().copied().unwrap_or(0.0);
            let inside = attacks.music(start, end);
            let outside = attacks.music(0.0, start - 0.1) + attacks.music(end + 0.1, duration);
            let missed = if inside > 0.0 {
                outside / (inside / total_bars)
            } else {
                0.0
            };
            // Music where the score has no note (a repeating pattern placed half a bar off
            // leaves notes of the recording unexplained, at the edges or under a rest) counts
            // as bars missed too
            let unexplained = (inside - attacks.explained(bars, &path.starts)).max(0.0);
            let missed = missed + unexplained / (inside / total_bars).max(1e-9);
            let value = path.scores.iter().sum::<f64>() / (total_bars + missed);
            (value, path)
        })
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    let Some((value, best)) = scored.first().cloned() else {
        return Vec::new();
    };
    // Another opening fitting nearly as well somewhere else (a pattern repeating every half
    // bar): bar 1 is then only a guess, and is reported as unsure so it gets checked
    let start = best.starts.first().copied().unwrap_or(0.0);
    let ambiguous = first.is_none()
        && scored.iter().skip(1).any(|(other, path)| {
            *other > value * (1.0 - AMBIGUOUS)
                && (path.starts.first().copied().unwrap_or(0.0) - start).abs() > 0.3
        });
    best.starts
        .iter()
        .enumerate()
        .map(|(i, &time)| {
            // A bar is as sure as its own notes and the ones of the bar before it
            let own = best.scores.get(i).copied();
            let before = i.checked_sub(1).and_then(|j| best.scores.get(j).copied());
            let value = match (own, before) {
                (Some(a), Some(b)) => (a + b) / 2.0,
                (Some(a), None) | (None, Some(a)) => a,
                (None, None) => 0.0,
            };
            Found {
                time,
                confidence: if i == 0 && ambiguous {
                    0.0
                } else {
                    (value / 1.2).clamp(0.0, 1.0) as f32
                },
            }
        })
        .collect()
}

/// Walks the bars from bar 1 at `start` with the overall tempo `ratio`, keeping the best
/// timings bar by bar (beam search). None if not even bar 1 fits in the recording.
fn follow(attacks: &Attacks, bars: &[BarNotes], start: f64, ratio: f64) -> Option<Path> {
    let duration = attacks.seconds();
    let mut beam = vec![Path {
        starts: vec![start],
        scores: Vec::new(),
        ratio,
        total: 0.0,
    }];
    for bar in bars {
        let mut next: Vec<Path> = Vec::with_capacity(beam.len() * 40);
        for path in &beam {
            let from = *path.starts.last().unwrap_or(&0.0);
            let written = bar.seconds.max(0.05);
            let low = path.ratio * (1.0 - STRETCH);
            let high = path.ratio * (1.0 + STRETCH);
            // One step of 10 ms at the end of the bar
            let steps = (((high - low) * written) / HOP_SECONDS).ceil().max(1.0) as usize;
            for step in 0..=steps {
                let ratio = low + (high - low) * step as f64 / steps as f64;
                let length = written * ratio;
                if from + length > duration + 0.5 {
                    continue;
                }
                // Bars without notes (rests) keep the tempo they had
                let (score, ratio) = if bar.onsets.is_empty() {
                    (0.0, path.ratio)
                } else {
                    (attacks.bar_score(bar, from, length), ratio)
                };
                let change = (ratio / path.ratio).ln().abs();
                let mut starts = path.starts.clone();
                starts.push(from + written * ratio);
                let mut scores = path.scores.clone();
                scores.push(score);
                next.push(Path {
                    starts,
                    scores,
                    ratio,
                    total: path.total + score - CHANGE_PENALTY * change,
                });
                if bar.onsets.is_empty() {
                    break;
                }
            }
        }
        if next.is_empty() {
            break;
        }
        next.sort_by(|a, b| b.total.total_cmp(&a.total));
        // Paths ending within 20 ms of a better one add nothing: the beam keeps variety
        let mut kept: Vec<Path> = Vec::with_capacity(BEAM);
        for path in next {
            let end = *path.starts.last().unwrap_or(&0.0);
            if kept.iter().any(|k| {
                (k.starts.last().unwrap_or(&0.0) - end).abs() < 0.02
                    && (k.ratio - path.ratio).abs() < 0.02
            }) {
                continue;
            }
            kept.push(path);
            if kept.len() == BEAM {
                break;
            }
        }
        beam = kept;
    }
    beam.into_iter().next().filter(|p| !p.scores.is_empty())
}

/// Openings followed to the end: where bar 1 may start and the overall tempo (recording
/// seconds per written second), the best few by the first bars with notes, all different.
fn openings(attacks: &Attacks, bars: &[BarNotes], first: Option<f64>) -> Vec<(f64, f64)> {
    // Up to ~4 bars or 12 written seconds of notes decide
    let mut head: Vec<(f64, &Onset)> = Vec::new();
    let mut at = 0.0;
    for bar in bars.iter().take(6) {
        for onset in &bar.onsets {
            head.push((at + onset.at * bar.seconds, onset));
        }
        at += bar.seconds;
        if at > 12.0 {
            break;
        }
    }
    if head.is_empty() {
        return vec![(first.unwrap_or(0.0), 1.0)];
    }
    let duration = attacks.seconds();
    let written = at;
    let mut found: Vec<(f64, f64, f64)> = Vec::new();
    // Coarse tempo steps of 2 %; the beam refines them bar by bar. Half or double the
    // written tempo is not looked for: it would fit a bar onto two
    let mut ratio = MIN_RATIO;
    while ratio <= MAX_RATIO {
        let span = written * ratio;
        let (from, to) = match first {
            Some(t) => (t, t),
            None => (0.0, (duration - span).clamp(0.0, 120.0)),
        };
        let mut start = from;
        while start <= to + 1e-9 {
            let sum: f64 = head
                .iter()
                .map(|(t, o)| attacks.score(start + t * ratio, &o.midis))
                .sum();
            found.push((sum, start, ratio));
            start += HOP_SECONDS;
        }
        ratio *= 1.02;
    }
    found.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut kept: Vec<(f64, f64)> = Vec::with_capacity(OPENINGS);
    for (_, start, ratio) in found {
        let close = kept
            .iter()
            .any(|&(s, r)| (s - start).abs() < 0.25 && (r / ratio).ln().abs() < 0.05);
        if !close {
            kept.push((start, ratio));
            if kept.len() == OPENINGS {
                break;
            }
        }
    }
    // Each one refined around itself: tempo in steps of 0.25 %, start in steps of 10 ms
    let fit = |start: f64, ratio: f64| -> f64 {
        head.iter()
            .map(|(t, o)| attacks.score(start + t * ratio, &o.midis))
            .sum()
    };
    kept.into_iter()
        .map(|(start, ratio)| {
            let mut best = (fit(start, ratio), start, ratio);
            for r in -8..=8 {
                let ratio = ratio * (1.0 + f64::from(r) * 0.0025);
                for s in -10..=10 {
                    let start = match first {
                        Some(t) => t,
                        None => (start + f64::from(s) * HOP_SECONDS).max(0.0),
                    };
                    let value = fit(start, ratio);
                    if value > best.0 {
                        best = (value, start, ratio);
                    }
                }
            }
            (best.1, best.2)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A recording with an attack of `midi` at each time (seconds), 30 s long.
    fn recording(hits: &[(f64, u8)]) -> Attacks {
        let rows = (30.0 / HOP_SECONDS) as usize;
        let mut data = vec![[0.0_f32; STRIDE]; rows];
        // A little noise everywhere so the normalisation has a floor
        for (i, row) in data.iter_mut().enumerate() {
            for (n, v) in row.iter_mut().enumerate() {
                *v = ((i * 31 + n * 17) % 97) as f32 / 970.0;
            }
        }
        for &(time, midi) in hits {
            let row = (time / HOP_SECONDS).round() as usize;
            data[row][(midi - LOW) as usize] += 5.0;
            data[row][NOTES] += 5.0;
        }
        Attacks::from_rows(data)
    }

    /// Adds clicks that rise on every semitone at once (a count-in), at `times`.
    fn with_clicks(hits: &[(f64, u8)], times: &[f64]) -> Attacks {
        let rows = (30.0 / HOP_SECONDS) as usize;
        let mut data = vec![[0.0_f32; STRIDE]; rows];
        for (i, row) in data.iter_mut().enumerate() {
            for (n, v) in row.iter_mut().enumerate() {
                *v = ((i * 31 + n * 17) % 97) as f32 / 970.0;
            }
        }
        for &time in times {
            let row = (time / HOP_SECONDS).round() as usize;
            for v in &mut data[row] {
                *v += 6.0;
            }
        }
        for &(time, midi) in hits {
            let row = (time / HOP_SECONDS).round() as usize;
            data[row][(midi - LOW) as usize] += 5.0;
            data[row][NOTES] += 5.0;
        }
        Attacks::from_rows(data)
    }

    /// Four quarter notes per bar, 2 s per bar at the written tempo, pitches cycling.
    fn score(bars: usize) -> Vec<BarNotes> {
        (0..bars)
            .map(|b| BarNotes {
                seconds: 2.0,
                onsets: (0..4)
                    .map(|q| Onset {
                        at: q as f64 / 4.0,
                        midis: vec![40 + ((b * 4 + q) % 7) as u8 * 3],
                    })
                    .collect(),
            })
            .collect()
    }

    /// Hits of `score` played from `start`, every bar `length` seconds long.
    fn played(bars: &[BarNotes], start: f64, lengths: impl Fn(usize) -> f64) -> Vec<(f64, u8)> {
        let mut hits = Vec::new();
        let mut at = start;
        for (i, bar) in bars.iter().enumerate() {
            let length = lengths(i);
            for onset in &bar.onsets {
                hits.push((at + onset.at * length, onset.midis[0]));
            }
            at += length;
        }
        hits
    }

    #[test]
    fn finds_the_start_and_a_slower_tempo() {
        let bars = score(8);
        // Played 10 % slower, after a 3.37 s intro
        let attacks = recording(&played(&bars, 3.37, |_| 2.2));
        let found = align(&attacks, &bars, None);
        assert_eq!(found.len(), 9);
        for (i, f) in found.iter().enumerate() {
            let expected = 3.37 + i as f64 * 2.2;
            assert!(
                (f.time - expected).abs() < 0.03,
                "bar {i}: {} vs {expected}",
                f.time
            );
        }
        assert!(found[3].confidence > 0.5);
    }

    #[test]
    fn follows_a_tempo_that_drifts() {
        let bars = score(10);
        // Each bar 3 % longer than the one before
        let attacks = recording(&played(&bars, 1.0, |i| 2.0 * 1.03_f64.powi(i as i32)));
        let found = align(&attacks, &bars, Some(1.0));
        let mut expected = 1.0;
        for (i, f) in found.iter().enumerate().take(10) {
            assert!(
                (f.time - expected).abs() < 0.04,
                "bar {i}: {} vs {expected}",
                f.time
            );
            expected += 2.0 * 1.03_f64.powi(i as i32);
        }
    }

    #[test]
    fn a_count_in_of_clicks_is_not_taken_for_bar_one() {
        let bars = score(6);
        // One bar of clicks on the beats (0.25 .. 1.75 s), then the music from 2.25 s
        let attacks = with_clicks(&played(&bars, 2.25, |_| 2.0), &[0.25, 0.75, 1.25, 1.75]);
        let found = align(&attacks, &bars, None);
        assert!(
            (found[0].time - 2.25).abs() < 0.03,
            "bar 1 at {}",
            found[0].time
        );
    }

    #[test]
    fn a_pattern_repeating_every_half_bar_is_right_or_flagged() {
        // Every half bar the same three notes: placed half a bar off, it fits as well
        let bars: Vec<BarNotes> = (0..6)
            .map(|_| BarNotes {
                seconds: 2.0,
                onsets: [0.0, 0.125, 0.25, 0.5, 0.625, 0.75]
                    .iter()
                    .zip([45, 52, 57, 45, 52, 57])
                    .map(|(&at, midi)| Onset {
                        at,
                        midis: vec![midi],
                    })
                    .collect(),
            })
            .collect();
        let attacks = recording(&played(&bars, 3.0, |_| 2.0));
        let found = align(&attacks, &bars, None);
        let right = (found[0].time - 3.0).abs() < 0.03;
        assert!(
            right || found[0].confidence == 0.0,
            "bar 1 at {}",
            found[0].time
        );
        // Pinned by hand, it is exact
        let pinned = align(&attacks, &bars, Some(3.0));
        assert!((pinned[5].time - 13.0).abs() < 0.03);
    }

    #[test]
    fn nothing_to_match_gives_nothing() {
        let attacks = recording(&[]);
        assert!(align(&attacks, &[], None).is_empty());
        let empty = vec![BarNotes {
            seconds: 2.0,
            onsets: Vec::new(),
        }];
        assert!(align(&attacks, &empty, None).is_empty());
    }
}
