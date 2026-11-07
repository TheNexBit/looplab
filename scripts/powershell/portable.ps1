# ===================================================================
#  Versione portable, senza installer e senza password:
#  1. controlla FFmpeg e i test
#  2. compila in modalita' rilascio (alcuni minuti)
#  3. crea lo ZIP con Looplab.exe, FFmpeg, licenze e portable.txt
#  Chi lo usa estrae lo ZIP dove vuole (anche su una chiavetta): i dati
#  restano nella cartella "dati" accanto all'exe.
#  Questa copia non cerca aggiornamenti da sola (servirebbe la chiave di
#  firma): lo ZIP fatto da 04-build.cmd invece li segnala.
# ===================================================================
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\release-config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - portable'

Assert-Ffmpeg
Invoke-Step 'Controlli' { pwsh -NoProfile -File (Join-Path $PSScriptRoot 'test.ps1') }

$version = (Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json).version
$configFile = New-ReleaseConfig $false
Invoke-Step "Build $version" { npx tauri build --no-bundle --config $configFile }

$zip = New-PortableZip $version
Write-Host "`nVersione portable pronta:" -ForegroundColor Green
Write-Host "  $zip"
Start-Process explorer.exe "/select,`"$zip`""
