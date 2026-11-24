# Collaudo Looplab — Fase 30 «Setlist e Live mode» — 24/11/2026 09:50
**Esito: ❌ NON SUPERATO**
Controlli: 58 · ✅ 37 · ⚠️ 5 · ❌ 12 · ⏭ 4 non verificabili · durata ~40 min

## Cosa ho fatto
- Ramo `fase-30` (9058e32), worktree `setlist`. `scripts\powershell\test.ps1`: Biome, TypeScript, Vitest (260 test), rustfmt, Clippy, cargo test: tutto ok.
- App vera (`tauri dev` sulla porta 1421) con dati di prova isolati e brani generati apposta (nomi con accenti, emoji, «—»).
- Provato ogni punto della fase: Home a schede, setlist (crea, rinomina, data, locale, duplica, elimina, ordine, limite, pausa 0-60 s), brani da ogni fonte, F2, menu delle righe, Impostazioni Live, modalità Setlist con avanti automatico misurato al decimo di secondo, Stage view, «Solo i cambi», tasti, stampa.
- Trascinamenti: righe dei recenti col mouse vero; file del sistema simulati con gli eventi di trascinamento di Tauri.
- Database: passaggio dallo schema 3 al 4 su una copia, backup con le setlist dentro, chiusura e riapertura (persistenza).
- Grafica: 1280×800, 1280×720 e 1920×1080, tutti i 10 temi, menu con la voce scelta e il puntatore sopra.

