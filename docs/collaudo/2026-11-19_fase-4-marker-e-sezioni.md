# Collaudo Looplab — Fase 4 Marker e sezioni — 19/11/2026 12:40
**Esito: ❌ NON SUPERATO** (tutte le funzioni della fase 4 vanno; il blocco è un difetto della barra in basso, emerso nella regressione)
Controlli: 33 · ✅ 28 · ⚠️ 4 · ❌ 1 · ⏭ 0 non verificabili · durata ~18 min

## Cosa ho fatto
- Controlli automatici: TypeScript, Vitest (202 test), rustfmt, Clippy, cargo test (199 test): tutti OK. Biome si ferma solo su `.claude/HANDOFF.md` (file non versionato).
- App vera (`tauri dev` sulla porta 1421, dati di prova in una cartella a parte), brani WAV di prova con accenti, emoji, spazi e `#` nel percorso.
- Comportamento attuale, non quello originale della fase 4: sezioni con inizio e fine (fase 15), salvataggio nel database `libreria.db` (fase 19), recenti fino a 30 (fase 10).
- Tasti: M, B (numeri ricalcolati quando le battute si spostano o si cancellano), S apre/chiude (anche mentre suona), Esc annulla, `,` `.` (si fermano su inizi e fini), Maiusc+S, Alt+1.
- Striscia delle sezioni: clic = playhead, doppio clic = loop, trascinare la sezione e i bordi (si fermano alla sezione vicina), menu col tasto destro (Loop, 8 colori, Elimina), sezione nuova trascinando nel vuoto, sovrapposizioni accorciate o divise.
- Bandierine: clic = salto, trascinamento (si ferma a 0:00), aggancio della calamita, tasto destro → Elimina. Pannello: rinomina (accenti, emoji, nome lunghissimo, vuoto ignorato), loop, elimina, elenco dei marker.
- Salvataggio: non scritto a 0,6 s, scritto a 1,0 s; una raffica di modifiche = un solo salvataggio; scritto anche chiudendo la finestra subito dopo una modifica.
- Riavvio: marker, sezioni, nomi, colori, loop, velocità, tonalità e posizione tornano tutti giusti, anche aprendo il brano dai recenti.
- Progetti illeggibili (versione più nuova, JSON rotto): compare l'avviso e il progetto nel database resta com'era. Un vecchio `.looplab.json` viene importato (sezioni completate con la fine) e spostato nei backup con `origine.txt`.
- Recenti: pagina iniziale, riga «Riprendi» e menu accanto ad «Apri»; un file che non esiste più appare in grigio. Console senza errori (solo un 404 innocuo della favicon all'avvio).

## Problemi trovati
| # | Gravità | Cosa succede | Dove / come riprodurlo |
|---|---|---|---|
| 1 | importante | Alla misura iniziale della finestra (1280×800) la barra in basso esce dallo schermo a destra (1448 px in 1280): cents e Accordatura non si vedono mai; con un loop attivo spariscono anche i valori di Velocità e Pitch e i tasti 50/75/100% | `src/features/player/TransportDock.tsx` · aprire un brano, creare un loop · `footer.scrollWidth` = 1448 · foto: `docs/collaudo/foto/2026-11-19_fase-4_dock-tagliato-e-nomi-sezioni.png` |
| 2 | minore | Nel pannello Sezioni i nomi sono tagliati dopo circa 6 lettere («Sezione 1» e «Sezione 2» si leggono tutti e due «Sezion»), e non c'è un suggerimento col nome intero | `src/features/markers/SectionList.tsx` (riga con orario e 3 tasti) · stessa foto |
| 3 | minore | Rinominando una sezione (o un loop salvato), Esc salva il testo scritto invece di annullarlo; Ctrl+Z lo riporta indietro | `src/components/ui/InlineName.tsx:24-33`: `onBlur={commit}` usa ancora la bozza vecchia dopo `setDraft(null)` · scrivere «ZZZ» nel nome e premere Esc |
| 4 | minore | Un vecchio `.looplab.json` danneggiato viene lasciato dov'è (bene), ma il brano si apre vuoto senza dire niente: l'errore finisce solo nel registro | `src-tauri/src/legacy.rs:96-101` |
| 5 | minore | `scripts\02-test.cmd` si ferma su Biome per colpa di `.claude/HANDOFF.md` (file non del progetto) | `biome.json`: escludere `.claude` |

## Superate da fasi successive (non sono difetti)
- Sezioni una dopo l'altra, «clic = loop», bordo solo sinistro → fase 15 (inizio e fine, clic = playhead, doppio clic = loop). Collaudato il comportamento attuale.
- `<file>.looplab.json` accanto al brano e «cartella protetta → copia» → fase 19 (database `libreria.db`; i vecchi file vengono importati). Collaudato il comportamento attuale.
- File recenti 10 → 30 (fase 10).

## Pulizia
Processi chiusi (app, Vite, cargo; i 4 `node` che c'erano già sono stati lasciati) · porte 1421 e 9222 libere · cartella temporanea eliminata · progetto come prima: sì (aggiunti solo questo registro e una foto) · nessuna cartella Looplab nata su C: · C: 598 GB liberi → 598 GB · D: 152 GB liberi → 152 GB (cartella di prova da 184 MB eliminata) · `%CARGO_TARGET_DIR%` 19 GB, non cresciuto in modo visibile. Resta `%LOCALAPPDATA%\Temp\1a69e687-….tmp` (0 byte, nato alle 12:34): non l'ho cancellato perché è aperto da un altro processo, quindi probabilmente non è mio.

## Riprova 19/11/2026 13:00
**Esito: ⚠️ SUPERATO CON AVVISI** — i 5 problemi sono risolti; restano 2 difetti minori.
Controlli: 18 · ✅ 16 · ⚠️ 2 · ❌ 0 · ⏭ 0 · durata ~15 min

Come: `scripts\02-test.cmd` completo; app vera (porta 1421, dati di prova a parte, poi riavviata due volte); barra misurata a 10 larghezze con un brano di 1:30 e uno di 61 minuti, loop attivo e ×2…×1000; rinomina provata scrivendo davvero.

| # | Voce riprovata | Esito | Prova |
|---|---|---|---|
| 1 | Barra in basso a 900, 1023, 1024, 1279, 1280, 1535, 1536, 1799, 1800, 1920 px (brano 1:30, loop ×100, 128.5 BPM, 87%, −11 st −37 ct) | ✅ | nessuna sporgenza, nessun tasto fuori o sovrapposto; foto a 900/1280/1536/1920 guardate |
| 1 | Accordatura e cents da 1280 px; 50/75/100% da 1800; Tap e Count-in da 1536 | ✅ | tasti visibili alle soglie giuste |
| 1 | F, Z, G a 1000 px (tasti nascosti) e clic sui tasti a 1280 | ✅ | Segui, Calamita e Brano intero si accendono e si spengono |
| 1 | Brano di 10 minuti o più + loop ripetuto 10 volte o più, finestra 1536–1543 px | ⚠️ | la barra sporge di 2–13 px: con ×100 il tasto Accordatura resta tagliato a destra |
| 2 | Pannello Sezioni: nome sopra gli orari, suggerimento col nome intero (sezioni e loop salvati) | ✅ | «Sezione 1/2/3» intere; nome lunghissimo con accenti ed emoji nel suggerimento |
| 3 | Esc annulla (sezione e loop salvato); niente passo di Annulla; anche dopo il riavvio | ✅ | testi «ZZZ», «QQQ», «NO» mai salvati |
| 3 | Invio e clic fuori salvano; vuoto e soli spazi ignorati; spazi ai lati tolti; Ctrl+Z / Ctrl+Y | ✅ | un passo per ogni nome cambiato |
| 3 | Clic su un nome e poi fuori, senza cambiare niente | ⚠️ | aggiunge un passo di Annulla vuoto: Ctrl+Z sembra non fare niente (c'era già prima) |
| 4 | Vecchio `.looplab.json` rotto: avviso all'apertura, file lasciato com'era, niente salvato | ✅ | avviso «non si legge… non vengono salvati»; `load_project` dà errore `projectFile` |
| 4 | Avvio con un vecchio elenco dei recenti (file rotto + file buono) | ✅ | l'app parte; il buono viene importato (65%) e spostato nei backup, il rotto resta dov'è |
| 5 | Biome, TypeScript, Vitest 202, rustfmt, Clippy, cargo test | ✅ | «Tutti i controlli superati» |
| — | Regressione: riavvio con sezioni, loop e loop salvati; play/pausa a 65%; console | ✅ | tutto tornato; console senza errori |

Avvisi (minori):
- Barra a 1536–1543 px con brani lunghi → `TransportDock.tsx` / `TempoModule.tsx`: a `2xl` entrano insieme il display largo, Tap e Count-in; il loop «10:00.5 → 10:50.4 ×100» li allarga di 13 px. ROADMAP dice «entra in ogni larghezza».
- Passo di Annulla vuoto → `InlineName.tsx` `commit`: chiama `onRename` anche se il nome non è cambiato (`draft.trim() === value`).

Pulizia: processi miei chiusi (app e `tauri dev`); il Vite sulla 1421 (PID 16184, delle 12:41) c'era già prima e l'ho lasciato · porta 9222 libera · cartella temporanea (926 MB) eliminata · progetto come prima: sì (aggiunta solo questa sezione) · niente Looplab nato su C: · C: 597 → 597 GB · D: 151 → 151 GB · ambiente ripulito: sì. Nella Temp di C: sono comparsi file `.tmp` (icone PNG/AVIF) di un altro programma: non sono miei e non li ho toccati.

## Riprova 19/11/2026 13:25
**Esito: ⚠️ SUPERATO CON AVVISI** — le 2 correzioni funzionano; restano 2 difetti minori, uno nuovo e uno appena sotto la soglia.
Controlli: 14 · ✅ 12 · ⚠️ 2 · ❌ 0 · ⏭ 0 · durata ~16 min

Come: `scripts\02-test.cmd` completo; app vera (porta 1421, dati di prova a parte, poi riavviata); brano di prova di 11:01; barra misurata a 11 larghezze con loop «10:00.5 → 10:50.4» ×100 e ×1000 e due serie di valori (128.5 BPM, 87%, −11 st −37 ct; 288.5 BPM, 199%, −12 st −50 ct), più una scansione ogni 1–5 px da 900 a 1920; rinomina provata con clic e tasti veri.

| # | Voce riprovata | Esito | Prova |
|---|---|---|---|
| 1 | Barra a 900, 1024, 1280, 1536, 1543, 1599, 1600, 1610, 1700, 1800, 1920 px con ×100 (tutte e due le serie di valori) | ✅ | nessuna sporgenza, nessun tasto fuori o sovrapposto, nessun testo tagliato; foto a 900/1536/1600 guardate |
| 1 | Stessa prova con ×1000 | ⚠️ | tutto a posto tranne 1280–1284 px: il riquadro Velocità/Pitch esce di 1–5 px a destra (bordo destro tagliato; il tasto Accordatura resta intero) |
| 1 | Tap e Count-in: nascosti fino a 1599, visibili da 1600; i clic funzionano (Count-in si accende e si spegne, Tap imposta il tempo); il tasto T va anche a 1536 | ✅ | `countIn` false→true→false; BPM cambiato dai colpi |
| 1 | Accordatura visibile da 1280 (non a 900 e 1024); 50/75/100% da 1800 | ✅ | misurato a ogni larghezza |
| 2 | Clic dentro e fuori, doppio clic, Invio o Esc senza cambiare niente (sezione e loop salvato), anche 3 volte di fila | ✅ | passi di Annulla sempre uguali (8 → 8) |
| 2 | Stesso nome con spazi ai lati; scrivere e poi riscrivere il nome uguale | ✅ | nessun passo aggiunto |
| 2 | Esc dopo «ZZZ»/«QQQ»; nome vuoto; soli spazi | ✅ | nome invariato, nessun passo |
| 2 | Nome nuovo con spazi ai lati («  Intro  », «  Ritornello è 🎸  ») con Invio o clic fuori | ✅ | salvato senza spazi, un passo; il primo Ctrl+Z lo riporta indietro, Ctrl+Y lo rimette |
| 2 | Loop salvato: nome «Assolo» | ⚠️ | si legge «Asso» a 1280, 1600 e 1920 px (31 px su 45): c'è il suggerimento col nome intero |
| — | `scripts\02-test.cmd`: Biome, TypeScript, Vitest 202, rustfmt, Clippy, cargo test | ✅ | «Tutti i controlli superati» |
| — | Riavvio: nomi, loop salvato, loop, velocità, pitch e BPM tornano giusti; console senza errori | ✅ | letti dopo il riavvio; nessun errore |

Avvisi (minori):
- Loop ripetuto 1000 volte o più, finestra tra 1280 e 1284 px (1280 è la misura iniziale) → `TransportDock.tsx` / `LoopMenu.tsx`: «×1000» allarga il tasto del loop e il riquadro Velocità/Pitch sporge di 5 px. La riga della ROADMAP dice «entra in ogni larghezza da 900 px». Caso raro (con un loop di 50 s servono quasi 14 ore).
- Nome del loop salvato tagliato dopo 4–5 lettere → `src/features/markers/SavedLoopList.tsx` (nome sulla stessa riga dell'orario, come era prima nel pannello Sezioni). Non riguarda queste correzioni.

Pulizia: processi miei chiusi (app e `tauri dev`, due avvii); i 4 `node` e i 6 `msedgewebview2` delle 11:56–12:21 c'erano già e li ho lasciati · porte 1421 e 9222 libere · cartella temporanea (276 MB) eliminata, anche `D:\.cache\collaudo` · progetto come prima: sì (aggiunta solo questa sezione) · niente Looplab nato su C: · C: 596,3 → 594,5 GB · D: 151,6 → 151,3 GB · ambiente ripulito: sì. Il calo di 1,8 GB su C: non viene da me (nessuna cartella o file mio su C:; nella Temp ci sono solo `.tmp` da 0 byte di altri programmi).

## Riprova 19/11/2026 14:00
**Esito: ⚠️ SUPERATO CON AVVISI**: le 2 correzioni funzionano; resta 1 difetto minore, nuovo, che si vede solo con il pannello laterale stretto al minimo.
Controlli: 11 · ✅ 10 · ⚠️ 1 · ❌ 0 · ⏭ 0 · durata ~12 min

Come: `scripts\02-test.cmd` completo; app vera (porta 1421, dati di prova a parte, poi riavviata); brano di prova di 11:01 in una cartella con accenti, emoji e `#`; barra misurata in 602 combinazioni (da 1270 a 1300 px ogni 1 px, più 900, 1023, 1024, 1279, 1535, 1536, 1543, 1599, 1600, 1799, 1800 e 1920; contatore assente, ×2, ×10, ×100, ×1000, ×10000 e ×100000; due serie di valori, fino a 288.5 BPM, 199%, −12 st −50 ct). Ho controllato che la misura si accorge davvero di una sporgenza: un elemento finto di 40 px fa uscire la barra di 11 px. Pannello e loop salvati provati con clic e tasti veri.

| # | Voce riprovata | Esito | Prova |
|---|---|---|---|
| 1 | Barra in tutte le 602 combinazioni | ✅ | nessuna sporgenza, nessun tasto fuori o sovrapposto, nessun testo tagliato; anche a 1280–1284 con ×1000 (prima sporgeva di 5 px). Margine a 1280 px: circa 29 px |
| 1 | Larghezza del tasto del loop | ✅ | sempre 166 px, da senza contatore fino a ×100000: il contatore non allarga più niente |
| 1 | Aspetto del contatore | ✅ | «LOOP ×100» sulla riga della scritta, stessa altezza, cifre arancioni a larghezza fissa, non in maiuscolo né spaziato; foto ingrandite a ×100 e ×100000 guardate |
| 1 | Contatore suonando davvero (loop di 2 s) | ✅ | 1º giro: solo «Loop»; poi ×2, ×3, ×4 a ogni ritorno all'inizio; un loop nuovo lo azzera |
| 2 | Loop salvati a 1024, 1280, 1600 e 1920 px | ✅ | nome sopra gli orari; «Assolo», «X» e «Intro àè 🎸» si leggono interi; il nome lunghissimo è tagliato ma il suggerimento mostra il nome intero |
| 2 | Spia del loop attivo | ✅ | accesa solo sulla riga del loop in uso; si sposta quando si richiama un altro loop |
| 2 | Rinomina, Esc, richiama, appunto, elimina, Ctrl+Z (clic veri) | ✅ | nome nuovo salvato; Esc non salva «ZZZ»; il loop richiamato diventa quello attivo; appunto salvato e tasto acceso; riga eliminata e rimessa da Ctrl+Z |
| 2 | Pannello laterale stretto al minimo (260 px), brano di 10 minuti o più | ⚠️ | gli orari «10:00.5–10:50.4» vanno a capo su due righe, nei Loop salvati e nelle Sezioni; da 270 px stanno su una riga |
| — | `scripts\02-test.cmd`: Biome, TypeScript, Vitest 202, rustfmt, Clippy, cargo test | ✅ | «Tutti i controlli superati» |
| — | Riavvio: loop salvati (nomi con accenti ed emoji, appunto, orari), loop attivo e sezioni | ✅ | tutto tornato giusto |
| — | Console | ✅ | nessun errore dell'app (solo il solito 404 della favicon) |

Avviso (minore):
- Orari su due righe con il pannello al minimo → `src/features/markers/SavedLoopList.tsx` e `SectionList.tsx`: la riga degli orari va a capo (manca `whitespace-nowrap`). Nessuna sovrapposizione, la riga diventa solo più alta. Succede solo trascinando il pannello fino a 260–269 px.

Nota (non è un difetto): sotto i 1280 px l'intervallo del loop si nasconde, e con lui anche il contatore ×N, come scritto nella ROADMAP. Il numero della ripetizione resta nel pannello Pratica.

Pulizia: processi miei chiusi (app e `tauri dev`, due avvii); i 4 `node` e i 6 `msedgewebview2` delle 11:56–12:21 c'erano già prima e li ho lasciati · porte 1421 e 9222 libere · cartella temporanea (218 MB) eliminata, anche `D:\.cache\collaudo` · progetto come prima: sì (aggiunta solo questa sezione) · niente Looplab nato su C: · C: 594,5 → 594,2 GB · D: 151,6 → 151,3 GB · ambiente ripulito: sì. Nella Temp di C: è comparso un `.tmp` da 0 byte (13:59), uguale a quelli di altri programmi già segnalati: non l'ho toccato.

## Riprova 19/11/2026 14:12
**Esito: ⚠️ SUPERATO CON AVVISI**: la correzione funziona. Con il pannello al minimo, gli orari dei brani da 1:30, da 11 minuti e da 63 minuti stanno su una riga e non toccano i tasti. Resta 1 difetto minore, che si vede solo con brani da 100 minuti in su.
Controlli: 8 · ✅ 7 · ⚠️ 1 · ❌ 0 · ⏭ 0 · durata ~8 min

Come: `scripts\02-test.cmd` completo; app vera (porta 1421, dati di prova a parte, finestra 1280 px); brani di prova da 1:30, 11:01, 63:00 e 102:00 in una cartella con accenti, emoji e `#`; per ogni brano, pannello a 260, 270, 280 e 400 px con 2 loop salvati, 2 sezioni (una con nome lunghissimo e appunto) e 1 marker. Per ogni riga ho misurato quante righe occupano gli orari, dove finisce il testo e dove inizia il primo tasto, e se un tasto è coperto. Poi ho rifatto le misure col mouse sopra ogni riga (movimento vero).

| # | Voce riprovata | Esito | Prova |
|---|---|---|---|
| 1 | Brano da 1:30 («1:00.5–1:29.4») a 260, 270 e 400 px | ✅ | una riga; spazio fino al primo tasto: 24 / 34 / 163 px |
| 1 | Brano da 11 minuti («10:00.5–10:50.4») a 260, 270 e 400 px | ✅ | una riga (prima andava a capo a 260); spazio: 11 / 21 / 150 px; foto guardata |
| 1 | Brano da 63 minuti a 260, 270 e 400 px | ✅ | una riga, spazio uguale a quello del brano da 11 minuti. L'app scrive «60:00.5–61:00.4», non «1:00:00.5–1:01:00.4» (`formatTime` usa minuti:secondi anche oltre l'ora) |
| 1 | Mouse sopra ogni riga (loop salvati e sezioni) | ✅ | appunto, loop ed elimina compaiono; nessun tasto coperto né fuori dalla riga; il pannello non scorre di lato |
| 1 | Brano da 102 minuti («100:00.5–101:00.4») a 260 px | ⚠️ | una riga, ma il testo esce di 10 px dal suo spazio ed entra di 2 px nel riquadro del tasto appunto. L'icona resta libera e il clic va al tasto; da 270 px è a posto (spazio 8 px) |
| 2 | Nome sopra gli orari; rinomina con Invio; Esc dopo «ZZZ» (sezione e loop salvato, clic e tasti veri) | ✅ | «Strofa àè 🎸» e «Assolo nuovo 🎸» salvati; con Esc il nome resta com'era |
| — | `scripts\02-test.cmd`: Biome, TypeScript, Vitest 202, rustfmt, Clippy, cargo test | ✅ | «Tutti i controlli superati» |
| — | Console | ✅ | nessun errore dell'app (solo il solito 404 della favicon) |

Avviso (minore):
- Brani da 100 minuti in su con il pannello a 260–269 px → `SavedLoopList.tsx:30` e `SectionList.tsx:38`: con `whitespace-nowrap` gli orari non vanno più a capo, ma escono dal loro spazio (`min-w-0`) e arrivano a toccare il tasto appunto. Caso raro.

Nota: se un giorno gli orari passassero al formato «1:00:00.5–1:01:00.4», a 260 px coprirebbero l'icona dell'appunto (prova simulata: il testo entra di 15 px nel tasto) e a 270 px lo toccherebbero. Per ora l'app non usa quel formato.

Pulizia: processi miei chiusi (app, `tauri dev`, Vite sulla 1421, cargo); i 4 `node` e i 6 `msedgewebview2` delle 11:56–12:21 c'erano già prima e li ho lasciati · porte 1421 e 9222 libere · cartella temporanea (2,3 GB, brani di prova, audio decodificato dall'app e profilo WebView2) eliminata, anche `D:\.cache\collaudo` · progetto come prima: sì (aggiunta solo questa sezione) · niente Looplab nato su C: · C: 594,2 → 594,3 GB · D: 151,6 → 151,6 GB · `%CARGO_TARGET_DIR%` +0,2 GB (ricompilazione normale) · ambiente ripulito: sì.
