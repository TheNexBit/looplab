"""Reference values for the Rust log-mel spectrogram, computed by Beat This! itself.

Run with the phase-17 reference environment (all caches on D:):
    pwsh -File D:\\sandbox\\tempo-ref\\run.ps1 crates/beat-detect/tests/golden/make_golden.py

Writes, next to this file, little-endian f32 files:
    <case>.input.f32   mono signal at 22050 Hz
    <case>.spect.f32   LogMelSpect output, frames x 128, row-major
    mel_fbank.f32      torchaudio filterbank, 513 x 128, row-major
"""

from pathlib import Path

import numpy as np
import torch
import torchaudio
from beat_this.preprocessing import LogMelSpect

OUT = Path(__file__).parent
SR = 22050
rng = np.random.default_rng(17)


def chirp_noise_clicks(seconds):
    t = np.arange(int(seconds * SR)) / SR
    sweep = 0.4 * np.sin(2 * np.pi * (40 * t + 0.5 * (9000 / seconds) * t * t))
    noise = 0.05 * rng.standard_normal(t.size)
    clicks = np.zeros(t.size)
    for start in np.arange(0, seconds, 0.43):
        i = int(start * SR)
        clicks[i : i + 200] += 0.8 * np.exp(-np.arange(min(200, t.size - i)) / 30)
    return sweep + noise + clicks


cases = {
    # Ordinary signal: several chunks' worth of frames would be too big, 7 s is enough
    "mixed": chirp_noise_clicks(7.0),
    # Length not a multiple of the hop, and barely longer than half a window
    "short": 0.3 * rng.standard_normal(1000),
    # Pure silence: log1p(0) = 0 everywhere
    "silence": np.zeros(SR // 2),
    # Full-scale square wave: large magnitudes
    "loud": np.sign(np.sin(2 * np.pi * 110 * np.arange(SR) / SR)),
}

spect = LogMelSpect()
for name, signal in cases.items():
    x = torch.tensor(signal, dtype=torch.float32)
    with torch.no_grad():
        y = spect(x).numpy().astype("<f4")
    x.numpy().astype("<f4").tofile(OUT / f"{name}.input.f32")
    y.tofile(OUT / f"{name}.spect.f32")
    print(f"{name}: {x.numel()} samples -> {y.shape}")

fbank = spect.spect_class.mel_scale.fb.numpy().astype("<f4")
fbank.tofile(OUT / "mel_fbank.f32")
print(f"fbank {fbank.shape}, torch {torch.__version__}, torchaudio {torchaudio.__version__}")
