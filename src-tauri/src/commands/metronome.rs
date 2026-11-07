//! The bar and the click sounds in the units of the UI, shared by the clicks over a track
//! (`player::set_click`) and the metronome on its own (`set_metronome`, `run_metronome`).

use audio_engine::{
    BarPattern, BeatState, ClickSound, ClickSounds, Exercises, Gap, MAX_STEPS, MetronomeSettings,
    Rhythm, RhythmStep, Segment, Sequence, Trainer,
};
use serde::Deserialize;
use tauri::State;

use super::AppError;
use crate::state::AppState;

/// The shape of a bar, as MetroFlow describes it.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BarRequest {
    /// Pulses in a bar (the numerator)
    pub beats: u32,
    /// Note value of a pulse: 4 for x/4, 8 for x/8…
    pub unit: u32,
    /// How the pulses group into felt beats (7/8 as [2, 2, 3]); empty: every pulse is a beat
    pub grouping: Vec<u8>,
    /// Accent, normal or muted, one per felt beat
    pub states: Vec<BeatState>,
    /// Clicks per pulse: 1, 2 (eighths of a quarter), 3 (triplets), 4 (sixteenths)…
    pub subdivision: u32,
    /// Share of a pair given to its first click: 0.5 even … 0.75 hard shuffle
    pub swing: f32,
    /// Cross pulses over the bar (3 against 4…); 0 = off
    pub cross: u32,
}

impl BarRequest {
    pub fn pattern(&self) -> BarPattern {
        BarPattern::new(
            self.beats,
            &self.grouping,
            &self.states,
            self.subdivision,
            self.swing,
            self.cross,
        )
    }

    /// Seconds per pulse at `bpm` quarter notes per minute, as in DAWs (an eighth in 7/8
    /// lasts half a quarter).
    pub fn pulse_seconds(&self, bpm: f64) -> f64 {
        60.0 / bpm * 4.0 / f64::from(self.unit.max(1))
    }
}

/// Sound and level (0..1) of each kind of click.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SoundsRequest {
    pub accent_sound: ClickSound,
    pub accent_level: f32,
    pub beat_sound: ClickSound,
    pub beat_level: f32,
    pub sub_sound: ClickSound,
    pub sub_level: f32,
    pub cross_sound: ClickSound,
    pub cross_level: f32,
}

impl SoundsRequest {
    pub fn sounds(&self) -> ClickSounds {
        let level = |value: f32| value.clamp(0.0, 1.0);
        ClickSounds {
            accent: (self.accent_sound, level(self.accent_level)),
            beat: (self.beat_sound, level(self.beat_level)),
            sub: (self.sub_sound, level(self.sub_level)),
            cross: (self.cross_sound, level(self.cross_level)),
        }
    }
}

/// Speed trainer: from one tempo to another, a step every few bars.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrainerRequest {
    pub from_bpm: f64,
    pub to_bpm: f64,
    pub step_bpm: f64,
    pub every_bars: u32,
}

/// Gap trainer: bars heard, then bars silent.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GapRequest {
    pub lead_bars: u32,
    pub play_bars: u32,
    pub silent_bars: u32,
    pub grow: bool,
}

/// Rhythm to play: one cell per click of the grid, over one or two bars.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RhythmRequest {
    pub steps: Vec<RhythmStep>,
    pub bars: u32,
    /// After this many repetitions heard, one is silent; 0 = never
    pub test_every: u32,
    /// A quiet click on the beats that are rests
    pub guide: bool,
}

/// The exercises, each off when absent.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExercisesRequest {
    pub trainer: Option<TrainerRequest>,
    pub gap: Option<GapRequest>,
    /// Share of the clicks silenced at random, 0..0.9
    pub mute_chance: f32,
    pub rhythm: Option<RhythmRequest>,
}

impl ExercisesRequest {
    /// The engine's exercises; a rhythm whose cells do not fill `cells` is left out.
    pub fn exercises(&self, cells: usize) -> Exercises {
        let rhythm = self.rhythm.as_ref().and_then(|r| {
            if r.steps.is_empty() || r.steps.len() != cells || cells > MAX_STEPS {
                return None;
            }
            let mut steps = [RhythmStep::Rest; MAX_STEPS];
            steps[..cells].copy_from_slice(&r.steps);
            Some(Rhythm {
                steps,
                len: cells,
                bars: r.bars.clamp(1, 2),
                test_every: r.test_every,
                guide: r.guide,
            })
        });
        Exercises {
            trainer: self.trainer.as_ref().map(|t| Trainer {
                from_bpm: t.from_bpm.clamp(1.0, 1_000.0),
                to_bpm: t.to_bpm.clamp(1.0, 1_000.0),
                step_bpm: t.step_bpm.abs().max(0.1),
                every_bars: t.every_bars.max(1),
            }),
            gap: self.gap.as_ref().map(|g| Gap {
                lead_bars: g.lead_bars,
                play_bars: g.play_bars.max(1),
                silent_bars: g.silent_bars.max(1),
                grow: g.grow,
            }),
            mute_chance: self.mute_chance.clamp(0.0, 0.9),
            rhythm,
        }
    }
}

