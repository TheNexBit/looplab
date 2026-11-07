//! The metronome on its own, without a track: its own clock in output frames, mixed after
//! everything else (no stretcher in the way, so it is exact at any tempo).
//!
//! Time is counted in pulses from a base point. A new tempo or bar takes over from the
//! current moment, keeping the place in the bar, so a speed trainer can change the tempo
//! while it runs without a jump. Count-in bars are the bars before 0: they sound plainly,
//! and the exercises (`exercises.rs`) only start at bar 0. Real-time safe.
//!
//! A sequence plays parts one after the other, each with its own bar, tempo and exercises
//! for a number of bars: 4 bars of 7/8 at 160, then 2 of 5/4… The change lands on the bar
//! line. Positions and bars are counted from the start of the part being played.

use std::sync::Arc;

use crate::click::{ClickSounds, ClickVoice};
use crate::exercises::{Exercises, Strum};
use crate::pattern::{BarPattern, ClickKind, Hits};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetronomeSettings {
    /// Output frames per pulse (the note value of the numerator) at `bpm`
    pub pulse_frames: f64,
    /// The tempo `pulse_frames` belongs to: the speed trainer scales from it
    pub bpm: f64,
    pub pattern: BarPattern,
    /// Bars counted in, plainly, before bar 0
    pub count_in_bars: u32,
    /// 0..1
    pub volume: f32,
    pub sounds: ClickSounds,
    pub exercises: Exercises,
}

impl Default for MetronomeSettings {
    fn default() -> Self {
        Self {
            pulse_frames: 24_000.0,
            bpm: 120.0,
            pattern: BarPattern::default(),
            count_in_bars: 0,
            volume: 0.8,
            sounds: ClickSounds::default(),
            exercises: Exercises::default(),
        }
    }
}

/// One part of the metronome: a bar, its tempo and its exercises, for `bars` bars
/// (0 = for ever, as when no sequence is playing).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Segment {
    pub pulse_frames: f64,
    pub bpm: f64,
    pub pattern: BarPattern,
    pub exercises: Exercises,
    pub bars: u32,
}

impl Segment {
    fn of(settings: &MetronomeSettings) -> Self {
        Self {
            pulse_frames: settings.pulse_frames.max(1.0),
            bpm: settings.bpm,
            pattern: settings.pattern,
            exercises: settings.exercises,
            bars: 0,
        }
    }
}

/// Parts played in order, then again from the first or to a stop. Built off the audio thread
/// and shared, so replacing it never frees memory there.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Sequence {
    pub segments: Vec<Segment>,
    pub repeat: bool,
}

/// What starts sounding in one frame.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
struct Frame {
    click: Option<ClickKind>,
    strum: Option<(bool, f32)>,
    cross: bool,
}

/// Levels of the strums of the rhythm trainer.
const STRUM_ACCENT: f32 = 1.0;
const STRUM_NOTE: f32 = 0.7;

pub(crate) struct Metronome {
    /// Count-in, volume and sounds; and the part played when no sequence is set
    settings: MetronomeSettings,
    /// The part being played: from the settings, or from the sequence
    part: Segment,
    sequence: Option<Arc<Sequence>>,
    segment: usize,
    running: bool,
    /// Frames played since start
    frame: u64,
    /// Pulse time at `base_frame`, where the current tempo took over
    base_pulses: f64,
    base_frame: u64,
    /// Frames per pulse now (the speed trainer changes it at bar lines)
    pulse_frames: f64,
    /// xorshift state of the random mutes
    seed: u32,
    main: ClickVoice,
    cross: ClickVoice,
}

impl Metronome {
    pub fn new(sample_rate: u32) -> Self {
        let settings = MetronomeSettings::default();
        Self {
            pulse_frames: settings.pulse_frames,
            part: Segment::of(&settings),
            settings,
            sequence: None,
            segment: 0,
            running: false,
            frame: 0,
            base_pulses: 0.0,
            base_frame: 0,
            seed: 0x2545_F491,
            main: ClickVoice::new(sample_rate),
            cross: ClickVoice::new(sample_rate),
        }
    }

