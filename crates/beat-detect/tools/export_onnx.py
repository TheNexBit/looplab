"""Exports a Beat This! checkpoint to ONNX and writes the logits Rust must reproduce.

    pwsh -File D:\\sandbox\\tempo-ref\\run.ps1 crates/beat-detect/tools/export_onnx.py [final0 ...]

The checkpoints (MIT, CPJKU) are downloaded once into TORCH_HOME (D:\\.cache\\torch);
the ONNX files go to D:\\sandbox\\tempo-ref\\models, outside the repository.
The reference logits are computed with a fresh model before exporting: tracing leaves
the rotary-embedding caches of the traced model in a different state.
"""

import hashlib
import sys
from pathlib import Path

import numpy as np
import onnx
import torch
from beat_this.inference import Spect2Frames, load_model
from beat_this.preprocessing import LogMelSpect

MODELS = Path(r"D:\sandbox\tempo-ref\models")
GOLDEN = Path(__file__).parent.parent / "tests" / "golden"
CHECKPOINTS = Path(torch.hub.get_dir()) / "checkpoints"
SHA256 = {"final0": "8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331"}


class Logits(torch.nn.Module):
    """The model with a tuple output: ONNX has no dictionaries."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spect):
        out = self.model(spect)
        return out["beat"], out["downbeat"]


def save_logits(path, beat, down):
    logits = torch.stack([beat, down], dim=1).numpy().astype("<f4")
    logits.tofile(path)
    return logits


def raw_goldens(name):
    """The bare model on short spectrograms, one call each, no chunking."""
    model = Logits(load_model(name))
    for case in ["mixed", "loud"]:
        spect = np.fromfile(GOLDEN / f"{case}.spect.f32", dtype="<f4").reshape(-1, 128)
        with torch.no_grad():
            beat, down = model(torch.from_numpy(spect)[None])
        logits = save_logits(GOLDEN / f"{case}.{name}.logits.f32", beat[0], down[0])
        print(f"  {case}: logits {logits.shape}, {logits.min():.2f}..{logits.max():.2f}")


def long_golden(name):
    """A 40 s piece through Spect2Frames: two overlapping chunks, borders, keep_first."""
    rng = np.random.default_rng(40)
    t = np.arange(40 * 22050) / 22050
    signal = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.05 * rng.standard_normal(t.size)
    period = 60 / 97  # clicks at 97 BPM, accented every 7
    for k, beat in enumerate(np.arange(0, 40, period)):
        i = int(beat * 22050)
        gain = 1.0 if k % 7 == 0 else 0.5
        signal[i : i + 300] += gain * np.exp(-np.arange(min(300, t.size - i)) / 40)
    with torch.no_grad():
        spect = LogMelSpect()(torch.tensor(signal, dtype=torch.float32))
        beat, down = Spect2Frames(name)(spect)
    spect.numpy().astype("<f4").tofile(GOLDEN / "long.spect.f32")
    logits = save_logits(GOLDEN / f"long.{name}.logits.f32", beat, down)
    print(f"  long: spect {tuple(spect.shape)}, logits {logits.shape}")


def export(name):
    model = Logits(load_model(name))
    ckpt = CHECKPOINTS / f"beat_this-{name}.ckpt"
    digest = hashlib.sha256(ckpt.read_bytes()).hexdigest()
    if name in SHA256 and digest != SHA256[name]:
        sys.exit(f"{name}: sha256 {digest} is not the published one")
    print(f"{name}: {ckpt.stat().st_size / 1e6:.1f} MB, sha256 {digest}")

    MODELS.mkdir(parents=True, exist_ok=True)
    path = MODELS / f"beat_this-{name}.onnx"
    frames = {0: "batch", 1: "frames"}
    torch.onnx.export(
        model,
        (torch.zeros(1, 1500, 128),),
        str(path),
        input_names=["spect"],
        output_names=["beat", "downbeat"],
        dynamic_axes={"spect": frames, "beat": frames, "downbeat": frames},
        opset_version=17,
        dynamo=False,
    )
    onnx.checker.check_model(onnx.load(str(path)))
    print(f"  -> {path} ({path.stat().st_size / 1e6:.1f} MB)")


for name in sys.argv[1:] or ["final0"]:
    load_model(name)  # downloads the checkpoint if needed
    raw_goldens(name)
    long_golden(name)
    export(name)
