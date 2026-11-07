//! The shape of a bar for the metronome: pulses, how they group into felt beats (7/8 as
//! 2+2+3), what each beat does (accent, normal, muted), subdivisions, swing and a cross
//! rhythm laid over the bar. Ported from MetroFlow's `beat-grid` / `bar-cursor`.
//!
//! Times are measured in pulses (the numerator's note value: eighths in 7/8), so the same
//! code serves the clicks over a track (pulses from track frames) and the metronome on its
//! own (pulses from its own clock, which can change tempo smoothly). A click sounds in the
//! frame whose span of pulses `[from, to)` contains its time: every tick is found exactly once.
//! Real-time safe: fixed arrays, no allocation.

/// Longest bar: as many pulses (and felt beats) as MetroFlow allows.
pub const MAX_PULSES: usize = 32;
/// Most clicks a pulse can be split into.
pub const MAX_SUBDIVISION: u32 = 8;
/// Swing: share of a pair of clicks given to the first one (0.5 = even, 2/3 = jazz, 0.75 = shuffle).
pub const SWING_STRAIGHT: f32 = 0.5;
pub const SWING_MAX: f32 = 0.75;

/// What one felt beat does. A muted beat silences its subdivisions too, but keeps its place.
#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BeatState {
    Accent,
    #[default]
    Normal,
    Muted,
}

/// Which voice a click uses.
#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClickKind {
    /// An accented beat (the first of the bar, unless changed)
    Accent,
    /// Any other beat
    Beat,
    /// Between beats: subdivisions, and the pulses inside a group (the 2nd eighth of a 2)
    Sub,
    /// The cross rhythm laid over the bar
    Cross,
}

/// The clicks starting in one frame: at most one of the main grid plus one of the cross rhythm.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Hits {
    pub main: Option<ClickKind>,
    pub cross: bool,
    /// Bar of the main click (negative during a count-in)
    pub bar: i64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BarPattern {
    /// Pulses in a bar (the numerator)
    pulses: u32,
    /// Felt beat each pulse belongs to, and whether it opens it
    beat_of_pulse: [u8; MAX_PULSES],
    starts_beat: [bool; MAX_PULSES],
    /// One entry per felt beat
    states: [BeatState; MAX_PULSES],
    /// Clicks per pulse: 1 = only the pulses, 2 = eighths of a quarter pulse…
    subdivision: u32,
    swing: f32,
    /// Cross pulses spread evenly over the bar; 0 = off
    cross: u32,
}

impl Default for BarPattern {
    fn default() -> Self {
        Self::regular(4)
    }
}

impl BarPattern {
    /// Every pulse a beat, the first accented: the plain bar.
    pub fn regular(pulses: u32) -> Self {
        Self::new(pulses, &[], &[BeatState::Accent], 1, SWING_STRAIGHT, 0)
    }

    /// A bar of `pulses` grouped as `grouping` (empty, or not adding up: every pulse is a
    /// beat). `states` gives each felt beat its state; missing ones are normal.
    pub fn new(
        pulses: u32,
        grouping: &[u8],
        states: &[BeatState],
        subdivision: u32,
        swing: f32,
        cross: u32,
    ) -> Self {
        let pulses = pulses.clamp(1, MAX_PULSES as u32);
        let valid = !grouping.is_empty()
            && grouping.iter().all(|&g| g > 0)
            && grouping.iter().map(|&g| u32::from(g)).sum::<u32>() == pulses;
        let mut beat_of_pulse = [0; MAX_PULSES];
        let mut starts_beat = [false; MAX_PULSES];
        let mut pulse = 0;
        if valid {
            for (beat, &size) in grouping.iter().enumerate() {
                for inside in 0..size {
                    beat_of_pulse[pulse] = beat as u8;
                    starts_beat[pulse] = inside == 0;
                    pulse += 1;
                }
            }
        } else {
            for index in 0..pulses as usize {
                beat_of_pulse[index] = index as u8;
                starts_beat[index] = true;
            }
        }
        let mut all_states = [BeatState::Normal; MAX_PULSES];
        for (slot, state) in all_states.iter_mut().zip(states) {
            *slot = *state;
        }
        Self {
            pulses,
            beat_of_pulse,
            starts_beat,
            states: all_states,
            subdivision: subdivision.clamp(1, MAX_SUBDIVISION),
            swing: swing.clamp(SWING_STRAIGHT, SWING_MAX),
            cross: if cross >= 2 {
                cross.min(MAX_PULSES as u32)
            } else {
                0
            },
        }
    }

