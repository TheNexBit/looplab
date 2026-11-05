# ===================================================================
#  Build ufficiale per Windows: installer NSIS firmato per gli aggiornamenti.
#  1. controlla FFmpeg, chiave di firma e i test
#  2. compila in modalita' rilascio (alcuni minuti)
#  3. scrive latest.json per l'aggiornamento automatico
#  Il risultato resta nella cache Rust (D:\.cache\cargo-target), fuori dal
#  progetto. La versione e' quella di package.json: aggiornala prima.
#  Prima prova l'app con prova-build.cmd.
# ===================================================================
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\release-config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - build'

Assert-Ffmpeg
if (-not (Test-Path $PrivateKey)) {
    Write-Host '[ERRORE] Chiave di firma mancante: esegui prima scripts\genera-chiave.cmd' -ForegroundColor Red
    exit 1
}
Confirm-NsisOnDevDrive

Invoke-Step 'Controlli' { pwsh -NoProfile -File (Join-Path $PSScriptRoot 'test.ps1') }

$version = (Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json).version
$configFile = New-ReleaseConfig $true
$password = Read-Host 'Password della chiave di firma' -AsSecureString

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $PrivateKey -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', $password).Password
try {
    Invoke-Step "Build $version" { npx tauri build --config $configFile }
} finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$nsis = Join-Path $ReleaseDir 'bundle\nsis'
$installer = Get-ChildItem $nsis -Filter "*_${version}_x64-setup.exe" | Select-Object -First 1
$signature = Get-Content "$($installer.FullName).sig" -Raw
$latest = [ordered]@{
    version   = $version
    notes     = "Looplab $version"
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            signature = $signature.Trim()
            url       = "https://github.com/TheNexBit/Looplab/releases/download/v$version/$($installer.Name)"
        }
    }
}
$latest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $nsis 'latest.json')

Write-Host "`nBuild completata in $nsis :" -ForegroundColor Green
Get-ChildItem $nsis -Filter "*$version*" | ForEach-Object { "  $($_.Name)" }
Write-Host '  latest.json'
Write-Host "Per pubblicare: crea la release v$version su GitHub e allega installer, .sig e latest.json."
