# Roadmap

| #   | Fase                       | Stato                      |
| --- | -------------------------- | -------------------------- |
| 1   | Fondamenta                 | ✅ completata              |
| 2   | Cuore audio                | ✅ completata              |
| 3   | Velocità, tonalità e loop  | ✅ completata              |
| 4   | Marker e sezioni           | ✅ completata — da provare |
| 5   | EQ e isolamento base       | ✅ completata — da provare |
| 6   | Video                      | ✅ completata — da provare |
| 7   | Rifinitura e distribuzione | ✅ completata — da provare |

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

## 5. EQ e isolamento base ✅

- EQ a 5 bande nel motore (`dsp/biquad.rs`, `dsp/eq.rs`, formule RBJ): shelf bassi/acuti, campana, passa-alto,
  passa-basso; ogni parametro scivola verso il nuovo valore (~20 ms) e accendere/spegnere fa una dissolvenza.
- Bypass A/B con dissolvenza; preset Piatto / Focus basso / Focus chitarra / Focus voce (`features/eq/presets.ts`).
- Curva calcolata dal motore stesso (`eq_response`): ciò che si vede è ciò che si sente. Punti trascinabili
  (frequenza e guadagno), rotella sul punto = Q; campi numerici per ogni banda.
- Canali (`dsp/channels.rs`): stereo, solo L, solo R, mono, senza centro, solo centro, con dissolvenza di 10 ms.
- Catena: lettore → stretch → EQ → canali. La futura separazione AI andrà prima dello stretch.
- EQ e canali salvati nel `.looplab.json`; i valori predefiniti esistono solo in Rust (`default_project`).

## 6. Video ✅

- FFmpeg 9.0 LGPL statico (BtbN) scaricato da `scripts/fetch-ffmpeg.cmd` in `D:\tools\ffmpeg`, con verifica
  SHA-256; copia per il pacchetto in `src-tauri/binaries/` (fuori da git). **Da lanciare a mano una volta.**
- FFmpeg è facoltativo: senza, Opus e proxy mostrano un messaggio; tutto il resto funziona.
  Avviato da Rust (`media.rs`) senza finestra di console, con avanzamento letto da `-progress`.
- Audio che symphonia non legge (es. Opus): estratto in FLAC nella cache dell'app e poi caricato.
- Video nella WebView (`<video>` muto, asset protocol con permesso solo per il file aperto); se WebView2 non lo
  riproduce, proxy H.264 720p (libopenh264 o Media Foundation, entrambi compatibili LGPL) nella cache.
- Sincronizzazione: l'audio comanda; il video segue con piccole correzioni di velocità, seek oltre 0,25 s.
- Pannello agganciato sopra o a lato, ridimensionabile e comprimibile (preferenze nella WebView).
- Finestra video creata nascosta all'avvio: si stacca all'istante; chiuderla la riaggancia.
- Posizione e dimensione delle finestre ricordate per monitor (`window_state.rs`, in `windows.json` nella cartella
  dati; non uso il plugin window-state perché scriverebbe in AppData anche in sviluppo).

## 7. Rifinitura e distribuzione ✅

- Command palette (Ctrl+K o la barra di ricerca): tutte le scorciatoie più preset, canali, pannelli, video,
  file recenti, informazioni; ricerca senza badare a maiuscole e accenti.
- Impostazioni (Ctrl+, o l'ingranaggio): salto con le frecce, salto fine, passo della velocità, segui il playhead.
- Informazioni: versione, "Cerca aggiornamenti", licenze di terze parti (`docs/THIRD_PARTY_LICENSES.md`, unica fonte,
  inclusa anche nell'installer).
- Finestre ricordate per monitor (fase 6); icona generata da `src-tauri/icons/icon.svg`.
- Build di rilascio separata dallo sviluppo: `scripts/release-config.ps1` genera la configurazione aggiuntiva
  (FFmpeg come sidecar, licenze, installer NSIS per utente in italiano/inglese, updater) nella cache Rust.
- Aggiornamenti firmati (plugin updater): chiave in `D:\.config\tauri\looplab.key` creata da `genera-chiave.cmd`;
  il plugin si attiva solo se la configurazione lo contiene (sviluppo e prova-build ne fanno a meno).
- `prova-build.cmd`: build di rilascio senza installer, con dati in `D:\.cache\looplab\build-data`
  (variabile `LOOPLAB_DATA_DIR`).

### Da decidere con l'utente

- **Licenza di Looplab** (nel README è "da definire").
- **Repository GitHub**: il prompt lo vuole privato, ma l'aggiornamento automatico scarica da GitHub Releases, che
  per gli utenti deve essere pubblico (repository pubblico, oppure un secondo repository pubblico solo per le release).
- **NSIS su C:\**: Tauri scarica sempre NSIS in `%LOCALAPPDATA%\tauri`; `build.cmd` propone un collegamento verso
  `D:\.cache\tauri`.

## Correzioni dopo le prove dell'utente

- Play riparte sempre dal punto del playhead, anche fuori dal loop (prima saltava all'inizio del loop).
- Video nel loop senza scatti: i salti del video mirano avanti del tempo che impiegano e non si ripetono a raffica.
- Il pannello video si restringe per lasciare spazio alle forme d'onda; niente più sovrapposizioni sul dock.
- Interazione come nei DAW: panoramica = clic sposta il playhead ovunque, trascina scorre la vista;
  righello = clic sposta il playhead, trascina crea il loop, la barra del loop nel righello si trascina per spostarlo;
  forma d'onda = clic sposta il playhead, trascina crea sempre un nuovo loop; bordi del loop = ridimensiona
  (l'area dei bordi si stringe sui loop corti); Maiusc+clic = estende il loop; Esc = toglie il loop.
- Calamita (tasto G, pulsante nel dock, impostazioni): loop, marker e sezioni trascinati si agganciano a marker,
  battute, inizi di sezione, playhead e bordi del brano entro 10 pixel.

## Dopo la prima versione

Separazione AI degli strumenti, analisi dello spettro, speed trainer, esportazione WAV.