    pub fn pulses(&self) -> u32 {
        self.pulses
    }

    /// Where click `k` of a pulse falls, as a fraction of the pulse. Swing lengthens the
    /// first click of every pair and shortens the second; a pair keeps its length, and
    /// odd subdivisions (triplets) have no pairs to swing.
    fn tick_offset(&self, k: u32) -> f64 {
        let n = f64::from(self.subdivision);
        if self.subdivision.is_multiple_of(2) && self.swing != SWING_STRAIGHT {
            let pair = f64::from(k / 2) * 2.0;
            let inside = if k % 2 == 1 {
                2.0 * f64::from(self.swing)
            } else {
                0.0
            };
            (pair + inside) / n
        } else {
            f64::from(k) / n
        }
    }

    /// Voice of click `k` of global pulse `pulse` (count-in bars, before 0, sound plainly).
    fn kind(&self, pulse: i64, k: u32) -> Option<ClickKind> {
        let in_bar = pulse.rem_euclid(i64::from(self.pulses)) as usize;
        if pulse < 0 {
            return Some(match (k, in_bar) {
                (0, 0) => ClickKind::Accent,
                (0, _) => ClickKind::Beat,
                _ => ClickKind::Sub,
            });
        }
        match self.states[usize::from(self.beat_of_pulse[in_bar])] {
            BeatState::Muted => None,
            _ if k > 0 || !self.starts_beat[in_bar] => Some(ClickKind::Sub),
            BeatState::Accent => Some(ClickKind::Accent),
            BeatState::Normal => Some(ClickKind::Beat),
        }
    }

    /// Clicks starting between pulse time `from` (included) and `to` (excluded): one frame.
    pub fn hits(&self, from: f64, to: f64) -> Hits {
        let mut hits = Hits::default();
        let pulses = i64::from(self.pulses);
        let first = from.floor() as i64;
        let last = to.floor() as i64;
        'main: for pulse in first..=last {
            for k in 0..self.subdivision {
                let at = pulse as f64 + self.tick_offset(k);
                if at >= from && at < to {
                    hits.main = self.kind(pulse, k);
                    hits.bar = pulse.div_euclid(pulses);
                    break 'main;
                }
            }
        }
        if self.cross > 0 && from >= 0.0 {
            // Cross pulse c sounds at c × pulses / cross: it divides the bar, not the beat
            let per = f64::from(self.pulses) / f64::from(self.cross);
            let first = (from / per).floor() as i64;
            let last = (to / per).floor() as i64;
            hits.cross = (first..=last).any(|c| {
                let at = c as f64 * per;
                at >= from && at < to
            });
        }
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every click over `bars` bars at `frames` frames per pulse, as (frame, kind).
    fn run(pattern: &BarPattern, frames: f64, bars: u32) -> Vec<(u64, Option<ClickKind>, bool)> {
        let total = (frames * f64::from(pattern.pulses() * bars)) as u64;
        (0..total)
            .filter_map(|n| {
                let hits = pattern.hits(n as f64 / frames, (n + 1) as f64 / frames);
                (hits.main.is_some() || hits.cross).then_some((n, hits.main, hits.cross))
            })
            .collect()
    }

    fn kinds(pattern: &BarPattern) -> Vec<ClickKind> {
        run(pattern, 100.0, 1)
            .into_iter()
            .filter_map(|(_, k, _)| k)
            .collect()
    }

