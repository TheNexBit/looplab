# Componenti di terze parti

Looplab usa questi componenti open source. Grazie ai loro autori.
Questo file è mostrato in "Informazioni" e incluso nell'installer.

## Inclusi nell'app

| Componente                      | Uso                            | Licenza               | Sito                                                     |
| ------------------------------- | ------------------------------ | --------------------- | -------------------------------------------------------- |
| FFmpeg 9.0 (build LGPL di BtbN) | audio dei video, proxy, export | LGPL 2.1 o successiva | https://ffmpeg.org                                       |
| Signalsmith Stretch 1.4.0       | velocità e tonalità            | MIT                   | https://github.com/Signalsmith-Audio/signalsmith-stretch |
| Signalsmith Linear 0.6.4        | FFT per Signalsmith Stretch    | MIT                   | https://github.com/Signalsmith-Audio/linear              |
| Symphonia                       | decodifica audio               | MPL 2.0               | https://github.com/pdeljanov/Symphonia                   |
| cpal                            | uscita audio                   | Apache 2.0            | https://github.com/RustAudio/cpal                        |
| rubato                          | conversione di frequenza       | MIT o Apache 2.0      | https://github.com/HEnquist/rubato                       |
| realfft, rustfft                | vista note (spettro)           | MIT o Apache 2.0      | https://github.com/HEnquist/realfft                      |
| rtrb                            | comunicazione col thread audio | MIT o Apache 2.0      | https://github.com/mgeier/rtrb                           |
| midir                           | pedali e controller MIDI       | MIT                   | https://github.com/Boddlnagg/midir                       |
| Tauri e i suoi plugin           | finestra dell'app              | MIT o Apache 2.0      | https://tauri.app                                        |
| tauri-specta, specta            | tipi condivisi Rust/TypeScript | MIT                   | https://github.com/specta-rs                             |
| serde, serde_json               | lettura e scrittura dei file   | MIT o Apache 2.0      | https://serde.rs                                         |
| React                           | interfaccia                    | MIT                   | https://react.dev                                        |
| Radix UI                        | componenti dell'interfaccia    | MIT                   | https://www.radix-ui.com                                 |
| Zustand                         | stato dell'interfaccia         | MIT                   | https://github.com/pmndrs/zustand                        |
| Motion                          | animazioni                     | MIT                   | https://motion.dev                                       |
| Lucide                          | icone                          | ISC                   | https://lucide.dev                                       |
| Tailwind CSS                    | stile                          | MIT                   | https://tailwindcss.com                                  |
| Inter (font)                    | testi                          | SIL OFL 1.1           | https://github.com/rsms/inter                            |
| JetBrains Mono (font)           | numeri e tempi                 | SIL OFL 1.1           | https://github.com/JetBrains/JetBrainsMono               |
| Fontsource                      | pacchetti dei font             | MIT                   | https://fontsource.org                                   |

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

## Font Inter e JetBrains Mono (SIL Open Font License 1.1)

Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter).
Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono).
I font sono inclusi senza modifiche e distribuiti con questa licenza:

```text
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
