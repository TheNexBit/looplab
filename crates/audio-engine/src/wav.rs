//! Minimal WAV writer: interleaved stereo PCM, 16 or 24 bit.

use std::fs::File;
use std::io::{self, BufWriter, Seek, SeekFrom, Write};
use std::path::Path;

use crate::pcm::CHANNELS;

#[cfg_attr(
    feature = "typed",
    derive(serde::Serialize, serde::Deserialize, specta::Type)
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BitDepth {
    Pcm16,
    Pcm24,
}

impl BitDepth {
    fn bytes(self) -> u16 {
        match self {
            Self::Pcm16 => 2,
            Self::Pcm24 => 3,
        }
    }
}

/// Size of the RIFF header written before the samples.
const HEADER_BYTES: u32 = 44;

pub struct WavWriter {
    out: BufWriter<File>,
    sample_rate: u32,
    depth: BitDepth,
    data_bytes: u32,
}

impl WavWriter {
    pub fn create(path: &Path, sample_rate: u32, depth: BitDepth) -> io::Result<Self> {
        let mut writer = Self {
            out: BufWriter::new(File::create(path)?),
            sample_rate,
            depth,
            data_bytes: 0,
        };
        writer.header()?;
        Ok(writer)
    }

    fn header(&mut self) -> io::Result<()> {
        let sample_rate = self.sample_rate;
        let block = CHANNELS as u16 * self.depth.bytes();
        let out = &mut self.out;
        out.write_all(b"RIFF")?;
        out.write_all(&(HEADER_BYTES - 8 + self.data_bytes).to_le_bytes())?;
        out.write_all(b"WAVEfmt ")?;
        out.write_all(&16_u32.to_le_bytes())?;
        out.write_all(&1_u16.to_le_bytes())?; // integer PCM
        out.write_all(&(CHANNELS as u16).to_le_bytes())?;
        out.write_all(&sample_rate.to_le_bytes())?;
        out.write_all(&(sample_rate * u32::from(block)).to_le_bytes())?;
        out.write_all(&block.to_le_bytes())?;
        out.write_all(&(self.depth.bytes() * 8).to_le_bytes())?;
        out.write_all(b"data")?;
        out.write_all(&self.data_bytes.to_le_bytes())
    }

    /// Appends interleaved stereo samples (clipped to -1..1).
    pub fn write(&mut self, interleaved: &[f32]) -> io::Result<()> {
        for &sample in interleaved {
            let s = sample.clamp(-1.0, 1.0);
            match self.depth {
                BitDepth::Pcm16 => {
                    self.out
                        .write_all(&((s * 32_767.0).round() as i16).to_le_bytes())?;
                }
                BitDepth::Pcm24 => {
                    let v = (s * 8_388_607.0).round() as i32;
                    self.out.write_all(&v.to_le_bytes()[..3])?;
                }
            }
        }
        let added = interleaved.len() as u64 * u64::from(self.depth.bytes());
        self.data_bytes = u32::try_from(u64::from(self.data_bytes) + added)
            .map_err(|_| io::Error::other("WAV files cannot exceed 4 GB"))?;
        Ok(())
    }

    /// Writes the final sizes into the header and closes the file.
    pub fn finish(mut self) -> io::Result<()> {
        self.out.seek(SeekFrom::Start(0))?;
        self.header()?;
        self.out.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_valid_header_and_samples() {
        // Never in the system temp folder (C:\): next to the shared build output
        let target = std::env::var_os("CARGO_TARGET_DIR").expect("CARGO_TARGET_DIR must be set");
        let dir = std::path::PathBuf::from(target).join("tmp/looplab-tests/wav");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("out.wav");
        let mut wav = WavWriter::create(&path, 48_000, BitDepth::Pcm24).unwrap();
        wav.write(&[0.5, -0.5, 1.0, -1.0]).unwrap();
        wav.finish().unwrap();

        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes.len(), 44 + 4 * 3);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 36 + 12);
        assert_eq!(
            u32::from_le_bytes(bytes[24..28].try_into().unwrap()),
            48_000
        );
        assert_eq!(u16::from_le_bytes(bytes[34..36].try_into().unwrap()), 24);
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()), 12);
        // 1.0 → 0x7FFFFF little-endian
        assert_eq!(&bytes[50..53], &[0xFF, 0xFF, 0x7F]);
    }
}
