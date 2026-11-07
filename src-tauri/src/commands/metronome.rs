//! The bar and the click sounds in the units of the UI, shared by the clicks over a track
//! (`player::set_click`) and the metronome on its own (`set_metronome`, `run_metronome`).

use audio_engine::{BarPattern, BeatState, ClickSound, ClickSounds, MetronomeSettings};
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

/// The metronome on its own: tempo, bar, count-in, volume and sounds.
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
    let bpm = settings.bpm.clamp(1.0, 1_000.0);
    engine.set_metronome(MetronomeSettings {
        pulse_frames: settings.bar.pulse_seconds(bpm) * f64::from(engine.sample_rate()),
        pattern: settings.bar.pattern(),
        count_in_bars: settings.count_in_bars,
        volume: settings.volume.clamp(0.0, 1.0),
        sounds: settings.sounds.sounds(),
    });
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
