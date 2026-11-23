# Roadmap

| #   | Fase                       | Stato                      |
| --- | -------------------------- | -------------------------- |
| 1   | Fondamenta                 | ✅ completata              |
| 2   | Cuore audio                | ✅ completata              |
| 3   | Velocità, tonalità e loop  | ✅ completata              |
| 4   | Marker e sezioni           | ✅ collaudata (19/11/2026) |
| 5   | EQ e isolamento base       | ✅ completata — da provare |
| 6   | Video                      | ✅ completata — da provare |
| 7   | Rifinitura e distribuzione | ✅ completata — da provare |
| 8   | Strumenti di pratica       | ✅ completata              |
| 9   | Comodità mentre suoni      | ✅ completata              |
| 10  | Esportare e vedere le note | ✅ completata — da provare |
| 11  | Scorciatoie per lo studio  | ✅ completata              |
| 12  | Versione portable          | ✅ completata              |
| 13  | Finestra mini              | ✅ completata              |
| 14  | Appunti su loop e sezioni  | ✅ completata              |
| 15  | Sezioni come region        | ✅ completata              |
| 16  | Nota di riferimento        | ✅ completata              |
| M   | Metronomo integrato        | ✅ completata              |
| 17  | Mappa del tempo            | ✅ da perfezionare         |
| 18  | Separazione strumenti      | ✅ completata              |
| 19  | Archivio unico e backup    | ✅ completata              |
| 20  | Esporta tracce separate    | ✅ completata              |
| 21  | Tab Guitar Pro             | ✅ provata (19/11/2026)    |
| 22  | Editor di sincronizzazione | ✅ provata (19/11/2026)    |
| 23  | Spartiti PDF               | ✅ provata (19/11/2026)    |
| 24  | Extra dello spartito       | ✅ provata (21/11/2026)    |
| 25  | Lezione: video e tab       | ✅ provata (21/11/2026)    |
| 26  | Inquadrature, basi, file   | ✅ provata (22/11/2026)    |
| 27  | Home delle lezioni         | ✅ provata (22/11/2026)    |

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
- Correzioni dopo il collaudo del 19/11/2026 (`docs/collaudo/`): la barra in basso entra di nuovo in ogni
  larghezza da 900 px in su (misurato a 900, 1023, 1024, 1279, 1280, 1535, 1536, 1799 e 1800 px; sotto i 1280 px
  Segui, Brano intero e Calamita si nascondono e restano sui tasti F, Z e G, come Batti e Conteggio e l'intervallo
  del loop; i fader e il display si stringono sotto i 1024 px; Batti e Conteggio si vedono da 1600 px, i tasti 50/75/100% da 1800 px; il contatore ×N del loop sta accanto alla scritta «Loop», così non allarga la barra); nel pannello
  Sezioni e nei Loop salvati il nome sta sopra gli orari e ha il suggerimento col nome intero; Esc nella rinomina annulla davvero e un nome lasciato com'era non aggiunge un passo di Annulla; un
  vecchio `.looplab.json` danneggiato fa comparire l'avviso «il progetto non si legge»; Biome ignora `.claude` e
  `docs/collaudo`.

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

