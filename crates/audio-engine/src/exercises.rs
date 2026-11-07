//! Exercises of the metronome on its own, ported from MetroFlow's trainers. They are decided
//! here, on the audio thread, bar by bar: a tempo step or a silent bar lands exactly on the
//! bar line, never a click late. Bars are counted from 0 after the count-in.
//!
//! - Speed trainer: the tempo moves by a step every few bars, up (or down) to a target.
//! - Gap trainer: the click plays a few bars, then leaves a few silent; keep the time.
//! - Random mutes: a share of the clicks drops out at random (Looplab's own).
//! - Rhythm: a pattern of strums and rests on the subdivision grid replaces the clicks; one
//!   repetition every few can be silent, to play it from memory.

/// Most cells of a rhythm pattern (16 pulses × 4 clicks × 2 bars).
pub const MAX_STEPS: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Trainer {
    pub from_bpm: f64,
    pub to_bpm: f64,
    /// BPM added (or taken, towards a slower target) at every step
    pub step_bpm: f64,
    pub every_bars: u32,
}

impl Trainer {
    /// Tempo of `bar` (0 = the first after the count-in).
    pub fn bpm_at(&self, bar: i64) -> f64 {
        let steps = (bar.max(0) / i64::from(self.every_bars.max(1))) as f64;
        let moved = steps * self.step_bpm.abs();
        if self.to_bpm >= self.from_bpm {
            (self.from_bpm + moved).min(self.to_bpm)
        } else {
            (self.from_bpm - moved).max(self.to_bpm)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gap {
    /// Bars of click before the first gap
    pub lead_bars: u32,
    /// Bars heard, then bars silent, every cycle
    pub play_bars: u32,
    pub silent_bars: u32,
    /// The silence grows by a bar every cycle (up to 32)
    pub grow: bool,
}

impl Gap {
    fn silent_in_cycle(&self, cycle: u32) -> u32 {
        if self.grow {
            (self.silent_bars + cycle).min(32)
        } else {
            self.silent_bars
        }
    }

    /// Whether `bar` is one of the silent ones (MetroFlow's `gapPositionAt`).
    pub fn is_silent(&self, bar: i64) -> bool {
        if bar < i64::from(self.lead_bars) {
            return false;
        }
        let play = u64::from(self.play_bars.max(1));
        let mut left = (bar - i64::from(self.lead_bars)) as u64;
        if self.grow {
            let mut cycle = 0;
            loop {
                let length = play + u64::from(self.silent_in_cycle(cycle));
                if left < length {
                    break;
                }
                left -= length;
                cycle += 1;
            }
        } else {
            left %= play + u64::from(self.silent_bars);
        }
        left >= play
    }
}

/// One cell of a rhythm pattern.
#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RhythmStep {
    #[default]
    Rest,
    Note,
    Accent,
}

/// What a rhythm decides for one click of the grid.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Strum {
    /// A strum: down on the pulse and every other click, up in between (alternate picking)
    Play {
        down: bool,
        accent: bool,
    },
    /// A rest on a beat with the guide on: a quiet click to lean on
    Guide,
    Silent,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rhythm {
    pub steps: [RhythmStep; MAX_STEPS],
    /// Cells in use: bars × pulses × clicks per pulse
    pub len: usize,
    /// Bars the pattern spans (1 or 2)
    pub bars: u32,
    /// After this many repetitions heard, one is silent; 0 = never
    pub test_every: u32,
    /// A quiet click on the beats that are rests
    pub guide: bool,
}

impl Rhythm {
    /// What click `sub` of pulse `pulse_in_bar` of `bar` plays; `per_bar` cells make a bar.
    pub fn strum(
        &self,
        bar: i64,
        pulse_in_bar: u32,
        sub: u32,
        subdivision: u32,
        on_beat: bool,
    ) -> Strum {
        let bars = i64::from(self.bars.max(1));
        let repetition = bar.max(0) / bars;
        if self.test_every > 0
            && repetition % i64::from(self.test_every + 1) == i64::from(self.test_every)
        {
            return Strum::Silent;
        }
        let per_bar = self.len as i64 / bars;
        let index = bar.rem_euclid(bars) * per_bar
            + i64::from(pulse_in_bar) * i64::from(subdivision)
            + i64::from(sub);
        let step = usize::try_from(index)
            .ok()
            .filter(|&i| i < self.len.min(MAX_STEPS))
            .map_or(RhythmStep::Rest, |i| self.steps[i]);
        match step {
            RhythmStep::Rest if self.guide && sub == 0 && on_beat => Strum::Guide,
            RhythmStep::Rest => Strum::Silent,
            RhythmStep::Note | RhythmStep::Accent => Strum::Play {
                down: sub.is_multiple_of(2),
                accent: step == RhythmStep::Accent,
            },
        }
    }
}

/// Every exercise, each off when absent.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Exercises {
    pub trainer: Option<Trainer>,
    pub gap: Option<Gap>,
    /// Share of the clicks (after the count-in) silenced at random, 0..0.9
    pub mute_chance: f32,
    pub rhythm: Option<Rhythm>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_trainer_steps_every_few_bars_up_to_the_target() {
        let up = Trainer {
            from_bpm: 100.0,
            to_bpm: 110.0,
            step_bpm: 4.0,
            every_bars: 2,
        };
        let tempi: Vec<f64> = (0..8).map(|bar| up.bpm_at(bar)).collect();
        assert_eq!(
            tempi,
            [100.0, 100.0, 104.0, 104.0, 108.0, 108.0, 110.0, 110.0]
        );
        let down = Trainer {
            from_bpm: 120.0,
            to_bpm: 100.0,
            ..up
        };
        assert_eq!(down.bpm_at(2), 116.0);
        assert_eq!(down.bpm_at(100), 100.0);
    }

    #[test]
    fn the_gap_trainer_leaves_bars_silent() {
        let gap = Gap {
            lead_bars: 1,
            play_bars: 2,
            silent_bars: 1,
            grow: false,
        };
        let silent: Vec<bool> = (0..7).map(|bar| gap.is_silent(bar)).collect();
        assert_eq!(silent, [false, false, false, true, false, false, true]);
        let grow = Gap {
            lead_bars: 0,
            grow: true,
            ..gap
        };
        // 2 heard + 1 silent, then 2 heard + 2 silent
        let silent: Vec<bool> = (0..7).map(|bar| grow.is_silent(bar)).collect();
        assert_eq!(silent, [false, false, true, false, false, true, true]);
    }

    fn rhythm(cells: &[RhythmStep], bars: u32, test_every: u32, guide: bool) -> Rhythm {
        let mut steps = [RhythmStep::Rest; MAX_STEPS];
        steps[..cells.len()].copy_from_slice(cells);
        Rhythm {
            steps,
            len: cells.len(),
            bars,
            test_every,
            guide,
        }
    }

    #[test]
    fn a_rhythm_strums_down_and_up_and_rests() {
        use RhythmStep::{Accent, Note, Rest};
        // One bar of 2/4 in eighths: accent, rest, note, note
        let pattern = rhythm(&[Accent, Rest, Note, Note], 1, 0, false);
        assert_eq!(
            pattern.strum(0, 0, 0, 2, true),
            Strum::Play {
                down: true,
                accent: true
            }
        );
        assert_eq!(pattern.strum(0, 0, 1, 2, true), Strum::Silent);
        assert_eq!(
            pattern.strum(0, 1, 1, 2, true),
            Strum::Play {
                down: false,
                accent: false
            }
        );
        // The next bar plays it again
        assert_eq!(
            pattern.strum(1, 1, 0, 2, true),
            Strum::Play {
                down: true,
                accent: false
            }
        );
    }

    #[test]
    fn a_rest_on_the_beat_can_guide_and_a_repetition_can_be_a_test() {
        use RhythmStep::{Note, Rest};
        let guided = rhythm(&[Rest, Note], 1, 0, true);
        assert_eq!(guided.strum(0, 0, 0, 2, true), Strum::Guide);
        assert_eq!(guided.strum(0, 0, 0, 2, false), Strum::Silent);
        let tested = rhythm(&[Note, Note], 1, 2, false);
        let heard: Vec<bool> = (0..6)
            .map(|bar| tested.strum(bar, 0, 0, 2, true) != Strum::Silent)
            .collect();
        assert_eq!(heard, [true, true, false, true, true, false]);
    }
}
