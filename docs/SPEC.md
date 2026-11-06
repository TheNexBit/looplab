# Specifica di Looplab

> Copia del prompt di avvio del progetto. Le decisioni prese dopo stanno in `ROADMAP.md`, `ARCHITECTURE.md` e `CLAUDE.md`.

## 1. Chi sono e come lavoriamo

Sono un chitarrista che costruisce i propri strumenti software. **Non sono uno sviluppatore professionista**: parlami sempre in **italiano**, in modo semplice, e spiega in una riga ogni termine tecnico che usi. Il codice, i nomi di file e i commenti restano in **inglese**.

Regole di lavoro:

- Lavora **per fasi** (sezione 8). Alla fine di ogni fase fermati, dimmi cosa dovrei vedere avviando l'app e aspetta il mio ok prima di passare alla fase successiva.
- Prima di scrivere codice in una fase, mostrami un piano breve (file che crei o modifichi e perché).
- Se una scelta tecnica non è ovvia o ci sono due strade valide, **chiedimi** invece di indovinare.
- **Tutto il mio ambiente di sviluppo è su `D:\`: non scrivere mai nulla su `C:\`** (dettagli nella sezione 5.2).
- **Niente doppioni**: ogni tipo, costante, colore o funzione esiste in un solo posto. Se stai per duplicare qualcosa, estrailo.
- **Niente file sparsi**: nessun file temporaneo (`test.ts`, `prova.rs`, `*_old`, `*_v2`), niente file nella root oltre a quelli di configurazione obbligatori.
- Mantieni aggiornati `docs/ROADMAP.md` (fasi e stato) e `docs/ARCHITECTURE.md` (come sono collegati i pezzi).

## 2. Obiettivo

Ricreare le funzioni principali di **Transcribe!** (Seventh String Software) — il software per trascrivere musica a orecchio — con:

- una **UI moderna, minimal, intuitiva e fluida** (60 fps, nessun "salto" visivo);
- un codice **ordinato, leggero e facile da leggere**;
- distribuzione **pubblica e gratuita** su **Windows**.

Non copiare nome, logo, icone o testi di Transcribe!: replichiamo le funzioni, non il marchio.

## 3. Funzioni della prima versione

**Riproduzione e studio**

- Apertura file audio (mp3, wav, flac, m4a/aac, ogg) e video (mp4, mkv, webm, mov) tramite drag & drop o finestra "Apri". Lista dei file recenti.
- Forma d'onda con vista panoramica dell'intero brano + vista dettagliata con zoom fluido (rotella, pinch del touchpad, scorciatoie).
- Play/pausa/seek con playhead fluido.
- **Velocità** dal 25% al 200% **senza cambiare tonalità**, con passi fini, preset rapidi (50/75/100%) e campo numerico.
- **Tonalità** ±12 semitoni + regolazione fine in **cents** (utile per registrazioni non accordate a 440 Hz e accordature ribassate).
- **Loop A-B** con trascinamento dei bordi sulla forma d'onda, **lead-in** opzionale (qualche secondo prima dell'inizio del loop) e pausa opzionale tra una ripetizione e l'altra.

**Marker e sezioni**

- Marker di battuta, marker liberi e **sezioni** con nome e colore (Intro, Strofa, Assolo…), aggiungibili anche al volo durante la riproduzione (tasto dedicato).
- Clic su una sezione = loop di quella sezione. Navigazione marker precedente/successivo.
- Lista sezioni in un pannello laterale, rinominabili e riordinabili.
- Tutto salvato automaticamente in un **file progetto accanto al brano** (`<nomefile>.looplab.json`), così il lavoro è portabile.

**EQ e isolamento (livello base)**

- Equalizzatore parametrico a 4–5 bande con bypass A/B e preset ("Focus basso", "Focus chitarra", "Focus voce").
- **Rimozione/isolamento del canale centrale** e selezione canale (solo L, solo R, mono).
- L'architettura deve lasciare spazio a una **separazione AI degli strumenti** in una fase futura (vedi sezione 9), senza implementarla ora.

**Video**

- Il video si mostra in un **pannello dentro la finestra principale** (ridimensionabile, comprimibile), sincronizzato con l'audio a qualsiasi velocità.
- Opzione per staccarlo in una finestra separata, che deve **aprirsi all'istante** (finestra pre-creata e nascosta, non creata al momento). Deve ricordare posizione e dimensione su ogni monitor.

## 4. Stack

| Ambito                            | Scelta                                                                | Note                                                               |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contenitore desktop               | **Tauri 2**                                                           | Solo Windows (WebView2).                                           |
| Interfaccia                       | **React 19 + TypeScript** (strict) + **Vite**                         |                                                                    |
| Stile                             | **Tailwind CSS v4**                                                   | Token del tema definiti una sola volta con `@theme` in CSS.        |
| Stato UI                          | **Zustand**                                                           | Store piccoli, uno per dominio. Niente React Query.                |
| Componenti base                   | **Radix UI**                                                          | Slider, menu, dialog, tooltip, context menu.                       |
| Icone                             | **lucide-react**                                                      |                                                                    |
| Animazioni                        | **Motion**                                                            | Solo dove aiuta.                                                   |
| Tipi condivisi Rust↔TS            | **tauri-specta**                                                      | Tipi TypeScript dei comandi generati dal Rust.                     |
| Gestore pacchetti JS              | **npm**                                                               | Cache su `D:\.cache\npm`.                                          |
| Lint + formattazione              | **Biome**                                                             |                                                                    |
| Test                              | **Vitest** (frontend), `cargo test` (motore audio)                    |                                                                    |
| Decodifica audio                  | **symphonia**                                                         |                                                                    |
| Uscita audio                      | **cpal** (WASAPI)                                                     |                                                                    |
| Velocità/tonalità                 | **Signalsmith Stretch** tramite bindings Rust                         | MIT. Verificare crate e versione. **Non usare Rubber Band** (GPL). |
| EQ                                | Filtri biquad in Rust (o crate leggero)                               |                                                                    |
| Comunicazione con il thread audio | **rtrb** + atomici                                                    |                                                                    |
| Video / formati extra             | **FFmpeg** come sidecar Tauri                                         | Build **LGPL**. Estrae l'audio dai video e crea proxy.             |
| Plugin Tauri                      | `dialog`, `fs`, `store`, `window-state`, `single-instance`, `updater` |                                                                    |

Usare sempre le versioni stabili più recenti, verificandole al momento.

## 5. Architettura e struttura

### 5.1 Struttura delle cartelle

Vedi `ARCHITECTURE.md`. In sintesi: `crates/audio-engine` (Rust puro: `decode.rs`, `engine.rs`, `dsp/`, `peaks.rs`),
`src-tauri` (`commands/`, `project.rs`, `media.rs`, `state.rs`, `binaries/`), `src` (`app/`, `features/{player,waveform,markers,eq,video,library}`,
`components/ui/`, `lib/bindings.ts` generato, `lib/shortcuts.ts`, `stores/`, `i18n/`, `styles/theme.css`), `docs/`, `scripts/`.
Ciò che serve a più feature va in `components/ui`, `lib` o `stores`, mai copiato.

### 5.2 Ambiente di sviluppo su D:\ (obbligatorio)

- Tutto lo sviluppo su `D:\`; su `C:\` niente. `D:\CLAUDE.md` contiene le convenzioni generali. `AMBIENTE.md` non si modifica.
- Prove usa e getta in `D:\sandbox`, strumenti in `D:\tools`, script comuni in `D:\shared`, cache in `D:\.cache`, configurazioni in `D:\.config`.
- Variabili: `CARGO_HOME`, `RUSTUP_HOME`, `CARGO_TARGET_DIR` (cache Rust condivisa), `npm_config_cache`, `NPM_CONFIG_PREFIX`, `GIT_CONFIG_GLOBAL`.
- Non impostare `target-dir` né creare `target/` locali. Profili snelli solo nel `Cargo.toml` root; `audio-engine` a `opt-level = 2` in dev.
  Ottimizzare il crate di stretching in dev solo dopo aver chiesto.
- Tauri CLI come dipendenza di sviluppo. Script PowerShell 7 in `scripts/`.
- FFmpeg: una sola copia LGPL in `D:\tools\ffmpeg` scaricata da `scripts/05-fetch-ffmpeg.cmd`; in `src-tauri/binaries/` solo la copia per il pacchetto (esclusa da git).
- Altri strumenti: chiedere prima, e vanno in `D:\tools`.
- In sviluppo tutti i dati dell'app (store, stato finestre, cache proxy, WebView2) in `D:\.cache\looplab\dev-data`.
- Git dal primo commit; remoto privato `TheNexBit/Looplab` creato con `gh` solo dopo ok.

### 5.3 Motore audio

- File decodificato una volta in PCM in memoria (valutare un formato compatto per brani lunghi).
- Catena: sorgente → time-stretch/pitch → EQ → operazioni sui canali → uscita cpal.
- Thread audio **real-time safe**: niente allocazioni, lock o I/O nella callback. Comandi via ring buffer, posizione via atomici.
- Velocità, tonalità ed EQ con effetto immediato (< 50 ms) e senza click (rampe sui parametri).
- L'audio è il **clock principale**.

### 5.4 Comunicazione UI ↔ Rust

- Comandi tipizzati con tauri-specta, sottili, delegano a `audio-engine`.
- Dati della forma d'onda in **binario** (ArrayBuffer), non JSON.
- Playhead animato con `requestAnimationFrame`, interpolando dall'ultima posizione × velocità, con correzione periodica dal Rust a bassa frequenza.

### 5.5 Video

- `<video>` muto: l'audio lo produce sempre il motore Rust.
- Il video segue il clock audio: stesso `playbackRate`, correzione della deriva, seek solo se la differenza è grande.
- File locali tramite asset protocol con scope limitato.
- Codec non supportato → proxy H.264 con FFmpeg nella cache dell'app, con indicatore di avanzamento.

### 5.6 Monitor con DPI diversi

Canvas e forma d'onda usano `devicePixelRatio` e si ridisegnano quando la finestra cambia monitor.

## 6. Design e UI

| Token      | Valore                                                  |
| ---------- | ------------------------------------------------------- |
| Accent     | `#6366f1`, hover `#4f46e5`                              |
| Sfondo     | gradiente `#0f172a` → `#020617`, mai bianco o nero puro |
| Testo      | slate-100 principale, slate-400 secondario              |
| Bordi      | slate-700 al 50%, sottili                               |
| Raggi      | 8px controlli, 12px pannelli, mai pill per i pulsanti   |
| Font       | `system-ui, "Segoe UI", sans-serif`; numeri tabulari    |
| Animazioni | 150–250 ms, niente rimbalzi                             |

