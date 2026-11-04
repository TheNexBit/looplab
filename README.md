# Looplab

App desktop per Windows per trascrivere musica a orecchio: rallenta senza cambiare tonalità,
cambia tonalità, crea loop e sezioni, isola gli strumenti con l'EQ, segue il video.

> Stato: fase 2 (cuore audio). Vedi [docs/ROADMAP.md](docs/ROADMAP.md).

## Avvio rapido (doppio clic)

| Script                | Cosa fa                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `scripts\dev.cmd`     | avvia l'app in sviluppo                                                  |
| `scripts\test.cmd`    | esegue tutti i controlli (Biome, TypeScript, Vitest, Clippy, cargo test) |
| `scripts\pulisci.cmd` | cancella `dist` e i dati di sviluppo                                     |

Da terminale: `npm run app`, `npm run lint`, `npm test`, `npm run test:rust`, `npm run bindings`.

## Requisiti

Rust (versione in `rust-toolchain.toml`), Node (versione in `.node-version`), VS Build Tools con C++.

## Documentazione

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — come sono collegati i pezzi
- [docs/ROADMAP.md](docs/ROADMAP.md) — fasi e stato

## Licenza

Da definire.
