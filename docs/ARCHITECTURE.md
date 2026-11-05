# Architettura

## I tre pezzi

```
UI (React, src/)  ──comandi tipizzati──▶  App Tauri (src-tauri/)  ──chiamate──▶  audio-engine (crates/)
                  ◀──eventi / binario───                         ◀──atomici────
```

- **`crates/audio-engine`**: libreria senza dipendenze da Tauri: decodifica, thread audio real-time,
  DSP e dati della forma d'onda. Si testa da sola con `cargo test`.
  - Caricamento (`load.rs`): `decode.rs` (file → stereo f32, pacchetto per pacchetto) →
    `resample.rs` (→ frequenza della scheda audio, a blocchi) → `pcm.rs` (16 bit in memoria) + `peaks.rs`.
  - Riproduzione: `engine.rs` è la maniglia usata dall'app (comandi, `LoopSettings`, limiti di velocità);
    `render.rs` vive nella callback cpal: lettore con loop → stretch → dissolvenze → scheda audio.
    Comandi via ring buffer rtrb, posizione/stato via atomici, brani sostituiti liberati fuori dal thread audio.
    La posizione pubblicata è quella _udita_: una piccola cronologia collega l'ingresso dello stretch
    al punto del brano, così latenza e ritorni del loop sono compensati.
  - `dsp/stretch.rs`: interfaccia sicura su Signalsmith Stretch (C++, in `vendor/`, MIT), compilato da
    `build.rs` tramite `cpp/stretch.cpp`. Unico codice non Rust; nessuna allocazione dopo la creazione.
  - `time.rs`: conversioni tempo ↔ frame.
- **`src-tauri`**: guscio desktop. Comandi sottili in `commands/` che delegano all'engine.
  - `paths.rs`: unica fonte dei percorsi in cui l'app scrive. In sviluppo tutto va in
    `LOOPLAB_DEV_DATA_DIR` (definito in `.cargo/config.toml`), in rilascio nella cartella standard di Windows.
  - `window.rs`: le finestre si creano nel codice (non in `tauri.conf.json`) per poter spostare
    il profilo WebView2 prima che parta.
  - `state.rs`: motore audio (avviato in background, ricreato se la scheda audio si guasta) e picchi del brano.
  - `playback.rs`: evento tipizzato `PlaybackStatus` ~15 volte al secondo mentre suona.
  - `commands/waveform.rs`: `get_peaks` restituisce byte grezzi; tauri-specta non sa descriverli, quindi è
    registrato a parte in `main.rs` e avvolto a mano in `src/features/waveform/peaks.ts`.
- **`src/`**: interfaccia React.

## Tipi condivisi Rust ↔ TypeScript

I comandi hanno `#[specta::specta]`; tauri-specta genera `src/lib/bindings.ts`
(all'avvio in debug e con `npm run bindings`). Non si scrive a mano nessun tipo di comando.

## Frontend

| Cartella           | Contenuto                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `app/`             | shell: layout, barra superiore, pannello laterale                                                                |
| `features/<nome>/` | componenti, hook e logica di una funzione (player, library, …)                                                   |
| `components/ui/`   | componenti base su Radix (Button, Tooltip, Slider, Kbd)                                                          |
| `lib/`             | `bindings.ts` (generato), `shortcuts.ts` (registro unico), utility                                               |
| `stores/`          | store Zustand: `ui` (layout), `player` (brano, play, posizione, velocità, tonalità), `loop` (A-B), `view` (zoom) |
| `i18n/`            | tutti i testi della UI                                                                                           |
| `styles/theme.css` | unica fonte dei token del tema (`@theme` Tailwind v4)                                                            |

## Regole

- Niente doppioni: un valore, un posto (colori in `theme.css`, testi in `i18n`, scorciatoie in `shortcuts.ts`,
  limiti dei controlli in `features/player/limits.ts`, percorsi dati in `paths.rs`).
- Il thread audio è real-time safe: niente allocazioni, lock o I/O nella callback.
- L'audio è il clock principale: playhead e video lo seguono.
- Animazioni a 60 fps (playhead, forme d'onda, tempo) girano in `requestAnimationFrame` leggendo gli store
  con `getState()`: non fanno ridisegnare React.
- Canvas sempre alla risoluzione reale del monitor (`useCanvas`), anche cambiando monitor.
