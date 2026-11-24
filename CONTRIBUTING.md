# Contributing to Looplab

Thanks for wanting to help! Looplab is a free practice app for musicians, and every kind of
contribution counts: a clear bug report, an idea, a translation, a fix or a whole feature.

## Ways to help

- **Report a bug** — open an issue with the _Bug report_ form. Steps to reproduce and a screenshot
  help a lot. If it can be compared with how a DAW such as Reaper behaves, say so.
- **Suggest a feature** — use the _Feature request_ form, or start a thread in
  [Discussions](https://github.com/TheNexBit/looplab/discussions) if the idea is still loose.
- **Translate** — the interface is in Italian today; an English version is the most wanted help.
- **Write code** — pick an issue labelled
  [`good first issue`](https://github.com/TheNexBit/looplab/labels/good%20first%20issue) or
  [`help wanted`](https://github.com/TheNexBit/looplab/labels/help%20wanted), and leave a comment so
  nobody works on the same thing twice.

## Getting started

Requirements: Windows 10/11, Rust (version in `rust-toolchain.toml`), Node (version in
`.node-version`) and the Visual Studio Build Tools with C++.

```powershell
git clone https://github.com/TheNexBit/looplab.git
cd looplab
npm ci
npm run app
```

The launchers in `scripts\` (double-click) cover the usual tasks: `01-dev.cmd` runs the app,
`02-test.cmd` runs every check. Some features need extra files fetched once:
`05-fetch-ffmpeg.cmd` (FFmpeg, LGPL build) and the model scripts `10-`/`11-`.

## How the code is organised

- `src/` — the interface: React 19, TypeScript, Zustand stores, Tailwind v4.
- `src-tauri/` — the Tauri 2 app: commands, project files, the library database.
- `crates/audio-engine` — playback, time-stretch and pitch-shift, loops, stems.
- `crates/beat-detect`, `crates/stem-split` — tempo detection and stem separation.
- `src/lib/bindings.ts` is generated: run `npm run bindings`, never edit it by hand.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md)
(both in Italian for now; feel free to ask questions in English).

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change; small ones are reviewed faster.
3. Run `scripts\02-test.cmd` (or `npm run lint`, `npm test`, `npm run test:rust`): it must pass with
   no errors and no warnings.
4. Code, file names and comments are in English. Prefer clear names and short functions; no
   leftover files (`*_old`, `*_v2`, scratch tests).
5. Explain what changes for the user and how you tried it. A screenshot or a short clip is welcome
   for anything visible.

### Design principles

Looplab should feel like a DAW: lit on/off buttons, knobs, menus, mouse wheel and shortcuts —
nothing to type while playing. Features are never hidden to save space, and the user's data stays
in one tidy local library, never scattered next to their media files.

### Licences of dependencies

Looplab is GPL-3.0-or-later. New dependencies must be compatible with it; FFmpeg is used only in
its LGPL build. Add every new third-party component to
[docs/THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md).

## License of contributions

By contributing, you agree that your contribution is released under the
[GNU General Public License v3.0 or later](LICENSE), like the rest of Looplab.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