    fn pulses_at(&self, frame: u64) -> f64 {
        self.base_pulses + (frame - self.base_frame) as f64 / self.pulse_frames
    }

    /// Frames per pulse in `bar` of the part: the speed trainer's tempo there, or the set one.
    fn pulse_frames_in(&self, bar: i64) -> f64 {
        let part = &self.part;
        match part.exercises.trainer {
            // The count-in already goes at the trainer's first tempo
            Some(trainer) if part.bpm > 0.0 => {
                part.pulse_frames * part.bpm / trainer.bpm_at(bar.max(0)).max(1.0)
            }
            _ => part.pulse_frames,
        }
    }

    /// From now on, `pulse_frames` per pulse, starting at `pulses`.
    fn rebase(&mut self, pulses: f64, pulse_frames: f64) {
        self.base_pulses = pulses;
        self.base_frame = self.frame;
        self.pulse_frames = pulse_frames.max(1.0);
    }

    fn bar_now(&self) -> i64 {
        (self.position() / f64::from(self.part.pattern.pulses())).floor() as i64
    }

    /// New settings take over now; while running, the place in the bar is kept. While a
    /// sequence plays, only its count-in, volume and sounds change.
    pub fn set(&mut self, settings: MetronomeSettings) {
        self.settings = MetronomeSettings {
            pulse_frames: settings.pulse_frames.max(1.0),
            ..settings
        };
        if self.sequence.is_none() {
            self.take_part(Segment::of(&self.settings));
        }
    }

    /// `part` takes over now, keeping the place in the bar while running.
    fn take_part(&mut self, part: Segment) {
        let old_pulses = f64::from(self.part.pattern.pulses());
        let now = self.position();
        self.part = part;
        if self.running {
            let bar = (now / old_pulses).floor();
            let into_bar = now - bar * old_pulses;
            let pulses = bar * f64::from(part.pattern.pulses()) + into_bar;
            self.rebase(pulses, self.pulse_frames_in(bar as i64));
        } else {
            self.pulse_frames = self.pulse_frames_in(0);
        }
    }

    /// Plays `sequence` from its first part (`None`: back to the settings' bar). Returns the
    /// one it replaces, to be freed off the audio thread.
    pub fn set_sequence(&mut self, sequence: Option<Arc<Sequence>>) -> Option<Arc<Sequence>> {
        let old = std::mem::replace(&mut self.sequence, sequence);
        self.segment = 0;
        let part = self.first_part();
        self.take_part(part);
        old
    }

    fn first_part(&self) -> Segment {
        self.sequence
            .as_ref()
            .and_then(|sequence| sequence.segments.first())
            .copied()
            .unwrap_or_else(|| Segment::of(&self.settings))
    }

    /// Moves to the next part of the sequence; false at the end of one that does not repeat.
    fn next_part(&mut self) -> bool {
        let Some(sequence) = &self.sequence else {
            return true;
        };
        let mut next = self.segment + 1;
        if next >= sequence.segments.len() {
            if !sequence.repeat {
                return false;
            }
            next = 0;
        }
        match sequence.segments.get(next) {
            Some(part) => {
                self.part = *part;
                self.segment = next;
                true
            }
            None => false,
        }
    }

    /// The part of the sequence being played (None without a sequence).
    pub fn segment(&self) -> Option<u32> {
        self.sequence.as_ref().map(|_| self.segment as u32)
    }

    /// Starts from the count-in (or bar 0), or stops.
    pub fn run(&mut self, running: bool) {
        self.running = running;
        if running {
            self.frame = 0;
            self.segment = 0;
            self.part = self.first_part();
            let start =
                -f64::from(self.settings.count_in_bars) * f64::from(self.part.pattern.pulses());
            self.rebase(start, self.pulse_frames_in(-1));
        }
    }

    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Where the metronome is, in pulses from bar 0 (negative during the count-in).
    pub fn position(&self) -> f64 {
        self.pulses_at(self.frame)
    }

