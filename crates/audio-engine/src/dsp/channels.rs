//! Channel selection and centre removal/isolation, switched with a short crossfade.
//!
//! Centre removal subtracts one side from the other: whatever is panned dead centre
//! (often vocals, bass, kick) cancels out. It is a basic trick, not real separation.

use crate::pcm::CHANNELS;

/// Crossfade length when switching mode.
const FADE_SECONDS: f32 = 0.01;

#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ChannelMode {
    #[default]
    Stereo,
    /// Left channel on both speakers
    Left,
    /// Right channel on both speakers
    Right,
    Mono,
    /// Left minus right: removes what is panned in the centre
    RemoveCenter,
    /// Left plus right: keeps the centre, the sides get quieter
    IsolateCenter,
}

#[inline]
pub(crate) fn apply(mode: ChannelMode, [l, r]: [f32; CHANNELS]) -> [f32; CHANNELS] {
    match mode {
        ChannelMode::Stereo => [l, r],
        ChannelMode::Left => [l, l],
        ChannelMode::Right => [r, r],
        ChannelMode::Mono | ChannelMode::IsolateCenter => {
            let mid = (l + r) * 0.5;
            [mid, mid]
        }
        ChannelMode::RemoveCenter => {
            // Same on both sides: a stereo "left minus right" would vanish when summed to mono
            let side = (l - r) * 0.5;
            [side, side]
        }
    }
}

pub struct Channels {
    current: ChannelMode,
    previous: ChannelMode,
    /// 0 → previous mode, 1 → current mode
    fade: f32,
    step: f32,
}

impl Channels {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            current: ChannelMode::Stereo,
            previous: ChannelMode::Stereo,
            fade: 1.0,
            step: 1.0 / (FADE_SECONDS * sample_rate as f32).max(1.0),
        }
    }

    /// Already in `mode`, with no crossfade (offline rendering).
    pub fn with_mode(sample_rate: u32, mode: ChannelMode) -> Self {
        Self {
            current: mode,
            previous: mode,
            ..Self::new(sample_rate)
        }
    }

    pub fn set(&mut self, mode: ChannelMode) {
        if mode != self.current {
            self.previous = self.current;
            self.current = mode;
            self.fade = 0.0;
        }
    }

    pub fn process(&mut self, block: &mut [f32]) {
        if self.fade >= 1.0 && self.current == ChannelMode::Stereo {
            return;
        }
        for frame in block.as_chunks_mut::<CHANNELS>().0 {
            let input = *frame;
            let new = apply(self.current, input);
            *frame = if self.fade < 1.0 {
                let old = apply(self.previous, input);
                self.fade = (self.fade + self.step).min(1.0);
                [
                    old[0] + (new[0] - old[0]) * self.fade,
                    old[1] + (new[1] - old[1]) * self.fade,
                ]
            } else {
                new
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_route_the_channels() {
        assert_eq!(apply(ChannelMode::Left, [0.4, 0.2]), [0.4, 0.4]);
        assert_eq!(apply(ChannelMode::Right, [0.4, 0.2]), [0.2, 0.2]);
        assert_eq!(apply(ChannelMode::Mono, [0.4, 0.2]), [0.3, 0.3]);
    }

    #[test]
    fn remove_center_cancels_what_is_in_the_middle() {
        assert_eq!(apply(ChannelMode::RemoveCenter, [0.5, 0.5]), [0.0, 0.0]);
        let hard_left = apply(ChannelMode::RemoveCenter, [0.5, 0.0]);
        assert!(hard_left[0] > 0.2);
    }

    #[test]
    fn switching_crossfades() {
        let mut channels = Channels::new(1_000); // 10 ms = 10 frames
        channels.set(ChannelMode::RemoveCenter);
        let mut block = vec![0.5; 40];
        channels.process(&mut block);
        assert!(block[0] > 0.0 && block[0] < 0.5, "starts from the old mode");
        assert_eq!(block[38], 0.0, "ends in the new mode");
    }
}
