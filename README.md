# Looplab

App desktop per Windows per trascrivere musica a orecchio: rallenta senza cambiare tonalità,
cambia tonalità, crea loop e sezioni, isola gli strumenti con l'EQ, segue il video.

> Stato: fasi 1–10 completate; la 10 (export, vista note, dati) è da provare. Vedi [docs/ROADMAP.md](docs/ROADMAP.md).

## Script (doppio clic)

In `scripts\` ci sono solo i lanciatori, numerati per importanza; la logica sta in `scripts\powershell\`.

| Script                         | Cosa fa                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `scripts\01-dev.cmd`           | avvia l'app in sviluppo                                                       |
| `scripts\02-test.cmd`          | tutti i controlli (Biome, TypeScript, Vitest, rustfmt, Clippy, cargo test)    |
| `scripts\03-prova-build.cmd`   | compila in modalità rilascio e apre l'app con dati di prova                   |
| `scripts\04-build.cmd`         | build ufficiale: installer NSIS firmato + `latest.json`                       |
| `scripts\05-fetch-ffmpeg.cmd`  | scarica FFmpeg LGPL in `D:\tools\ffmpeg` (una volta; serve per Opus e proxy)  |
| `scripts\06-genera-chiave.cmd` | crea la chiave di firma degli aggiornamenti in `D:\.config\tauri` (una volta) |
| `scripts\07-pulisci.cmd`       | cancella `dist` e i dati di sviluppo e di prova                               |

Da terminale: `npm run app`, `npm run lint`, `npm test`, `npm run test:rust`, `npm run bindings`.

## Requisiti

Rust (versione in `rust-toolchain.toml`), Node (versione in `.node-version`), VS Build Tools con C++.

## Documentazione

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — come sono collegati i pezzi
- [docs/ROADMAP.md](docs/ROADMAP.md) — fasi, stato e scelte prese
- [docs/THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md) — componenti di terze parti
- [docs/SPEC.md](docs/SPEC.md) — specifica originale

## Licenza

Da definire.
