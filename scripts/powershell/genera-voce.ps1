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
    Write-Host "  $code\$name.wav  ($($language.Words[$name]))"
  }
  Write-Host "Voce $code`: $($voice.VoiceInfo.Name) -> $out"
}
$synth.Dispose()