Principi: minimal, una sola azione primaria per schermata; stati chiari (hover, focus, disabled, attivo); icone senza testo solo per simboli universali, altrimenti tooltip con nome e scorciatoia; doppio clic su uno slider = valore di default; ogni slider ha un valore numerico modificabile.

Layout: barra superiore sottile (nome file, apri, command palette Ctrl+K); centro con vista panoramica e forma d'onda dettagliata con corsia sezioni e marker; pannello video agganciato (sopra o a lato), ridimensionabile e comprimibile; pannello laterale destro comprimibile (Sezioni, EQ); dock di trasporto in basso (play, loop, velocità, tonalità); stato vuoto curato con area di drop e scorciatoie.

Scorciatoie (registro unico in `lib/shortcuts.ts`): spazio play/pausa, frecce per spostarsi, `[` `]` inizio/fine loop, `L` loop, `M` marker, `S` sezione, `+`/`-` velocità, `Shift + su/giù` tonalità, `Ctrl+K` command palette.

## 7. Obiettivi di qualità

Avvio < 1 s; playhead e zoom a 60 fps; nessun click cambiando parametri; nessun warning di Biome o del compilatore Rust a fine fase; test su decodifica, loop, conversione tempo/campioni e salvataggio del progetto.

## 8. Fasi

