# Genera i campioni della voce che conta del metronomo con le voci di Windows:
#   it  "uno" ... "sedici" e le sillabe   (Microsoft Elsa)  -> src-tauri\voice\it
#   en  "one" ... "sixteen" e le sillabe  (Microsoft Zira)  -> src-tauri\voice\en
# Sillabe delle suddivisioni, come nel conteggio americano: ottavi "1 and", sedicesimi
# "1 e and a", terzine "1 trip let", quintine "1 e and a da", sestine "1 trip let and trip let".
# La voce italiana dice gli stessi suoni scritti all'italiana (e, i, a, da, tri, let).
# WAV 48 kHz, 16 bit, mono. Silenzi e volume li sistema il motore quando li carica.
# Va lanciato solo per rifare i campioni; quelli nel progetto bastano per compilare.
#   -Lingua it | en | tutte (predefinito)
param([ValidateSet('it', 'en', 'tutte')][string]$Lingua = 'tutte')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$languages = [ordered]@{
  it = @{
    Culture = 'it-IT'
    Words = [ordered]@{
      'and' = 'e'; 'e' = 'i'; 'a' = 'a'; 'da' = 'da'; 'trip' = 'tri'; 'let' = 'let'
      '01' = 'uno'; '02' = 'due'; '03' = 'tre'; '04' = 'quattro'
      '05' = 'cinque'; '06' = 'sei'; '07' = 'sette'; '08' = 'otto'
      '09' = 'nove'; '10' = 'dieci'; '11' = 'undici'; '12' = 'dodici'
      '13' = 'tredici'; '14' = 'quattordici'; '15' = 'quindici'; '16' = 'sedici'
    }
  }
  en = @{
    Culture = 'en-US'
    Words = [ordered]@{
      'and' = 'and'; 'e' = 'ee'; 'a' = 'uh'; 'da' = 'da'; 'trip' = 'trip'; 'let' = 'let'
      '01' = 'one'; '02' = 'two'; '03' = 'three'; '04' = 'four'
      '05' = 'five'; '06' = 'six'; '07' = 'seven'; '08' = 'eight'
      '09' = 'nine'; '10' = 'ten'; '11' = 'eleven'; '12' = 'twelve'
      '13' = 'thirteen'; '14' = 'fourteen'; '15' = 'fifteen'; '16' = 'sixteen'
    }
  }
}

# Toglie il silenzio prima e dopo la parola (resta un margine di 15 ms), cosi' i campioni
# incorporati nell'app pesano un quarto: il motore li rifinisce comunque quando li carica.
function Remove-Silence([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $at = 12
  while ($at + 8 -le $bytes.Length) {
    $id = [Text.Encoding]::ASCII.GetString($bytes, $at, 4)
    $size = [BitConverter]::ToInt32($bytes, $at + 4)
    if ($id -eq 'data') { break }
    $at += 8 + $size + ($size % 2)
  }
  $data = $at + 8
  $count = [int]([Math]::Min($size, $bytes.Length - $data) / 2)
  $loud = { param($i) [Math]::Abs([BitConverter]::ToInt16($bytes, $data + 2 * $i)) -gt 655 }
  $first = 0
  while ($first -lt $count -and -not (& $loud $first)) { $first++ }
  $last = $count - 1
  while ($last -gt $first -and -not (& $loud $last)) { $last-- }
  $margin = 720 # 15 ms a 48 kHz
  $from = [Math]::Max(0, $first - $margin)
  $to = [Math]::Min($count - 1, $last + $margin)
  $length = ($to - $from + 1) * 2
  $out = New-Object byte[] ($data + $length)
  [Array]::Copy($bytes, 0, $out, 0, $data)
  [Array]::Copy($bytes, $data + 2 * $from, $out, $data, $length)
  [BitConverter]::GetBytes([int]($out.Length - 8)).CopyTo($out, 4)
  [BitConverter]::GetBytes([int]$length).CopyTo($out, $at + 4)
  [IO.File]::WriteAllBytes($Path, $out)
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# Veloce e asciutta: a 240 BPM ogni parola ha un quarto di secondo
$synth.Rate = 3
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($code in $languages.Keys) {
  if ($Lingua -ne 'tutte' -and $Lingua -ne $code) { continue }
  $language = $languages[$code]
  $voice = $synth.GetInstalledVoices() |
    Where-Object { $_.VoiceInfo.Culture.Name -eq $language.Culture -and $_.Enabled } |
    Select-Object -First 1
  if (-not $voice) {
    throw "Nessuna voce $($language.Culture) installata (Impostazioni > Ora e lingua > Voce)."
  }
  $synth.SelectVoice($voice.VoiceInfo.Name)
  $out = Join-Path $root "src-tauri\voice\$code"
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  foreach ($name in $language.Words.Keys) {
    $synth.SetOutputToWaveFile((Join-Path $out "$name.wav"), $format)
    $synth.Speak($language.Words[$name])
    $synth.SetOutputToNull()
    Remove-Silence (Join-Path $out "$name.wav")
    Write-Host "  $code\$name.wav  ($($language.Words[$name]))"
  }
  Write-Host "Voce $code`: $($voice.VoiceInfo.Name) -> $out"
}
$synth.Dispose()
