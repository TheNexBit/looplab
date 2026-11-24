# Pubblicazione di Looplab

La catena per far uscire una versione: dai contenuti di prova fino alla promozione. Accanto a ogni fase c'è
chi la può fare (un agente da solo, oppure serve l'utente). Le fasi 1–3 si ripetono quando cambiano le
schermate, la 4 si è fatta una volta sola, la 5–7 a ogni versione.

## 1. Contenuti dimostrativi — agente «media»

- Musica creata apposta, senza diritti: `D:\sandbox\screenshot-kit\make_media.py` (Python con numpy, 110 BPM in Mi
  minore) crea il «Corso Demo Rock» in `D:\sandbox\screenshot-kit\media\`: lezioni, solo + base, tab MusicXML.
- Mai musica o tab di altri negli screenshot.

## 2. Screenshot professionali — agente «fotografo»

- Copia di Looplab con dati vuoti (`LOOPLAB_DATA_DIR=D:\.cache\looplab\screens`) e WebView2 aperto al controllo
  remoto: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224`, poi `npm run app`.
- `D:\sandbox\screenshot-kit\shoot.mjs` prepara ogni scena con gli store dell'app (corso, sezioni, loop, stems,
  setlist, Live mode, metronomo) e salva PNG e WebP a 1600×1000 con densità 2× in `out\`.
- Trappole: foto tutte uguali e scure = pagina non caricata (ricaricarla) o finestra ridotta a icona
  (`restore-window.ps1`). A fine lavoro chiudere l'app e liberare le porte.

## 3. Sito — agente «web»

- `site/index.html` (una pagina, inglese di default con tasto IT), `site/shots/*.webp`, `site/favicon.svg`.
- I testi italiani stanno negli attributi `data-it`, `data-it-alt`, `data-it-aria` accanto a quelli inglesi.
- Si pubblica da solo con GitHub Pages (`.github/workflows/pages.yml`) a ogni push che tocca `site/`:
  <https://thenexbit.github.io/looplab/>. Se GitHub risponde «Deployment failed, try again later» è un suo
  intoppo: riprovare più tardi con `gh workflow run pages.yml -R TheNexBit/looplab`.
- Biome controlla anche il sito: niente `href="#"`, icone decorative con `aria-hidden`, gruppi di tasti in
  `<fieldset>`.

## 4. Progetto su GitHub — fatto una volta (24/11/2026)

- Repository pubblico `TheNexBit/looplab`; nella cronologia l'email personale è stata sostituita da quella
  anonima di GitHub (`76566744+TheNexBit@users.noreply.github.com`, impostata in `git config` del progetto).
- `README.md` (inglese) e `README.it.md`, banner `.github/assets/banner.svg`, licenza **GPL-3.0-or-later**
  (`LICENSE`), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, moduli in `.github/ISSUE_TEMPLATE/`, tasto Sponsor
  (`.github/FUNDING.yml` → Ko-fi `roxfod`), Discussions attive, prime issue per chi vuole collaborare.
- Da fare a mano su GitHub: immagine di anteprima (Settings → General → Social preview).

## 5. Chiusura della versione — verificatore / collaudatore

- `scripts\02-test.cmd` senza errori né warning **su main**, dopo aver unito tutto (sito e README compresi).
- Versione `0.<fase>.0` in `package.json`, `package-lock.json`, `Cargo.toml` (+ `Cargo.lock`), voce in
  `CHANGELOG.md`, roadmap aggiornata, etichetta `v0.F.0`, push di main e dell'etichetta.

## 6. Build e release — utente + agente «release»

- **Utente:** `scripts\04-build.cmd` e la password della chiave di firma (mai in chat). La chiave sta in
  `D:\.config\tauri` (creata il 24/11/2026): va copiata in un posto sicuro insieme alla password. Se si perde,
  Looplab si installa lo stesso, ma chi lo ha già deve scaricare a mano la versione nuova.
- **Agente:** `gh release create vX.Y.Z` con installer, `.sig`, `latest.json` e ZIP portatile
  (`D:\.cache\cargo-target\release\bundle\`), note in inglese; controllare che
  `releases/latest/download/latest.json` risponda.

## 7. Promozione — utente

- Un messaggio per server, nei canali giusti (#self-promo, #showcase), con screenshot o GIF; chiedere pareri più
  che donazioni. Niente messaggi ripetuti in serie.

## Agenti e regista

Si parte con **`/pubblica`** (il regista, `.claude/skills/pubblica/SKILL.md`): sceglie le fasi, chiama gli
agenti in ordine, fa commit e push e si ferma quando serve l'utente. Gli agenti stanno in `.claude/agents/`.

| Agente           | Fase | Fa                                                | Non fa                        |
| ---------------- | ---- | ------------------------------------------------- | ----------------------------- |
| `pub-media`      | 1    | contenuti demo senza diritti                      | toccare l'app o il progetto   |
| `pub-fotografo`  | 2    | copia isolata dell'app, scene, foto, pulizia      | modificare il codice dell'app |
| `pub-web`        | 3    | sito e README in EN e IT, Biome, prova in locale  | commit e push                 |
| `verificatore`   | 5    | controlli e prova di ciò che è cambiato           | correggere il codice          |
| `pub-release`    | 6    | release su GitHub con i file della build          | password, build, firma        |
| `pub-repository` | 6–7  | issue, etichette, ripubblicare il sito, controlli | licenza, visibilità, commit   |

Ordine: `pub-media` → `pub-fotografo` → `pub-web` di fila senza fermarsi; controlli e `verificatore` prima di
ogni push; `pub-release` solo dopo la build fatta dall'utente.
