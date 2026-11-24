//! Separated tracks of the open song (voice, drums, bass…), mixed with their own levels
//! where the song is read, before the time stretch: speed, pitch, EQ and loops work on
//! the mix as on the song.
//!
//! The original song is one more input of the mix: while every track is at full level
//! and none is muted or soloed, the original is heard (the separated tracks add up to it
//! only nearly), and changing a level crossfades to the mix of the tracks.
//!
//! Stems from files (a solo and its backing track, opened together like Song Master's «Open as
//! stems») use the same mix: the open file is one lane with its own level (`original`), the
//! other files are the tracks, each moved onto the open file's time (`shifted`).

use crate::pcm::{CHANNELS, Pcm};

/// Most separated tracks a song can have.
pub const MAX_STEMS: usize = 8;
/// Inputs of the mix: the tracks and the original song.
pub(crate) const INPUTS: usize = MAX_STEMS + 1;
const ORIGINAL: usize = MAX_STEMS;

/// The separated tracks of the song, at the engine's rate, as long as the song.
pub struct Stems {
    tracks: Vec<Pcm>,
}

impl std::fmt::Debug for Stems {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Stems({} tracks)", self.tracks.len())
    }
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

/// Level of each separated track (0..1, mute and solo already applied).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StemLevels {
    pub gains: [f32; MAX_STEMS],
    /// Stems from files: the open file's own level. `None` for separated tracks, where the
    /// original is heard only while every track is untouched.
    pub original: Option<f32>,
}

impl Default for StemLevels {
    /// Everything at full level: the original song is heard.
    fn default() -> Self {
        Self {
            gains: [1.0; MAX_STEMS],
            original: None,
        }
    }
}

impl StemLevels {
    /// Gain of every input of the mix: the original alone while nothing is changed.
    pub(crate) fn inputs(&self, stems: Option<&Stems>) -> [f32; INPUTS] {
        let mut out = [0.0; INPUTS];
        let count = stems.map_or(0, Stems::len);
        if let Some(original) = self.original {
            // Stems from files: every lane, the open file too, at its own level
            out[ORIGINAL] = original;
            out[..count].copy_from_slice(&self.gains[..count]);
            return out;
        }
        if count == 0 || self.gains[..count].iter().all(|&g| g >= 1.0) {
            out[ORIGINAL] = 1.0;
        } else {
            out[..count].copy_from_slice(&self.gains[..count]);
        }
        out
    }
}

/// `pcm` moved onto another file's time: what it plays at `frames` from its start is heard at
/// 0 (the file starts earlier, its first frames are cut), or `-frames` of silence come first
/// (it starts later).
pub fn shifted(pcm: &Pcm, frames: i64) -> Pcm {
    let total = pcm.frames() as i64;
    let skip = frames.max(0);
    let silence = (-frames).max(0) as usize;
    let kept = (total - skip).max(0) as usize;
    let mut out = Pcm::with_capacity(pcm.sample_rate(), silence + kept);
    let mut samples = vec![0.0; (silence + kept) * CHANNELS];
    for i in 0..kept {
        let [l, r] = pcm.frame(skip as usize + i);
        let at = (silence + i) * CHANNELS;
        samples[at] = l;
        samples[at + 1] = r;
    }
    out.extend_from_f32(&samples);
    out
}

/// Where the reader takes the song from, for one block: the gains glide from `from` at the
/// block's first frame to `to` at its end, so a fader move never clicks.
pub(crate) struct Source<'a> {
    pub track: Option<&'a Pcm>,
    pub stems: Option<&'a Stems>,
    pub from: [f32; INPUTS],
    pub to: [f32; INPUTS],
}

impl<'a> Source<'a> {
    /// The song alone, at full level (tests).
    #[cfg(test)]
    pub fn track(track: Option<&'a Pcm>) -> Self {
        let mut full = [0.0; INPUTS];
        full[ORIGINAL] = 1.0;
        Self {
            track,
            stems: None,
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
        let gains = StemLevels::default().inputs(Some(&stems));
        assert_eq!(gains[ORIGINAL], 1.0);
        assert!(gains[..MAX_STEMS].iter().all(|&g| g == 0.0));
    }

    #[test]
    fn a_lowered_track_switches_to_the_mix() {
        let track = constant(0.3, 10);
        let stems = Stems::new(vec![constant(0.1, 10), constant(0.2, 10)]);
        let mut levels = StemLevels::default();
        levels.gains[1] = 0.0;
        let gains = levels.inputs(Some(&stems));
        let source = Source {
            track: Some(&track),
            stems: Some(&stems),
            from: gains,
            to: gains,
        };
        let [l, _] = source.frame(3, 0.0);
        assert!((l - 0.1).abs() < 1e-3, "only the first track: {l}");
    }

    #[test]
    fn stems_from_files_mix_every_lane_at_its_level() {
        let track = constant(0.3, 10);
        let stems = Stems::new(vec![constant(0.1, 10)]);
        // The backing alone (solo), the open file silent
        let levels = StemLevels {
            original: Some(0.0),
            ..StemLevels::default()
        };
        let gains = levels.inputs(Some(&stems));
        let source = Source {
            track: Some(&track),
            stems: Some(&stems),
            from: gains,
            to: gains,
        };
        let [l, _] = source.frame(3, 0.0);
        assert!((l - 0.1).abs() < 1e-3, "only the backing: {l}");
        // Both at full level: they add up, the original is not taken alone
        let both = StemLevels {
            original: Some(1.0),
            ..StemLevels::default()
        }
        .inputs(Some(&stems));
        assert_eq!(both[ORIGINAL], 1.0);
        assert_eq!(both[0], 1.0);
    }

    #[test]
    fn a_file_is_moved_onto_the_open_files_time() {
        let mut pcm = Pcm::with_capacity(48_000, 4);
        pcm.extend_from_f32(&[0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4]);
        // Starts later: silence first
        let later = shifted(&pcm, -2);
        assert_eq!(later.frames(), 6);
        assert!(later.frame(1)[0].abs() < 1e-3);
        assert!((later.frame(2)[0] - 0.1).abs() < 1e-3);
        // Starts earlier: its first frames are cut
        let earlier = shifted(&pcm, 1);
        assert_eq!(earlier.frames(), 3);
        assert!((earlier.frame(0)[0] - 0.2).abs() < 1e-3);
        assert_eq!(shifted(&pcm, 10).frames(), 0);
    }

    #[test]
    fn gains_glide_across_a_block() {
        let track = constant(0.5, 10);
        let mut from = [0.0; INPUTS];
        from[ORIGINAL] = 1.0;
        let source = Source {
            track: Some(&track),
            stems: None,
            from,
            to: [0.0; INPUTS],
        };
        let [half, _] = source.frame(0, 0.5);
        assert!((half - 0.25).abs() < 1e-3, "{half}");
    }
}
