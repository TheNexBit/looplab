# ===================================================================
#  Parti comuni a build.ps1 e prova-build.ps1 (non si lancia da solo).
#  Scrive la configurazione aggiuntiva della build di rilascio nella
#  cartella della cache Rust, fuori dal progetto, e la passa a Tauri.
# ===================================================================

$KeyDir = 'D:\.config\tauri'
$PrivateKey = Join-Path $KeyDir 'looplab.key'
$PublicKey = "$PrivateKey.pub"
$Binaries = Join-Path $Repo 'src-tauri\binaries'
$Sidecar = Join-Path $Binaries 'ffmpeg-x86_64-pc-windows-msvc.exe'
$ReleaseDir = Join-Path $env:CARGO_TARGET_DIR 'release'
# GitHub address of the releases the updater reads (the repository must allow public downloads)
$UpdateFeed = 'https://github.com/TheNexBit/Looplab/releases/latest/download/latest.json'

function Assert-Ffmpeg {
    if (-not (Test-Path $Sidecar)) {
        Write-Host '[ERRORE] FFmpeg manca: esegui prima scripts\05-fetch-ffmpeg.cmd' -ForegroundColor Red
        exit 1
    }
}

# Tauri always downloads NSIS into %LOCALAPPDATA%\tauri (no option to move it).
# Offer a junction to the Dev Drive, so only a link stays on C:\.
function Confirm-NsisOnDevDrive {
    $tauriHome = Join-Path $env:LOCALAPPDATA 'tauri'
    $target = 'D:\.cache\tauri'
    $item = Get-Item $tauriHome -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq 'Junction') { return }
    if ($item) {
        Write-Host "[ATTENZIONE] $tauriHome esiste gia' come cartella normale su C:\." -ForegroundColor Yellow
        return
    }
    Write-Host "Tauri scarichera' NSIS (lo strumento che crea l'installer) in $tauriHome."
    if ((Read-Host "Creo li' un collegamento verso $target, cosi' i file restano su D:\? (s/n)") -eq 's') {
        New-Item -ItemType Directory -Force $target | Out-Null
        New-Item -ItemType Junction -Path $tauriHome -Target $target | Out-Null
        Write-Host "Collegamento creato: $tauriHome -> $target"
    }
}

# Extra Tauri config for release builds; returns the path of the generated file.
function New-ReleaseConfig([bool]$WithUpdater) {
    $config = [ordered]@{
        bundle = [ordered]@{
            externalBin = @('binaries/ffmpeg')
            resources   = [ordered]@{
                '../docs/THIRD_PARTY_LICENSES.md' = 'THIRD_PARTY_LICENSES.md'
                'binaries/FFMPEG-LICENSE.txt'     = 'FFMPEG-LICENSE.txt'
            }
            windows     = [ordered]@{ nsis = [ordered]@{ installMode = 'currentUser'; languages = @('Italian', 'English') } }
        }
    }
    if ($WithUpdater) {
        $config.bundle.createUpdaterArtifacts = $true
        $config.plugins = [ordered]@{
            updater = [ordered]@{
                pubkey    = (Get-Content $PublicKey -Raw).Trim()
                endpoints = @($UpdateFeed)
                windows   = [ordered]@{ installMode = 'passive' }
            }
        }
    }
    $dir = Join-Path $env:CARGO_TARGET_DIR 'looplab'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $file = Join-Path $dir 'release.conf.json'
    $config | ConvertTo-Json -Depth 10 | Set-Content $file
    return $file
}
