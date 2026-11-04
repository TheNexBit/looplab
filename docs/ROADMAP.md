# Roadmap

| # | Fase | Stato |
|---|---|---|
| 1 | Fondamenta | ✅ completata — in attesa di ok |
| 2 | Cuore audio | ⏳ da fare |
| 3 | Velocità, tonalità e loop | ⏳ da fare |
| 4 | Marker e sezioni | ⏳ da fare |
| 5 | EQ e isolamento base | ⏳ da fare |
| 6 | Video | ⏳ da fare |
| 7 | Rifinitura e distribuzione | ⏳ da fare |

## 1. Fondamenta ✅
- Verifica ambiente su `D:\` e cache Rust condivisa (`CARGO_TARGET_DIR`).
- Workspace Cargo (`src-tauri`, `crates/audio-engine`) con profili snelli.
- Tauri 2 + React 19 + TypeScript strict + Vite + Tailwind v4 + Zustand + Radix + Motion.
- Biome, Vitest, Clippy senza warning; `scripts/test.cmd` li esegue tutti.
- tauri-specta: `src/lib/bindings.ts` generato dal Rust (`npm run bindings`).
- Dati di sviluppo (incluso WebView2) in `D:\.cache\looplab\dev-data`.
- Tema in `src/styles/theme.css`, testi in `src/i18n`, scorciatoie in `src/lib/shortcuts.ts`.
- Layout: barra superiore, stato vuoto con drop zone, pannello laterale comprimibile, dock di trasporto (inattivo).

## 2. Cuore audio
Apertura file, decodifica, play/pausa/seek, forma d'onda panoramica + dettagliata con zoom, playhead fluido.

## 3. Velocità, tonalità e loop
Stretch e pitch con cents, loop A-B trascinabile, lead-in, scorciatoie base.

## 4. Marker e sezioni
Creazione al volo, colori, lista laterale, loop di sezione, salvataggio automatico `.looplab.json`, file recenti.

## 5. EQ e isolamento base
EQ parametrico con preset e bypass, canale centrale, selezione canali.

## 6. Video
Sidecar FFmpeg, pannello agganciato, sincronizzazione, finestra staccabile istantanea, proxy per codec non supportati.

## 7. Rifinitura e distribuzione
Command palette, impostazioni, ricordo delle finestre, icona, installer NSIS, aggiornamenti firmati, licenze di terze parti.

## Dopo la prima versione
Separazione AI degli strumenti, analisi dello spettro, speed trainer, esportazione WAV.
