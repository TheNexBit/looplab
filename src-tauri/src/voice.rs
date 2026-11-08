//! The words of the metronome's counting voice, built into the app in two languages: "e" and
//! "uno" … "sedici", "and" and "one" … "sixteen", recorded with Windows' voices by
//! `scripts\09-genera-voce.cmd`.

use audio_engine::VoiceBank;
use serde::Deserialize;

/// The language the voice counts in.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum VoiceLanguage {
    #[default]
    It,
    En,
}

/// One language's words: "and", then the numbers from one.
macro_rules! words {
    ($lang:literal) => {
        (
            include_bytes!(concat!("../voice/", $lang, "/e.wav")).as_slice(),
            [
                include_bytes!(concat!("../voice/", $lang, "/01.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/02.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/03.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/04.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/05.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/06.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/07.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/08.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/09.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/10.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/11.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/12.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/13.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/14.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/15.wav")).as_slice(),
                include_bytes!(concat!("../voice/", $lang, "/16.wav")).as_slice(),
            ],
        )
    };
}

const ITALIAN: (&[u8], [&[u8]; 16]) = words!("it");
const ENGLISH: (&[u8], [&[u8]; 16]) = words!("en");

/// The words of `language`, ready for an engine running at `sample_rate`.
pub fn bank(language: VoiceLanguage, sample_rate: u32) -> VoiceBank {
    let (and, numbers) = match language {
        VoiceLanguage::It => ITALIAN,
        VoiceLanguage::En => ENGLISH,
    };
    VoiceBank::from_wavs(and, &numbers, sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_built_in_word_is_heard_in_both_languages() {
        for language in [VoiceLanguage::It, VoiceLanguage::En] {
            let bank = bank(language, 48_000);
            assert_eq!(bank.words(), 16, "{language:?}: sixteen numbers");
            assert!(
                bank.shortest() > 2_000,
                "{language:?}: a word lasts ~40 ms or more"
            );
        }
        assert_ne!(
            bank(VoiceLanguage::It, 48_000),
            bank(VoiceLanguage::En, 48_000)
        );
    }
}
