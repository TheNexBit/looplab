# Roadmap

| #   | Fase                       | Stato                      |
| --- | -------------------------- | -------------------------- |
| 1   | Fondamenta                 | ✅ completata              |
| 2   | Cuore audio                | ✅ completata              |
| 3   | Velocità, tonalità e loop  | ✅ completata              |
| 4   | Marker e sezioni           | ✅ completata — da provare |
| 5   | EQ e isolamento base       | ⏳ da fare                 |
| 6   | Video                      | ⏳ da fare                 |
| 7   | Rifinitura e distribuzione | ⏳ da fare                 |

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

## 3. Velocità, tonalità e loop ✅

- Signalsmith Stretch 1.4.0 (MIT) incluso in `crates/audio-engine/vendor/` con un binding C scritto da noi
  (`cpp/stretch.cpp` + `dsp/stretch.rs`): niente LLVM/libclang, compilato con MSVC e ottimizzato anche in sviluppo.
- Velocità 25–200% senza cambiare tonalità (rampa di ~25 ms), tonalità ±12 semitoni + ±50 cents.
- Il playhead mostra ciò che si sente davvero: il motore compensa la latenza dello stretch.
- Loop A-B nel motore, preciso al campione, con dissolvenza incrociata di 5 ms al punto di ritorno;
  lead-in a ogni ripetizione e pausa opzionale tra le ripetizioni.
- Loop creato trascinando sulla forma d'onda, bordi trascinabili, visibile anche nella panoramica.
- Dock: slider con valore modificabile a mano, preset di velocità 50/75/100%, cents, menu del loop.
- Scorciatoie: `[` `]` inizio/fine loop, `L` loop, `+`/`−` velocità ±5%, Maiusc+↑↓ tonalità.
- Rimandato: salvataggio di velocità, tonalità e loop per brano (fase 4, `.looplab.json`).

## 4. Marker e sezioni ✅

Scelte prese senza chiedere (come concordato): sezioni consecutive alla Transcribe (ognuna finisce dove inizia
la successiva), nessun riordino manuale (l'ordine è quello del brano), velocità e tonalità salvate per brano.

- `M` marker libero, `B` battuta (numerata da sola), `S` sezione (nome e colore automatici), `,` `.` marker
  precedente/successivo.
- Corsia delle sezioni sopra la forma d'onda: clic = loop della sezione, bordo sinistro trascinabile,
  tasto destro = loop, colore (8 colori in `theme.css`), elimina.
- Bandierine dei marker sotto il righello: clic = salta lì, trascina = sposta, tasto destro = elimina.
- Pannello "Sezioni": nomi modificabili, loop, elimina; elenco dei marker.
- Salvataggio automatico in `<file>.<ext>.looplab.json` accanto al brano (schema in `src-tauri/src/project.rs`,
  tipi generati), 0,8 s dopo l'ultima modifica e alla chiusura; scrittura atomica; un file illeggibile non viene
  mai sovrascritto; cartella protetta → copia nella cartella dati dell'app.
- File recenti (10) nello stato vuoto e nel menu accanto ad "Apri" (`src-tauri/src/recent.rs`).

## 5. EQ e isolamento base

EQ parametrico con preset e bypass, canale centrale, selezione canali.

## 6. Video

Sidecar FFmpeg, pannello agganciato, sincronizzazione, finestra staccabile istantanea, proxy per codec non supportati.

## 7. Rifinitura e distribuzione

Command palette, impostazioni, ricordo delle finestre, icona, installer NSIS, aggiornamenti firmati, licenze di terze parti.

## Dopo la prima versione

Separazione AI degli strumenti, analisi dello spettro, speed trainer, esportazione WAV.
