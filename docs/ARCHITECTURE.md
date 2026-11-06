# Architettura

## I tre pezzi

```
UI (React, src/)  ──comandi tipizzati──▶  App Tauri (src-tauri/)  ──chiamate──▶  audio-engine (crates/)
                  ◀──eventi / binario───                         ◀──atomici────
```

- **`crates/audio-engine`**: libreria senza dipendenze da Tauri: decodifica, thread audio real-time,
  DSP e dati della forma d'onda. Si testa da sola con `cargo test`.
  - Caricamento (`load.rs`): `decode.rs` (file → stereo f32, pacchetto per pacchetto) →
    `resample.rs` (→ frequenza della scheda audio, a blocchi) → `pcm.rs` (16 bit in memoria) + `peaks.rs`.
  - Riproduzione: `engine.rs` è la maniglia usata dall'app (comandi, `LoopSettings`, limiti di velocità);
    `render.rs` vive nella callback cpal: lettore con loop → stretch → dissolvenze → scheda audio.
    Comandi via ring buffer rtrb, posizione/stato via atomici, brani sostituiti liberati fuori dal thread audio.
    La posizione pubblicata è quella _udita_: una piccola cronologia collega l'ingresso dello stretch
    al punto del brano, così latenza e ritorni del loop sono compensati; durante pause e conteggi
    la posizione resta ferma. Il lettore conta le ripetizioni del loop (`Status::loops`).
  - `click.rs`: metronomo e conteggio. I battiti si trovano leggendo il brano (tempo del brano, prima
    dello stretch) e si mettono in coda con il frame d'ingresso; il click è sintetizzato in uscita
    quando quel frame si sente, quindi non cambia suono con velocità e tonalità. Il conteggio è la
    parte finale della pausa tra le ripetizioni, e precede anche il play.
  - `dsp/stretch.rs`: interfaccia sicura su Signalsmith Stretch (C++, in `vendor/`, MIT), compilato da
    `build.rs` tramite `cpp/stretch.cpp`. Unico codice non Rust; nessuna allocazione dopo la creazione.
  - `time.rs`: conversioni tempo ↔ frame.
- **`src-tauri`**: guscio desktop. Comandi sottili in `commands/` che delegano all'engine.
  - `paths.rs`: unica fonte dei percorsi in cui l'app scrive. In sviluppo tutto va in
    `LOOPLAB_DEV_DATA_DIR` (definito in `.cargo/config.toml`), in rilascio nella cartella standard di Windows.
  - `window.rs`: le finestre si creano nel codice (non in `tauri.conf.json`) per poter spostare
    il profilo WebView2 prima che parta.
  - `state.rs`: motore audio (avviato in background, ricreato se la scheda audio si guasta) e picchi del brano.
  - `playback.rs`: evento tipizzato `PlaybackStatus` ~15 volte al secondo mentre suona.
  - `commands/waveform.rs`: `get_peaks` restituisce byte grezzi; tauri-specta non sa descriverli, quindi è
    registrato a parte in `main.rs` e avvolto a mano in `src/features/waveform/peaks.ts`.
  - `project.rs`: schema del `.looplab.json` (unica definizione; i tipi TS sono generati), lettura/scrittura
    atomica, ripiego nella cartella dati. `recent.rs`: file recenti. `json_file.rs`: lettura e scrittura
    atomica (file temporaneo + rinomina) dei file JSON dell'app, usata da progetti, recenti e finestre. I valori predefiniti vivono solo qui
    (`default_project`). EQ e canali usano direttamente i tipi di `audio-engine` (feature `typed`).
  - `media.rs`: FFmpeg facoltativo (estrazione audio, proxy H.264), cache in `paths::cache_dir`.
  - `window.rs` + `window_state.rs`: finestra principale e finestra video nascosta; posizioni per monitor.
