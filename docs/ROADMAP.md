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
| 8   | Strumenti di pratica       | ✅ completata              |
| 9   | Comodità mentre suoni      | ✅ completata              |
| 10  | Esportare e vedere le note | ✅ completata — da provare |

## 1. Fondamenta ✅

- Verifica ambiente su `D:\` e cache Rust condivisa (`CARGO_TARGET_DIR`).
- Workspace Cargo (`src-tauri`, `crates/audio-engine`) con profili snelli.
- Tauri 2 + React 19 + TypeScript strict + Vite + Tailwind v4 + Zustand + Radix + Motion.
- Biome, Vitest, Clippy senza warning; `scripts/02-test.cmd` li esegue tutti.
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

- FFmpeg 9.0 LGPL statico (BtbN) scaricato da `scripts/05-fetch-ffmpeg.cmd` in `D:\tools\ffmpeg`, con verifica
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
- Build di rilascio separata dallo sviluppo: `scripts/powershell/release-config.ps1` genera la configurazione aggiuntiva
  (FFmpeg come sidecar, licenze, installer NSIS per utente in italiano/inglese, updater) nella cache Rust.
- Aggiornamenti firmati (plugin updater): chiave in `D:\.config\tauri\looplab.key` creata da `06-genera-chiave.cmd`;
  il plugin si attiva solo se la configurazione lo contiene (sviluppo e prova-build ne fanno a meno).
- `03-prova-build.cmd`: build di rilascio senza installer, con dati in `D:\.cache\looplab\build-data`
  (variabile `LOOPLAB_DATA_DIR`).

### Da decidere con l'utente

- **Licenza di Looplab** (nel README è "da definire").
- **Repository GitHub**: il prompt lo vuole privato, ma l'aggiornamento automatico scarica da GitHub Releases, che
  per gli utenti deve essere pubblico (repository pubblico, oppure un secondo repository pubblico solo per le release).
- **NSIS su C:\**: Tauri scarica sempre NSIS in `%LOCALAPPDATA%\tauri`; `04-build.cmd` propone un collegamento verso
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
- Clic come in Reaper: sulla barra del loop = playhead all'inizio del loop; su un bordo = playhead su quel bordo;
  con la calamita, un clic vicino ai bordi del loop si aggancia a loro.
- Punto di partenza come in Reaper (attivo di serie, pulsante ↩ nel dock e impostazioni): il punto cliccato o da cui
  parte la riproduzione è segnato da un triangolo nel righello; fermando con Spazio si torna lì.
- "Segui il brano" sempre visibile (pulsante mirino nel dock, tasto F): lo scroll manuale lo sospende solo per 2 s
  invece di spegnerlo di nascosto; seguire non interrompe più uno zoom in corso.

- Nuovo aspetto "Rack" (stile hardware da studio), scelto dall'utente tra tre mockup: grafite con tasti in rilievo
  e spie LED (verde = play e loop, ambra = punto di partenza, segui, calamita), display ambra per il tempo,
  forma d'onda ambra con griglia, loop verde, marker ambra e battute grigie, sezioni con bordo colorato.
  Velocità e tonalità sono due fader uno sopra l'altro, così il dock entra anche nella finestra minima (900 px).
  Font Inter e JetBrains Mono inclusi nell'app (`@fontsource-variable`), niente rete. Logica e comandi invariati.

- Pulizia del codice (dopo analisi approvata): marker e sezioni non vengono più ridisegnati a ogni fotogramma
  mentre la vista scorre; recenti e posizione delle finestre si salvano in modo sicuro come i progetti
  (`json_file.rs`); doppioni unificati (modi dei canali, durata del brano, posizione → tempo, tastini `Chip`,
  formato velocità, limiti di lead-in e pausa); gesti della forma d'onda in `gestures.ts`; il log di FFmpeg
  tiene solo le ultime righe. Comportamento invariato.

## 8. Strumenti di pratica ✅

- **Speed trainer** (scheda Pratica): il loop parte dalla velocità "Da" e sale di "Passo" ogni "Ogni"
  ripetizioni fino ad "A". Il motore conta le ripetizioni (nuovo campo `loops` nello stato); il conteggio
  ricomincia quando cambiano loop, brano o impostazioni del trainer. Le impostazioni valgono per il PC.
- **Annulla / Ripeti** (Ctrl+Z / Ctrl+Y, tasti nella barra in alto) per marker, sezioni, loop e loop salvati.
  Una serie di modifiche ravvicinate (un trascinamento) è un solo passo. Nei campi di testo Ctrl+Z resta
  quello normale del campo.
- **Loop salvati** (scheda Sezioni, Maiusc+L o pulsante): nome modificabile, riprendi, elimina; anche nella
  palette dei comandi. Salvati nel `.looplab.json`.
- **Tempo, conteggio e metronomo** (scheda Pratica): BPM del brano originale (salvato nel progetto), tasto
  "Batti" / T per batterlo (diviso per la velocità, così vale per l'originale); conteggio di 1/2/4/8 battiti
  prima del play e prima di ogni ripetizione; metronomo (tasto K) con il primo battito della battuta più acuto.
  Senza BPM conteggio e metronomo restano spenti e la scheda lo dice.
- Scelte fatte da me: la griglia dei click parte dall'inizio del loop (o dalla
  prima battuta B); il contatore ×N compare sul tasto Loop dalla seconda ripetizione.

- Correzione dopo le prove: durante il conteggio tra una ripetizione e l'altra il playhead scattava avanti e
  indietro (gli aggiornamenti del motore e i cambi di velocità del trainer facevano ripartire la previsione).
  Ora la previsione sa quanto manca alla fine del conteggio e lo conserva. "Salva loop" è un pulsante con
  scritta (anche nel menu del Loop) e lo stesso loop non si salva due volte.

## 9. Comodità mentre suoni ✅

- **Tasti personalizzabili** (Impostazioni → Tasti e pedali): clic sul tasto, poi premi quello nuovo (Esc annulla);
  un tasto già usato viene tolto all'altra azione con un avviso; × toglie il tasto; "Ripristina" torna ai
  predefiniti. Salvati su questo PC. I tasti multimediali (Play/Pausa, Stop, Avanti, Indietro) funzionano sempre.
- **Pedali MIDI** ("Impara MIDI" accanto a ogni azione): nota premuta, controller che supera la metà (pedale
  sustain CC 64) o cambio programma. Tutti i dispositivi MIDI collegati vengono aperti, anche se collegati dopo;
  funziona con Looplab in secondo piano. Crate `midir` (MIT).
- **Tasti multimediali in secondo piano** (opzione, spenta di serie, perché li toglie agli altri lettori):
  plugin `tauri-plugin-global-shortcut`.
- **Griglia del tempo** (scheda Pratica): con i BPM impostati, battiti e battute (ambra) sulla forma d'onda; la
  calamita si aggancia al battito più vicino. "Batti" fissa anche il primo battito (l'ultimo tocco), "Primo
  battito qui" (Maiusc+T) lo sposta sul playhead. Metronomo e griglia usano lo stesso primo battito.
- **Diario di studio**: secondi di riproduzione per brano e per giorno e velocità massima, in `diary.json` nella
  cartella dati (scritto ogni 30 s, alla pausa, al cambio brano e alla chiusura). Scheda Pratica: oggi, totale,
  ultimi 7 giorni; "Tutti i brani" (anche dalla palette) apre l'elenco e riapre un brano con un clic.
- Crediti aggiornati: font Inter e JetBrains Mono (SIL OFL 1.1, testo incluso), Fontsource, midir.

- Correzione dopo le prove: durante il conteggio il video scattava (la musica aspetta ma il video andava
  avanti e veniva riportato indietro). Ora il video segue `playbackClock`: fermo sul fotogramma giusto durante
  conteggio e pausa tra le ripetizioni, riparte con la musica; la finestra video staccata riceve quanto manca.

- **Metrica come nei DAW** (scheda Pratica, accanto a "Griglia"): un pulsante "7/8" apre le metriche più usate
  (2/4… 7/4, 3/8… 12/8) più +/− per i battiti e 2/4/8/16 per il valore del battito; la rotella sopra il pulsante
  cambia i battiti. Niente da scrivere. Il tempo (BPM) è in quarti al minuto come in Reaper e Ableton: in 7/8 i
  battiti della griglia e del metronomo sono ottavi. "Batti" si preme sui battiti della metrica (gli ottavi in 7/8).
  Il **conteggio** ora è in battute (No, 1, 2, 4), come nei DAW. Salvata nel progetto (`beatsPerBar`, `beatUnit`).

- **Pannello laterale ridimensionabile**: trascina il bordo sinistro (da 260 a 560 px, mai tanto da schiacciare
  le forme d'onda), doppio clic per la larghezza normale; ricordata su questo PC. Le righe della scheda Pratica
  vanno a capo quando il pannello è stretto. Maniglia unica `ResizeHandle`, usata anche dal pannello video.

- **Script in ordine**: in `scripts\` solo i lanciatori numerati per importanza (`01-dev.cmd` … `07-pulisci.cmd`),
  la logica PowerShell in `scripts\powershell\`. Riferimenti aggiornati in README, messaggi dell'app e documenti.

## 10. Esportare, vedere le note, manutenzione ✅

- **Esporta audio** (Ctrl+Alt+R come il Render di Reaper, pulsante ⤓ in alto, menu del Loop, tasto destro su una
  sezione): loop, sezione o brano intero; ripetizioni ×1/2/4/8 unite come nel loop; con o senza velocità e
  tonalità attuali, con o senza EQ e canali; formati WAV 16/24 bit (scritti da Looplab) e FLAC / MP3 320k
  (con FFmpeg). Nome proposto: "Brano - Ritornello 75% +2st.wav", nella cartella del brano. Avanzamento,
  Annulla (nessun file a metà), "Mostra nella cartella". Le scelte di formato e suono restano per il PC.
  Il motore rende fuori tempo reale con la stessa catena della riproduzione (`export.rs`).
- **Vista note** (tasto N, icona pianoforte): tastiera di 88 tasti sotto la forma d'onda, con la curva del livello
  di ogni nota (5 punti per semitono) e i tasti più forti accesi in ambra e scritti in alto (C4 = Do centrale,
  come in Reaper). "Al playhead" segue la musica dal vivo (~12 volte al secondo); "Media del loop" fa la media
  su tutto il loop, più stabile per capire gli accordi. Segue la tonalità e i canali (es. "Senza centro").
- **Impostazioni → Dati**: spazio occupato dalle conversioni di FFmpeg (audio estratto, video compatibili) e
  "Svuota" (il video sullo schermo resta); "Registro degli errori" apre `looplab.log` in Esplora risorse.
- **Registro degli errori** (`logs\looplab.log` nella cartella dati, max 1 MB + `looplab.old.log`): avvio,
  errori dei comandi, crash del Rust e errori dell'interfaccia, con data e ora (UTC).
- Scelte fatte da me: nomi delle note in lettere (C D E…) come nei DAW; la vista note parte chiusa; nessuna
  normalizzazione del volume nell'export (si sente come in Looplab).

- **Temi di colore** (Impostazioni → Aspetto, anche dalla palette "Tema: …"), come il menu Tema di Ableton:
  Rack (predefinito), Fosforo (verde, loop azzurro), Blu notte, Studio chiaro (pannelli chiari, display scuri),
  Alto contrasto (nero, bianco, giallo). Si applica subito, forma d'onda e vista note comprese, e resta su questo PC
  (non si azzera con "Valori predefiniti"). Ogni anteprima è disegnata nei colori del suo tema. Tutti i colori dei
  componenti sono ora token del tema (barra in alto, trasporto, righello, fader, display, bordi); i numeri sui
  pannelli hanno un colore proprio (`readout`), leggibile anche sul tema chiaro. Marker e sezioni tengono i loro
  colori. Un test controlla che ogni tema definisca tutti i colori.
- **Seconda pulizia del codice** (dopo analisi approvata): tolto codice mai usato; un solo punto per le
  percentuali scritte a mano, i valori con segno, le preferenze del PC (`lib/storage.ts`), la rotella sui valori
  (`useWheelSteps`), l'aspetto dei display ambra (`lcd` nel tema), le cartelle dati e cache dei comandi, l'avvio di
  FFmpeg e i nomi nella cache. I colori del tema si leggono una volta sola invece che a ogni disegno, e la forma
  d'onda di un brano caricato non si ricostruisce più a ogni richiesta. Comportamento invariato.
- **Conteggio**: il primo battito di ogni battuta è accentato (prima solo il primo in assoluto), come il metronomo.
- **Tempo e click nella barra di trasporto, come nei DAW** (scelto dall'utente tra tre mockup:
  https://claude.ai/artifact/5rDvvAWCwgy2egxjZTjGTW): display ambra "Tempo" con BPM e metrica (clic per scrivere,
  rotella o ↑↓ per cambiare), ▾ per Batti, Primo battito qui, Griglia e Tempo sconosciuto; tasti Batti, Metronomo
  (spia) e Conteggio (mostra "No", "1 bt"…, apre conteggio e volume). Sotto i 1280 px Batti e Conteggio si
  nascondono e restano nel pannello ▾; display e Play si stringono: la barra entra anche a 900 px (misurato a
  900, 1024 e 1280). La scheda Pratica tiene solo speed trainer e diario; le spiegazioni sono suggerimenti
  sui titoli.
- **Scorrimento fluido** con Maiusc+rotella (e scorrimento orizzontale del touchpad): la vista scivola come lo zoom
  invece di saltare a ogni scatto; più scatti veloci si sommano.
- **Inizio e fine del brano**: tasti Home e Fine (come in Reaper e Ableton), anche nella palette e assegnabili.
- **Apertura come in Reaper** (dopo la misura: una lezione di 3 ore chiedeva ~20 s di attesa e ~2 GB di RAM):
  si suona dopo i primi 3 secondi decodificati, il resto si carica in sottofondo e la forma d'onda si riempie
  da sola (la parte mancante è tratteggiata nella panoramica, con la percentuale). L'audio decodificato sta in un
  file della cache letto dal disco (non più in RAM) e la riapertura dello stesso file è istantanea.
  Misurato su 3 ore di AAC: suonabile in 0,01 s, tutto caricato in 12 s (78 s nella versione di sviluppo),
  seconda apertura immediata. Cache dei brani pronti al massimo 10 GB, i più vecchi si tolgono da soli
  (Impostazioni → Dati la mostra e la svuota). L'export aspetta che il brano sia caricato tutto.

## Dopo la prima versione

- **Separazione AI degli strumenti** (voce, batteria, basso, altro): da decidere con l'utente, serve scaricare un
  modello (~300 MB) e una libreria di calcolo. Andrà prima dello stretch nella catena.
