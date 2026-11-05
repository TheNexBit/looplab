# ===================================================================
#  Prova dell'app compilata PRIMA della build ufficiale:
#  1. compila in modalita' rilascio senza installer (piu' veloce)
#  2. apre looplab.exe con dati di prova in D:\.cache\looplab\build-data
#  Serve a scoprire problemi che dai sorgenti non si vedono
#  (FFmpeg mancante nel pacchetto, prestazioni reali, avvio...).
#  Non servono la chiave di firma ne' NSIS.
# ===================================================================
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\release-config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - prova build'

Assert-Ffmpeg
$configFile = New-ReleaseConfig $false
Invoke-Step 'Compilazione di prova' { npx tauri build --no-bundle --config $configFile }

$env:LOOPLAB_DATA_DIR = 'D:\.cache\looplab\build-data'
$exe = Join-Path $ReleaseDir 'looplab.exe'
Write-Host "`nAvvio $exe"
Write-Host "Dati di prova: $env:LOOPLAB_DATA_DIR"
Write-Host 'Chiudi l''app per terminare.'
& $exe
