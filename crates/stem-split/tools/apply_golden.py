"""The whole-song path of Demucs on 40 s of the reference song, deterministic (shifts=0).

    pwsh -File D:\sandbox\tempo-ref\run.ps1 crates/stem-split/tools/apply_golden.py

Writes to D:\sandbox\tempo-ref\stems-golden: excerpt.f32 (2, N) and
excerpt.htdemucs_6s.f32 (6, 2, N), the sources as Separator.separate_tensor gives them.
"""

from pathlib import Path

import numpy as np
import torch
from demucs.api import Separator

GOLDEN = Path(r"D:\sandbox\tempo-ref\stems-golden")
SONG = Path(r"D:\sandbox\tempo-ref\songs\12th-44k.f32")

song = np.fromfile(SONG, dtype="<f4").reshape(-1, 2).T
excerpt = song[:, 50 * 44100 : 90 * 44100].copy()
separator = Separator("htdemucs_6s", shifts=0, overlap=0.25, split=True, device="cpu", progress=False)
with torch.no_grad():
    _, sources = separator.separate_tensor(torch.from_numpy(excerpt), 44100)
stacked = np.stack([sources[name].numpy() for name in separator.model.sources])
excerpt.astype("<f4").tofile(GOLDEN / "excerpt.f32")
stacked.astype("<f4").tofile(GOLDEN / "excerpt.htdemucs_6s.f32")
print(separator.model.sources, stacked.shape)