    fn random(&mut self) -> f32 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        self.seed as f32 / u32::MAX as f32
    }

    /// What the exercises make of the clicks of the grid in one frame.
    fn exercise(&mut self, hits: Hits) -> Frame {
        let plain = Frame {
            click: hits.main,
            strum: None,
            cross: hits.cross,
        };
        if !hits.on_grid && !hits.cross || hits.bar < 0 && hits.on_grid {
            return plain;
        }
        let bar = if hits.on_grid {
            hits.bar
        } else {
            self.bar_now()
        };
        let exercises = self.part.exercises;
        if exercises.gap.is_some_and(|gap| gap.is_silent(bar)) {
            return Frame::default();
        }
        let mut frame = plain;
        if hits.on_grid
            && let Some(rhythm) = exercises.rhythm
        {
            let pattern = &self.part.pattern;
            let on_beat = pattern.starts_beat(hits.pulse_in_bar);
            frame.click = None;
            match rhythm.strum(
                bar,
                hits.pulse_in_bar,
                hits.sub,
                pattern.subdivision(),
                on_beat,
            ) {
                Strum::Play { down, accent } => {
                    frame.strum = Some((down, if accent { STRUM_ACCENT } else { STRUM_NOTE }));
                }
                Strum::Guide => frame.click = Some(ClickKind::Sub),
                Strum::Silent => {}
            }
        }
        if exercises.mute_chance > 0.0
            && (frame.click.is_some() || frame.strum.is_some())
            && self.random() < exercises.mute_chance
        {
            frame.click = None;
            frame.strum = None;
        }
        frame
    }

    /// Moves one frame on and returns what starts sounding in it (nothing when stopped).
    fn advance(&mut self) -> Frame {
        if !self.running {
            return Frame::default();
        }
        let from = self.pulses_at(self.frame);
        let mut to = self.pulses_at(self.frame + 1);
        let mut hits = self.part.pattern.hits(from, to);
        let downbeat = hits.on_grid && hits.pulse_in_bar == 0 && hits.sub == 0;
        if downbeat && self.part.bars > 0 && hits.bar >= i64::from(self.part.bars) {
            // The part is over: the next one starts on this very downbeat
            let at = (hits.bar * i64::from(self.part.pattern.pulses())) as f64;
            let early_frames = (from - at) * self.pulse_frames;
            if !self.next_part() {
                self.running = false;
                return Frame::default();
            }
            self.pulse_frames = self.pulse_frames_in(0).max(1.0);
            self.base_frame = self.frame;
            self.base_pulses = early_frames / self.pulse_frames;
            to = self.pulses_at(self.frame + 1);
            hits = self.part.pattern.hits(self.pulses_at(self.frame), to);
        }
        self.frame += 1;
        // A new bar: the speed trainer's tempo for it takes over from the next frame
        if hits.on_grid && hits.pulse_in_bar == 0 && hits.sub == 0 {
            let pulse_frames = self.pulse_frames_in(hits.bar);
            if (pulse_frames - self.pulse_frames).abs() > 1e-9 {
                self.rebase(to, pulse_frames);
            }
        }
        self.exercise(hits)
    }

    /// Next sample of the clicks (0 when stopped and silent).
    #[inline]
    pub fn next(&mut self) -> f32 {
        let frame = self.advance();
        if let Some(kind) = frame.click {
            self.main.start(self.settings.sounds.of(kind));
        }
        if let Some((down, level)) = frame.strum {
            self.main.start_strum(down, level);
        }
        if frame.cross {
            self.cross.start(self.settings.sounds.of(ClickKind::Cross));
        }
        let volume = self.settings.volume;
        self.main.next(volume) + self.cross.next(volume)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exercises::{Gap, MAX_STEPS, Rhythm, RhythmStep, Trainer};
    use crate::pattern::BeatState;

    fn sounds(frame: Frame) -> bool {
        frame.click.is_some() || frame.strum.is_some() || frame.cross
    }

    /// Frames at which something starts, over `frames` frames.
    fn onsets(metronome: &mut Metronome, frames: usize) -> Vec<usize> {
        (0..frames)
            .filter(|_| sounds(metronome.advance()))
            .collect()
    }

    fn settings(pulse_frames: f64, pulses: u32) -> MetronomeSettings {
        MetronomeSettings {
            pulse_frames,
            pattern: BarPattern::regular(pulses),
            ..MetronomeSettings::default()
        }
    }

    fn started(settings: MetronomeSettings) -> Metronome {
        let mut metronome = Metronome::new(48_000);
        metronome.set(settings);
        metronome.run(true);
        metronome
    }

    #[test]
    fn silent_until_started_then_clicks_on_every_pulse() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(settings(4_800.0, 4));
        assert!(onsets(&mut metronome, 10_000).is_empty());
        metronome.run(true);
        assert_eq!(
            onsets(&mut metronome, 20_000),
            [0, 4_800, 9_600, 14_400, 19_200]
        );
        // And they are heard
        metronome.run(true);
        assert!(
            (0..2_000)
                .map(|_| metronome.next().abs())
                .fold(0.0, f32::max)
                > 0.1
        );
        metronome.run(false);
        assert!(onsets(&mut metronome, 10_000).is_empty());
    }

    #[test]
    fn counts_in_before_bar_zero() {
        let mut metronome = started(MetronomeSettings {
            count_in_bars: 1,
            ..settings(4_800.0, 3)
        });
        assert!((metronome.position() + 3.0).abs() < 1e-9);
        onsets(&mut metronome, 3 * 4_800);
        assert!(metronome.position().abs() < 1e-9);
    }

    #[test]
    fn a_new_tempo_keeps_the_place_in_the_bar() {
        let mut metronome = started(settings(4_800.0, 4));
        onsets(&mut metronome, 7_200); // one and a half pulses
        metronome.set(settings(2_400.0, 4));
        assert!((metronome.position() - 1.5).abs() < 1e-9);
        // The next pulse comes half a (new) pulse later
        assert_eq!(onsets(&mut metronome, 4_000)[0], 1_200);
    }

    #[test]
    fn muted_beats_and_cross_rhythm_reach_the_output() {
        let mut metronome = started(MetronomeSettings {
            pattern: BarPattern::new(2, &[], &[BeatState::Muted, BeatState::Muted], 1, 0.5, 3),
            ..settings(4_800.0, 2)
        });
        // Only the cross rhythm sounds: 3 over a bar of 9,600 frames
        assert_eq!(onsets(&mut metronome, 9_600), [0, 3_200, 6_400]);
    }

    fn with(exercises: Exercises, pulses: u32) -> MetronomeSettings {
        MetronomeSettings {
            exercises,
            ..settings(1_000.0, pulses)
        }
    }

    fn part(pulse_frames: f64, pulses: u32, bars: u32) -> Segment {
        Segment {
            pulse_frames,
            bpm: 120.0,
            pattern: BarPattern::regular(pulses),
            exercises: Exercises::default(),
            bars,
        }
    }

    #[test]
    fn a_sequence_changes_bar_and_tempo_on_the_bar_line() {
        let mut metronome = started(settings(1_000.0, 4));
        let old = metronome.set_sequence(Some(Arc::new(Sequence {
            // 1 bar of 3 at 1,000 frames a pulse, then 1 bar of 2 at 500
            segments: vec![part(1_000.0, 3, 1), part(500.0, 2, 1)],
            repeat: false,
        })));
        assert!(old.is_none());
        metronome.run(true);
        assert_eq!(metronome.segment(), Some(0));
        let clicks = onsets(&mut metronome, 6_000);
        assert_eq!(clicks, [0, 1_000, 2_000, 3_000, 3_500]);
        // It stops at the end of a sequence that does not repeat
        assert!(!metronome.is_running());
    }

    #[test]
    fn a_repeating_sequence_starts_again_and_can_be_dropped() {
        let mut metronome = Metronome::new(48_000);
        metronome.set(settings(1_000.0, 4));
        metronome.set_sequence(Some(Arc::new(Sequence {
            segments: vec![part(1_000.0, 1, 1), part(1_000.0, 1, 1)],
            repeat: true,
        })));
        metronome.run(true);
        onsets(&mut metronome, 2_500);
        assert_eq!(metronome.segment(), Some(0));
        assert!(metronome.is_running());
        let old = metronome.set_sequence(None);
        assert!(old.is_some());
        assert_eq!(metronome.segment(), None);
    }

    #[test]
    fn the_speed_trainer_changes_tempo_on_the_bar_line() {
        // 120 BPM = 1,000 frames a pulse; +60 BPM every bar of 2 up to 240
        let mut metronome = started(with(
            Exercises {
                trainer: Some(Trainer {
                    from_bpm: 120.0,
                    to_bpm: 240.0,
                    step_bpm: 60.0,
                    every_bars: 1,
                }),
                ..Exercises::default()
            },
            2,
        ));
        let clicks = onsets(&mut metronome, 4_000);
        // Bar 0 at 120 (1,000 a pulse), bar 1 at 180 (667), bar 2 at 240 (500)
        let gaps: Vec<usize> = clicks.windows(2).map(|w| w[1] - w[0]).take(5).collect();
        for (gap, expected) in gaps.iter().zip([1_000, 1_000, 667, 667, 500]) {
            assert!(gap.abs_diff(expected) <= 1, "{gaps:?}");
        }
    }

    #[test]
    fn the_gap_trainer_silences_whole_bars_after_the_count_in() {
        let mut metronome = started(MetronomeSettings {
            count_in_bars: 1,
            ..with(
                Exercises {
                    gap: Some(Gap {
                        lead_bars: 0,
                        play_bars: 1,
                        silent_bars: 1,
                        grow: false,
                    }),
                    ..Exercises::default()
                },
                2,
            )
        });
        // Count-in (2 clicks), bar 0 heard (2), bar 1 silent, bar 2 heard
        assert_eq!(
            onsets(&mut metronome, 8_000),
            [0, 1_000, 2_000, 3_000, 6_000, 7_000]
        );
    }

    #[test]
    fn random_mutes_drop_about_their_share_of_clicks() {
        let mut metronome = started(with(
            Exercises {
                mute_chance: 0.3,
                ..Exercises::default()
            },
            4,
        ));
        let heard = onsets(&mut metronome, 1_000_000).len();
        assert!((600..800).contains(&heard), "{heard} of 1000 heard");
    }

    #[test]
    fn the_rhythm_replaces_the_clicks_with_strums() {
        let mut steps = [RhythmStep::Rest; MAX_STEPS];
        steps[0] = RhythmStep::Accent;
        steps[3] = RhythmStep::Note;
        let mut metronome = started(MetronomeSettings {
            pattern: BarPattern::new(2, &[], &[BeatState::Accent], 2, 0.5, 0),
            ..with(
                Exercises {
                    rhythm: Some(Rhythm {
                        steps,
                        len: 4,
                        bars: 1,
                        test_every: 0,
                        guide: false,
                    }),
                    ..Exercises::default()
                },
                2,
            )
        });
        let frames: Vec<Frame> = (0..2_000).map(|_| metronome.advance()).collect();
        let strums: Vec<(usize, bool)> = frames
            .iter()
            .enumerate()
            .filter_map(|(n, f)| f.strum.map(|(down, _)| (n, down)))
            .collect();
        // Down on 1, up on the "and" of 2; nothing else
        assert_eq!(strums, [(0, true), (1_500, false)]);
        assert!(frames.iter().all(|f| f.click.is_none()));
    }
}
