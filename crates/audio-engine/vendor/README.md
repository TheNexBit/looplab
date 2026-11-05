# Vendored C++ code

Copied unchanged from upstream; update by replacing the files.

| Folder                                         | Upstream                                                 | Version                               | License             |
| ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------- | ------------------- |
| `signalsmith-stretch/`                         | https://github.com/Signalsmith-Audio/signalsmith-stretch | tag 1.4.0                             | MIT (`LICENSE.txt`) |
| `signalsmith-linear/` (`stft.h`, `fft.h` only) | https://github.com/Signalsmith-Audio/linear              | tag 0.6.4 (required by stretch 1.4.0) | MIT (`LICENSE.txt`) |

The C interface used from Rust is `../cpp/stretch.cpp`, compiled by `../build.rs`.