## Problemi trovati
| # | Gravità | Cosa succede | Dove / come riprodurlo |
|---|---|---|---|
| 1 | importante | In vista normale, Spazio o Play su un brano senza file o su una pausa fanno suonare il brano di prima; il brano senza file non parte | modalità accesa → Alt+→ fino a un brano senza file → Spazio. `shortcutHandlers.ts` (playPause non passa da `live.toggle`), `live.ts` |
| 2 | importante | Stage view: un titolo lungo o note lunghe escono dallo schermo. Il titolo copre l'intestazione e tempi e barra finiscono sotto «Prossimo» | `StageView.tsx`: impaginazione senza riduzione né scorrimento (foto 01) |
| 3 | importante | Stampa: il locale esce codificato («Bar%20Sport%2C%20Citt%E0…») e la data come 2026-12-06 | `printSetlist.ts:31` usa `.map(escape)` invece di `escapeHtml` (foto 02) |
| 4 | importante | Una modifica fatta meno di 0,4 s prima di chiudere la finestra va persa | `stores/setlists.ts`: `beforeunload` lancia un salvataggio asincrono che non finisce; serve `onCloseRequested` come in `projectSync.ts` |
| 5 | importante | Se elimini la setlist attiva, la modalità resta accesa senza barra né ✕ e i salvataggi del brano di studio restano bloccati | Home in modalità Setlist → cestino → Elimina. `live.ts` (nessuno stop se la setlist sparisce) |
| 6 | importante | Il tasto ▾ «Opzioni del Live mode» (dove si sceglie «Solo i cambi») sembra vuoto: la freccia è larga 2 px | Home e pannello; classi `px-2.5` e `px-0` in conflitto sul Button (foto 04) |
| 7 | minore | «Ferma dopo questo» acceso non si vede: niente segno nel menu (lo stesso vale per Segue) e niente icona sulla riga | `SetlistParts.tsx:209-236` CheckboxItem senza indicatore; riga 462 mostra solo Segue (foto 03) |
| 8 | minore | Stage view di un brano col file mancante: mostra le sezioni del brano aperto prima | `StageView.tsx:137` |
| 9 | minore | Chiusa la modalità, la barra in alto resta compatta a 1280 («Apri», «Home», «Cerca un'azione…» senza testo) anche dopo un ridimensionamento | `TopBar.tsx:184` `resetKey` non tiene conto della modalità |
| 10 | minore | Esc chiude la finestra Impostazioni Live e insieme anche la Home | doppio clic su una riga della Home → Esc |
| 11 | minore | Testi superati: nel menu Live «Esc = esci» (ora torna alla vista normale); nel pannello «Doppio clic su un brano per aprirlo» (ora lo suona) | `i18n/it.ts` |
| 12 | minore | Altri: un cue in oltre il cue out cancella il cue out senza avviso (`setlist.rs` tidy); dopo Invio o Esc nella rinomina la riga perde il focus e F2 non riparte; «Fine prevista» non conta la pausa prima del brano dopo; riassunto Live nel tema chiaro con contrasto 3,6:1; commento doppio in `SetlistParts.tsx:382-383` | — |

Avvisi: a 1280 la barra della setlist nasconde il nome e la scritta «Stage view» (restano le icone). Nella Home, con data e nome lunghi, il cestino e «Stage view» vanno su una riga a parte. Nel worktree Vite blocca i font Inter e JetBrains (403, `node_modules` collegata fuori dalla cartella consentita): vale anche per `13-prova-setlist`.

## Non verificabili
- Trascinamento reale da Esplora risorse — non si può simulare senza mouse fisico. Al suo posto ho mandato gli eventi `tauri://drag-*` sulla Home e sul pannello: la zona si illumina, i file entrano, il .txt viene scartato e fuori dalla setlist il file si apre.
- Finestre di sistema «File…», «Cerca il file…» e la stampa — non si pilotano. Al suo posto ho provato l'effetto nello store (percorso nuovo, durata riletta) e la pagina di stampa visualizzata.
- Pedale e tasti multimediali fisici — al loro posto ho mandato l'evento `media-key` (next e previous ok).
- Trasposizione all'ascolto — ho controllato solo i valori del player (+3 st, 105%), non il suono.

## Pulizia
Processi chiusi (app, Vite, launcher) · porte 1421 e 9222 libere · cartella temporanea eliminata · progetto come prima: sì, più questo registro e `docs/collaudo/foto/` (svuotata delle foto della fase 28 e riempita con 5 foto nuove) · C: 640,21 → 640,20 GB (variazione del sistema, nessun file mio) · D: 160,48 → 160,30 GB (−180 MB non miei: la copia di prova dell'utente è stata usata dalle 09:10 alle 09:22, prima del mio avvio) · cargo-target invariato (27,0 GB) · ambiente ripulito: sì

## Riprova 24/11/2026 11:00
**Esito finale: ⚠️ SUPERATO CON AVVISI** · ramo `fase-30` a9a82fb · 12 difetti su 12 risolti · durata ~45 min
`scripts\powershell\test.ps1`: Biome, TypeScript, Vitest (260 test), rustfmt, Clippy, cargo test: tutto ok. App vera (`tauri dev` sulla porta 1421, dati di prova isolati, brani con accenti ed emoji).

| # | Esito | Prova |
|---|---|---|
| 1 | ✅ risolto | Brano senza file: Spazio e Play del dock lo fanno partire, il brano di prima resta fermo (posizione 0:00); pausa e ripresa; spia accesa; pausa della setlist ferma e riparte |
| 2 | ✅ risolto | Titolo lunghissimo su 2 righe con «…», note lunghe che scorrono; barra, tempi e «Prossimo» sempre visibili a 1024×600, 1280×720, 1280×800, 1920×1080 |
| 3 | ✅ risolto | Stampa: «domenica 6 dicembre 2026 · Bar Sport, Città di Castello», nessun %xx; `<b>&"` mostrati come testo |
| 4 | ✅ risolto | Modifica fatta 120 ms e 30 ms prima di chiudere la finestra (chiusura vera di Windows): ritrovata dopo il riavvio |
| 5 | ✅ risolto | Eliminata la setlist attiva: modalità chiusa, barra normale; una sezione di studio aggiunta dopo viene salvata (riaperto il brano, c'è) |
| 6 | ✅ risolto | Tasto ▾ largo 28 px con la freccia; il menu mostra «Solo i cambi» |
| 7 | ✅ risolto | Segno ✓ su «Ferma dopo questo» e «Segue» (leggibile col puntatore sopra); icona sulla riga |
| 8 | ✅ risolto | Stage view di un brano col file mancante: nessuna sezione del brano di prima; le sezioni del brano giusto si vedono |
| 9 | ✅ risolto | Chiusa la modalità, la barra in alto torna con «Apri», «Home», «Cerca un'azione…» |
| 10 | ✅ risolto | Esc chiude solo Impostazioni Live; il secondo Esc chiude la Home |
| 11 | ✅ risolto | «Esc = vista normale» e «Doppio clic su un brano per suonarlo» |
| 12 | ✅ risolto | I cue non si incrociano (cue in fermo a cue out −1 s); F2 riparte dopo Invio ed Esc; «Fine prevista» conta la pausa (+1 min con pausa 60 s); riassunto Live a 6,6:1 nei temi chiari (≥ 9:1 negli scuri); commento doppio tolto |
| Font | ✅ risolto | Inter e JetBrains Mono caricati (200) |

Non regressione OK: Attiva, avanti automatico (pausa 2 s misurata), avanti automatico spento (aspetta il tasto), Ferma dopo, Segue, pausa che aspetta il tasto, brano fuori scaletta con «Torna alla setlist», Stage view con Esc, rinomina, chiusura e riapertura (tutto salvato).

**Resta da fare (nuovo, minore):** su un brano col file mancante, «Brano precedente» (← o pedale) non torna indietro: ricomincia sempre lo stesso brano. Ripreso: brano 4 finito, passa al 5 (file mancante), premi ← due volte → resta sul 5. `live.ts` `previous()`: per un brano col percorso usa la posizione del brano aperto prima (12 s > 3 s) e quindi «ricomincia».
Avvisi rimasti per scelta: barra della setlist a 1280 px con sole icone; nella Home con data e nome lunghi alcuni tasti vanno a capo. Console: solo `favicon.ico` 404 del server di sviluppo. Non verificabili come prima: trascinamento da Esplora risorse, finestre di sistema, pedali fisici.

Pulizia: app, Vite e launcher chiusi (i 4 node già aperti prima lasciati) · porte 1421 e 9222 libere · cartella temporanea eliminata · progetto come prima: sì (solo questo registro; `docs/collaudo/foto/` non toccata) · C: 596,22 → 596,21 GB · D: 149,06 → 148,92 GB (ricompilazione dev nel cargo-target condiviso) · ambiente ripulito: sì
