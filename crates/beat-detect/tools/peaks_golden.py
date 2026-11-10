"""Beats and downbeats of Beat This!'s minimal postprocessing on the golden logits.

    pwsh -File D:\\sandbox\\tempo-ref\\run.ps1 crates/beat-detect/tools/peaks_golden.py

Writes tests/golden/long.final0.beats.txt: one line per beat, "seconds downbeat(0/1)".
"""

from pathlib import Path

import numpy as np
import torch
from beat_this.model.postprocessor import Postprocessor

GOLDEN = Path(__file__).parent.parent / "tests" / "golden"

logits = np.fromfile(GOLDEN / "long.final0.logits.f32", dtype="<f4").reshape(-1, 2)
beats, downbeats = Postprocessor("minimal")(torch.from_numpy(logits[:, 0]), torch.from_numpy(logits[:, 1]))
with open(GOLDEN / "long.final0.beats.txt", "w", newline="\n") as out:
    for t in beats:
        out.write(f"{t:.6f} {int(np.any(np.isclose(downbeats, t)))}\n")
print(f"{len(beats)} beats, {len(downbeats)} downbeats")
