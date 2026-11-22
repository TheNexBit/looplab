//! Separated tracks of the open song (voice, drums, bass…), mixed with their own levels
//! where the song is read, before the time stretch: speed, pitch, EQ and loops work on
//! the mix as on the song.
//!
//! The original song is one more input of the mix: while every track is at full level
//! and none is muted or soloed, the original is heard (the separated tracks add up to it
//! only nearly), and changing a level crossfades to the mix of the tracks.

use std::sync::Arc;

use crate::pcm::{CHANNELS, Pcm};

/// Most separated tracks a song can have.
pub const MAX_STEMS: usize = 8;
/// Inputs of the mix: the tracks, the original song and the other take (the backing).
pub(crate) const INPUTS: usize = MAX_STEMS + 2;
const ORIGINAL: usize = MAX_STEMS;
const OTHER: usize = MAX_STEMS + 1;

/// The separated tracks of the song, at the engine's rate, as long as the song.
pub struct Stems {
    tracks: Vec<Pcm>,
}

impl Stems {
    /// At most [`MAX_STEMS`] tracks; extra ones are ignored.
    pub fn new(mut tracks: Vec<Pcm>) -> Self {
        tracks.truncate(MAX_STEMS);
        Self { tracks }
    }

    pub fn len(&self) -> usize {
        self.tracks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tracks.is_empty()
    }
}

/// Another recording of the same take, heard instead of the song at the flick of a key: the
/// backing track without the guitar, or the lesson's mp3. Lined up with the song: frame `f`
/// of the song is frame `f + shift` of this one.
pub struct OtherTake {
    pcm: Arc<Pcm>,
    shift: i64,
}

impl OtherTake {
    /// `pcm` at the engine's rate (it may still be loading); `shift` in its frames.
    pub fn new(pcm: Arc<Pcm>, shift: i64) -> Self {
        Self { pcm, shift }
    }
}

/// Level of each separated track (0..1, mute and solo already applied).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StemLevels {
    pub gains: [f32; MAX_STEMS],
}

impl Default for StemLevels {
    /// Everything at full level: the original song is heard.
    fn default() -> Self {
        Self {
            gains: [1.0; MAX_STEMS],
        }
    }
}

impl StemLevels {
    /// Gain of every input of the mix: the original alone while nothing is changed, the other
    /// take alone while it is chosen.
    pub(crate) fn inputs(&self, stems: Option<&Stems>, other: bool) -> [f32; INPUTS] {
        let mut out = [0.0; INPUTS];
        if other {
            out[OTHER] = 1.0;
            return out;
        }
        let count = stems.map_or(0, Stems::len);
        if count == 0 || self.gains[..count].iter().all(|&g| g >= 1.0) {
            out[ORIGINAL] = 1.0;
        } else {
            out[..count].copy_from_slice(&self.gains[..count]);
        }
        out
    }
}

/// Where the reader takes the song from, for one block: the gains glide from `from` at the
/// block's first frame to `to` at its end, so a fader move never clicks.
pub(crate) struct Source<'a> {
    pub track: Option<&'a Pcm>,
    pub stems: Option<&'a Stems>,
    pub other: Option<&'a OtherTake>,
    pub from: [f32; INPUTS],
    pub to: [f32; INPUTS],
}

impl<'a> Source<'a> {
    /// The song alone, at full level (exports, tests).
    pub fn track(track: Option<&'a Pcm>) -> Self {
        let mut full = [0.0; INPUTS];
        full[ORIGINAL] = 1.0;
        Self {
            track,
            stems: None,
            other: None,
            from: full,
            to: full,
        }
    }

    /// One frame of the mix; `t` is how far into the block it is (0..1).
    #[inline]
    pub fn frame(&self, frame: u64, t: f32) -> [f32; CHANNELS] {
        let gain = |i: usize| self.from[i] + (self.to[i] - self.from[i]) * t;
        let mut out = [0.0; CHANNELS];
        let mut add = |pcm: &Pcm, at: u64, g: f32| {
            if g != 0.0 && at < pcm.frames() {
                let [l, r] = pcm.frame(at as usize);
                out[0] += l * g;
                out[1] += r * g;
            }
        };
        if let Some(track) = self.track {
            add(track, frame, gain(ORIGINAL));
        }
        if let Some(stems) = self.stems {
            for (i, pcm) in stems.tracks.iter().enumerate() {
                add(pcm, frame, gain(i));
            }
        }
        if let Some(other) = self.other
            && let Ok(at) = u64::try_from(frame as i64 + other.shift)
        {
            add(&other.pcm, at, gain(OTHER));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn constant(value: f32, frames: usize) -> Pcm {
        let mut pcm = Pcm::with_capacity(48_000, frames);
        pcm.extend_from_f32(&vec![value; frames * CHANNELS]);
        pcm
    }

    #[test]
    fn untouched_levels_play_the_original() {
        let stems = Stems::new(vec![constant(0.1, 10), constant(0.2, 10)]);
        let gains = StemLevels::default().inputs(Some(&stems), false);
        assert_eq!(gains[ORIGINAL], 1.0);
        assert!(gains[..MAX_STEMS].iter().all(|&g| g == 0.0));
    }

    #[test]
    fn a_lowered_track_switches_to_the_mix() {
        let track = constant(0.3, 10);
        let stems = Stems::new(vec![constant(0.1, 10), constant(0.2, 10)]);
        let mut levels = StemLevels::default();
        levels.gains[1] = 0.0;
        let gains = levels.inputs(Some(&stems), false);
        let source = Source {
            track: Some(&track),
            stems: Some(&stems),
            other: None,
            from: gains,
            to: gains,
        };
        let [l, _] = source.frame(3, 0.0);
        assert!((l - 0.1).abs() < 1e-3, "only the first track: {l}");
    }

    #[test]
    fn the_other_take_replaces_the_song_lined_up() {
        let track = constant(0.3, 10);
        let mut other = Pcm::with_capacity(48_000, 10);
        other.extend_from_f32(&[0.0, 0.0, 0.0, 0.0, 0.7, 0.7, 0.0, 0.0]);
        // Frame 0 of the song is frame 2 of the other take
        let other = OtherTake::new(Arc::new(other), 2);
        let gains = StemLevels::default().inputs(None, true);
        let source = Source {
            track: Some(&track),
            stems: None,
            other: Some(&other),
            from: gains,
            to: gains,
        };
        assert!((source.frame(0, 0.0)[0] - 0.7).abs() < 1e-3);
        assert!(source.frame(1, 0.0)[0].abs() < 1e-3);
    }

    #[test]
    fn gains_glide_across_a_block() {
        let track = constant(0.5, 10);
        let mut from = [0.0; INPUTS];
        from[ORIGINAL] = 1.0;
        let source = Source {
            track: Some(&track),
            stems: None,
            other: None,
            from,
            to: [0.0; INPUTS],
        };
        let [half, _] = source.frame(0, 0.5);
        assert!((half - 0.25).abs() < 1e-3, "{half}");
    }
}
