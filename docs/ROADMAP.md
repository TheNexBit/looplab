# Roadmap

| #   | Fase                       | Stato                           |
| --- | -------------------------- | ------------------------------- |
| 1   | Fondamenta                 | ✅ completata                   |
| 2   | Cuore audio                | ✅ completata — in attesa di ok |
| 3   | Velocità, tonalità e loop  | ⏳ da fare                      |
| 4   | Marker e sezioni           | ⏳ da fare                      |
| 5   | EQ e isolamento base       | ⏳ da fare                      |
| 6   | Video                      | ⏳ da fare                      |
| 7   | Rifinitura e distribuzione | ⏳ da fare                      |

## 1. Fondamenta ✅

- Verifica ambiente su `D:\` e cache Rust condivisa (`CARGO_TARGET_DIR`).
- Workspace Cargo (`src-tauri`, `crates/audio-engine`) con profili snelli.
- Tauri 2 + React 19 + TypeScript strict + Vite + Tailwind v4 + Zustand + Radix + Motion.
- Biome, Vitest, Clippy senza warning; `scripts/test.cmd` li esegue tutti.
- tauri-specta: `src/lib/bindings.ts` generato dal Rust (`npm run bindings`).
- Dati di sviluppo (incluso WebView2) in `D:\.cache\looplab\dev-data`.
- Tema in `src/styles/theme.css`, testi in `src/i18n`, scorciatoie in `src/lib/shortcuts.ts`.
- Layout: barra superiore, stato vuoto con drop zone, pannello laterale comprimibile, dock di trasporto (inattivo).

## 2. Cuore audio ✅

- Apertura file con "Apri", Ctrl+O o trascinamento; messaggi chiari per formati non supportati.
- Decodifica (symphonia): mp3, wav, flac, m4a/aac, ogg Vorbis, aiff e l'audio AAC/Vorbis di mp4/mov/mkv/webm.
- Conversione una tantum alla frequenza della scheda audio (rubato), in streaming per non raddoppiare la RAM.
- Brano in memoria a 16 bit (`pcm.rs`, formato sostituibile senza toccare il resto).
- Thread audio real-time safe (cpal + rtrb + atomici), micro-dissolvenze di 5 ms su play/pausa/seek.
- Forma d'onda multi-risoluzione inviata in binario; panoramica con riquadro trascinabile;
  vista dettagliata con righello, zoom animato (rotella, pinch, Ctrl +/−) e scorrimento (Shift+rotella).
- Playhead a 60 fps interpolato, corretto 15 volte al secondo dal motore; la vista segue il playhead.
- Scorciatoie: Spazio, ← → (5 s), Maiusc+← → (1 s), Ctrl+O, Ctrl +/−.
- Rimandati: Opus e immagine video (fase 6), file recenti (fase 4), cambio automatico della scheda audio (fase 7).

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
