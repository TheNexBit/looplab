"""Exports the network of an HTDemucs model to ONNX and writes what Rust must reproduce.

    pwsh -File D:\\sandbox\\tempo-ref\\run.ps1 crates/stem-split/tools/export_demucs.py [htdemucs_6s]

The ONNX graph is the network only, from the normalised inputs to the de-normalised
outputs: the spectrogram, the complex mask and the inverse spectrogram stay in Rust.
Inputs, for one segment of `segment` seconds at 44.1 kHz stereo (L samples):
    mix  (1, 2, L)          the waveform
    mag  (1, 4, 2048, T)    the STFT as channels (re/im of left and right), T = L / 1024
Outputs:
    spec (1, S, 4, 2048, T) the sources' spectrograms (before the inverse STFT)
    wave (1, S, 2, L)       the sources from the time branch
A source is ispec(spec) + wave.

Models (Demucs 4.1, code MIT, weights' licence unclear: see docs/ROADMAP.md, phase 18)
are downloaded by Demucs into HF_HOME (D:\\.cache\\huggingface); the ONNX files go to
D:\\sandbox\\tempo-ref\\models. Reference data go to D:\\sandbox\\tempo-ref\\stems-golden.
"""

import json
import sys
from pathlib import Path

import numpy as np
import onnx
import torch
from demucs.pretrained import get_model

MODELS = Path(r"D:\sandbox\tempo-ref\models")
GOLDEN = Path(r"D:\sandbox\tempo-ref\stems-golden")
SONG = Path(r"D:\sandbox\tempo-ref\songs\12th-44k.f32")  # stereo interleaved 44.1 kHz


class Network(torch.nn.Module):
    """HTDemucs.forward between _magnitude and _mask, nothing else."""

    def __init__(self, model):
        super().__init__()
        self.m = model

    def forward(self, mix, mag):
        m = self.m
        x = mag
        B, C, Fq, T = x.shape
        mean = x.mean(dim=(1, 2, 3), keepdim=True)
        std = x.std(dim=(1, 2, 3), keepdim=True)
        x = (x - mean) / (1e-5 + std)
        xt = mix
        meant = xt.mean(dim=(1, 2), keepdim=True)
        stdt = xt.std(dim=(1, 2), keepdim=True)
        xt = (xt - meant) / (1e-5 + stdt)
        saved, saved_t, lengths, lengths_t = [], [], [], []
        for idx, encode in enumerate(m.encoder):
            lengths.append(x.shape[-1])
            inject = None
            if idx < len(m.tencoder):
                lengths_t.append(xt.shape[-1])
                tenc = m.tencoder[idx]
                xt = tenc(xt)
                if not tenc.empty:
                    saved_t.append(xt)
                else:
                    inject = xt
            x = encode(x, inject)
            if idx == 0 and m.freq_emb is not None:
                frs = torch.arange(x.shape[-2], device=x.device)
                emb = m.freq_emb(frs).t()[None, :, :, None].expand_as(x)
                x = x + m.freq_emb_scale * emb
            saved.append(x)
        if m.crosstransformer:
            if m.bottom_channels:
                b, c, f, t = x.shape
                x = x.reshape(b, c, f * t)
                x = m.channel_upsampler(x)
                x = x.reshape(b, -1, f, t)
                xt = m.channel_upsampler_t(xt)
            x, xt = m.crosstransformer(x, xt)
            if m.bottom_channels:
                b, c, f, t = x.shape
                x = x.reshape(b, c, f * t)
                x = m.channel_downsampler(x)
                x = x.reshape(b, -1, f, t)
                xt = m.channel_downsampler_t(xt)
        for idx, decode in enumerate(m.decoder):
            skip = saved.pop(-1)
            x, pre = decode(x, skip, lengths.pop(-1))
            offset = m.depth - len(m.tdecoder)
            if idx >= offset:
                tdec = m.tdecoder[idx - offset]
                length_t = lengths_t.pop(-1)
                if tdec.empty:
                    pre = pre[:, :, 0]
                    xt, _ = tdec(pre, None, length_t)
                else:
                    skip = saved_t.pop(-1)
                    xt, _ = tdec(xt, skip, length_t)
        S = len(m.sources)
        x = x.view(B, S, -1, Fq, T) * std[:, None] + mean[:, None]
        xt = xt.view(B, S, -1, mix.shape[-1]) * stdt[:, None] + meant[:, None]
        return x, xt


def single(model):
    """get_model returns a bag; these names hold one network."""
    if hasattr(model, "models"):
        assert len(model.models) == 1, f"{len(model.models)} networks in the bag"
        return model.models[0]
    return model


def export(name):
    model = single(get_model(name)).eval()
    length = int(model.segment * model.samplerate)
    print(f"{name}: sources {model.sources}, segment {float(model.segment):.3f} s = {length} samples")

    # One segment of the song (from 60 s), as Demucs itself would see it
    song = np.fromfile(SONG, dtype="<f4").reshape(-1, 2).T
    start = 60 * 44100
    mix = torch.from_numpy(song[:, start : start + length].copy())[None]
    with torch.no_grad():
        z = model._spec(mix)
        mag = model._magnitude(z)
        net = Network(model).eval()
        spec, wave = net(mix, mag)
        full = model(mix)  # the whole forward: what Rust must give at the end
    print(f"  mag {tuple(mag.shape)}, spec {tuple(spec.shape)}, wave {tuple(wave.shape)}")

    MODELS.mkdir(parents=True, exist_ok=True)
    path = MODELS / f"{name}.onnx"
    torch.onnx.export(
        net,
        (mix, mag),
        str(path),
        input_names=["mix", "mag"],
        output_names=["spec", "wave"],
        opset_version=17,
        dynamo=False,
    )
    onnx.checker.check_model(onnx.load(str(path)), full_check=False)
    print(f"  -> {path} ({path.stat().st_size / 1e6:.1f} MB)")

    GOLDEN.mkdir(parents=True, exist_ok=True)
    for label, tensor in [("mix", mix), ("mag", mag), ("spec", spec), ("wave", wave), ("full", full)]:
        tensor.numpy().astype("<f4").tofile(GOLDEN / f"{name}.{label}.f32")
    meta = {
        "sources": list(model.sources),
        "samplerate": model.samplerate,
        "segment_samples": length,
        "nfft": model.nfft,
        "shapes": {k: list(v.shape) for k, v in [("mag", mag), ("spec", spec), ("wave", wave), ("full", full)]},
    }
    (GOLDEN / f"{name}.json").write_text(json.dumps(meta, indent=2))


for name in sys.argv[1:] or ["htdemucs_6s"]:
    export(name)
