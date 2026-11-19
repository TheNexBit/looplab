# Studio: tab sincronizzate con la registrazione (stile Soundslice)

Data: 19/11/2026. Ramo `tab`. Fonti: documentazione pubblica, centro assistenza e blog di Soundslice; documentazione
di alphaTab. Studio del **comportamento** (cosa vede e fa l'utente), non del codice di Soundslice, che è proprietario.

## 1. Come funziona Soundslice (analisi del comportamento)

### 1.1 Il modello: i syncpoint

- Un **syncpoint** lega un punto dello spartito a un istante della registrazione. L'unità base è il **primo
  battito di una battuta**; si può scendere dentro la battuta agganciandosi a una nota ("guide notes") per i
  passaggi rubato.
- I syncpoint sono numerati **nell'ordine in cui la musica viene suonata**: con i ritornelli la stessa battuta
  scritta compare più volte (battuta 9 al primo giro, 9 al secondo giro…).
- **Reali e impliciti**: quelli messi dall'utente (neri) sono salvati; quelli in mezzo (grigi) sono calcolati
  dividendo lo spazio in parti uguali. Trascinare un reale sposta in proporzione gli impliciti vicini; trascinare
  un implicito lo rende reale.
- Ogni registrazione ha i suoi syncpoint e il suo ritaglio. Prima del primo syncpoint c'è un'"intro" (se > 1 s),
  dopo l'ultimo un'"outro" (se ≥ 4 s).

### 1.2 Come si crea la sincronizzazione

- **Tap**: si preme Play e si batte `T` su ogni inizio battuta.
- **Primo e ultimo**: si mettono due punti, al secondo si scrive "end" → le battute in mezzo si spaziano uguali
  (ottimo per musica a metronomo).
- **Trascinamento** sulla forma d'onda, "Sposta tutti" (spostamento rigido), rinumerazione col doppio clic.
- **Righello dei battiti** rilevati con **snap** ai battiti (agosto 2026).
- **Auto sync**, due modi: "Detect beats" (servono 3 punti giusti all'inizio, poi segue i battiti) e "Sync with
  notation" (allineamento ottimale usando le altezze delle note, crea anche punti dentro la battuta). Riparazione:
  "cancella questo e i successivi", 2-3 punti a mano, rilancia.
- Compensazione della **latenza** in millisecondi.

### 1.3 Il player

- Cursore che segue la musica, note evidenziate. **Clic su una nota = salta lì**.
- **Loop**: trascini sullo spartito, la selezione si aggancia a note, pause e stanghette; il resto si sbiadisce;
  bordi trascinabili; clic altrove = toglie il loop. Menu del loop: con conteggio, una volta sola, salva come clip.
- **Velocità** 25–200 %, passi del 10 %, intonazione invariata, cambio fluido durante la riproduzione.
- **Impaginazione**: scorrimento verticale (predefinito), a pagine (1 o 2 per schermo, girano da sole),
  orizzontale "karaoke".
- Viste: spartito, tab, entrambi; tastiera e **manico** che si illuminano; accordi; testo.
- Tasti: Spazio play/pausa, Invio/Home inizio, `<` `>` velocità, Ctrl +/− zoom, ←/→ nota precedente/successiva
  (in riproduzione ±5 s), Ctrl ←/→ battuta, PagSu/PagGiù pagine.
- **Synth sovrapposto**: suona le note della tab sopra la registrazione vera, usando i syncpoint come tempi
  (per controllare la trascrizione).

### 1.4 Import

- Guitar Pro 3–8 (.gp3 .gp4 .gp5 .gpx .gp), MusicXML, PowerTab, TuxGuitar, tab ASCII. Consigliano il .gp nativo
  (il MusicXML perde bending e armonici). Ignorano l'audio dentro i file GP8.
- **PDF/foto**: lo scanner trasforma l'immagine in note (OMR). Limiti dichiarati per la tab: solo accordatura
  standard (chitarra 6 corde, basso 4); tab senza pentagramma → tutte le note diventano semiminime; bending,
  legature, slide, armonici, palm mute **non** riconosciuti. Nessun dato di precisione pubblicato. Dopo la
  scansione si può anche esercitarsi **sull'immagine originale** (clic = salta, trascina = loop).

## 2. La base tecnica: alphaTab (MPL-2.0)

- Legge Guitar Pro 3–8, MusicXML, Capella, alphaTex; disegna spartito e tab nel browser (quindi nella WebView).
- **Modalità media esterni** (dalla 1.6, stabile 1.9): alphaTab non suona nulla, chiede a noi play/pausa/seek e
  riceve la posizione con `updatePosition(ms)` (consigliato ogni ≤ 50 ms). Interfaccia `IExternalMediaHandler`.
- **Sync point** = `{ barIndex, barOccurence, barPosition (0..1), millisecondOffset }`, in
  `score.applyFlatSyncPoints()` / `exportFlatSyncPoints()` + `api.updateSyncPoints()`. Tra un punto e l'altro
  segue il tempo scritto nella tab. Legge anche i sync point e l'audio dei file GP8.
- Licenza MPL-2.0: obbligo solo sui file di alphaTab stessi (se li modifichiamo vanno pubblicati) e avviso in
  `THIRD_PARTY_LICENSES.md`. Compatibile con qualsiasi licenza futura di Looplab.

## 3. Cosa ha già Looplab (vantaggio rispetto a partire da zero)

| Soundslice                                         | Looplab oggi                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Rallentamento di qualità, loop precisi al campione | Motore Rust con stretch e loop A/B ✅                               |
| Righello battiti, Detect beats                     | Fase 17: Beat This! in Rust, battiti + battute + mappa del tempo ✅ |
| Più tracce con volumi                              | Fase 18: separazione strumenti ✅                                   |
| Manico illuminato                                  | `src/features/fretboard` (manico e accordature) ✅                  |
| Metronomo con conteggio sul tempo vero             | Click e count-in sulla mappa del tempo ✅                           |
| Forma d'onda con trascinamento                     | `src/features/waveform` ✅                                          |

**Effetto a catena importante:** la tab contiene la metrica esatta di ogni battuta (7/4, 4/4…). Usata come vincolo
dall'analisi della fase 17, risolve proprio il problema aperto dell'intro in 7/4 di "The 12th Hour".

## 4. Decisioni di progetto

1. **Il motore Rust resta il padrone del tempo.** alphaTab in modalità media esterni: il cursore legge la posizione
   del motore (che è già in tempo del brano, quindi la velocità non cambia nulla per la tab).
2. **Modello dei punti come alphaTab** (`barIndex`, `occurrence`, `position`, `ms`) + flag reale/implicito come
   Soundslice. Interpolazione: tra due punti reali si segue la proporzione del tempo scritto (non spazi uguali),
   così le battute in 7/4 durano più di quelle in 4/4.
3. **Archivio:** il file tab viene **copiato** nella libreria (`%APPDATA%\Looplab\spartiti\`, in sviluppo
   `D:\.cache\looplab\dev-data\spartiti\`), i punti stanno in `libreria.db`. Nessun file accanto ai brani; finisce
   nei backup.
4. **Auto sync in due livelli**, entrambi locali e senza abbonamenti:
   - _dai battiti_: allineamento (programmazione dinamica) delle battute della tab sui battiti della fase 17;
   - _dalle note_ (dopo): confronto delle altezze tra il synth della tab e l'audio (cromagramma + DTW in Rust).
5. **PDF senza OMR**, ma non "solo visore": rilevo righi e stanghette nell'immagine (linee orizzontali e verticali,
   analisi semplice e affidabile su tab stampate) → ogni battuta del PDF diventa un riquadro cliccabile, si
   sincronizza come una tab vera, il loop si trascina sull'immagine. L'OMR resta un esperimento separato
   (Audiveris è AGPL: escluso).

## 5. Requisiti non negoziabili (dall'utente, 19/11/2026)

### 5.1 Interfaccia fantastica e comprensibile a colpo d'occhio

- Una sola zona "Spartito" coerente col resto dell'app (stessi colori, font, comandi da DAW): niente finestre
  nuove con stili diversi. La tab si adatta a tema chiaro/scuro.
- Gerarchia visiva chiara: la battuta che suona è la cosa più evidente (cursore + battuta evidenziata), il loop è
  una fascia colorata con bordi trascinabili, il resto sbiadisce quando c'è un loop.
- Ogni stato è disegnato: vuoto ("Trascina qui un file Guitar Pro o un PDF"), caricamento con avanzamento, errore
  spiegato in parole semplici con cosa fare, file non sincronizzato (invito a sincronizzare).
- Comandi come in Reaper/Ableton: menu, +/−, rotella, tasti ON/OFF con spia, tasto destro per le opzioni; niente
  valori da digitare. Tooltip su ogni comando con la scorciatoia.

### 5.2 Fluidità e prestazioni

- Cursore a 60 fps legato al frame (requestAnimationFrame) con interpolazione tra le posizioni del motore: niente
  scatti anche se il motore manda la posizione ogni 50 ms.
- alphaTab disegna **in un worker** e solo le parti visibili (rendering pigro); lo scorrimento della pagina non
  ridisegna la tab. PDF: pagine disegnate solo quando entrano in vista, con cache delle immagini già pronte.
- Nessun lavoro quando la vista Spartito è chiusa o l'app è in pausa. Obiettivo da misurare: CPU in riproduzione
  non più alta di oggi di oltre qualche punto, nessun frame oltre 16 ms durante lo scorrimento.
- Il synth di alphaTab e il suo soundfont **non** vengono caricati finché non servono (fase 24).

### 5.3 Dati salvati: niente sparso per il mondo

- Quando l'utente collega una tab o un PDF a un brano, il file viene **copiato una volta** in
  `%APPDATA%\Looplab\spartiti\` (sviluppo: `D:\.cache\looplab\dev-data\spartiti\`) con nome dato dal contenuto
  (impronta), così due brani con lo stesso PDF non lo duplicano. L'originale dell'utente non viene mai toccato.
- Tutto il resto (quale file a quale brano, traccia scelta, impaginazione, punti di sincronizzazione, righi e
  stanghette rilevati nel PDF) sta in `libreria.db`: entra nei backup a rotazione e nel ripristino.
- Le immagini delle pagine PDF sono **cache rigenerabile** in `%LOCALAPPDATA%\Looplab\cache\spartiti\`, con limite
  di spazio; si possono cancellare senza perdere nulla.
- Scollegare o cancellare: il file in `spartiti\` si toglie solo quando nessun brano lo usa più; pulizia
  controllata all'avvio (file orfani) come per il resto della libreria.
- In Impostazioni → Dati la voce "Spartiti" mostra cartella e spazio occupato, come le altre.

## 6. Fasi proposte

- **21 – Tab Guitar Pro nel player**: collega un .gp a un brano; tab/spartito con alphaTab; cursore sul motore;
  clic = salta; trascina = loop A/B agganciato a note e battute; impaginazione verticale / pagine / orizzontale;
  scelta della traccia (chitarra, basso…); tasti come sopra; sync iniziale "primo e ultimo punto" + sync dei GP8.
- **22 – Editor di sincronizzazione**: punti sulla forma d'onda, tap con `T`, trascina, "sposta tutti",
  impliciti/reali, snap ai battiti, Annulla/Ripeti, "cancella questo e i successivi", latenza; auto sync dai
  battiti; la metrica della tab guida l'analisi della fase 17.
- **23 – PDF**: pdf.js, rilevamento righi e stanghette, battute cliccabili, sync e loop sull'immagine, pagine che
  girano da sole.
- **24 – Extra**: manico illuminato dalle note della tab, synth sovrapposto (audio del synth come traccia in più
  nel motore), auto sync dalle note, conteggio e velocità progressiva sui loop della tab.

## 7. Rischi

- alphaTab dentro WebView2: da verificare prestazioni su tab lunghe (pagine da molti righi) e font/caratteri.
- Ritornelli e salti (D.S., Coda): da gestire con `occurrence`; da provare su file reali.
- PDF scansionati storti o di bassa qualità: il rilevamento di righi peggiora; serve correzione a mano.