    use ClickKind::{Accent, Beat, Sub};

    #[test]
    fn a_plain_bar_accents_the_first_beat() {
        assert_eq!(kinds(&BarPattern::regular(4)), [Accent, Beat, Beat, Beat]);
    }

    #[test]
    fn groups_click_on_their_first_pulse_and_softly_inside() {
        let seven = BarPattern::new(7, &[2, 2, 3], &[BeatState::Accent], 1, 0.5, 0);
        assert_eq!(kinds(&seven), [Accent, Sub, Beat, Sub, Beat, Sub, Sub]);
        // A grouping that does not add up is ignored rather than trusted
        let wrong = BarPattern::new(7, &[2, 2], &[], 1, 0.5, 0);
        assert_eq!(kinds(&wrong).len(), 7);
    }

    #[test]
    fn a_muted_beat_silences_its_subdivisions() {
        let pattern = BarPattern::new(
            4,
            &[],
            &[
                BeatState::Accent,
                BeatState::Muted,
                BeatState::Normal,
                BeatState::Accent,
            ],
            2,
            0.5,
            0,
        );
        assert_eq!(kinds(&pattern), [Accent, Sub, Beat, Sub, Accent, Sub]);
    }

    #[test]
    fn subdivisions_and_swing_fall_where_expected() {
        let even = run(&BarPattern::new(1, &[], &[], 4, 0.5, 0), 400.0, 1);
        let frames: Vec<u64> = even.iter().map(|c| c.0).collect();
        assert_eq!(frames, [0, 100, 200, 300]);
        let swung = run(&BarPattern::new(1, &[], &[], 2, 2.0 / 3.0, 0), 300.0, 1);
        let frames: Vec<u64> = swung.iter().map(|c| c.0).collect();
        // The pair falls 2:1, as if written in triplets
        assert_eq!(frames, [0, 200]);
        // Triplets have no pairs: swing leaves them alone
        let triplets = run(&BarPattern::new(1, &[], &[], 3, 0.75, 0), 300.0, 1);
        assert_eq!(triplets.len(), 3);
    }

    #[test]
    fn a_cross_rhythm_divides_the_bar() {
        // Three against four, 100 frames a pulse: the bar is 400 frames
        let pattern = BarPattern::new(4, &[], &[BeatState::Accent], 1, 0.5, 3);
        let cross: Vec<u64> = run(&pattern, 100.0, 2)
            .into_iter()
            .filter_map(|(n, _, cross)| cross.then_some(n))
            .collect();
        assert_eq!(cross, [0, 133, 266, 400, 533, 666]);
    }

    #[test]
    fn every_click_sounds_once_at_any_tempo() {
        // A pulse that is not a whole number of frames (137 BPM at 48 kHz)
        let frames = 48_000.0 * 60.0 / 137.0;
        let pattern = BarPattern::new(7, &[2, 2, 3], &[BeatState::Accent], 3, 0.5, 5);
        let clicks = run(&pattern, frames, 10);
        let main = clicks.iter().filter(|c| c.1.is_some()).count();
        let cross = clicks.iter().filter(|c| c.2).count();
        assert_eq!(main, 7 * 3 * 10);
        assert_eq!(cross, 5 * 10);
    }

    #[test]
    fn count_in_bars_sound_plainly_and_bars_are_numbered() {
        let pattern = BarPattern::new(3, &[], &[BeatState::Muted], 1, 0.5, 0);
        let first = pattern.hits(-3.0, -2.99);
        assert_eq!((first.main, first.bar), (Some(Accent), -1));
        assert_eq!(pattern.hits(-2.0, -1.99).main, Some(Beat));
        // Bar 0 starts with the muted beat the player asked for
        assert_eq!(
            pattern.hits(0.0, 0.01),
            Hits {
                main: None,
                cross: false,
                bar: 0
            }
        );
        assert_eq!(pattern.hits(4.0, 4.01).bar, 1);
    }
}
