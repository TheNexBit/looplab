# Looplab

App desktop per Windows per trascrivere musica a orecchio: rallenta senza cambiare tonalità,
cambia tonalità, crea loop e sezioni, isola gli strumenti con l'EQ, segue il video.

> Stato: prima versione completa (fasi 1–7), da provare. Vedi [docs/ROADMAP.md](docs/ROADMAP.md).

## Script (doppio clic)

| Script                      | Cosa fa                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `scripts\dev.cmd`           | avvia l'app in sviluppo                                                       |
| `scripts\test.cmd`          | tutti i controlli (Biome, TypeScript, Vitest, rustfmt, Clippy, cargo test)    |
| `scripts\fetch-ffmpeg.cmd`  | scarica FFmpeg LGPL in `D:\tools\ffmpeg` (una volta; serve per Opus e proxy)  |
| `scripts\genera-chiave.cmd` | crea la chiave di firma degli aggiornamenti in `D:\.config\tauri` (una volta) |
| `scripts\prova-build.cmd`   | compila in modalità rilascio e apre l'app con dati di prova                   |
| `scripts\build.cmd`         | build ufficiale: installer NSIS firmato + `latest.json`                       |
| `scripts\pulisci.cmd`       | cancella `dist` e i dati di sviluppo e di prova                               |

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
