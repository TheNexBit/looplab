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
- Moduli dei corsi richiudibili uno per uno, con «Chiudi / Apri tutti i moduli»; la scelta si ricorda.
- «Ritrova le battute» nel menu di sincronizzazione dei PDF: le cerca di nuovo nelle pagine.

### Corretto

- Battute dei PDF: travature, parentesi delle terzine e linee 8va lunghe venivano prese per righe del
  pentagramma, e alcune battute andavano perse (Exercise 03 ne aveva 7 su 8). Ora i 27 PDF del corso
  JTC hanno tutti le stesse battute dei loro file .gp.

### Modificato

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