- **`src/`**: interfaccia React. Le due finestre caricano la stessa pagina: `main.tsx` mostra l'app o solo
  il video (finestra staccata, che riceve sorgente e orologio dalla principale con l'evento `video-sync`).

## Sincronizzazione con il motore e col disco

- `features/player/syncEngine.ts`: loop, EQ e canali → motore (e tutto di nuovo a ogni brano aperto).
- `features/markers/projectSync.ts`: carica il progetto di ogni brano, salva 0,8 s dopo l'ultima modifica e
  alla chiusura; non sovrascrive mai un file illeggibile.
- `features/video/videoLoader.ts`, `detach.ts`: video del brano, proxy, finestra staccata.

## Pratica

- `stores/practice.ts`: tempo del brano (salvato nel progetto) e contatore delle ripetizioni.
- `features/practice/tempo.ts`: calcoli puri (battuta tap, durata del conteggio, velocità dello speed trainer).
- `features/practice/trainer.ts`: conta le ripetizioni dal contatore del motore e imposta la velocità.
- `features/player/syncEngine.ts` manda al motore tempo, conteggio e metronomo; la griglia dei battiti
  parte dall'inizio del loop, altrimenti dalla prima battuta (marker B), altrimenti da 0.
- Il player prevede il conteggio: il playhead aspetta fermo prima del play e a ogni ripetizione.
- `stores/history.ts`: Annulla/Ripeti di marker, sezioni, loop e loop salvati; una raffica di modifiche
  (un trascinamento) è un solo passo; si azzera all'apertura di ogni brano.
- `stores/savedLoops.ts`: loop con nome, salvati nel progetto.

## Forma d'onda dettagliata

- `features/waveform/DetailView.tsx` disegna (canvas a ogni fotogramma), `gestures.ts` gestisce mouse e rotella.
- Bandierine dei marker e corsia delle sezioni stanno su una striscia lunga quanto il brano
  (`useTimeStrip.ts`) che a ogni fotogramma viene solo spostata e allungata: scorrere e zoomare non le
  ridisegna. `pointer.ts`: soglie dei gesti e `timeAtX` (posizione del mouse → tempo).

## Tipi condivisi Rust ↔ TypeScript

I comandi hanno `#[specta::specta]`; tauri-specta genera `src/lib/bindings.ts`
(all'avvio in debug e con `npm run bindings`). Non si scrive a mano nessun tipo di comando.

## Frontend

| Cartella           | Contenuto                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `app/`             | shell: layout, barre, pannello laterale, palette, impostazioni, informazioni, azioni                   |
| `features/<nome>/` | componenti, hook e logica di una funzione: player, library, waveform, markers, eq, video               |
| `components/ui/`   | componenti base su Radix (Button, Chip, Tooltip, Slider, NumberField, Kbd, Dialog, stili dei menu)     |
| `lib/`             | `bindings.ts` (generato), `shortcuts.ts` (registro unico), utility                                     |
| `stores/`          | uno per dominio: `ui`, `player`, `loop`, `view`, `markers`, `eq`, `video`, `recent`, `settings`        |
| `i18n/`            | tutti i testi della UI                                                                                 |
| `styles/theme.css` | unica fonte dei token del tema "Rack" (`@theme` Tailwind v4), font e utility `hw`/`well`/`panel-label` |

## Regole

- Niente doppioni: un valore, un posto (colori in `theme.css`, testi in `i18n`, scorciatoie in `shortcuts.ts`,
  limiti dei controlli in `features/player/limits.ts`, percorsi dati in `paths.rs`).
- Il thread audio è real-time safe: niente allocazioni, lock o I/O nella callback.
- L'audio è il clock principale: playhead e video lo seguono.
- Animazioni a 60 fps (playhead, forme d'onda, tempo) girano in `requestAnimationFrame` leggendo gli store
  con `getState()`: non fanno ridisegnare React.
- Canvas sempre alla risoluzione reale del monitor (`useCanvas`), anche cambiando monitor.
