//! The Beat This! network, run with rten from its ONNX export
//! (`tools/export_onnx.py`), and the chunking of a whole piece exactly as its
//! `Spect2Frames` does it.

use std::path::Path;

use rten::{Model, ValueView};

use crate::spectrogram::N_MELS;

/// Frames per model call: 30 s, the length the network was trained on.
pub const CHUNK: usize = 1500;
/// Frames dropped at each edge of a chunk, where the network sees no context.
pub const BORDER: usize = 6;

/// Logits of one spectrogram frame: positive means "a beat (downbeat) is here".
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameLogits {
    pub beat: f32,
    pub downbeat: f32,
}

#[derive(Debug)]
pub struct ModelError(String);

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ModelError {}

fn error(context: &str) -> impl Fn(&dyn std::fmt::Display) -> ModelError + '_ {
    move |e| ModelError(format!("{context}: {e}"))
}

pub struct BeatModel {
    model: Model,
    input: rten::NodeId,
    outputs: [rten::NodeId; 2],
}

impl BeatModel {
    pub fn load(path: &Path) -> Result<Self, ModelError> {
        let model = Model::load_file(path).map_err(|e| error("loading the model")(&e))?;
        let node = |name: &str| model.node_id(name).map_err(|e| error(name)(&e));
        Ok(Self {
            input: node("spect")?,
            outputs: [node("beat")?, node("downbeat")?],
            model,
        })
    }

    /// One call of the network on `frames × N_MELS` values, without chunking.
    pub fn run(&self, spect: &[f32]) -> Result<Vec<FrameLogits>, ModelError> {
        let frames = spect.len() / N_MELS;
        let input = ValueView::from_shape([1, frames, N_MELS], spect)
            .map_err(|e| error("input shape")(&e))?;
        let [beat, downbeat] = self
            .model
            .run_n(vec![(self.input, input.into())], self.outputs, None)
            .map_err(|e| error("running the model")(&e))?;
        let (_, beat) = beat
            .into_shape_vec::<f32, 2>()
            .map_err(|e| error("beat output")(&e))?;
        let (_, downbeat) = downbeat
            .into_shape_vec::<f32, 2>()
            .map_err(|e| error("downbeat output")(&e))?;
        Ok(beat
            .into_iter()
            .zip(downbeat)
            .map(|(beat, downbeat)| FrameLogits { beat, downbeat })
            .collect())
    }

    /// Logits for a whole piece, as Beat This! computes them: chunks of [`CHUNK`]
    /// frames overlapping by [`BORDER`], the first and last padded with silence, the
    /// last moved back to end with the piece; where chunks overlap the earlier wins.
    /// `progress` receives the fraction done after each chunk.
    pub fn predict(
        &self,
        spect: &[f32],
        mut progress: impl FnMut(f32),
    ) -> Result<Vec<FrameLogits>, ModelError> {
        let len = spect.len() / N_MELS;
        let starts = chunk_starts(len);
        let mut out = vec![
            FrameLogits {
                beat: -1000.0,
                downbeat: -1000.0
            };
            len
        ];
        let mut written = vec![false; len];
        for (done, &start) in starts.iter().enumerate() {
            let from = start.max(0) as usize;
            let to = ((start + CHUNK as isize) as usize).min(len);
            let left = (-start).max(0) as usize;
            let right = (start + CHUNK as isize - len as isize).clamp(0, BORDER as isize) as usize;
            let mut chunk = vec![0.0f32; (left + (to - from) + right) * N_MELS];
            chunk[left * N_MELS..(left + to - from) * N_MELS]
                .copy_from_slice(&spect[from * N_MELS..to * N_MELS]);
            let logits = self.run(&chunk)?;
            // Drop the borders; chunk frame i is piece frame start + i
            let kept = &logits[BORDER..logits.len().saturating_sub(BORDER).max(BORDER)];
            for (i, value) in kept.iter().enumerate() {
                let frame = start + (BORDER + i) as isize;
                if let Ok(frame) = usize::try_from(frame)
                    && frame < len
                    && !written[frame]
                {
                    out[frame] = *value;
                    written[frame] = true;
                }
            }
            progress((done + 1) as f32 / starts.len() as f32);
        }
        Ok(out)
    }
}

/// `split_piece(..., avoid_short_end=True)`: first frame of each chunk, the first one
/// at `-BORDER`.
fn chunk_starts(len: usize) -> Vec<isize> {
    let step = CHUNK - 2 * BORDER;
    let mut starts: Vec<isize> = (0..)
        .map(|k| k as isize * step as isize - BORDER as isize)
        .take_while(|&s| s < len as isize - BORDER as isize)
        .collect();
    if len > step
        && let Some(last) = starts.last_mut()
    {
        *last = len as isize - (CHUNK - BORDER) as isize;
    }
    if starts.is_empty() {
        starts.push(-(BORDER as isize));
    }
    starts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_follow_split_piece() {
        assert_eq!(chunk_starts(351), vec![-6]);
        assert_eq!(chunk_starts(1488), vec![-6]);
        assert_eq!(chunk_starts(2001), vec![-6, 507]);
        assert_eq!(chunk_starts(4000), vec![-6, 1482, 2506]);
    }
}
