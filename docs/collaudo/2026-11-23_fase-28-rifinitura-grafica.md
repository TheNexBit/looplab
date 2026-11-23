# Collaudo Looplab — Fase 28 «Rifinitura grafica» — 23/11/2026 08:31 (RIPROVA)
**Esito: ❌ NON SUPERATO** (1 problema importante, 3 minori)
Controlli: 22 · ✅ 18 · ⚠️ 3 · ❌ 1 · ⏭ 0 non verificabili · durata ~26 min · ramo `fase-28`, commit `10794fb`

## Cosa ho fatto
- `scripts\powershell\test.ps1` completo: Biome, TypeScript, Vitest (234 test), rustfmt, Clippy e cargo test sono tutti verdi.
- Ho avviato l'app vera sulla porta 1421, con dati di prova in una cartella a parte e un percorso con accenti ed emoji («Esercizio 05 àè 🎸»). Ho usato i file JTC Exercise 05 (mp3, .gp, PDF) e Wrong Tone Solo (esercizio con la base).
- Menu: ho portato il puntatore su ogni voce di ogni menu, in tutti i 10 temi, a 1920 e a 1280 px, metronomo compreso (circa 830 voci). La voce evidenziata ha sempre un contrasto di almeno 4,6:1 (Light). La spunta compare sulla voce scelta. Provati anche «+1 st» in Accordatura e il menu Traccia, con foto ingrandite 2×.
- Spartito .gp: titolo su 4 righe separate a zoom 50%, 100% e 200%, a 1280 e 1920 px, con carta chiara e scura, nei temi Rack, Light, Paper, Contrast e OLED. Maiusc+P e il tasto «Carta scura» funzionano. Il cursore si vede con tutte e due le carte.
- Panoramica: la freccia compare quando il puntatore ci passa sopra, poi resta la striscia di 12 px. Maiusc+O la nasconde e la mostra. Carta e panoramica restano come le avevo lasciate anche dopo aver chiuso e riaperto l'app.
- PDF: si apre in cima alla pagina della prima battuta. Home e la ripartenza del loop tornano in cima (misurato durante la riproduzione). Con lo zoom al 150% la pagina è larga 1350 px, al 200% 1800 px (900 × zoom), e si scorre di lato. Mentre suona, la vista segue la battuta anche di lato. Con la pagina scorsa di lato, il clic sulle battute 1, 2, 3, 4, 7 e 8 va al tempo giusto e illumina la battuta giusta. Trascinando dalla battuta 2 alla 4 nasce il loop 0:02–0:08.
- Lezioni con Ctrl+L sopra il brano: occupano tutta la larghezza (1280/1920). Esc torna al brano. La schermata iniziale senza brano resta centrata. «Lo sapevi?» è intero a 1280 e a 1920 px.
- Metronomo: il menu «BPM ♩» si apre in 8 punti su 8, dall'alto in basso della riga. Il doppio clic riporta il valore da 127 a 120.
- Impostazioni → Tasti e pedali: ci sono «Spartito: carta chiara / scura» (Maiusc P) e «Panoramica: mostra / nascondi» (Maiusc O).
- Barra in alto misurata a 8 larghezze, da 1280 a 1920 px. Console: nessun errore, solo un avviso interno di alphaTab.

## Problemi trovati
| # | Gravità | Cosa succede | Dove / come riprodurlo |
|---|---|---|---|
| 1 | importante | Finestra fino a circa 1500 px: apri un brano semplice, poi un esercizio con la base. I tasti «Con chitarra» e «Solo base» restano con il nome scritto e non diventano icone. A destra spariscono dei tasti: a 1280 px Impostazioni, Vista note, Finestra mini e Pannello laterale; a 1366 px Finestra mini e Pannello; a 1440 px Pannello. Tornano solo ridimensionando la finestra. Foto `foto/12-riprova-barra-tasti-fuori-1280.png` | `src/components/ui/FitBar.tsx:64` misura solo quando FitBar stesso si ridisegna o cambia misura. Se un figlio come `TakeSwitch` (TopBar.tsx:222) compare da solo, FitBar non se ne accorge. Il ResizeObserver guarda solo il contenitore, non il contenuto. |
| 2 | minore | A 1280 px con lo zoom al 200% l'annotazione «(This is how Marco picks this pattern, but do whatever works for you!)» è tagliata a destra («…for yo») e non si può scorrere. Foto `foto/13-riprova-annotazione-tagliata-1280-z200.png` | È una riga unica nel file .gp e alphaTab non la manda a capo (`scoreHeader.ts`, `ONE_LINE_MAX`). Il taglio comincia da circa il 190% con il pannello laterale aperto. |
| 3 | minore | Temi Light e Paper: la voce scelta, quando il puntatore non è sopra, ha la scritta color accento su sfondo chiaro, con contrasto 3,99:1 (Light) e 4,36:1 (Paper). Si legge, ma sta sotto 4,5:1. | `MenuChoice.tsx:23` e le voci scelte del metronomo (`text-accent`). |
| 4 | minore | Temi Light e Paper: con «Carta scura» acceso lo spartito .gp resta chiaro, su sfondo grigio o verdino con inchiostro scuro. Il PDF invece diventa davvero scuro. Il nome del tasto promette qualcosa che in questi temi non succede. | `scoreEngine.ts` e i colori presi dal tema per la carta scura. |

Osservazione, non un difetto: con il PDF dal 150% in su la battuta 1 non si vede all'apertura né dopo Home, perché si vede la cima della pagina. È la scelta dell'utente del 22/11; la vista arriva alla battuta 1 quando la musica va avanti.

## Non verificabili
- Nessuno.

## Pulizia
Processi chiusi: solo i miei (app, `tauri dev`, Vite 1421); le porte 1421 e 9222 sono libere. Cartella temporanea eliminata (231 MB). Progetto come prima: sì, aggiunti solo questo registro e le foto 12-13. Su C: non è nato niente di Looplab. C: 603,87 → 603,85 GB · D: 150,32 → 150,06 GB · `CARGO_TARGET_DIR` resta 24,54 GB · ambiente ripulito: sì.
Nota: Vite sulla porta 1421 ha rifatto la sua cache in `node_modules\.vite`, cartella ignorata da git. Al prossimo avvio normale sulla 1420 la rifà una volta, senza danni. Nella Temp di C: ci sono 4 file `.tmp` da 0 byte di un altro programma: non sono miei e non li ho toccati.

**Resta da fare (decide l'utente, non chiedo una terza riprova):** problema 1 da correggere prima dell'unione in main. Problemi 2-4 a scelta.


## Chiusura (23/11/2026)

**Esito finale: ✅ chiuso.** Il problema importante (barra in alto che non si rimisurava quando compariva un tasto da
solo) è stato corretto nel commit `62aba4a` (`FitBar.tsx` si rimisura a ogni cambiamento al suo interno) e
controllato dal verificatore sull'app vera a 1280, 1366, 1440 e 1920 px: tutti i tasti visibili, nome del brano
intero, nessuno sfarfallio. I tre problemi minori restano così per scelta dell'utente. Fase 28 unita in main.
