# Valori di fabbrica

Come si presenta Looplab alla prima apertura, o dopo «Ripristina tutto» (Impostazioni → Generale). Scelti con l'utente il 23/11/2026.
Si vedono dal vivo con `scripts\12-prova-da-zero.cmd`, che apre l'app con una cartella dati vuota e la
cancella alla chiusura. Il test `src/stores/settings.test.ts` controlla che le impostazioni partano da qui.

Dove stanno nel codice: impostazioni `SETTINGS_DEFAULTS` (`src/stores/settings.ts`), aspetto
`DEFAULT_APPEARANCE` (`src/stores/appearance.ts`), video `DEFAULT_PREFS` (`src/stores/video.ts`), spartito
`SCORE_SIZE`/`SCORE_ZOOM` (`src/stores/score.ts`), metronomo da solo `DEFAULTS` (`src/stores/metronome.ts`),
finestra `create_main` (`src-tauri/src/window.rs`), tasti `shortcuts` (`src/lib/shortcuts.ts`).

## Finestra e avvio

| Cosa                         | Valore                     |
| ---------------------------- | -------------------------- |
| Finestra alla prima apertura | 1280 × 800, centrata       |
| Lingua                       | Italiano                   |
| Tema                         | «Rack» (scuro, ambra)      |
| All'avvio                    | Schermata vuota (la Home)  |
| Pannello laterale            | Aperto (solo con un brano) |
| Barra informazioni in basso  | Spenta                     |
| Grandezza interfaccia        | 100%                       |

## Setlist e Live mode

| Cosa                              | Valore                              |
| --------------------------------- | ----------------------------------- |
| Home, a sinistra                  | Corsi (la scheda Setlist a un clic) |
| Live mode                         | Set completo                        |
| Solo cambi: secondi per lato      | 10                                  |
| Pausa tra i brani (nuova setlist) | Attendi il tasto (0 s)              |

## Ascolto

| Cosa                           | Valore                                        |
| ------------------------------ | --------------------------------------------- |
| Volume brano / click           | 100% / 80%, nessun mute                       |
| Velocità / tonalità            | 100% / 0 st                                   |
| Metronomo sul brano / count-in | Spento / spento (1 battuta)                   |
| Metronomo da solo              | 120 BPM, 4/4, volume 80%                      |
| Nota di riferimento            | La = 440 Hz, chitarra in accordatura standard |

## Forma d'onda

| Cosa                              | Valore                     |
| --------------------------------- | -------------------------- |
| Panoramica                        | Visibile, 56 px            |
| Forma d'onda grande               | 96 px (la minima)          |
| Griglia, righello, linea centrale | Accese                     |
| Stile                             | Piena                      |
| Vista all'apertura di un brano    | Primi 30 secondi           |
| Rotella del mouse                 | Zoom                       |
| Segui il playhead                 | Acceso, a pagine           |
| Magnete                           | Acceso                     |
| Torna al punto di partenza        | Acceso                     |
| Riprendi dove eri                 | Acceso                     |
| Dopo aver creato un loop          | Parte dall'inizio del loop |

## Video e spartito

| Cosa                                   | Valore                                               |
| -------------------------------------- | ---------------------------------------------------- |
| Video da solo                          | In alto, 280 px                                      |
| Lezione con video e spartito           | Video accanto allo spartito (45% / 55%), riga 460 px |
| Spartito                               | Alto 380 px, zoom 100%, carta chiara                 |
| Manico sotto la tab / synth delle note | Spenti                                               |
| Vista note                             | Chiusa                                               |
