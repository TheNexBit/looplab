//! The HTDemucs network on one segment (`tools/export_demucs.py`): from the waveform and
//! its spectrogram as channels to the sources' spectrograms and waveforms.

use std::path::Path;

use rten::{Model, NodeId, ValueView};

#[derive(Debug)]
pub struct NetworkError(String);

impl std::fmt::Display for NetworkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for NetworkError {}

fn error(context: &'static str) -> impl Fn(&dyn std::fmt::Display) -> NetworkError {
    move |e| NetworkError(format!("{context}: {e}"))
}

/// What one call returns, row-major as the ONNX outputs.
pub struct Output {
    /// (sources, 4, bins, frames): re/im of left and right
    pub spec: Vec<f32>,
    /// (sources, 2, samples)
    pub wave: Vec<f32>,
}

pub struct Network {
    model: Model,
    inputs: [NodeId; 2],
    outputs: [NodeId; 2],
}

impl Network {
    pub fn load(path: &Path) -> Result<Self, NetworkError> {
        let model = Model::load_file(path).map_err(|e| error("loading the model")(&e))?;
        let node = |name: &str| model.node_id(name).map_err(|e| error("node")(&e));
        Ok(Self {
            inputs: [node("mix")?, node("mag")?],
            outputs: [node("spec")?, node("wave")?],
            model,
        })
    }

    /// One segment: `mix` is (2, samples) and `mag` (4, bins, frames), row-major.
    pub fn run(
        &self,
        mix: &[f32],
        mag: &[f32],
        bins: usize,
        frames: usize,
    ) -> Result<Output, NetworkError> {
        let samples = mix.len() / 2;
        let mix = ValueView::from_shape([1, 2, samples], mix).map_err(|e| error("mix")(&e))?;
        let mag = ValueView::from_shape([1, 4, bins, frames], mag).map_err(|e| error("mag")(&e))?;
        let [spec, wave] = self
            .model
            .run_n(
                vec![(self.inputs[0], mix.into()), (self.inputs[1], mag.into())],
                self.outputs,
                None,
            )
            .map_err(|e| error("running the model")(&e))?;
        let (_, spec) = spec
            .into_shape_vec::<f32, 5>()
            .map_err(|e| error("spec output")(&e))?;
        let (_, wave) = wave
            .into_shape_vec::<f32, 4>()
            .map_err(|e| error("wave output")(&e))?;
        Ok(Output { spec, wave })
    }
}