- **Script in ordine**: in `scripts\` solo i lanciatori numerati per importanza (`01-dev.cmd` … `08-portable.cmd`),
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

- **Conteggio on/off come il tasto metronomo di Reaper**: clic sul tasto Conteggio = acceso/spento (spia ambra,
  ricorda le battute, mostrate sul tasto: "2 bt"); tasto destro (o ▾ del Tempo) = battute 1/2/4, volume e suoni.
  Scegliere le battute accende il conteggio. "No" non c'è più. Azione "Conteggio on/off" assegnabile a un tasto o
  a un pedale MIDI. Le impostazioni vecchie restano valide (un conteggio acceso resta acceso).
- **Suoni del metronomo** (tasto Conteggio della barra di trasporto, o ▾ del Tempo nelle finestre strette), come
  nelle impostazioni del metronomo di Reaper: per l'accento (1° battito) e per gli altri battiti si scelgono
  separatamente suono e livello; ▶ fa sentire il suono anche a brano fermo, e sceglierlo dal menu lo fa sentire
  subito. Otto suoni sintetizzati nel motore (niente campioni da distribuire): beep alto e basso, legno alto e
  basso, campanaccio, bacchetta, charleston, clave. Predefinito invariato (beep alto / beep basso). Valgono anche
  per il conteggio.
- **Trascinare con la rotella premuta**, come in Reaper: sulla forma d'onda (e sul righello) la vista segue la
  mano; playhead, loop e zoom restano, "segui il brano" si sospende 2 s. Lo scorrimento automatico di Windows
  (icona a frecce) non parte più.
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

- **Personalizzazioni** (l'utente le trovava scarne; scelte tutte e quattro le aree):
  - _Colori su misura_ (Impostazioni → Aspetto), come il theme tweaker di Reaper: accento, forma d'onda, loop,
    playhead, display e griglia, da 14 colori pronti o dal selettore di Windows; ogni colore crea da solo le sue
    sfumature (passaggio del mouse, sfondo tenue, alone). Ogni tema ricorda i suoi; ↺ rimette il colore del tema.
    Le anteprime dei temi mostrano i colori cambiati.
  - _Interfaccia_: grandezza di tutta l'app 80–150% (zoom della finestra, anche dalla palette "Interfaccia più
    grande / più piccola"), carattere (Inter, Segoe UI, Monospazio), angoli (squadrati, normali, morbidi),
    altezza della panoramica (bassa, normale, alta). La densità compatta/ampia non c'è: la fa già la grandezza.
  - _Forma d'onda_ (nuova scheda): stile piena / contorno / metà (un solo lato, come la vista "rettificata" di
    Reaper), zoom verticale ×1–×4 (i picchi si fermano al bordo), spessore del playhead 1–3 px, griglia di battute,
    linee del righello, linea centrale.
  - _Comportamento_ (scheda Generale): all'avvio schermata vuota o ultimo brano; vista all'apertura primi 30 s o
    tutto il brano; scorrimento continuo o a pagine (come Reaper); rotella = zoom o scorrimento (Maiusc fa
    l'altra cosa; il pizzico del touchpad zooma sempre); velocità della rotella ×0,5–×2; doppio clic = niente o
    suona da lì.
  - Comandi delle impostazioni come nei DAW: tasti ON/OFF con spia al posto delle caselle, − / + e rotella al
    posto dei numeri da scrivere (doppio clic sul valore = predefinito), tasti di scelta. "Valori predefiniti"
    di ogni scheda rimette solo le sue voci.

- **Nomi standard dei DAW** (richiesta dell'utente: "1 bt", "Batti" e la campanella non si capivano): Tap,
  icona metronomo, tasto Count-in con scritta e "1 bar / 2 bars / 4 bars", Snap, Follow, Pre-roll, Gap, Pitch,
  Fine tune, Downbeat qui; EQ Low shelf / Peak / High shelf / HPF / LPF e Gain; suoni Woodblock, Cowbell, Stick,
  Hi-hat. Spiegazioni e menu restano in italiano.
- **Focus da tastiera**: una linea sottile attaccata al controllo invece dell'alone verde arrotondato (si vedeva
  attorno alla scheda attiva del pannello laterale).

- **Display Tempo**: il numero dei BPM non si taglia più (era stretto per "129.5"); si mostra sempre con un
  decimale, come nei DAW. Il menu si apre dalla scritta "Tempo ▾" (tutta cliccabile, si illumina) o col tasto
  destro ovunque sul display. Il menu è diviso in Tempo (Tap tempo, Downbeat qui, Griglia con spia, Tempo
  sconosciuto) e Count-in / click; ogni voce dice cosa fa e mostra il suo tasto. Una voce spenta scrive
  perché (es. "Apri un brano per usarlo", "Prima imposta il BPM").

- **Tutto il brano a schermo** (tasto ↔ con spia nella barra di trasporto, tasto Z, palette), come lo zoom al
  progetto di Reaper: la forma d'onda grande mostra tutto il brano; premuto di nuovo torna allo zoom di prima.
  La spia è accesa mentre si vede tutto. Sotto i 1024 px il tasto si nasconde (restano Z e la palette).

- **Scorrimento a pagine più facile da trovare**: tasto destro sul tasto Follow (come le opzioni dei tasti di
  Reaper) apre Follow on/off e Scorrimento Continuo / A pagine; comando "Scorrimento continuo on/off" (come
  "Continuous scrolling" di Reaper) nella palette e assegnabile a un tasto o pedale. Resta anche in
  Impostazioni → Generale.

- **Punto di partenza ben visibile** (con "Torna al punto di partenza" acceso): linea tratteggiata a tutta altezza
  come l'edit cursor di Reaper (il playhead resta la linea piena), bandierina più grande con bordo scuro nel
  righello, colore proprio in ogni tema (`--color-cue`, mai l'accento: prima nel tema Fosforo spariva nella forma
  d'onda verde), modificabile in Colori su misura → "Punto di partenza".

- **Dopo aver creato un loop** (trascinando sulla forma d'onda), come l'opzione di Reaper "sposta l'edit cursor
  all'inizio della selezione": il playhead Resta, va All'inizio del loop (predefinito: fermando si torna lì) o
  Suona subito da lì. Si sceglie in Impostazioni → Generale → Mouse e nel menu del Loop (▾ o tasto destro sul
  tasto Loop).

- **Pagina iniziale nuova** (scelte dell'utente: i recenti sono la parte importante, il resto minimale):
  - _Recenti_ come lista principale (fino a 30): icona audio/video, nome intero al passaggio del mouse, cosa c'è
    nel progetto (loop salvati, sezioni, ultima velocità), durata, quando è stato aperto ("12 min fa", "ieri",
    "mar", "12 ott"). Ricerca da 7 brani in su. Tasto destro: Apri, Mostra nella cartella, Togli dalla lista.
    `recent.json` ora ricorda anche ora di apertura e durata (le liste vecchie si leggono ancora).
  - _Riprendi_: una riga sottile in cima con l'ultimo brano.
  - _Striscia per trascinare_ al posto del grande riquadro (il file si può lasciare ovunque nella finestra); il
    riquadro grande resta solo al primo avvio, quando non ci sono recenti.
  - _Lo sapevi?_: un suggerimento di una riga, diverso a ogni avvio. Tolte le scorciatoie fisse (sono in Ctrl+K).

- **Niente menu del browser col tasto destro** (Indietro, Aggiorna, Stampa, Esamina): restano solo i menu
  dell'app e Taglia/Copia/Incolla nei campi di testo. In sviluppo Maiusc + tasto destro lo riapre (per Esamina).

- **Si vede dove c'è il tasto destro**:
  - _Triangolino_ nell'angolo in basso a destra dei tasti con opzioni (Loop, Follow, Count-in), come i tasti di
    Logic, Cubase e dell'hardware con un menu dietro un tasto (prop `options` di `Button`).
  - _Seconda riga nel suggerimento_ "Tasto destro: …" con l'icona del mouse (prop `rightClick` di `Tooltip`), anche
    sul display del Tempo; sui recenti, sulle sezioni e sulle bandierine dei marker la stessa riga è nel `title`
    (`withRightClick`).

- **Trascinamento col tasto centrale**: il "vuoto" all'inizio del trascinamento non era di Looplab, ma di uno
  script AutoHotkey dell'utente (CenterWindow) che tratteneva il tasto centrale per 150 ms; ora lo script ha le
  eccezioni per le app audio. Restano utili: l'auto-scroll di Windows bloccato su tutta la finestra (sul
  mousedown, `main.tsx`), lo scatto della rotella ignorato mentre la si preme, il Follow in pausa mentre si tiene
  la vista e i **bordi elastici** (`pan` / `settle` in `stores/view.ts`): oltre 0:00 o la fine la vista segue
  ancora la mano, sempre più dura e al massimo per 1/5 della vista, con la zona senza musica ombreggiata.

- **Ridimensionare il video subito**: la barra tra video e forme d'onda parte dalla misura che si vede, non da
  quella salvata (più grande, se la finestra era più alta: il primo tratto del trascinamento non muoveva niente).
  A ogni limite (video minimo, forme d'onda minime, pannello laterale) il trascinamento si riaggancia, così
  tornando indietro si muove subito. Le barre prendono il mouse anche qualche pixel intorno.

- **Pulizia del codice** (report approvato dall'utente):
  - tasti con opzioni sul tasto destro in un componente unico (`OptionsKey`, `useOptions`, `OptionsPanel`);
  - trascinamenti con il puntatore in una funzione sola (`lib/followPointer.ts`): finiscono anche se Windows
    prende il mouse (prima le bande dell'EQ potevano restare agganciate);
  - righe e gruppi delle Impostazioni condivisi (`app/SettingLayout.tsx`);
  - una sola `formatPercent`, un solo `isVideoPath`, `clamp` al posto dei limiti scritti a mano;
  - un solo ciclo di animazione per forme d'onda, posizione e note (`useAnimationFrame`), fermo quando nessuno
    disegna; un disegno che va in errore finisce nel registro senza fermare gli altri;
  - tolte le letture dei formati vecchi di `recent.json` (solo percorsi) e del tema (`looplab.theme`).

## 11. Scorciatoie per lo studio ✅

Scelte dall'utente tra le idee proposte (le più piccole e usate in ogni sessione, più la scaletta).

- **Riprendi dove eri**: il progetto ricorda la posizione del playhead (`position`, salvata quando si ferma, si
  sposta da fermo o si chiude); riaprendo il brano il playhead torna lì e la vista lo mostra. Spegnibile in
  Impostazioni → Generale ("Riprendi dove eri").
- **Zoom sul loop** (Maiusc+Z): la forma d'onda mostra il loop con un po' di margine (`zoomTo`). Mentre suona dentro
  un loop tutto visibile, il Follow non sposta la vista.
- **Loop avanti / indietro di una frase** (Ctrl+→ / Ctrl+←, come in Ableton): il loop scorre della sua lunghezza e
  riparte dal nuovo inizio. **Loop doppio / a metà** (Ctrl+↑ / Ctrl+↓) dallo stesso inizio.
- **Accordature** (menu "Accordatura" accanto al Pitch, da 1280 px): il brano è in Mi♭, Re, Do♯ o Do e il Pitch lo
  riporta in standard (+1…+4 st), così la chitarra accordata standard suona insieme.
- **Tasti 1–9**: richiamano i loop salvati nel loro ordine; **Alt+1–9** mettono in loop le sezioni.
- **Scaletta** (scheda Sezioni, sotto i Loop salvati): loop salvati in fila, ognuno ×N (− / + / rotella), ordine
  con le frecce; Play la suona dall'inizio, passa da sola al passo successivo contando le ripetizioni del motore e
  si ferma alla fine. Cambiare il loop a mano o aprire un altro brano la interrompe. Salvata nel progetto
  (`playlist`); comando "Scaletta: avvia / ferma" assegnabile a un tasto o pedale.

## 12. Versione portable ✅

- **ZIP portable** (`Looplab_<versione>_x64-portable.zip`): `Looplab.exe`, FFmpeg, licenze e `portable.txt`. Con
  quel file accanto all'exe, impostazioni, cache, registro errori e profilo WebView2 stanno in `dati\` lì accanto:
  si estrae dove si vuole, anche su una chiavetta. Serve WebView2, già presente in Windows 10/11 aggiornati.
- `04-build.cmd` crea lo ZIP insieme all'installer (con aggiornamenti segnalati); `08-portable.cmd` crea solo lo
  ZIP, senza chiave né password (non cerca aggiornamenti).
- Nella portable la cache dei brani decodificati si ferma a **2 GB** (10 GB nell'installata) e "Cerca
  aggiornamenti" dice solo che c'è una versione nuova da scaricare: l'installer metterebbe una copia installata
  accanto alla portable. Impostazioni → Dati dice quando si è nella portable.
- I progetti `.looplab.json` restano accanto ai brani come sempre: viaggiano con la musica, non con l'app.

## 13. Finestra mini ✅

- **Finestra mini** (Ctrl+M o il tasto ⧉ in alto, come il mini player di un lettore multimediale): la finestra
  diventa una barra sottile **sempre in primo piano** con play, loop, posizione, velocità − / + e il brano. Resta
  sopra la tablatura nel browser o il video di una lezione; tutte le scorciatoie funzionano. Ctrl+M o ⤢ la
  riportano com'era (posizione, dimensione, massimizzata). Chiudendo l'app in mini, si ricorda la finestra intera.
- Fatta in Rust (`window::set_mini`): la finestra principale si rimpicciolisce, niente seconda finestra da tenere
  sincronizzata.

## 14. Appunti su loop e sezioni ✅

- **Appunti** ("attenzione al bending", "diteggiatura 1-3-4"): tasto 🗒 su ogni loop salvato e sezione della
  scheda Sezioni, acceso quando c'è un appunto; il suggerimento lo mostra, un clic apre il riquadro per scriverlo
  (si salva chiudendo, un solo passo di Annulla). Salvati nel progetto (`memo` di loop salvati e sezioni).
- **Mentre suoni** l'appunto si vede in un riquadro in alto a sinistra della forma d'onda grande: quello del loop
  salvato in loop, altrimenti quello della sezione sotto il playhead (`features/markers/memo.ts`). Anche nella
  finestra mini, al posto dell'intervallo del loop, e nel suggerimento della striscia delle sezioni.
- Nel codice si chiamano `memo` per non confonderli con la vista note (le note musicali, tasto N).

## 15. Sezioni come le region di Reaper ✅

Scelta dell'utente: le sezioni consecutive della fase 4 (ognuna fino alla successiva, l'ultima fino alla fine)
erano scomode. Ora ogni sezione ha **inizio e fine**, con spazio libero tra l'una e l'altra.

- **Creare**: S apre la sezione (sulla striscia "Sezione in corso…" cresce col playhead), S di nuovo la chiude, Esc
  la annulla; trascinando in uno spazio vuoto della striscia (con lo Snap); Maiusc+S o "Crea sezione" nel menu
  del Loop fanno del loop una sezione (come "Insert region from time selection" di Reaper).
- **Non si sovrappongono**: una sezione nuova accorcia quelle che copre, divide in due quella in cui cade, toglie
  quelle che copre per intero (`insertSection`). Trascinando bordi o sezione si resta nello spazio libero
  (`roomAround`, `setSectionBounds`).
- **Striscia**: clic = playhead all'inizio della sezione, doppio clic = loop, trascinare = spostarla, bordi =
  allungarla o accorciarla, tasto destro = menu; clic nel vuoto = playhead lì. La lista mostra inizio–fine; `,` e
  `.` si fermano anche sulle fini; la calamita si aggancia a inizi e fini.
- **Progetti vecchi**: le sezioni senza fine ricevono l'inizio della successiva, l'ultima la fine del brano
  (`withEnds`, al caricamento): nulla si perde.

## 16. Nota di riferimento, velatura, riga informazioni ✅

Le ultime idee proposte rimaste aperte, fatte in ordine su richiesta dell'utente.

- **Nota di riferimento** (scheda Pratica): Chitarra / Basso, accordatura dello strumento (Standard, Mi♭, Drop D,
  Re, Drop C♯, Drop C), un tasto per corda dalla più grave e il La. Clic = la nota suona finché non la fermi (o
  si cambia scheda), anche sopra il brano e a brano fermo, senza bisogno di un brano aperto. La = 415…466 Hz
  (440 standard) e volume con − / + o rotella. Sintetizzata nel motore (`tone.rs`), niente microfono.
- **Velatura fino al punto di partenza** (Impostazioni → Forma d'onda, spenta di serie): mentre suona, una fascia
  leggera del colore del punto di partenza dal punto di partenza al playhead.
- **Riga informazioni** (Impostazioni → Generale, spenta di serie), come la Info View di Ableton: in fondo alla
  finestra dice cosa c'è sotto il mouse, con scorciatoia e tasto destro.

## M. Metronomo integrato ✅

Provato dall'utente in una copia a parte (ramo `metronomo`) e unito a `main` il 2026-11-09, tolto il commit
che separava la copia di prova. Si importa MetroFlow (`D:\projects\Metronome`, che resta intatto) invece di rifarlo: logica e
interfaccia si portano, solo il motore dei click passa in Rust (un motore solo, valido anche sopra i brani).

1. ✅ **Logica pura** importata con test nuovi (MetroFlow non ne aveva): `features/metronome/` (battuta con gruppi
   e accenti, swing, poliritmi, gap trainer, ritmo da suonare, metrica casuale, routine), `lib/music/` (note,
   scale, accordi), `features/fretboard/` (manico e accordature). Ancora non usata dall'app.
2. ✅ **Motore in Rust** (`pattern.rs`, `metronome.rs`): gruppi, accenti per battito (forte / normale / muto),
   suddivisioni fino a 8, swing, poliritmo su una voce sua; suoni e livelli per accento, battito, suddivisione e
   poliritmo. Il click sopra i brani usa già lo stesso modello (per ora con la battuta semplice, come prima). Il
   metronomo da solo ha un orologio suo: parte dal count-in, cambia tempo o battuta tenendo il punto della battuta
   (pronto per lo speed trainer), comandi `set_metronome` / `run_metronome`, posizione nello stato di riproduzione.
3. ✅ **Modalità Metronomo** (Ctrl+Maiusc+M, tasto in alto, pulsante nella pagina iniziale): si apre sopra il
   brano, che resta caricato sotto; pannello laterale e barra di trasporto del brano si nascondono. Display del
   tempo (− / +, rotella, frecce, doppio clic = 120, Tap o T, nome italiano del tempo, ♪ = … se l'impulso non è un
   quarto), display della battuta con menu (metriche comuni, composte con nome, tutti i gruppi possibili, impulsi
   e valore con − / +), battuta cliccabile (forte → normale → muto, blocchi larghi quanto il gruppo, impulso che si
   accende, puntini delle suddivisioni, riga del poliritmo), suddivisione 1–6, swing 50–75 % (solo in 2 o 4),
   poliritmo 2–16, trasporto suo (Spazio, count-in 0–4 battute, battuta e tempo trascorso, volume). I tasti Spazio, T,
   più e meno guidano il metronomo mentre è aperto; avviarlo mette in pausa il brano e viceversa. Impostazioni salvate
   su questo PC (`stores/metronome.ts`).
4. ✅ **Esercizi** (pannello a destra, decisi nel motore battuta per battuta, `exercises.rs`; si possono
   combinare): speed trainer (da / a / passo / ogni N battute, anche verso il basso; il cambio cade sulla
   battuta), gap trainer (battute di click prima, suona / silenzio, silenzio che cresce), click muti a caso
   (5–90 %, il count-in suona sempre), ritmo da suonare (griglia di pause / note / accenti su 1 o 2 battute in
   suddivisione 2, 3 o 4, pennate giù e su con suoni propri, ritmi generati facile / medio / difficile, giro a
   memoria ogni N, click guida sulle pause in battere). Righe dal vivo: tempo attuale, click o silenzio, cella
   che suona. Impostazioni salvate su questo PC (`stores/metronomeExercises.ts`).
5. ✅ **Brani e sequenze** (schede Brani e Sequenze accanto agli Esercizi). Un brano è battuta, tempo ed
   esercizi con un nome (salva, ricarica, rinomina, elimina). Una sequenza unisce scaletta, routine e sequenza di
   battute di MetroFlow: parti in fila, ognuna con battuta, tempo ed esercizi suoi per N battute e una nota su cosa
   suonare; la battuta attuale o un brano si aggiungono come parti, si spostano, si allungano con − / +; durata
   totale; «Da capo» la ripete. Il motore la suona da sé (`Sequence` in `metronome.rs`): il cambio cade sulla
   stanghetta, alla fine si ferma da solo. Mentre suona, la schermata mostra la parte in corso (striscia in alto
   con nome, parte N di M e la nota) e i comandi della battuta propria riposano fino a «Esci dalla sequenza».
   Salvati su questo PC (`stores/metronomeLibrary.ts`).
   - ✅ **Cosa contano i BPM** (clic su «BPM» nel display Tempo o tasto destro): quarti come nei DAW
     (predefinito: 4/8 a 120 va il doppio di 4/4 a 120) o impulsi della battuta (4/8 a 120 = 120 ottavi).
     Ogni brano e parte tiene la sua scelta (`tempoBase`, `pulseTempo` nel motore).
   - ✅ **Grafica nuova** (dopo la prova del passo 3: «la grafica va migliorata molto»). Al centro la manopola del
     tempo di MetroFlow (`TempoDial.tsx`, `dialGeometry.ts`): scala 20–400 su un anello aperto in basso che si riempie
     fino al tempo, numero su un display rotondo, − / + nella sua apertura (tenuti premuti scorrono), trascinamento
     attorno all'anello (più fine lontano dal centro), rotella, frecce, doppio clic = 120; a ogni battito l'arco
     «respira» e sull'accento si accende tutto l'anello. A sinistra il display della battuta, a destra il tasto Tap
     grande con spia. La battuta è una fila di pad da drum machine (spia sopra ogni impulso, blu nel count-in, tacche
     di livello forte / normale, puntini delle suddivisioni, gruppi staccati), sotto una plancia unica per
     suddivisione, swing e poliritmo.
   - ✅ **Pad che si accendono** (dopo la prova: «puoi fare di meglio con l'illuminazione»): il pad che suona si
     illumina tutto, resta pieno per il primo tratto e sfuma entro il battito, con un alone e un leggero
     «colpo»; sull'accento il lampo è bianco al centro e più largo, nel count-in è blu (`BeatStrip.tsx`).
6. ✅ **Lampeggio**: tasto ON/OFF con spia nel trasporto; lo schermo del metronomo lampeggia a ogni battito, più forte
   sugli accenti (`useBeats.ts`, condiviso con la manopola). Preferenza di questo PC, non dei brani.
7. ✅ **Manico della chitarra** (tasto ON/OFF con spia nel trasporto; da MetroFlow, `features/fretboard/`,
   `stores/fretboard.ts`). Sotto la plancia, il manico acceso con una scala o un accordo: gradi (R, ♭3, 5…) o
   nomi delle note, tonica in ambra, corda più acuta in alto, 12 / 15 / 22 / 24 tasti. Barra di selettori come nei
   DAW, niente da digitare: tonica (menu o rotella, nome anche in italiano), scala o accordo (19 scale e 25
   accordi con nomi italiani), accordatura (11 preset, da 4 a 8 corde; ogni corda si accorda di un semitono con
   rotella o − / + sul suo nome e l'accordatura diventa «Personalizzata»), posizione da 4–6 tasti (il resto resta
   tenue; la rotella la sposta), ♯ / ♭. Col manico acceso manopola e pad si accorciano. Salvato su questo PC.
8. ✅ **Voce che conta** (tasto ON/OFF con spia nel trasporto; tasto destro: «e» sulle suddivisioni e volume).
   «uno, due, tre…» sugli impulsi, anche nel count-in; tace dove tace il click (battito muto, gap trainer, click
   muti a caso); oltre il sedici ricomincia da «uno». Campioni registrati con la voce italiana di Windows
   (Microsoft Elsa) da `scripts\09-genera-voce.cmd`, incorporati nell'app (`src-tauri/voice/it`); il motore li
   taglia dai silenzi, li porta allo stesso volume e alla frequenza della scheda (`voice.rs`) e li dice sul
   battito, sopra i click, senza toccare il thread audio. Oltre ~180 BPM i numeri lunghi si accorciano (la parola
   dopo taglia quella prima). **Da verificare prima di distribuire l'app:** la licenza d'uso delle frasi registrate
   con le voci di Windows; in alternativa si registrano campioni propri con lo stesso script.
9. ✅ **Suoni e suoni importati** (scheda «Suoni» accanto a Esercizi, Brani, Sequenze; da MetroFlow, che aveva gli
   slot dei suoni). Per accento, battito, suddivisione e poliritmo: suono (8 interni o uno importato, da menu; si
   sente appena scelto), tasto Ascolta e volume. «Importa un suono…» prende un file audio qualsiasi (WAV, MP3,
   FLAC, OGG, M4A…): ne fa un click dal primo suono, al massimo 2 secondi, sfumato in fondo, e lo tiene nei dati
   dell'app (cartella `suoni`, `commands/click_sounds.rs`); sotto, l'elenco degli importati con Elimina (chi lo
   usava torna al suono interno). Gli stessi suoni valgono sopra i brani: la scheda Pratica mostra quello
   importato quando è in uso. Nel motore ogni voce dei click legge da `ClickSamples` condivisi (tagliati,
   livellati, alla frequenza della scheda) senza toccare il thread audio; scegliere un suono non accende la
   scheda audio, il motore lo prende quando parte (anche dopo una scheda persa).
10. ✅ **Voce in inglese e lingua dell'app.** La voce che conta parla inglese («one, two… and», Microsoft Zira;
    predefinita) o italiano: si sceglie nel tasto destro di Voce (comando `set_voice_language`, entrambe le
    lingue incorporate in `src-tauri/voice/en` e `it`; `09-genera-voce.cmd -Lingua it|en|tutte`). Impostazioni →
    Generale → «Lingua / Language»: Italiano o English per tutta l'interfaccia (`i18n/en.ts`, controllata dal
    compilatore chiave per chiave contro `it.ts`); la lingua si legge all'avvio e cambiandola la finestra si
    ricarica subito. In inglese i nomi delle note sono lettere (C, D♭…) invece di Do Re Mi, e numeri e date
    seguono il formato inglese.
11. ✅ **Conteggio delle suddivisioni come nello standard americano** (dopo la prova: «la voce non si adegua agli
    standard del counting»). Al posto della sola «and» su ogni click: ottavi «1 and», sedicesimi «1 e and a»,
    terzine «1 trip let», quintine «1 e and a da», sestine «1 trip let and trip let» (scelto dall'utente tra
    trip-let, and-a e la-li; oltre il sei «and»). Sei sillabe registrate per lingua (`Syllable` in `voice.rs`);
    la voce italiana dice gli stessi suoni scritti all'italiana (e, i, a, da, tri, let).
12. ✅ **Tooltip che non intralciano** (dopo la prova: il tooltip finiva sopra un altro tasto e si prendeva il
    clic). Stessi tempi e stesso aspetto, ma il tooltip è trasparente ai clic (anche il riquadro di Radix che lo
    posiziona, regola in `theme.css`) e non trattiene il mouse: sparisce appena il mouse lascia il tasto
    (`disableHoverableContent`). Vale per tutta l'app.
13. ✅ **Maiusc sospende lo snap, come in Reaper.** Finché Maiusc è premuto la calamita non aggancia: loop (nuovo,
    spostato, bordi, Maiusc+clic che lo allunga), marker, sezioni e playhead seguono il mouse pixel per pixel
    (la precisione dipende dallo zoom); rilasciato Maiusc lo snap torna. Il tasto Snap e G restano com'erano;
    mentre Maiusc lo sospende durante un trascinamento la spia del tasto Snap si spegne. Stato tenuto per tutta
    la finestra (`features/markers/snapHold.ts`), azzerato quando la finestra perde il fuoco.
14. ✅ **Pulizia del codice** (report approvato dall'utente, tutti i 9 punti). Tolta la logica di MetroFlow che il
    motore Rust ha sostituito (`gapCycle`, `randomSetup`, `routinePlan`, `routineTypes`, `constants`, i tipi del
    vecchio motore Web Audio, le funzioni di tempo inutilizzate di `beatGrid` e `rhythmPattern`: circa 900 righe);
    un solo calcolo dei gruppi della battuta (`feltBeatSpans`); una sola riga del suono (`ClickSoundRow`) anche
    nella scheda Pratica, che ora mostra i suoni importati, e via il vecchio ascolto di prova (`preview_click`);
    uno stile unico per i tasti − / + (`smallKey`); campioni della voce tagliati già in registrazione
    (−2,6 MB sull'exe); barra in basso del metronomo in `MetronomeTransport.tsx`, `TempoPanel` → `TempoControls`,
    `italianName` → `localNoteName`.
15. ✅ **Cinque temi nuovi** (Impostazioni → Aspetto, anche dalla ricerca azioni): Tramonto (prugna, accento
    corallo, loop dorato), Abisso (blu petrolio, acquamarina, loop corallo), Valvole (marrone da amplificatore,
    display arancio come le nixie, loop oliva), OLED (nero puro, accento rosso da registrazione), Carta (avorio
    e inchiostro, secondo tema chiaro). Dieci temi in tutto, ognuno con i colori su misura. Nuovo test di
    leggibilità per ogni tema (contrasto WCAG di testo, display e tasti accesi, anche al passaggio del mouse).
    Lo Studio chiaro aveva il testo dei tasti accesi a 3,3:1: arancione scurito (#d46f00 → #b05c00, ora 4,6:1)
    e, come la Carta, al passaggio del mouse il tasto si scurisce invece di schiarirsi.
16. ✅ **Il pannello laterale si ricorda com'era.** Aperto o chiuso e la scheda attiva (Sezioni, Pratica, EQ)
    tornano come lasciati alla riapertura dell'app, come la larghezza già faceva (`stores/ui.ts`, chiavi
    `looplab.sidePanelOpen` e `looplab.sidePanelTab`; test di un riavvio in `ui.test.ts`).

## 17. Mappa del tempo e rilevamento automatico ✅ (da perfezionare)

**Obiettivo (milestone):** su brani con tempi dispari e cambi continui di tempo e metrica (es. Dream Theater "The
Dance of Eternity", Tool "Schism") Looplab trova da solo tempo, battiti, battute e cambi; l'utente controlla col
metronomo e corregge solo dove serve.

**Fatto** (provato dall'utente su "The 12th Hour" di Marco Sfogli; chiusa il 10/11/2026 con l'accordo di
perfezionarla durante lo sviluppo):

- Mappa del tempo nel motore, nel progetto e nell'interfaccia: bandierine "120 · 7/8" sotto la forma d'onda (clic,
  trascina con snap, tasto destro elimina), Shift+C come in Reaper, Annulla/Ripeti. Prima del primo marker vale la
  sua griglia, anche per il click.
- "Analizza tempo" nel menu ▾ del Tempo: Beat This! (CPJKU, codice e pesi MIT) portato in Rust (crate
  `beat-detect`: spettrogramma e rete con rten, identici a PyTorch), poi battiti con programmazione dinamica (un solo
  livello di battito, nessun limite di BPM), battute con Viterbi (metri da 2 a 16, anche additivi 3+4, 2+2+3), BPM
  sempre in quarti. I marker proposti sono tratteggiati: si confermano o si tolgono tutti insieme, e un marker
  modificato diventa dell'utente e guida una nuova analisi.
- Volume della traccia e del click a portata di mano (fader Trk/Clk nel trasporto).

**Da perfezionare** (nel corso dello sviluppo):

- Metrica nei brani prog: dove la batteria suona in 4 sotto un riff in 7, la rete segue la batteria (intro di "The
  12th Hour", che l'utente conta 1 2 3 1 2 3 4). Idee: un metro messo a mano che vale per tutta la sezione, il
  confronto con Explore This! (licenza dei pesi da chiarire), brani di riferimento annotati.
- Tratti caotici (assoli): il tempo proposto oscilla di qualche BPM.
- Come arriva il modello (83 MB) sui PC degli utenti: nell'installer o scaricato al primo uso. Per ora
  `scripts\10-modello-tempo.cmd` lo copia in `src-tauri\models\`.
- Fader Trk/Clk: da rifinire nell'aspetto (priorità bassa, detto dall'utente).
- Il trasporto sfora sotto i 1100 px circa (era così anche prima).

**Piano iniziale:**

- **Mappa del tempo come in Reaper**: punti di tempo e metrica lungo il brano (es. 7/8 a 0:42, 5/4 a 1:10). Griglia,
  metronomo, conteggio, Snap, `,` e `.`, battute nella striscia seguono la mappa. I progetti vecchi diventano una
  mappa con un solo punto: nulla si perde.
- **Rilevamento automatico** (in Rust, sul brano decodificato, una volta e poi in cache): trova attacchi delle note
  → tempo e battiti → primo battere della battuta → metrica e punti di cambio. Da decidere con l'utente: metodo
  classico (leggero, niente download) o piccolo modello AI di beat tracking (più preciso sui tempi dispari).
  Licenze: niente GPL/AGPL (es. aubio, Essentia), come per Rubber Band.
- **Proposta, non imposizione**: il risultato appare come bozza sulla striscia, si ascolta col metronomo e si
  accetta tutto o tratto per tratto.
- **Correzione a mano**: spostare, aggiungere o togliere punti; Tap tempo, "Downbeat qui" e metrica per il singolo
  tratto; tutto con un passo di Annulla.
- **Prove**: alcuni brani di riferimento con la mappa fatta a mano, per misurare quanto ci azzecca.
- Aspettativa realistica: tempo e battiti giusti quasi sempre; metrica e inizio battuta nei cambi frequenti sono il
  caso più difficile per qualunque programma, quindi proposti e da confermare.

## 18. Separazione degli strumenti ✅

Avviata il 10/11/2026 con il via dell'utente, in un worktree a parte (`D:\sandbox\looplab-stems`, ramo `stems`).

**Obiettivo:** dal brano aperto, tracce separate di voce, batteria, basso, chitarra, piano e altro; ognuna con il suo
fader, Mute e Solo, come le tracce di un DAW. Togli la chitarra e ci suoni sopra, tieni solo la batteria per capire
il metro.

**Scelte (consigliate, decise senza domande come da accordo):**

- **Modello**: HTDemucs di Demucs v4.1 (Meta / Alexandre Défossez): codice MIT, il più documentato, versione a 4
  tracce e a 6 (anche chitarra e piano). Portato in Rust come Beat This!: STFT in Rust, rete in ONNX con rten, niente
  librerie native.
- **Licenza dei pesi non chiara** (l'autore: addestrati anche su MUSDB, dati solo per ricerca; quelli a 6 tracce
  probabilmente non commerciali). Va bene per sviluppo e uso personale; **prima di pubblicare** va chiarita o il
  modello sostituito. Per questo il modello è un file a parte, intercambiabile.
- **Una volta per brano, poi in cache**: la separazione su processore richiede qualche minuto; le tracce finiscono
  nella cache come l'audio decodificato e la volta dopo si aprono subito. Mai in tempo reale.
- **Nella catena prima dello stretch**: velocità, tonalità, EQ, loop valgono sul mix delle tracce scelte.
- Solo processore (nessuna scheda video da richiedere); modello installato da script come quello del tempo, il
  download su richiesta si decide con la pubblicazione.

**Passi:**

1. ✅ Ambiente Python di riferimento con Demucs 4.1; separazione di prova e tempi su CPU (109 s per 4:43 con
   PyTorch).
2. ✅ Esportazione ONNX della rete (senza STFT), prova con rten e confronto numero per numero con PyTorch.
3. ✅ STFT/iSTFT, segmenti sovrapposti e ricomposizione come Demucs, in Rust: 40 s di brano uguali a Demucs entro
   1,1·10⁻⁵, separati in 8,7 s.
4. ✅ Separazione in background con avanzamento e Annulla; tracce a 16 bit nella cache dei brani (circa 54 MB per
   traccia ogni 5 minuti), scritte a pezzi senza tenere il brano in memoria sei volte.
5. ✅ Motore: mix delle tracce con livello, Mute e Solo prima dello stretch; finché nulla è toccato si sente
   l'originale.
6. ✅ Interfaccia: scheda "Tracce" del pannello laterale, "Separa strumenti", sei canali (S, M, fader con rotella e
   doppio clic), "Mix originale"; il mix è salvato nel progetto.
7. ✅ Provata dall'utente il 13/11/2026 (Mute e Solo, mix e originale, tracce ricaricate dalla cache, mix salvato
   nel progetto). Unita in `main` insieme alla fase 19. Resta aperto: l'export usa il brano originale, non il mix
   delle tracce.

## 19. Archivio unico e backup ✅

Avviata il 13/11/2026 con il via dell'utente, in un worktree a parte (`D:\sandbox\looplab-archivio`, ramo
`archivio`, nato da `stems`: contiene anche la fase 18).

**Obiettivo:** niente file sparsi. Tutto il lavoro dell'utente in un solo archivio, nelle cartelle standard di
Windows, con backup automatici a rotazione. Il punto di vista è quello di chi installa l'app: non deve scegliere
nulla, e sa sempre dove sono i backup.

**Scelte (consigliate, decise senza domande come da accordo):**

- **Un database SQLite** (`libreria.db`) al posto dei file JSON: progetti dei brani, diario, recenti e preferenze
  (prima nel localStorage del WebView). Nessun `.looplab.json` accanto ai brani.
- **Lavoro e cache separati**: il lavoro (`libreria.db`, `suoni\`) in `%APPDATA%\Looplab`; ciò che si rigenera
  (cache, log, WebView, posizioni delle finestre) in `%LOCALAPPDATA%\Looplab`; i backup, visibili, in
  `Documenti\Looplab\Backup`. Versione portable, sviluppo e prova-build: tutto sotto una sola cartella, stessa
  struttura.
- **Brano riconosciuto dal contenuto**: un'impronta (dimensione + inizio e fine del file) ritrova il progetto di un
  brano spostato o rinominato.
- **Backup**: copia sicura del database (`VACUUM INTO`, verificata con `integrity_check`) più i suoni. Automatico
  all'avvio e a ogni cambio di giorno; ne restano 7 giornalieri, 4 settimanali e 12 mensili. Quelli manuali non si
  cancellano mai. Prima di un ripristino, copia di sicurezza dello stato attuale. Seconda destinazione facoltativa
  (es. un disco esterno).
- **Archivio danneggiato** all'avvio: messo da parte e sostituito dall'ultimo backup sano, con avviso.
- **Migrazione senza perdite**: i vecchi `diary.json`, `recent.json`, `projects\` e i `.looplab.json` accanto ai brani
  vengono importati e poi spostati (non cancellati) in `Backup\File delle versioni precedenti`, con `origine.txt`
  che dice da dove veniva ciascuno.
- La disinstallazione non tocca mai libreria e backup (cartelle `Looplab`, non quelle col nome del pacchetto che
  l'uninstaller di Tauri può cancellare).

**Passi:**

1. ✅ Cartelle standard (`paths.rs`) e database con schema versionato.
2. ✅ Progetti, recenti, diario e preferenze nel database; impronta dei brani.
3. ✅ Migrazione dei vecchi file (provata sui dati della copia "strumenti": progetto di The 12th Hour, recenti e
   diario importati, file messi da parte).
4. ✅ Backup automatici a rotazione, seconda destinazione, ripristino, recupero dell'archivio danneggiato.
5. ✅ Interfaccia: Impostazioni → Dati, sezioni Libreria, Backup (Backup ora, Apri cartella, Ripristina) e
   Seconda copia.
6. ✅ Provata dall'utente il 13/11/2026 insieme alla fase 18, in una copia di prova con i suoi dati: import dei
   vecchi file, Backup ora, Ripristina, backup di sicurezza e seconda copia funzionano. Unita in `main`.

**Note:** non ci sono ancora copie installate da altri; chi aveva usato una build di rilascio perderebbe solo le
preferenze dell'interfaccia (il profilo WebView cambia cartella), non progetti, recenti e diario.

## 20. Esporta tracce separate ✅

Chiesta dall'utente il 13/11/2026: le tracce separate stanno nella cache (file `.pcm` grezzi, si svuota da sola);
servono come file veri, in un posto fisso e ordinato.

1. ✅ Tasto «Esporta tracce» nel pannello Tracce: 6 WAV a 16 bit (`voce.wav`, `chitarra.wav`, `basso.wav`,
   `batteria.wav`, `piano.wav`, `altro.wav`) come escono dalla separazione, senza livelli, velocità né EQ.
2. ✅ Cartella fissa `Documenti\Looplab\Tracce separate\<brano>\` (in sviluppo e portable: `Tracce separate\` nella
   cartella dei dati), con `origine.txt`; lo stesso brano riusa la sua cartella, un altro con lo stesso nome prende
   «(2)». Finito il salvataggio, Esplora risorse si apre sui file.
3. ✅ Cartella a scelta: Impostazioni → Dati, riga «Tracce esportate» (Apri cartella, Scegli cartella, Predefinita);
   la scelta sta nella libreria, quindi finisce anche nei backup.
4. ✅ Provata dall'utente il 13/11/2026 (primo avvio con la libreria e import dei vecchi dati, esportazione nella
   cartella predefinita e in una scelta, ritorno alla predefinita). Da rifare quando capita: aprire un WAV in Reaper.

## 21. Tab Guitar Pro nel player ✅

**Obiettivo:** come in Soundslice, la tab di un file Guitar Pro scorre sincronizzata con la registrazione vera;
clic su una nota = salta lì, trascinare sulle note = loop A/B. Studio completo e requisiti (UI, prestazioni,
dati) in `docs/studi/2026-11-19_tab-sincronizzate.md`. Ramo `tab`.

**Fatto** (verificato dal collaudatore in tre giri, 22/22 controlli; provato dall'utente il 19/11/2026 sugli
esercizi JTC di Marco Sfogli, 10/10 punti Ok): tutto il piano qui sotto. Correzioni nate dalle verifiche: alphaTab
non comanda mai il motore (oltre la fine dello spartito la musica tornava a 0), punti di sincronia in conflitto
rifiutati nel menu e scartati se già salvati (due punti allo stesso secondo bloccavano la pagina), velocità non
applicata due volte al cursore, fascia del loop con i tick assoluti, barra usabile a 900 px (tutte le scelte anche
nel menu "…"), un PDF o un errore non nascondono la tab (avviso), file illeggibili mai collegati, sincronia
salvata applicata anche riaprendo il brano, cursore fermo sull'ultima battuta oltre la fine.

**Da perfezionare:** a velocità ridotta il cursore anticipa al massimo ~1/16 (lo scorrimento animato di alphaTab
dura come a velocità 1); la scritta "alphaTab.net" resta visibile (richiesta dalla documentazione di alphaTab).

**Piano:**

- **Dati**: "Collega spartito" copia il file una volta in `spartiti\` nella cartella utente (nome = impronta del
  contenuto, niente doppioni), il progetto del brano ricorda file, traccia, vista e punti di sincronizzazione in
  `libreria.db`. La cartella `spartiti\` entra nei backup e nel ripristino come `suoni\`; i file che nessun brano
  usa più si tolgono all'avvio. L'originale dell'utente non viene mai toccato.
- **Vista Spartito** agganciata sopra le forme d'onda, ridimensionabile e comprimibile (come il video). alphaTab
  1.9 (MPL-2.0) disegna tab e spartito in un worker, con i colori del tema. Barra: traccia (chitarra, basso…),
  tab / spartito / entrambi, verticale / orizzontale, segui continuo / a pagine, zoom −/+.
- **Motore padrone del tempo**: alphaTab in modalità media esterni; il cursore legge la posizione del motore a ogni
  frame (fluido anche rallentato). Mappa tick ↔ secondi nostra (`timeline.ts`, con test) per loop e clic.
- **Interazione**: clic su una nota = salta; trascina = loop A/B agganciato alle note (precisione al campione del
  motore); il loop si vede come fascia colorata sulla tab e il resto si sbiadisce.
- **Sincronizzazione iniziale**: punti letti dai file GP8; altrimenti "La battuta 1 inizia qui" e "L'ultima
  battuta finisce qui" (le battute in mezzo seguono il tempo scritto). L'editor completo è la fase 22.
- Stati disegnati: vuoto (trascina qui un file), caricamento, errore spiegato, non ancora sincronizzato.

## 22. Editor di sincronizzazione ✅

**Obiettivo:** sincronizzare la tab con la registrazione in pochi secondi e correggerla a vista, come in
Soundslice, con i comandi di Looplab (bandierine come quelle del tempo, Annulla/Ripeti, snap).

**Fatto** (verificato dal collaudatore, 22 controlli Ok e 4 difetti minori corretti; provato dall'utente il
19/11/2026): tutto il piano qui sotto. Dalle prove: un T rifiutato aspetta la stessa battuta; la battuta del
prossimo T si ricava sempre dalle bandierine presenti (dopo Ctrl+Z la tab si sfasava di una battuta); il disegno
della tab non passa sopra i menu; il pulsante si chiama sempre «Sincronizza» e la spia dice lo stato.

**Da perfezionare:** la bandierina del tempo molto vicina all'inizio del brano esce a sinistra (difetto vecchio
di `TempoFlags`, vale anche per le bandierine della sincronia).

**Piano:**

- **Bandierine delle battute** sulla forma d'onda dettagliata: ogni punto di sincronia è una bandierina col numero
  di battuta (colore dello spartito); tra un punto e l'altro sottili righe dove cadono le battute calcolate, così si
  vede subito se la tab "scivola". Clic = salta lì; trascina = sposta (con lo snap ai battiti della mappa del tempo
  se il magnete è acceso, Shift lo sospende), senza poter scavalcare i vicini; tasto destro = elimina, elimina
  questo e i successivi.
- **Batti le battute**: dal menu Sincronizza si entra in modalità tap: in riproduzione ogni `T` fissa l'inizio
  della battuta successiva (la barra dello spartito dice quale), `Esc` esce. Fuori da questa modalità `T` resta il
  tap del tempo.
- **Sposta tutto**: tutti i punti avanti o indietro insieme (es. la registrazione ha un'intro più lunga).
- **Segui la griglia del tempo**: con una mappa del tempo (fase 17 o a mano) e la battuta 1 fissata, ogni battuta
  della tab si aggancia alla griglia seguendo la metrica scritta nella tab.
- **Mappa del tempo dalla tab**: il contrario, una tab sincronizzata crea la mappa del tempo (tempo e metrica di
  ogni cambio, es. l'intro in 7/4): metronomo, griglia e conteggio diventano giusti anche nei brani prog.
- Annulla/Ripeti comprendono la sincronia; tutto si salva nel progetto del brano.

## 23. Spartiti PDF ✅

**Obiettivo:** un PDF (la tab stampata dei corsi, uno spartito) si usa come una tab Guitar Pro: segue la musica,
le battute si cliccano, si sincronizza e ci si fa il loop sopra.

**Fatto** (verificato dal collaudatore in due giri, 23/26 controlli Ok e 3 avvisi minori; provato dall'utente il
19/11/2026 sull'Esercizio 10 JTC, 7/7 passi Ok): tutto il piano qui sotto. Dalle verifiche: le tab ora usano il
motore SVG di alphaTab (quello a canvas perdeva il contesto su alcuni bending: "Melody Solo" non si disegnava); il
PDF riaperto va subito sulla battuta della testina; le pagine lontane liberano la memoria; la ricerca delle battute
lascia respirare l'interfaccia tra una pagina e l'altra; testi per i PDF illeggibili; il plugin Vite di alphaTab
si importa dal suo pacchetto (`@coderline/alphatab-vite`).

**Da perfezionare:** in riproduzione un PDF lungo costa ~20 % di un core in più del pannello chiuso (fluido, p95
18 ms); la prima ricerca delle battute ha ancora uno scatto (max ~170 ms) una volta sola; 7 PDF su 27 del corso
perdono 1-2 battute (una ne perde 10), da correggere col tasto destro.

**Piano:**

- **pdf.js 6.5** (Apache 2.0) disegna le pagine una sotto l'altra, solo quelle vicine alla vista (memoria e CPU
  basse anche con PDF lunghi); niente immagini su disco: le pagine si ridisegnano al volo, nulla da pulire.
- **Battute trovate da sole** (`pdf/detectBars.ts`): linee del rigo (4-6 linee equidistanti con carta in mezzo),
  righi uniti in un sistema se una stanghetta li attraversa tutti, stanghette = colonne scure su tutti i righi
  del sistema (un'asta di nota attraversa al massimo un rigo). Pagine scure (copertine, pubblicità) saltate. Prova
  sui 27 PDF del corso JTC di Marco Sfogli: 20 identici al file Guitar Pro, gli altri con 1-2 battute in meno.
  Senza nessun rigo trovato ogni pagina vale una battuta (le pagine girano lo stesso).
- Le battute trovate si salvano nel progetto (`pdfBars`, una volta sola); **correzione a mano** col tasto destro su
  una battuta: dividi qui, unisci alla successiva, non è una battuta (la sincronia si sposta di conseguenza; Annulla
  e Ripeti valgono anche qui).
- Cursore e battuta illuminata come nella tab, a ogni frame; clic = salta all'inizio della battuta; trascina =
  loop sulle battute; segui continuo / una schermata alla volta / fermo; zoom.
- Sincronia con gli stessi strumenti della fase 22 (bandierine, tap col T, sposta tutto). Tra due punti le
  battute si dividono il tempo in parti uguali. «Segui la griglia» e «Mappa del tempo dalla tab» solo per le tab
  (in un PDF la metrica non si legge).

## 24. Extra dello spartito ✅

**Obiettivo:** manico illuminato dalle note della tab, synth sovrapposto, auto sync dalle note, conteggio e
velocità progressiva sui loop della tab.

**Fatto** (verificato dal collaudatore in tre giri; provato dall'utente il 21/11/2026, 8/8 passi Ok). Dalle verifiche: la sincronia
automatica scambiava il conteggio a clic per la battuta 1 e il fruscio della distorsione per note (ora conta solo
ciò che sale sopra lo spettro intero, con soglia a −40 dB e armoniche); le partenze possibili si seguono fino in
fondo e vince quella che spiega tutto il brano. Misure da zero: Es. 01 36 ms medio, Melody Solo 18 ms, Es. 05 e 21
sul primo attacco dopo il conteggio; banco di prova su 26 esercizi JTC: 21 partono giusti, 5 ambigui danno l'avviso.
Il manico si nasconde sotto i 768 px insieme al suo tasto; il synth segue anche i centesimi della trasposizione.

**Da perfezionare:** se le note si ripetono uguali ogni mezza battuta (Es. 10) la battuta 1 da zero può cadere
mezza battuta prima: compare l'avviso e, fissata la battuta 1, il risultato è preciso (15 ms). Note basse vicine
(2 semitoni) si distinguono poco: servirebbe un'analisi più fine sotto i 150 Hz.

Cosa c'è:

- **Synth sovrapposto**: tasto «Synth» con spia nella barra dello spartito (tasto destro = volume). Il motore
  audio suona le note della traccia scelta sopra la registrazione: allineate al campione anche rallentate e nei
  loop, con la trasposizione del brano; le note stoppate (x) non suonano.
- **Manico**: tasto «Manico»: sotto la tab un manico con le note che si sentono adesso (pallino col tasto) e,
  tenui, quelle che arrivano; corde e accordatura della traccia, tasti quanti ne usa la tab (12-24).
- **Sincronizza dalle note** (menu Sincronizza, solo tab): Looplab ascolta la registrazione e mette da solo le
  bandierine dove serve (poche: una dove il tempo cambia); la battuta 1 fissata a mano resta; le battute
  incerte sono indicate. Annulla la toglie in un colpo.
- **Conteggio e speed trainer sui loop della tab**: il loop trascinato sulla tab è il loop A/B, quindi conteggio
  e trainer valgono già; ora il conteggio (e il metronomo) funzionano anche senza mappa del tempo, col tempo e la
  metrica della tab sincronizzata.

## 25. Lezione: video e tab affiancati ✅

**Obiettivo:** una video lezione si studia come su JTC Guitar: video e tab insieme, sincronizzati, con loop,
velocità, synth e manico. Bozza mostrata in chat e approvata il 21/11/2026.

**Fatto** (verificato dal collaudatore; provato dall'utente il 21/11/2026, 7/7 e 7/7 passi Ok, zoom ripristinato): `features/video/LessonLayout.tsx`; preferenze `beside`, `split`,
`lessonHeight` nel video store (per PC); tasto «Affianca allo spartito» nella barra del video. Il collegamento
della lezione alla Home e i tasti «Con chitarra / Solo base» arrivano con le fasi 26-27.

**Barre che si adattano** (regola dell'utente, 21/11/2026: mai togliere o nascondere comandi per mancanza di
spazio): `components/ui/FitBar.tsx` misura lo spazio reale e passa da tasti con nome → compatti (icona + spia, nome
nel suggerimento) → due righe. Usata da barra in alto, barra dello spartito e trasporto (prima F/Z/G, Batti,
Conteggio, 50/75/100 %, Accordatura sparivano nelle finestre strette). Con video e tab, nei pannelli di sempre il
video si aggancia a lato (scelta ricordata a parte); nella lezione la colonna della tab è larga almeno 400 px; sotto
860 px di pagina la lezione si mette in verticale. Verificato dal collaudatore (nessun comando mancante, nessun
tremolio). Casi limite noti: video rimesso sopra a 900×700 → onda dettagliata ~32 px; 900 px con pannello laterale
aperto → video piccolo.

- **Vista affiancata**: video a sinistra, spartito a destra, divisorio trascinabile (si ricorda la proporzione);
  sotto, a tutta larghezza, la forma d'onda in una fascia ridimensionabile; trasporto come adesso.
- Si attiva da sola quando il brano aperto ha video e spartito; un tasto passa a «Sopra/sotto» o al layout di
  sempre. Il video resta staccabile in un'altra finestra (lo spartito allora prende tutto lo spazio).
- In testa il nome della lezione (corso e modulo, se viene dalla Home) e i tasti «Con chitarra / Solo base».
- Prestazioni: video, tab e cursore fluidi insieme a 60 fps anche rallentati; misura della CPU come nelle fasi 21-23.

## 26. Stesso esercizio, più file: inquadrature, basi e sincronia condivisa ✅ (provata 22/11/2026)

**Fatto** (22/11/2026; dettagli in ARCHITECTURE «Esercizio» e «Inquadrature e base al volo»): file della lezione
riconosciuti per nome nella cartella, allineati dal suono in sottofondo (sui file JTC: seconda inquadratura
+0,173 s, mp3 −0,018 s, ~60 ms a file; un mp3 di un altro esercizio è scartato), sincronia della tab, marker,
loop e tempo condivisi tra i file, menu «Inquadratura» nel pannello video, «Con chitarra / Solo base» nella barra
in alto. Scelte prese:

- **Tasti**: Ctrl+1…9 per gli angoli (1-9 sono già i loop salvati, Alt+1-9 le sezioni), V angolo successivo,
  A «Con chitarra / Solo base»; tutti riassegnabili nelle impostazioni.
- **Un solo video alla volta** (niente angoli in pausa caricati): il cambio salta allo stesso punto in pochi
  decimi; il PC decodifica un video solo.
- **«Sposta»**: ±1 fotogramma (1/30 s) e ±0,1 s per gli angoli, ±10 ms e ±0,1 s per la base; tasto destro sul
  commutatore per scegliere la base, segnare un file audio come base, spostarla o riallinearla.
- **Condivisione**: vince l'ultima modifica delle parti condivise, velocità di studio compresa (dopo la prova
  dell'utente); tonalità, EQ, mix e posizione restano del file.
- Il corso JTC non ha basi: il commutatore compare comunque (tasto destro per segnare un file come base).

**Piano di partenza:**

**Obiettivo:** video (anche più inquadrature), mp3 e base dello stesso esercizio sono una cosa sola: la tab
sincronizzata una volta vale per tutti, si cambia inquadratura e si passa alla base al volo.

- **Inquadrature (file separati)**: i video della stessa lezione con nomi simili («Lezione 01 - Wide.mp4»,
  «Lezione 01 - Close up.mp4», «… Mano destra») sono angoli della stessa lezione. Se ne vede uno grande; tasti
  1-9 o il menu «Angolo» cambiano inquadratura all'istante, allo stesso punto (gli altri restano pronti in pausa,
  senza decodifica: il PC lavora per un video solo). Ogni angolo si allinea agli altri dal suo audio, come qui
  sotto; un angolo senza audio si allinea a mano con «Sposta» (±1 fotogramma / ±0,1 s). Nomi degli angoli
  modificabili; l'ultimo angolo scelto si ricorda per lezione.

- **Spostamento automatico** tra audio del video e mp3 (confronto dei suoni, precisione al millisecondo): la
  sincronia della tab, i marker e i loop si traducono da un file all'altro. Se i due file non combaciano (versioni
  diverse) Looplab lo dice e tiene sincronie separate.
- **Cambio al volo «Con chitarra / Solo base»**: stesso punto, stesso loop, stessa velocità e tonalità; la base
  si allinea alla registrazione nello stesso modo (attacco comune). Scorciatoia da tastiera.
- Dati: un «esercizio» in `libreria.db` raggruppa i suoi file (impronte, non percorsi soltanto: i file spostati si
  ritrovano), nessun file scritto accanto ai media.

## 27. Home delle lezioni ✅ (provata 22/11/2026)

**Fatto** (22/11/2026; dettagli in ARCHITECTURE «Home delle lezioni»). Scelte prese:

- La Home sta a sinistra della schermata iniziale (a destra restano recenti, metronomo e suggerimento); con un
  brano aperto si apre sopra di lui con il tasto «Lezioni» o **Ctrl+L** (Esc torna al brano, che resta caricato).
- Aggiornamento da solo: rilettura in sottofondo quando la Home compare e quando la finestra torna in primo piano
  (solo le cartelle cambiate), senza programmi che sorvegliano il disco.
- «Apri» apre il video principale (non le altre inquadrature né la base); tasto destro: scegliere il file da
  aprire, la tab (o nessuna), tornare agli abbinamenti automatici, mostrare nella cartella.
- Le cartelle con solo PDF (guide di studio) sono «Documento» e si aprono nel visore PDF del sistema.

**Piano di partenza:**

**Obiettivo:** le cartelle dei corsi diventano una libreria: si sceglie una lezione e si apre già pronta.

- **Cartelle scelte dall'utente** (una o più, es. il corso JTC): Looplab le legge e mostra corso → moduli →
  lezioni, riconoscendo in ogni lezione video, audio, base, tab Guitar Pro, PDF (stessa cartella e nomi simili:
  «Melody Solo.mp4», «Melody Solo tab.gp», «Melody Solo Backing.mp3»).
- Si aggiorna da sola quando si aggiungono o tolgono file; la lettura avviene in sottofondo, a pezzi, senza
  bloccare l'interfaccia, e un indice in `libreria.db` la rende immediata alle aperture successive.
- **Apri lezione** = video (o audio) + tab collegata in automatico + base pronta; tasto destro per scegliere cosa
  aprire o correggere un abbinamento sbagliato (la correzione si ricorda).
- Su ogni lezione: stato della tab (sincronizzata / da sincronizzare), ultima apertura e minuti di pratica (dal
  diario), cerca per nome; «Ultime aperte» in cima.
- Anche aprendo un file da fuori (trascinato o Apri) Looplab cerca accanto la sua tab e la collega.

**Prova e unione (fasi 21-27):** tutto si prova nel worktree del ramo `tab` (`scripts-dev.cmd` del worktree);
solo dopo la prova completa dell'utente il ramo si unisce in main.

**Unione:** il 22/11/2026 il ramo `tab` (fasi 21-27, tutte provate) è stato unito in main; worktree tolto.

## 28. Rifinitura grafica ✅ (provata 23/11/2026)

**Obiettivo:** togliere i difetti di aspetto trovati usando le fasi 21-27 e rendere più severo il collaudo grafico.

- **Voci di menu leggibili:** una voce scelta, col puntatore sopra, era arancione su arancione. Ora una regola
  unica (`theme.css`) mette l'inchiostro «su accento» a tutto ciò che è arancione dentro una voce evidenziata, in
  ogni menu e tema; le scelte dei menu dello spartito hanno una spunta (`components/ui/MenuChoice.tsx`).
- **Titolo delle tab .gp:** i 27 file del corso JTC hanno un «a capo» nel titolo («Module 02⏎Exercise 03…») e
  alphaTab lo disegnava come una riga sola, sopra le righe sotto. Ora la prima riga resta il titolo e le altre
  diventano il sottotitolo (`features/score/scoreHeader.ts`, con test); il blocco grande di alphaTab resta.
- **Carta chiara/scura:** lo spartito parte sempre su carta chiara (inchiostro nero come una stampa, uguale in
  ogni tema); il tasto «Carta scura» nella barra dello spartito (e **Maiusc+P**, riassegnabile) passa allo scuro
  coi colori del tema. Il PDF scuro è la pagina in negativo con i colori girati (`invert + hue-rotate`). La scelta
  si ricorda (`scoreDark`).
- **Panoramica nascondibile:** tasto sulla striscia (compare col puntatore sopra), **Maiusc+O**, comando in
  Ctrl+K e interruttore in Impostazioni → Aspetto. Nascosta resta una striscia sottile per riaprirla. Si ricorda
  (`showOverview`). La corsia delle sezioni resta: serve a disegnarle.
- **Collaudatore:** controlli grafici obbligatori (foto ingrandite sui testi, menu con voce scelta e puntatore
  sopra, tutti i temi, titolo degli spartiti a più zoom, 1280 px).
- **Giro grafico** (collaudatore, 5 temi, 1920 e 1280 px; l'utente ha chiesto di correggere tutto):
  testo grigio nelle voci di menu evidenziate; nomi dei tasti rapidi a capo invece che tagliati; annotazioni e nomi
  di sezione su più righe messi su una riga (`tidyTexts`); spartito e PDF all'apertura restano in cima se la prima
  battuta ci sta (titolo visibile, niente riga tagliata); avviso «Tab collegata» in basso; Home sopra un brano a
  tutta larghezza (pannello laterale tolto); «Lo sapevi?» va a capo intero; trainer spenti più leggibili; menu
  «BPM ♩» cliccabile su tutta la riga. La barra in alto a 1280 px era già a posto.
- **Prova dell'utente (23/11/2026, 15/15 e 8/8):** Lezioni sopra un brano a tutta larghezza (la schermata iniziale
  resta centrata); zoom del PDF oltre il 100% (pagina = larghezza del pannello, al massimo 900 px, per lo zoom;
  scorrimento di lato e la vista segue la battuta anche di lato); nome del brano mai schiacciato a 1280 px.
- **Riprova del collaudatore:** la barra in alto (`components/ui/FitBar.tsx`) non si rimisurava quando un tasto
  compariva da solo (esercizio con base aperto dopo un brano semplice) e spingeva fuori i tasti a destra; ora si
  rimisura a ogni cambiamento al suo interno (verificato a 1280, 1366, 1440 e 1920 px).
- **Lasciati così (scelta dell'utente):** a 1280 px e zoom 200% un'annotazione .gp molto lunga esce a destra
  (alphaTab non la manda a capo); nei temi Light e Paper la voce scelta di un menu, senza puntatore sopra, ha
  contrasto ~4:1; nei temi Light e Paper «Carta scura» lascia il .gp chiaro (il PDF diventa scuro).

**Unione:** il 23/11/2026 il ramo `fase-28` è stato unito in main.

## 29. Comodità delle lezioni 🔧 (ramo `fase-29`)

**Obiettivo:** le sei priorità dell'utente del 23/11/2026.

- **Versione:** numerazione SemVer `0.<fase>.<correzione>`, `CHANGELOG.md`, etichetta git per versione
  (la prima è `v0.28.0`, fasi 1-28). Regola in `CLAUDE.md`.
- **Home a tutta finestra** anche al primo avvio (`features/library/EmptyState.tsx`).
- **Togliere un corso:** tasto cestino sulla riga del corso, con conferma; i file restano sul disco
  (`remove_lesson_root`).
- **Moduli richiudibili:** ogni modulo si chiude col suo titolo; un tasto «Comprimi tutto / Espandi tutto»
  per tutta la Home (accanto a «Aggiungi corso») e uno per corso (sulla sua riga), anche nel menu del corso. Corsi e moduli chiusi si ricordano (`lessonFolds` nelle impostazioni).
- **Cambio tab facile:** menu «Tab» nella barra dello spartito (`features/score/TabMenu.tsx`) con le tab
  della lezione (`lesson_of_track`), la spia della sincronizzazione, le tab usate prima e «Cambia
  file…». Alt+T (riassegnabile, anche in Ctrl+K) passa alla successiva. Ogni progetto tiene le tab
  usate prima con la loro sincronizzazione (`Project.other_scores`, «scaffale» nello store dello
  spartito); la pulizia dei file in `spartiti\` le conserva.
- **Corsi da qualsiasi cartella:** formati in una lista unica (`src-tauri/src/formats.rs`, letta
  dall'interfaccia con le costanti dei bindings `AUDIO_FORMATS` e `VIDEO_FORMATS`), con in più .m4v, .aif,
  .wave, .m4b, .mka e .oga. Una cartella con un solo file è la lezione solo quando si chiama come lei
  (`folder_is_lesson`); altrimenti resta un titolo. Profondità fino a 16 cartelle. Test con una cartella
  qualsiasi di video e canzoni.
- **Ricerca delle lezioni** (`features/lessons/search.ts`, con test): più parole in qualsiasi ordine,
  accenti e maiuscole a parte; risultati per corso e modulo come nella Home, parole evidenziate, conteggio
  «N lezioni trovate in M corsi», tasto × ed Esc per svuotarla (il primo Esc svuota, il secondo torna al
  brano). Le «Ultime aperte» mostrano «corso · modulo».
- **Battute dei PDF:** il riconoscimento (`features/score/pdf/detectBars.ts`) prendeva travature, parentesi
  delle terzine e linee 8va per righe del pentagramma: il pentagramma risultava storto e le sue stanghette
  si perdevano (Exercise 03 Basic Shapes: 7 battute su 8, la sincronia non seguiva più dalla terza). Ora
  una riga entra in un pentagramma solo se comincia e finisce con le altre ed è alla distanza giusta; la
  «carta» si conta su tutto il pentagramma. Prova sui 27 PDF del corso JTC: tutti con le stesse battute
  dei loro .gp (prima 7 sbagliati). «Ritrova le battute» nel menu Sincronia dei PDF le cerca di nuovo
  (la sincronia riparte da zero, Ctrl+Z la riporta).
- **Stop con «Torna al punto di partenza»:** il playhead resta dove si è fermata la musica; Play riparte
  dalla linea tratteggiata (`stores/player.ts`, con test).

## Dopo la prima versione

- (vuoto per ora)
