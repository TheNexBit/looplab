# ===================================================================
#  Scarica FFmpeg (build LGPL, statica) in D:\tools\ffmpeg e ne copia
#  l'eseguibile in src-tauri\binaries\ come sidecar di Tauri.
#  - Fonte: https://github.com/BtbN/FFmpeg-Builds (serie stabile 9.0)
#  - Verifica l'impronta SHA-256 pubblicata insieme al file
#  - Una sola copia sul PC; quella nel progetto e' esclusa da git
#  Rilancialo per aggiornare FFmpeg all'ultima versione 9.0.x.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - scarica FFmpeg'

$Asset = 'ffmpeg-n9.0-latest-win64-lgpl-9.0'
$BaseUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest'
$Tools = 'D:\tools\ffmpeg'
$Download = Join-Path $Tools 'download'
$Sidecar = Join-Path $Repo 'src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe'

New-Item -ItemType Directory -Force $Download | Out-Null
$zip = Join-Path $Download "$Asset.zip"

Write-Host "Scarico $Asset.zip (circa 160 MB)..."
$ProgressPreference = 'SilentlyContinue'   # the progress bar makes Invoke-WebRequest very slow
Invoke-WebRequest "$BaseUrl/$Asset.zip" -OutFile $zip
$response = Invoke-WebRequest "$BaseUrl/checksums.sha256"
# GitHub serves it as binary data: turn the bytes into text
$sums = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }

Write-Host 'Verifico l''impronta SHA-256...'
$expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape("$Asset.zip") } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash
if (-not $expected -or $expected.ToUpper() -ne $actual) {
    Remove-Item $zip -Force
    Write-Host "[ERRORE] Impronta diversa da quella pubblicata ($expected): file cancellato." -ForegroundColor Red
    exit 1
}

Write-Host 'Estraggo...'
$unpacked = Join-Path $Download $Asset
if (Test-Path $unpacked) { Remove-Item -Recurse -Force $unpacked }
Expand-Archive $zip $Download
foreach ($folder in 'bin', 'doc', 'include', 'lib') {
    $target = Join-Path $Tools $folder
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
}
foreach ($item in Get-ChildItem $unpacked) { Move-Item $item.FullName $Tools -Force }
Remove-Item -Recurse -Force $unpacked
Remove-Item $zip -Force
Set-Content (Join-Path $Tools 'VERSION.txt') "$Asset`nSHA-256 $actual`n$(Get-Date -Format s)"

New-Item -ItemType Directory -Force (Split-Path $Sidecar) | Out-Null
Copy-Item (Join-Path $Tools 'bin\ffmpeg.exe') $Sidecar -Force

Write-Host "`nFFmpeg pronto:" -ForegroundColor Green
& $Sidecar -hide_banner -version | Select-Object -First 1
