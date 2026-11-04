# Architettura

## I tre pezzi

```
UI (React, src/)  ──comandi tipizzati──▶  App Tauri (src-tauri/)  ──chiamate──▶  audio-engine (crates/)
                  ◀──eventi / binario───                         ◀──atomici────
```

- **`crates/audio-engine`**: libreria Rust pura (nessuna dipendenza da Tauri). Conterrà decodifica,
  thread audio real-time, DSP e dati della forma d'onda. Si testa da sola con `cargo test`.
  Oggi contiene solo le conversioni tempo ↔ frame (`time.rs`).
- **`src-tauri`**: guscio desktop. Comandi sottili in `commands/` che delegano all'engine.
  - `paths.rs`: unica fonte dei percorsi in cui l'app scrive. In sviluppo tutto va in
    `LOOPLAB_DEV_DATA_DIR` (definito in `.cargo/config.toml`), in rilascio nella cartella standard di Windows.
  - `window.rs`: le finestre si creano nel codice (non in `tauri.conf.json`) per poter spostare
    il profilo WebView2 prima che parta.
- **`src/`**: interfaccia React.

## Tipi condivisi Rust ↔ TypeScript
I comandi hanno `#[specta::specta]`; tauri-specta genera `src/lib/bindings.ts`
(all'avvio in debug e con `npm run bindings`). Non si scrive a mano nessun tipo di comando.

## Frontend
| Cartella | Contenuto |
|---|---|
| `app/` | shell: layout, barra superiore, pannello laterale |
| `features/<nome>/` | componenti, hook e logica di una funzione (player, library, …) |
| `components/ui/` | componenti base su Radix (Button, Tooltip, Slider, Kbd) |
| `lib/` | `bindings.ts` (generato), `shortcuts.ts` (registro unico), utility |
| `stores/` | store Zustand, uno per dominio (`ui.ts` per il layout) |
| `i18n/` | tutti i testi della UI |
| `styles/theme.css` | unica fonte dei token del tema (`@theme` Tailwind v4) |

## Regole
- Niente doppioni: un valore, un posto (colori in `theme.css`, testi in `i18n`, scorciatoie in `shortcuts.ts`,
  limiti dei controlli in `features/player/limits.ts`, percorsi dati in `paths.rs`).
- Il thread audio sarà real-time safe: niente allocazioni, lock o I/O nella callback (fase 2).
- L'audio è il clock principale: playhead e video lo seguono.
