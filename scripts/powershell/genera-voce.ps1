# Genera i campioni della voce che conta del metronomo ("uno" ... "sedici" ed "e") con la
# voce italiana di Windows (Microsoft Elsa). WAV 48 kHz, 16 bit, mono in src-tauri\voice\it.
# Silenzi e volume li sistema il motore quando li carica: qui solo la registrazione.
# Va lanciato solo per rifare i campioni; quelli nel progetto bastano per compilare.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $root 'src-tauri\voice\it'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$words = [ordered]@{
  'e' = 'e'
  '01' = 'uno'; '02' = 'due'; '03' = 'tre'; '04' = 'quattro'
  '05' = 'cinque'; '06' = 'sei'; '07' = 'sette'; '08' = 'otto'
  '09' = 'nove'; '10' = 'dieci'; '11' = 'undici'; '12' = 'dodici'
  '13' = 'tredici'; '14' = 'quattordici'; '15' = 'quindici'; '16' = 'sedici'
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() |
  Where-Object { $_.VoiceInfo.Culture.Name -eq 'it-IT' -and $_.Enabled } |
  Select-Object -First 1
if (-not $voice) { throw 'Nessuna voce italiana installata (Impostazioni > Ora e lingua > Voce).' }
$synth.SelectVoice($voice.VoiceInfo.Name)
# Veloce e asciutta: a 240 BPM ogni parola ha un quarto di secondo
$synth.Rate = 3
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($name in $words.Keys) {
  $file = Join-Path $out "$name.wav"
  $synth.SetOutputToWaveFile($file, $format)
  $synth.Speak($words[$name])
  $synth.SetOutputToNull()
  Write-Host "  $name.wav  ($($words[$name]))"
}
$synth.Dispose()
Write-Host "Voce: $($voice.VoiceInfo.Name) -> $out"