/// The metronome on its own: tempo, bar, count-in, volume, sounds and exercises.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MetronomeRequest {
    /// Quarter notes per minute
    pub bpm: f64,
    pub bar: BarRequest,
    pub count_in_bars: u32,
    /// 0..1
    pub volume: f32,
    pub sounds: SoundsRequest,
    pub exercises: ExercisesRequest,
}

/// Settings of the metronome on its own; while it runs they take over at once, keeping
/// the place in the bar. Starts the audio device if needed: no track is required.
#[tauri::command]
#[specta::specta]
pub fn set_metronome(
    state: State<'_, AppState>,
    settings: MetronomeRequest,
) -> Result<(), AppError> {
    let engine = state.engine()?;
    let part = part(
        settings.bpm,
        &settings.bar,
        &settings.exercises,
        0,
        engine.sample_rate(),
    );
    engine.set_metronome(MetronomeSettings {
        pulse_frames: part.pulse_frames,
        bpm: part.bpm,
        pattern: part.pattern,
        exercises: part.exercises,
        count_in_bars: settings.count_in_bars,
        volume: settings.volume.clamp(0.0, 1.0),
        sounds: settings.sounds.sounds(),
    });
    Ok(())
}

/// A bar with its tempo and exercises, in the engine's terms, for `bars` bars (0 = for ever).
fn part(bpm: f64, bar: &BarRequest, exercises: &ExercisesRequest, bars: u32, rate: u32) -> Segment {
    let bpm = bpm.clamp(1.0, 1_000.0);
    let pattern = bar.pattern();
    let rhythm_bars = exercises.rhythm.as_ref().map_or(1, |r| r.bars.clamp(1, 2));
    let cells = (pattern.pulses() * pattern.subdivision() * rhythm_bars) as usize;
    Segment {
        pulse_frames: bar.pulse_seconds(bpm) * f64::from(rate),
        bpm,
        pattern,
        exercises: exercises.exercises(cells),
        bars,
    }
}

/// One part of a sequence: a bar, its tempo and exercises, for some bars.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PartRequest {
    pub bpm: f64,
    pub bar: BarRequest,
    pub exercises: ExercisesRequest,
    /// At least 1
    pub bars: u32,
}

/// Parts played in order, then again (`repeat`) or to a stop.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SequenceRequest {
    pub parts: Vec<PartRequest>,
    pub repeat: bool,
}

/// Plays a sequence on the metronome on its own, from its first part (null: back to the
/// metronome's own bar). Start it with `run_metronome`.
#[tauri::command]
#[specta::specta]
pub fn set_sequence(
    state: State<'_, AppState>,
    sequence: Option<SequenceRequest>,
) -> Result<(), AppError> {
    let engine = state.engine()?;
    let rate = engine.sample_rate();
    engine.set_sequence(sequence.and_then(|sequence| {
        let segments: Vec<Segment> = sequence
            .parts
            .iter()
            .map(|p| part(p.bpm, &p.bar, &p.exercises, p.bars.max(1), rate))
            .collect();
        (!segments.is_empty()).then_some(Sequence {
            segments,
            repeat: sequence.repeat,
        })
    }));
    Ok(())
}

/// Starts the metronome on its own from its count-in, or stops it.
#[tauri::command]
#[specta::specta]
pub fn run_metronome(state: State<'_, AppState>, running: bool) -> Result<(), AppError> {
    state.engine()?.run_metronome(running);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pulse_is_the_note_value_of_the_numerator() {
        let bar = |unit| BarRequest {
            beats: 7,
            unit,
            grouping: vec![2, 2, 3],
            states: vec![],
            subdivision: 1,
            swing: 0.5,
            cross: 0,
        };
        // 120 quarters a minute: a quarter is 0.5 s, an eighth 0.25 s
        assert!((bar(4).pulse_seconds(120.0) - 0.5).abs() < 1e-12);
        assert!((bar(8).pulse_seconds(120.0) - 0.25).abs() < 1e-12);
        assert_eq!(bar(8).pattern().pulses(), 7);
    }
}