1. **Fondamenta** — ambiente, scaffold, workspace, Biome, tema, tauri-specta, layout e stato vuoto.
2. **Cuore audio** — apertura file, decodifica, play/pausa/seek, forma d'onda panoramica + dettagliata con zoom, playhead fluido.
3. **Velocità, tonalità e loop** — stretch e pitch con cents, loop A-B trascinabile, lead-in, scorciatoie base.
4. **Marker e sezioni** — creazione al volo, colori, lista laterale, loop di sezione, salvataggio `.looplab.json`, file recenti.
5. **EQ e isolamento base** — EQ parametrico con preset e bypass, canale centrale, selezione canali.
6. **Video** — sidecar FFmpeg, pannello agganciato, sincronizzazione, finestra staccabile istantanea, proxy.
7. **Rifinitura e distribuzione** — command palette, impostazioni, ricordo finestre, icona, installer NSIS, aggiornamenti firmati (chiave in `D:\.config\tauri\`), licenze di terze parti, licenza dell'app da concordare.

Ogni fase si chiude con app avviabile, `ROADMAP.md` aggiornato e spiegazione in italiano di cosa provare.

## 9. Fuori dalla prima versione (da non ostacolare)

- Separazione AI degli strumenti (ONNX Runtime, modello tipo HTDemucs scaricato su richiesta).
- Analisi dello spettro.
- Speed trainer.
- Esportazione di loop e sezioni in WAV con velocità e tonalità applicate.
