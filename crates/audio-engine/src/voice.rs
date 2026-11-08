//! The counting voice of the metronome: "uno, due, tre…" on the pulses and "e" on the
//! subdivisions, spoken over the clicks.
//!
//! The words are short recordings (`VoiceBank`), prepared once off the audio thread: read
//! from WAV, trimmed of their silences, levelled and resampled to the output rate. The audio
//! thread only reads them (`SpokenWord`): no allocation, no locks.

use std::sync::Arc;

/// How the voice counts, chosen in the metronome.
#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[cfg_attr(feature = "typed", serde(rename_all = "camelCase"))]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CountVoice {
    /// The pulses are counted aloud
    pub on: bool,
    /// "e" on the subdivisions too (uno e due e…)
    pub subdivisions: bool,
    /// 0..1, on top of the metronome volume
    pub level: f32,
}

impl Default for CountVoice {
    fn default() -> Self {
        Self {
            on: false,
            subdivisions: false,
            level: 0.9,
        }
    }
}

/// The syllables said between the numbers, as in American counting: eighths "1 and",
/// sixteenths "1 e and a", triplets "1 trip let", quintuplets "1 e and a da", sextuplets
/// "1 trip let and trip let".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Syllable {
    And,
    E,
    A,
    Da,
    Trip,
    Let,
}

impl Syllable {
    /// In the order of `VoiceBank::from_wavs`.
    pub const ALL: [Self; 6] = [Self::And, Self::E, Self::A, Self::Da, Self::Trip, Self::Let];

    /// The syllable of click `sub` (1 = the first after the number) of a pulse split in
    /// `of` clicks. Splits beyond six fall back to "and" on every click.
    pub fn of(sub: u32, of: u32) -> Self {
        use Syllable::{A, And, Da, E, Let, Trip};
        let pattern: &[Syllable] = match of {
            2 => &[And],
            3 => &[Trip, Let],
            4 => &[E, And, A],
            5 => &[E, And, A, Da],
            6 => &[Trip, Let, And, Trip, Let],
            _ => &[],
        };
        pattern
            .get(sub.saturating_sub(1) as usize)
            .copied()
            .unwrap_or(And)
    }

    const fn index(self) -> usize {
        match self {
            Self::And => 0,
            Self::E => 1,
            Self::A => 2,
            Self::Da => 3,
            Self::Trip => 4,
            Self::Let => 5,
        }
    }
}

/// The word said on a click: a number for a pulse, a syllable for a subdivision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Word {
    /// 1 = "one" … (past the last recorded number it starts again from "one")
    Number(u32),
    Syllable(Syllable),
}

/// Peak every word is levelled to, so "e" is as loud as "quattordici".
const PEAK: f32 = 0.9;
/// Below this a sample counts as silence when trimming.
const SILENCE: f32 = 0.02;
/// Fade at both ends of a trimmed word, in seconds: no click where it was cut.
const FADE: f32 = 0.004;

/// The recorded words at the output rate: the syllables and the numbers from "one".
#[derive(Debug, Default, PartialEq)]
pub struct VoiceBank {
    syllables: [Vec<f32>; 6],
    numbers: Vec<Vec<f32>>,
}

impl VoiceBank {
    /// Builds the bank from WAV files (16-bit PCM, any rate, mono or stereo): `syllables` in
    /// the order of `Syllable::ALL`, `numbers` from "one". Words that cannot be read stay
    /// silent.
    pub fn from_wavs(syllables: [&[u8]; 6], numbers: &[&[u8]], sample_rate: u32) -> Self {
        let prepare = |bytes: &[u8]| {
            read_wav(bytes)
                .map(|(samples, rate)| prepare(&samples, rate, sample_rate))
                .unwrap_or_default()
        };
        Self {
            syllables: syllables.map(prepare),
            numbers: numbers.iter().map(|bytes| prepare(bytes)).collect(),
        }
    }

    /// How many numbers were recorded.
    pub fn words(&self) -> usize {
        self.numbers.len()
    }

    /// Length in samples of the shortest word, syllables included (0 if one is missing).
    pub fn shortest(&self) -> usize {
        self.numbers
            .iter()
            .chain(&self.syllables)
            .map(Vec::len)
            .min()
            .unwrap_or(0)
    }

