# Componenti di terze parti

Looplab usa questi componenti open source. Grazie ai loro autori.
Questo file è mostrato in "Informazioni" e incluso nell'installer.

## Inclusi nell'app

| Componente                      | Uso                            | Licenza               | Sito                                                     |
| ------------------------------- | ------------------------------ | --------------------- | -------------------------------------------------------- |
| FFmpeg 9.0 (build LGPL di BtbN) | audio dei video, proxy video   | LGPL 2.1 o successiva | https://ffmpeg.org                                       |
| Signalsmith Stretch 1.4.0       | velocità e tonalità            | MIT                   | https://github.com/Signalsmith-Audio/signalsmith-stretch |
| Signalsmith Linear 0.6.4        | FFT per Signalsmith Stretch    | MIT                   | https://github.com/Signalsmith-Audio/linear              |
| Symphonia                       | decodifica audio               | MPL 2.0               | https://github.com/pdeljanov/Symphonia                   |
| cpal                            | uscita audio                   | Apache 2.0            | https://github.com/RustAudio/cpal                        |
| rubato                          | conversione di frequenza       | MIT o Apache 2.0      | https://github.com/HEnquist/rubato                       |
| rtrb                            | comunicazione col thread audio | MIT o Apache 2.0      | https://github.com/mgeier/rtrb                           |
| Tauri e i suoi plugin           | finestra dell'app              | MIT o Apache 2.0      | https://tauri.app                                        |
| tauri-specta, specta            | tipi condivisi Rust/TypeScript | MIT                   | https://github.com/specta-rs                             |
| serde, serde_json               | lettura e scrittura dei file   | MIT o Apache 2.0      | https://serde.rs                                         |
| React                           | interfaccia                    | MIT                   | https://react.dev                                        |
| Radix UI                        | componenti dell'interfaccia    | MIT                   | https://www.radix-ui.com                                 |
| Zustand                         | stato dell'interfaccia         | MIT                   | https://github.com/pmndrs/zustand                        |
| Motion                          | animazioni                     | MIT                   | https://motion.dev                                       |
| Lucide                          | icone                          | ISC                   | https://lucide.dev                                       |
| Tailwind CSS                    | stile                          | MIT                   | https://tailwindcss.com                                  |

Le librerie Rust e JavaScript usate indirettamente hanno licenze compatibili (MIT, Apache 2.0, BSD, ISC,
Zlib, MPL 2.0); l'elenco completo si ottiene da `Cargo.lock` e `package-lock.json`.

## FFmpeg (LGPL)

Looplab avvia FFmpeg come programma separato (`ffmpeg.exe`), senza modificarlo né collegarlo al proprio codice.
FFmpeg è distribuito sotto la GNU Lesser General Public License 2.1 o successiva; il testo completo della
licenza è incluso nell'installer accanto a `ffmpeg.exe`. Il codice sorgente esatto della build usata è
disponibile da https://github.com/BtbN/FFmpeg-Builds e da https://ffmpeg.org/download.html.
Puoi sostituire `ffmpeg.exe` con un'altra build compatibile.

## Symphonia (MPL 2.0)

Symphonia è usato senza modifiche. Il suo codice sorgente è disponibile su https://github.com/pdeljanov/Symphonia
e il testo della licenza su https://mozilla.org/MPL/2.0/.

## Signalsmith Stretch e Linear (MIT)

Copyright (c) Signalsmith Audio Ltd. — I file sono inclusi senza modifiche in `crates/audio-engine/vendor/`
insieme alle loro licenze. Licenza MIT: è concesso gratuitamente il permesso di usare, copiare, modificare,
unire, pubblicare e distribuire il software, a condizione che la nota di copyright e questa autorizzazione
siano incluse; il software è fornito "così com'è", senza garanzie.
