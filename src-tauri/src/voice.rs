//! The words of the metronome's counting voice, built into the app: "e" and "uno" … "sedici",
//! recorded with Windows' Italian voice by `scripts\09-genera-voce.cmd`.

use audio_engine::VoiceBank;

const AND: &[u8] = include_bytes!("../voice/it/e.wav");
const NUMBERS: [&[u8]; 16] = [
    include_bytes!("../voice/it/01.wav"),
    include_bytes!("../voice/it/02.wav"),
    include_bytes!("../voice/it/03.wav"),
    include_bytes!("../voice/it/04.wav"),
    include_bytes!("../voice/it/05.wav"),
    include_bytes!("../voice/it/06.wav"),
    include_bytes!("../voice/it/07.wav"),
    include_bytes!("../voice/it/08.wav"),
    include_bytes!("../voice/it/09.wav"),
    include_bytes!("../voice/it/10.wav"),
    include_bytes!("../voice/it/11.wav"),
    include_bytes!("../voice/it/12.wav"),
    include_bytes!("../voice/it/13.wav"),
    include_bytes!("../voice/it/14.wav"),
    include_bytes!("../voice/it/15.wav"),
    include_bytes!("../voice/it/16.wav"),
];

/// The words, ready for an engine running at `sample_rate`.
pub fn bank(sample_rate: u32) -> VoiceBank {
    VoiceBank::from_wavs(AND, &NUMBERS, sample_rate)
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_built_in_word_is_heard() {
        let bank = super::bank(48_000);
        assert_eq!(bank.words(), 16, "sixteen numbers");
        assert!(bank.shortest() > 2_000, "a word lasts at least ~40 ms");
    }
}