    fn samples(&self, word: Word) -> &[f32] {
        match word {
            Word::Syllable(syllable) => &self.syllables[syllable.index()],
            Word::Number(n) if !self.numbers.is_empty() => {
                let count = self.numbers.len() as u32;
                &self.numbers[((n.max(1) - 1) % count) as usize]
            }
            Word::Number(_) => &[],
        }
    }
}

/// Reads a 16-bit PCM WAV into mono samples and its rate; None if it is not one.
pub(crate) fn read_wav(bytes: &[u8]) -> Option<(Vec<f32>, u32)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let u16_at = |at: usize| {
        bytes
            .get(at..at + 2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
    };
    let u32_at = |at: usize| {
        bytes
            .get(at..at + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let mut at = 12;
    let mut format = None;
    while at + 8 <= bytes.len() {
        let id = &bytes[at..at + 4];
        let size = u32_at(at + 4)? as usize;
        let body = at + 8;
        if id == b"fmt " {
            let (kind, channels, rate, bits) = (
                u16_at(body)?,
                u16_at(body + 2)?,
                u32_at(body + 4)?,
                u16_at(body + 14)?,
            );
            if kind != 1 || bits != 16 || channels == 0 {
                return None;
            }
            format = Some((usize::from(channels), rate));
        } else if id == b"data" {
            let (channels, rate) = format?;
            let data = bytes.get(body..(body + size).min(bytes.len()))?;
            let samples = data
                .chunks_exact(2 * channels)
                .map(|frame| {
                    frame
                        .as_chunks::<2>()
                        .0
                        .iter()
                        .map(|s| f32::from(i16::from_le_bytes(*s)) / 32_768.0)
                        .sum::<f32>()
                        / channels as f32
                })
                .collect();
            return Some((samples, rate));
        }
        at = body + size + size % 2;
    }
    None
}

/// Trims the silences, levels the peak, resamples to `to_rate` and fades the ends.
pub(crate) fn prepare(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    let loud = |s: &f32| s.abs() > SILENCE;
    let (Some(first), Some(last)) = (
        samples.iter().position(loud),
        samples.iter().rposition(loud),
    ) else {
        return Vec::new();
    };
    let word = &samples[first..=last];
    let peak = word.iter().fold(0.0_f32, |m, s| m.max(s.abs()));
    let gain = if peak > 0.0 { PEAK / peak } else { 0.0 };

    // Linear interpolation is plenty for a spoken word
    let step = f64::from(from_rate) / f64::from(to_rate.max(1));
    let length = ((word.len() as f64) / step).floor() as usize;
    let mut out: Vec<f32> = (0..length)
        .map(|i| {
            let x = i as f64 * step;
            let j = x.floor() as usize;
            let t = (x - j as f64) as f32;
            let a = word[j];
            let b = word.get(j + 1).copied().unwrap_or(a);
            (a + (b - a) * t) * gain
        })
        .collect();

    let fade = ((FADE * to_rate as f32) as usize).min(out.len() / 2);
    for i in 0..fade {
        let g = i as f32 / fade as f32;
        out[i] *= g;
        let end = out.len() - 1 - i;
        out[end] *= g;
    }
    out
}

/// The word being said: real-time safe, it only reads the shared bank.
pub(crate) struct SpokenWord {
    bank: Arc<VoiceBank>,
    word: Word,
    at: usize,
    level: f32,
    playing: bool,
}

impl SpokenWord {
    pub fn new() -> Self {
        Self {
            bank: Arc::new(VoiceBank::default()),
            word: Word::Number(1),
            at: 0,
            level: 0.0,
            playing: false,
        }
    }

    /// New words; the old bank is handed back, to be freed off the audio thread.
    pub fn set_bank(&mut self, bank: Arc<VoiceBank>) -> Arc<VoiceBank> {
        self.playing = false;
        std::mem::replace(&mut self.bank, bank)
    }

    /// Says `word` at `level` (0..1), cutting the one being said.
    pub fn say(&mut self, word: Word, level: f32) {
        self.word = word;
        self.at = 0;
        self.level = level.clamp(0.0, 1.0);
        self.playing = true;
    }

    pub fn stop(&mut self) {
        self.playing = false;
    }

    /// Next sample of the voice (0 when silent).
    #[inline]
    pub fn next(&mut self, volume: f32) -> f32 {
        if !self.playing {
            return 0.0;
        }
        let samples = self.bank.samples(self.word);
        match samples.get(self.at) {
            Some(&sample) => {
                self.at += 1;
                sample * self.level * volume
            }
            None => {
                self.playing = false;
                0.0
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 16-bit mono WAV of `samples` at `rate`, with an 18-byte fmt chunk as Windows writes.
    fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
        let data: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        let mut out = b"RIFF".to_vec();
        out.extend(((4 + 26 + 8 + data.len()) as u32).to_le_bytes());
        out.extend(b"WAVEfmt ");
        out.extend(18_u32.to_le_bytes());
        out.extend(1_u16.to_le_bytes());
        out.extend(1_u16.to_le_bytes());
        out.extend(rate.to_le_bytes());
        out.extend((rate * 2).to_le_bytes());
        out.extend(2_u16.to_le_bytes());
        out.extend(16_u16.to_le_bytes());
        out.extend(0_u16.to_le_bytes());
        out.extend(b"data");
        out.extend((data.len() as u32).to_le_bytes());
        out.extend(data);
        out
    }

    /// Silence, then a loud word of `length` samples, then silence.
    fn word(length: usize, amplitude: i16) -> Vec<i16> {
        let mut samples = vec![0; 100];
        samples.extend((0..length).map(|i| if i % 2 == 0 { amplitude } else { -amplitude }));
        samples.extend(vec![0; 100]);
        samples
    }

    const AND: Word = Word::Syllable(Syllable::And);

    #[test]
    fn subdivisions_are_counted_as_in_american_counting() {
        use Syllable::{A, And, Da, E, Let, Trip};
        let said = |of: u32| (1..of).map(|sub| Syllable::of(sub, of)).collect::<Vec<_>>();
        assert_eq!(said(2), [And], "1 and");
        assert_eq!(said(3), [Trip, Let], "1 trip let");
        assert_eq!(said(4), [E, And, A], "1 e and a");
        assert_eq!(said(5), [E, And, A, Da], "1 e and a da");
        assert_eq!(
            said(6),
            [Trip, Let, And, Trip, Let],
            "1 trip let and trip let"
        );
        assert_eq!(said(8), [And; 7], "beyond six: and");
    }

    #[test]
    fn words_are_trimmed_levelled_and_resampled() {
        let one = wav(&word(4_800, 8_000), 48_000);
        let and = wav(&word(2_400, 30_000), 48_000);
        let bank = VoiceBank::from_wavs([&and; 6], &[&one], 24_000);
        // Silences gone, half the samples at half the rate
        assert_eq!(bank.samples(Word::Number(1)).len(), 2_400);
        assert_eq!(bank.samples(AND).len(), 1_200);
        // Both levelled to the same peak, however loud they were recorded
        let peak = |s: &[f32]| s.iter().fold(0.0_f32, |m, v| m.max(v.abs()));
        assert!((peak(bank.samples(Word::Number(1))) - PEAK).abs() < 0.01);
        assert!((peak(bank.samples(AND)) - PEAK).abs() < 0.01);
        // Faded ends: no click where it was cut
        assert_eq!(bank.samples(AND)[0], 0.0);
    }

    #[test]
    fn numbers_past_the_last_start_again_and_bad_files_are_silent() {
        let one = wav(&word(100, 9_000), 48_000);
        let two = wav(&word(200, 9_000), 48_000);
        let bank = VoiceBank::from_wavs([b"not a wav"; 6], &[&one, &two], 48_000);
        assert_eq!(
            bank.samples(Word::Number(3)).len(),
            bank.samples(Word::Number(1)).len()
        );
        assert_eq!(
            bank.samples(Word::Number(4)).len(),
            bank.samples(Word::Number(2)).len()
        );
        assert!(bank.samples(AND).is_empty());
    }

    #[test]
    fn a_word_plays_once_then_falls_silent() {
        let one = wav(&word(100, 9_000), 48_000);
        let mut voice = SpokenWord::new();
        let _ = voice.set_bank(Arc::new(VoiceBank::from_wavs([&[]; 6], &[&one], 48_000)));
        assert_eq!(voice.next(1.0), 0.0, "silent until a word is said");
        voice.say(Word::Number(1), 1.0);
        let heard: Vec<f32> = (0..300).map(|_| voice.next(1.0)).collect();
        assert!(heard[..100].iter().any(|s| s.abs() > 0.5));
        assert!(heard[100..].iter().all(|&s| s == 0.0));
    }
}
