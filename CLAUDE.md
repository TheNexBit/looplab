# Looplab — regole del progetto

Valgono insieme a `D:\CLAUDE.md`. Specifica completa del progetto: `docs/SPEC.md`.

- Parla con l'utente in **italiano semplice** (non è uno sviluppatore professionista); spiega ogni termine tecnico.
  Codice, nomi di file e commenti in **inglese**.
- Lavora **per fasi** (`docs/ROADMAP.md`): piano breve prima, a fine fase fermati e spiega cosa provare.
- Se ci sono due strade valide, chiedi.
- **Niente su `C:\`**: dati di sviluppo in `LOOPLAB_DEV_DATA_DIR` (`.cargo/config.toml`), letto da `paths.rs` e `scripts/powershell/config.ps1`.
- Nessun `target/` locale e nessun `target-dir`: si usa `CARGO_TARGET_DIR`.
- **Niente doppioni** e **niente file sparsi** (`test.ts`, `*_old`, `*_v2`): prove usa e getta in `D:\sandbox`.
- `src/lib/bindings.ts` è generato: rigeneralo con `npm run bindings`, mai a mano.
- Script: in `scripts/` solo i lanciatori `.cmd` numerati per importanza (`01-dev.cmd`…), la logica in `scripts/powershell/<nome>.ps1` (PowerShell 7), stile FolderForge. Mai `.ps1` e `.cmd` mischiati.
- Prima di chiudere una fase: `scripts\02-test.cmd` senza errori né warning; aggiorna `docs/ROADMAP.md` e `docs/ARCHITECTURE.md`.
- **Versione** (SemVer, vedi `CHANGELOG.md`): `0.<fase>.0` quando una fase è chiusa e provata, `0.<fase>.<n>` per le
  correzioni dopo. A fine fase: versione in `package.json` e `Cargo.toml` (workspace), voce in `CHANGELOG.md`,
  etichetta git `v0.F.0`.
- Licenza del progetto: **GPL-3.0-or-later**. Ogni libreria nuova deve avere una licenza compatibile con la GPL-3.0
  (MIT, BSD, Apache-2.0, LGPL, GPL): controllala prima di aggiungerla. Rubber Band ora sarebbe ammessa, ma lo stretching
  attuale si cambia solo su richiesta dell'utente. FFmpeg resta la build LGPL già in uso.
- tauri-specta/specta sono rc: versioni fissate con `=`.
