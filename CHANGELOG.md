# Novità di Looplab

Tutte le modifiche importanti, versione per versione. Il formato segue
[Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e la numerazione segue
[Semantic Versioning](https://semver.org/lang/it/):

- **0.F.0**: la fase F della [ROADMAP](docs/ROADMAP.md) è chiusa e provata (il numero di mezzo è la fase).
- **0.F.C**: correzioni dopo la chiusura della fase F (C = 1, 2, 3…).
- **1.0.0**: la prima versione pubblicata. Fino ad allora si resta sotto 1.0.

Ogni versione ha un'etichetta git `vX.Y.Z` sul commit che la chiude.

## Non ancora uscita

### Aggiunto

- Menu «Tab» nella barra dello spartito: tutte le tab della lezione (.gp e PDF) a un clic, ognuna
  con la sua sincronizzazione; Alt+T passa alla successiva. Le tab usate prima con un brano restano
  ricordate.
- Tasto per togliere un corso dalla Home (i file restano sul disco), con conferma.
- Moduli dei corsi richiudibili uno per uno; tasto «Comprimi tutto / Espandi tutto» per tutti i corsi
  (accanto a «Aggiungi corso») e per ogni corso (sulla sua riga): comprime dalla radice, corsi e moduli,
  ed espande tutto allo stesso modo. La scelta si ricorda.
- Tasto gomma per svuotare l'elenco dei recenti (anche da «Ultime aperte» delle lezioni), con conferma
  e la scelta di togliere solo i file spariti; file, loop, marker e diario restano.
- «Ritrova le battute» nel menu di sincronizzazione dei PDF: le cerca di nuovo nelle pagine.
- Ricerca delle lezioni chiara: risultati raggruppati per corso e modulo come nella Home, parole cercate
  evidenziate, quante lezioni e in quanti corsi, più parole in qualsiasi ordine (accenti e maiuscole a
  parte), tasto × ed Esc per svuotarla. Le «Ultime aperte» dicono di che corso e modulo sono.
- Lezioni «fatte» e «da ripassare»: un clic sul cerchio della lezione la segna fatta, il tasto destro
  la segna da ripassare. Ogni corso e ogni modulo mostrano «3/8 fatte» con una barretta, e quante lezioni
  sono da ripassare.
- Lezione precedente / successiva del corso dalla barra in alto (Alt+← e Alt+→), con il tasto «Fatta»
  per segnare la lezione mentre la suoni.
- «Riprendi da dove eri» in cima alla Home: riapre l'ultima lezione com'era (file, punto, loop,
  velocità e tab); se è già fatta, propone la successiva.
- Avviso sopra un PDF quando le sue battute non sono quante quelle della tab .gp gemella, con
  «Ritrova le battute» e «Va bene così». Il numero di battute del PDF si legge nel menu Sincronia e in un
  messaggio dopo ogni ricerca.
- Panoramica e forma d'onda grande si regolano trascinando il loro bordo inferiore (doppio clic: misura
  normale). La forma d'onda grande ha una misura minima uguale in ogni brano: spartito e video si
  rimpiccioliscono prima di lei.
- Volumi, velocità e tonalità con manopole uguali e il valore in un display: il volume del brano sta sul titolo
  della forma d'onda, quello del click nel modulo del metronomo, velocità e tonalità nella barra in basso.
  Nuovi tasti «M» per silenziare il brano o il click senza perdere il livello. Preset di velocità, intonazione
  fine e accordatura col tasto destro sulle manopole.
- Nella Home ogni lezione mostra tutti i suoi file (video, inquadrature, audio, base, tab) e ognuno si apre da
  solo; tasto «Solo base» sulla riga della lezione.
- Home senza doppioni: a sinistra solo i corsi, a destra un solo «Riprendi» (o «Stai suonando» con «Torna al
  brano») e un solo elenco dei recenti, che dice da quale corso e modulo viene ogni brano.

### Tolto

- Il cambio al volo «Con chitarra / Solo base» dentro la lezione (e il suo tasto A): la base si apre dalla Home
  come brano a sé, con il tasto «Solo base».

### Corretto

- Qualsiasi cartella di video o audio diventa un corso, anche senza moduli, numeri o tab: una lezione
  per file, le sotto-cartelle come titoli. La cartella dà il nome alla lezione solo quando si chiama
  come lei (prima un file solo in una cartella prendeva sempre il nome della cartella).
- Formati: una lista unica per tutta l'app; aggiunti .m4v, .aif, .wave, .m4b, .mka e .oga.
  Cartelle lette fino a 16 livelli (prima 8).
- Battute dei PDF: travature, parentesi delle terzine e linee 8va lunghe venivano prese per righe del
  pentagramma, e alcune battute andavano perse (Exercise 03 ne aveva 7 su 8). Ora i 27 PDF del corso
  JTC hanno tutti le stesse battute dei loro file .gp.
- Nelle lezioni con video e spartito la forma d'onda grande poteva ridursi a pochi pixel.
- La forma d'onda, la panoramica e la vista note lampeggiavano mentre se ne cambiava la misura: la tela veniva
  svuotata e ridisegnata solo al giro di schermo dopo. Ora si ridisegna nello stesso istante.
- La finestra chiusa massimizzata si riapriva normale: una finestra ridotta a icona salvava una posizione
  finta (-32000) e alla riapertura veniva scartato anche «massimizzata». Ora una finestra ridotta a icona non
  cambia niente di ciò che è ricordato, e «massimizzata» vale sempre.

### Modificato

- Pannelli: video, spartito e panoramica hanno lo stesso titolo a sinistra (freccia giù = aperto, a destra =
  chiuso, icona e nome), come i corsi della Home; un clic sul titolo apre o chiude. Spariti i tasti freccia
  diversi sparsi a destra e al centro.
- Spartito senza tab: una riga sola (cosa fare, «Scegli file…», ×) invece di un pannello vuoto grande che
  tagliava il testo; la forma d'onda non viene più schiacciata dal video quando c'è questa riga.
- La Home occupa tutta la finestra anche al primo avvio.
- Con «Torna al punto di partenza» lo stop lascia il playhead dove sei arrivato; ripartendo si
  riparte dalla linea tratteggiata.

## 0.28.0 — 2026-11-23

Prima versione numerata: raccoglie le fasi 1-28. Il dettaglio di ogni fase è nella
[ROADMAP](docs/ROADMAP.md).

### Aggiunto

- **Ascolto e studio** (fasi 1-4): apertura di audio e video, motore audio, velocità e tonalità
  indipendenti, loop, marker e sezioni.
- **Suono** (fase 5): EQ e isolamento base dei canali.
- **Video** (fase 6): video sincronizzato, sopra o accanto, in finestra separata.
- **Distribuzione** (fase 7): rifinitura, installazione, versione portable (fase 12).
- **Pratica** (fasi 8-9, 11, 13-16): metronomo e conteggio, speed trainer, diario, scorciatoie per
  lo studio, finestra mini, appunti su loop e sezioni, sezioni come le region di Reaper, nota di
  riferimento, velatura, riga informazioni.
- **Esportazione e note** (fasi 10, 20): esportazione audio, vista delle note, manutenzione,
  esportazione delle tracce separate in WAV.
- **Tempo** (fase 17): mappa del tempo e rilevamento automatico dei battiti.
- **Separazione degli strumenti** (fase 18): voce, batteria, basso, chitarra, piano e resto.
- **Archivio** (fase 19): un'unica libreria SQLite e backup a rotazione.
- **Spartiti** (fasi 21-25): tab Guitar Pro, editor di sincronizzazione, spartiti PDF, synth e
  manico, lezione con video e tab affiancati.
- **Esercizi e lezioni** (fasi 26-27): inquadrature, basi e sincronia condivise tra i file dello
  stesso esercizio; Home delle lezioni con i corsi.

### Modificato

- **Rifinitura grafica** (fase 28): voci di menu sempre leggibili, titoli delle tab .gp su righe
  separate, carta dello spartito chiara o scura (Maiusc+P), panoramica nascondibile (Maiusc+O),
  zoom del PDF oltre il 100%, Lezioni a tutta larghezza, barra in alto che non perde mai un tasto.
- Pulizia del codice: funzioni doppie unite, codice mai usato tolto (nessun cambiamento visibile).
