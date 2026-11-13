# Architettura

## I tre pezzi

```
UI (React, src/)  ──comandi tipizzati──▶  App Tauri (src-tauri/)  ──chiamate──▶  audio-engine (crates/)
                  ◀──eventi / binario───                         ◀──atomici────
```

- **`crates/audio-engine`**: libreria senza dipendenze da Tauri: decodifica, thread audio real-time,
  DSP e dati della forma d'onda. Si testa da sola con `cargo test`.
  - Caricamento (`load.rs`, come in Reaper): `open` legge i primi 3 s e restituisce il brano già suonabile;
    un thread `looplab-loader` continua: `decode.rs` (file → stereo f32) → `resample.rs` (→ frequenza della
    scheda audio) → `pcm.rs` + `peaks.rs` (`PeaksBuilder`, forma d'onda che cresce), con `LoadEvent` di
    avanzamento. `pcm.rs` tiene l'audio a 16 bit in un file della cache mappato in memoria (`memmap2`):
    il loader aggiunge frame e pubblica `ready` (Release), il thread audio legge solo sotto `ready` (Acquire),
    oltre c'è silenzio. A fine caricamento l'intestazione del file è segnata completa e la forma d'onda è
    salvata accanto (`.peaks`): la prossima apertura le riusa subito. File di lunghezza sconosciuta, o cache
    occupata, si decodificano in memoria come prima (`load`). I valori dei picchi sono a scala fissa
    (±127 = fondo scala): l'interfaccia ingrandisce i brani bassi (`gain` in `peaks.ts`).
  - Riproduzione: `engine.rs` è la maniglia usata dall'app (comandi, `LoopSettings`, limiti di velocità);
    `render.rs` vive nella callback cpal: lettore con loop → stretch → dissolvenze → scheda audio.
    Comandi via ring buffer rtrb, posizione/stato via atomici, brani sostituiti liberati fuori dal thread audio.
    La posizione pubblicata è quella _udita_: una piccola cronologia collega l'ingresso dello stretch
    al punto del brano, così latenza e ritorni del loop sono compensati; durante pause e conteggi
    la posizione resta ferma. Il lettore conta le ripetizioni del loop (`Status::loops`).
  - `click.rs`: metronomo e conteggio. I suoni (`ClickSound`) sono ricette sintetizzate (due toni che si
    spengono e un colpo di rumore filtrato), con inviluppi a fattore costante: niente `exp()` né allocazioni
    nel thread audio. `PreviewClick` fa sentire un click anche a brano fermo. I battiti si trovano leggendo il brano (tempo del brano, prima
    dello stretch) e si mettono in coda con il frame d'ingresso; il click è sintetizzato in uscita
    quando quel frame si sente, quindi non cambia suono con velocità e tonalità. Il conteggio è la
    parte finale della pausa tra le ripetizioni, e precede anche il play.
  - `pattern.rs` (da MetroFlow): la battuta (`BarPattern`): impulsi, gruppi (7/8 = 2+2+3), stato di ogni
    battito, suddivisioni, swing, poliritmo. Il tempo si misura in impulsi: un click suona nel frame il cui tratto
    `[da, a)` contiene il suo istante, quindi ognuno si trova una volta sola a qualsiasi tempo. Le battute prima
    di 0 sono il count-in e suonano semplici. Lo usano sia il click sopra il brano (impulsi dai frame del brano)
    sia `metronome.rs`: il metronomo da solo, con un orologio in frame d'uscita mescolato dopo lo stretch; un
    cambio di tempo o di battuta riparte dal punto in cui si è nella battuta. Il poliritmo ha una voce sua
    (`cross_voice`), perché suona insieme ai battiti.
  - `exercises.rs` (da MetroFlow): speed trainer, gap trainer, click muti a caso, ritmo da suonare. Il
    metronomo da solo li applica battuta per battuta nel thread audio (un cambio di tempo o una battuta muta
    cade esattamente sulla stanghetta); il count-in ne è escluso. Le pennate del ritmo hanno suoni propri
    (`ClickVoice::start_strum`). Lato interfaccia: `stores/metronomeExercises.ts` (stesse regole per le righe
    dal vivo) e `features/metronome/ExercisesPanel.tsx`.
  - Sequenze: `Segment` (battuta, tempo, esercizi, battute) e `Sequence` in `metronome.rs`, mandata con
    `set_sequence` come `Arc` e restituita al thread normale per essere liberata (`Garbage`). A fine parte la
    successiva parte sul downbeat stesso; posizione e battute si contano dall'inizio della parte, e lo stato dice
    quale parte suona (`metronome_segment`). Lato interfaccia: `stores/metronomeLibrary.ts` (brani e sequenze
    salvati), `stores/metronome.ts` (`sequence`, `shownSetup`: la schermata mostra la parte in corso),
    `LibraryPanels.tsx`, `MetronomeSide.tsx`.
  - `tone.rs`: nota di riferimento per accordarsi (`SetTone`, comando `set_reference_tone`): fondamentale
    più tre armoniche, dissolvenza di 30 ms all'accensione, allo spegnimento e al cambio di livello; si
    somma al click, quindi si sente sopra il brano e a brano fermo.
  - `dsp/stretch.rs`: interfaccia sicura su Signalsmith Stretch (C++, in `vendor/`, MIT), compilato da
    `build.rs` tramite `cpp/stretch.cpp`. Unico codice non Rust; nessuna allocazione dopo la creazione.
  - `time.rs`: conversioni tempo ↔ frame.
  - `export.rs`: rendering fuori tempo reale (stesso `Reader` del player, quindi stesse giunture del loop) →
    stretch → EQ e canali già al valore giusto (`Eq::with_settings`, `Channels::with_mode`), dissolvenze di 5 ms
    ai bordi; `wav.rs` scrive WAV 16/24 bit. A velocità e tonalità originali l'audio è copiato senza stretch.
  - `spectrum.rs`: FFT di ~0,35 s (realfft) letta su scala musicale, 5 punti per semitono da A0 a C8; su un loop
    media fino a 48 finestre. La tonalità sposta la scala, i canali si applicano prima dell'analisi.
- **`src-tauri`**: guscio desktop. Comandi sottili in `commands/` che delegano all'engine.
  - `paths.rs`: unica fonte dei percorsi in cui l'app scrive (`Places`): **user** (il lavoro: `libreria.db` e
    `suoni\`), **local** (si rigenera: `cache\`, `logs\`, `webview\`, `windows.json`), **backup**. Installata:
    `%APPDATA%\Looplab`, `%LOCALAPPDATA%\Looplab`, `Documenti\Looplab\Backup`. Sviluppo
    (`LOOPLAB_DEV_DATA_DIR` in `.cargo/config.toml`), `LOOPLAB_DATA_DIR` e portable: tutto sotto una cartella,
    backup in `backup\`. Versione portable: con `portable.txt` accanto all'exe tutto va in `dati\` lì accanto (`portable_data`); la
    cache dei brani decodificati si ferma a 2 GB invece di 10 e gli aggiornamenti si segnalano soltanto (lo ZIP
    nuovo si scarica a mano). Lo ZIP lo crea `New-PortableZip` in `scripts/powershell/release-config.ps1`.
  - `window.rs`: le finestre si creano nel codice (non in `tauri.conf.json`) per poter spostare
    il profilo WebView2 prima che parta. `set_mini` fa della finestra principale la barra mini sempre in primo
    piano e la rimette com'era; la UI mostra allora solo `app/MiniBar.tsx`.
  - `state.rs`: motore audio (avviato in background, ricreato se la scheda audio si guasta) e picchi del brano.
  - `playback.rs`: evento tipizzato `PlaybackStatus` ~15 volte al secondo mentre suona.
  - `commands/waveform.rs`: `get_peaks` restituisce byte grezzi; tauri-specta non sa descriverli, quindi è
    registrato a parte in `main.rs` e avvolto a mano in `src/features/waveform/peaks.ts`.
  - **Libreria** (fase 19): `db.rs` apre `libreria.db` (SQLite con rusqlite `bundled`, `synchronous = FULL`,
    schema versionato in `user_version`, tabelle `projects`, `recent`, `diary`, `prefs`, `meta`); `Library` è lo
    stato condiviso dei comandi e all'avvio, se il file è danneggiato, lo mette da parte e rimette l'ultimo backup
    sano (`backup::recover`). Le chiavi dei brani sono il percorso in minuscolo.
  - `project.rs`: schema del progetto di un brano (unica definizione; i tipi TS sono generati), salvato come JSON
    nella tabella `projects`. `fingerprint` (dimensione + FNV dei primi e ultimi 64 KB) ritrova il progetto di un
    brano spostato o rinominato; una copia del brano riceve una copia del progetto. `recent.rs`: file recenti
    (fino a 30, con ora di apertura e durata; `list` aggiunge loop, sezioni e velocità dal progetto). `diary.rs`:
    diario. `prefs.rs`: preferenze dell'interfaccia (JSON per chiave). `legacy.rs`: importa una volta i file delle
    versioni precedenti (`recent.json`, `diary.json`, `projects\`, `<brano>.looplab.json`, anche all'apertura di
    un brano) e li sposta in `Backup\File delle versioni precedenti` con `origine.txt`.
  - `backup.rs`: cartelle `AAAA-MM-GG HH.MM.SS <tipo>` con `libreria.db` (`VACUUM INTO` + `integrity_check`,
    scritte come `.partial` e rinominate a fine copia) e `suoni\`. Automatico all'avvio e a ogni cambio di giorno
    (thread in `main.rs`, controllo ogni 30 minuti); rotazione 7 giorni / 4 settimane / 12 mesi; manuali mai
    cancellati, di sicurezza (prima di un ripristino) gli ultimi 5; seconda cartella facoltativa (`meta`
    `backup_mirror`). `restore` chiude la libreria, fa il backup di sicurezza, rimette file e suoni e la riapre.
    Comandi in `commands/archive.rs`, interfaccia in `app/ArchiveSettings.tsx` (Impostazioni → Dati).
  - `stems_out.rs` (fase 20): «Esporta tracce» salva le tracce separate in WAV a 16 bit in `Places::stems_out`
    (`Documenti\Looplab\Tracce separate\<brano>\voce.wav`…), una cartella per brano con `origine.txt`; cartella scelta dall'utente in `meta` `stems_out_dir`
    (`set_stems_folder`, riga «Tracce esportate» di `ArchiveSettings.tsx`); comando
    `export_stems` in `commands/stems.rs`, tasto in `features/stems/StemsPanel.tsx`.
  - `json_file.rs`: lettura e scrittura atomica (file temporaneo + rinomina) dei file JSON rimasti: posizioni
    delle finestre e lettura dei file delle versioni precedenti. I valori predefiniti del progetto vivono solo in
    `project.rs` (`default_project`). EQ e canali usano direttamente i tipi di `audio-engine` (feature `typed`).
  - `media.rs`: FFmpeg facoltativo (estrazione audio, proxy H.264, codifica FLAC/MP3 degli export), cache in
    `paths::cache_dir`. `cache.rs`: spazio occupato e "Svuota" (salta i file in uso); brani decodificati in
    `cache/decoded/<hash>-<frequenza>.pcm|.peaks`, al massimo 10 GB (`trim_decoded` toglie i più vecchi).
  - `commands/player.rs`: `open_file` torna dopo i primi secondi; l'evento `TrackLoading` segue il resto
    (l'interfaccia aggiorna la forma d'onda ogni 1–5 s secondo la lunghezza, e alla fine).
  - `log.rs`: registro degli errori in `logs/looplab.log` (avvio, errori dei comandi tramite `AppError::new`,
    panic, errori dell'interfaccia via `log_ui_error`).
  - `commands/export.rs`, `commands/spectrum.rs`, `commands/data.rs`: export, vista note, cache e registro.
    `AppState` tiene anche l'audio del brano aperto (lo stesso `Arc<Pcm>` del motore) e l'analizzatore FFT.
  - `window.rs` + `window_state.rs`: finestra principale e finestra video nascosta; posizioni per monitor.
- **`src/`**: interfaccia React. Le due finestre caricano la stessa pagina: `main.tsx` mostra l'app o solo
  il video (finestra staccata, che riceve sorgente e orologio dalla principale con l'evento `video-sync`).
  Blocca anche il menu del browser sul tasto destro (restano i menu dell'app e quello dei campi di testo).

## Sincronizzazione con il motore e col disco

- `features/player/syncEngine.ts`: loop, EQ e canali → motore (e tutto di nuovo a ogni brano aperto).
- `features/markers/projectSync.ts`: carica il progetto di ogni brano, salva 0,8 s dopo l'ultima modifica e
  alla chiusura; non sovrascrive mai un file illeggibile.
- `features/video/videoLoader.ts`, `detach.ts`: video del brano, proxy, finestra staccata.

## Pratica

- `stores/practice.ts`: tempo del brano (salvato nel progetto) e contatore delle ripetizioni.
- `features/practice/TempoModule.tsx`: tempo, metrica, batti, metronomo e conteggio nella barra di trasporto;
  `PracticePanel.tsx` (scheda Pratica): speed trainer, nota di riferimento (`ReferenceGroup.tsx`, corde e
  accordature in `reference.ts`) e diario; titolo e spiegazione dei gruppi in `Group.tsx`.
- `features/practice/tempo.ts`: calcoli puri (battuta tap, durata del conteggio, velocità dello speed trainer).
- `features/practice/trainer.ts`: conta le ripetizioni dal contatore del motore e imposta la velocità.
- `features/player/syncEngine.ts` manda al motore tempo, conteggio e metronomo; la griglia dei battiti
  parte dall'inizio del loop, altrimenti dalla prima battuta (marker B), altrimenti da 0.
- Il player prevede il conteggio: il playhead aspetta fermo prima del play e a ogni ripetizione.
- `stores/history.ts`: Annulla/Ripeti di marker, sezioni, loop e loop salvati; una raffica di modifiche
  (un trascinamento) è un solo passo; si azzera all'apertura di ogni brano.
- `stores/savedLoops.ts`: loop con nome, salvati nel progetto.

## Tasti, pedali e diario

- `lib/shortcuts.ts`: elenco delle azioni con i tasti predefiniti; `stores/keymap.ts` tiene i tasti cambiati e i
  comandi MIDI (preferenze nella libreria) e li rende attivi con `setActiveShortcuts`.
- `src-tauri/src/midi.rs`: apre ogni ingresso MIDI (ricontrolla ogni 2 s) e manda `MidiTrigger` all'interfaccia;
  `src-tauri/src/media_keys.rs`: tasti multimediali di sistema (opzione) → evento `MediaKey`.
  `features/remote/remoteControl.ts` collega entrambi alle azioni di `shortcutHandlers`.
- `src-tauri/src/diary.rs` + `features/practice/diaryRecorder.ts`: tempo di pratica per brano e giorno;
  `diaryStats.ts` fa i conti per la scheda Pratica e la finestra del diario.
- Griglia del tempo: `practice.ts` (`currentGrid`), `tempo.ts` (battiti), `draw.ts` (`drawBeatGrid`), `snap.ts`.

## Export e vista note

- `features/export/exportPlan.ts`: regione (loop, sezione, brano) e nome del file, funzioni pure con test;
  `ExportDialog.tsx`: la finestra; `ui.openExport(source)` la apre già sulla sezione o sul loop.
- `features/notes/noteMath.ts`: nomi, tasti, note più forti; `NoteView.tsx` chiede lo spettro in un
  `requestAnimationFrame` (solo quando cambia qualcosa, al massimo ogni 80 ms mentre suona) e lo disegna su canvas.
  `stores/notes.ts`: aperta/chiusa e modo (preferenze nella libreria).

## Forma d'onda dettagliata

- `features/waveform/DetailView.tsx` disegna (canvas a ogni fotogramma), `gestures.ts` gestisce mouse e rotella.
- Bandierine dei marker e corsia delle sezioni stanno su una striscia lunga quanto il brano
  (`useTimeStrip.ts`) che a ogni fotogramma viene solo spostata e allungata: scorrere e zoomare non le
  ridisegna. `pointer.ts`: soglie dei gesti e `timeAtX` (posizione del mouse → tempo).

## Tipi condivisi Rust ↔ TypeScript

I comandi hanno `#[specta::specta]`; tauri-specta genera `src/lib/bindings.ts`
(all'avvio in debug e con `npm run bindings`). Non si scrive a mano nessun tipo di comando.

## Frontend

| Cartella           | Contenuto                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`             | shell: layout, barre, pannello laterale, palette, impostazioni, informazioni, azioni                                                       |
| `features/<nome>/` | componenti, hook e logica di una funzione: player, library, waveform, markers, eq, video                                                   |
| `components/ui/`   | componenti base su Radix (Button, Chip, Tooltip, Slider, NumberField, Stepper, OnOffKey, ChoiceKeys, OptionsKey, Kbd, Dialog, menu)        |
| `lib/`             | `bindings.ts` (generato), `shortcuts.ts` (registro unico), utility                                                                         |
| `stores/`          | uno per dominio: `ui`, `player`, `loop`, `view`, `markers`, `eq`, `video`, `recent`, `settings`, `appearance`                              |
| `i18n/`            | tutti i testi della UI                                                                                                                     |
| `styles/theme.css` | unica fonte dei token: `@theme` Tailwind v4 dà i nomi, un blocco `[data-theme]` per tema i valori; utility `hw`/`well`/`lcd`/`panel-label` |

## Regole

- Niente doppioni: un valore, un posto (colori in `theme.css`, testi in `i18n`, scorciatoie in `shortcuts.ts`,
  limiti dei controlli in `features/player/limits.ts`, percorsi dati in `paths.rs`, preferenze dell'interfaccia in
  `lib/storage.ts` (lette tutte da `main.tsx` prima di caricare `boot.tsx`, salvate nella libreria), valori con segno in `lib/format.ts`, percentuali scritte in `parsePercent`).
- Il thread audio è real-time safe: niente allocazioni, lock o I/O nella callback.
- L'audio è il clock principale: playhead e video lo seguono.
- Animazioni a 60 fps (playhead, forme d'onda, tempo) girano in `requestAnimationFrame` leggendo gli store
  con `getState()`: non fanno ridisegnare React.
- Canvas sempre alla risoluzione reale del monitor (`useCanvas`), anche cambiando monitor, e ridisegnati
  quando cambia il tema.
- Temi: `lib/theme.ts` (elenco `THEMES`, `applyTheme`, colori letti una volta per tema), `stores/appearance.ts`
  (scelte di questo PC: tema, colori su misura per tema, carattere, angoli, panoramica, grandezza),
  `app/AppearanceSettings.tsx`. Un tema nuovo = un blocco in `theme.css` con tutti i colori (lo verifica
  `theme.test.ts`), il suo id in `THEMES` e nome e descrizione in `i18n`.
- Colori su misura, carattere e angoli: `lib/appearance.ts` li scrive come variabili CSS in linea su `<html>`
  (vincono sui blocchi dei temi; ogni colore genera le sue sfumature con `lib/color.ts`) e poi chiama
  `refreshThemeColors()` perché i canvas rileggano i colori. La grandezza è lo zoom della webview
  (`setZoom`, permesso `core:webview:allow-set-webview-zoom`); i canvas seguono il nuovo `devicePixelRatio`.
- Impostazioni a scelta (stile della forma d'onda, rotella, avvio…): elenco unico `SETTING_CHOICES` in
  `stores/settings.ts`, nomi in `i18n` (`settings.choices`, controllati da TypeScript). Controlli delle
  impostazioni: `OnOffKey`, `Stepper` (− / + / rotella), `ChoiceKeys` in `components/ui/`.
- Tasto destro: un controllo che lo usa lo dice sempre. Tasti: `Button options` (triangolino nell'angolo) e
  `Tooltip rightClick` (seconda riga "Tasto destro: …"); un tasto con opzioni nuovo usa `OptionsKey`
  (o `useOptions` + `OptionsPanel` se il pannello si apre anche da un altro tasto); altri elementi: `title` con
  `withRightClick`.
- Metronomo da solo: `stores/metronome.ts` (battuta, tempo, posizione riportata dal motore e proseguita a tempo
  tra un rapporto e l'altro: `currentPulses`), `features/metronome/metronomeEngine.ts` (`syncMetronome`, avviato
  dall'app: manda ogni cambio al motore, avvio e arresto; brano e metronomo non suonano insieme), schermata
  `MetronomeView.tsx` (+ `TempoDial`, `MeterMenu`, `BeatStrip`, barra in basso `MetronomeTransport`; tasti e
  menu del tempo in `TempoControls`), scelte pure in `meterChoices.ts`, battuta e gruppi in `beatGrid.ts`
  (`feltBeatSpans` è l'unico punto che divide la battuta in battiti), battiti per l'animazione in `useBeats`.
  Suoni dei click: una riga per tipo (`ClickSoundRow`), usata dalla scheda Suoni e dalla scheda Pratica;
  suoni importati in `stores/clickSounds.ts` e `commands/click_sounds.rs`. Voce che conta: `voice.rs` nel
  motore, parole incorporate da `src-tauri/src/voice.rs`.
- Riga informazioni (`app/InfoBar.tsx`, opzione `infoBar`): legge gli attributi `data-info*` che `Tooltip`
  mette sul suo elemento, altrimenti `title` o `aria-label` dell'elemento sotto il puntatore. Un testo nuovo
  in un `Tooltip` compare quindi da solo anche lì.
- Scaletta: i passi in `stores/playlist.ts` (salvati nel progetto), chi la fa avanzare in
  `features/practice/playlist.ts` (`runPlaylist`, avviato dall'app come il trainer, conta `player.loops`).
- Trascinamenti col puntatore: `lib/followPointer.ts` (cattura, fine anche se il mouse viene preso da Windows).
- Righe e gruppi delle Impostazioni: `app/SettingLayout.tsx`. Disegno a ogni frame: `useAnimationFrame`, un solo
  ciclo per tutta l'app.
