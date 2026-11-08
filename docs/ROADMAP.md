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

## M. Metronomo integrato (prova sul ramo `metronomo`) 🚧

Copia di prova in `D:\sandbox\looplab-metronomo` (dati, porta 1422 e nome suoi: commit da togliere prima di
unire a `main`). Si importa MetroFlow (`D:\projects\Metronome`, che resta intatto) invece di rifarlo: logica e
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
   (Microsoft Elsa) da `scripts 9-genera-voce.cmd`, incorporati nell'app (`src-tauri/voice/it`); il motore li
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

## 17. Mappa del tempo e rilevamento automatico 🔜

**Obiettivo (milestone):** su brani con tempi dispari e cambi continui di tempo e metrica (es. Dream Theater "The
Dance of Eternity", Tool "Schism") Looplab trova da solo tempo, battiti, battute e cambi; l'utente controlla col
metronomo e corregge solo dove serve. Oggi c'è un solo tempo e una sola metrica per tutto il brano.

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

## Dopo la prima versione

- **Separazione AI degli strumenti** (voce, batteria, basso, altro) — **rimandata dall'utente a un secondo
  momento**, non iniziare senza il suo via. Previsto: modello tipo HTDemucs (~300 MB) con ONNX Runtime, scaricati
  solo su richiesta; nella catena prima dello stretch. Da decidere insieme: tracce calcolate una volta per brano e
  salvate in cache (consigliato) o in tempo reale; processore o scheda video; comandi livello/Mute/Solo per
  traccia; limite di spazio della cache; posizione in `dati\` nella versione portable.
