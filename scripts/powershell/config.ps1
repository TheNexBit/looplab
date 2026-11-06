# ===================================================================
#  Shared by every Looplab script: paths, tool checks, first-time setup.
#  Use it at the top of a script with:  . "$PSScriptRoot\config.ps1"
#  If something changes on the PC (tools, folders) fix it here.
# ===================================================================
$ErrorActionPreference = 'Stop'

# Repository root (two folders above: scriptspowershell)
$Repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

# Dev data folder: read from .cargo/config.toml so the path exists in one place only
$cargoConfig = Get-Content (Join-Path $Repo '.cargo\config.toml') -Raw
if ($cargoConfig -notmatch 'LOOPLAB_DEV_DATA_DIR\s*=\s*"([^"]+)"') {
    Write-Host '[ERRORE] LOOPLAB_DEV_DATA_DIR non trovato in .cargo\config.toml' -ForegroundColor Red
    exit 1
}
$DevData = $Matches[1] -replace '\\\\', '\'

foreach ($tool in 'node', 'npm', 'cargo') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "[ERRORE] $tool non trovato nel PATH." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path (Join-Path $Repo 'node_modules\.bin\tauri.cmd'))) {
    Write-Host 'Dipendenze mancanti: eseguo npm ci (solo la prima volta)...'
    Push-Location $Repo
    npm ci --no-audit --no-fund
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) {
        Write-Host '[ERRORE] npm ci fallito: leggi i messaggi sopra.' -ForegroundColor Red
        exit 1
    }
}

# Runs a native command from the repo root; stops the script if it fails.
function Invoke-Step([string]$Title, [scriptblock]$Command) {
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
    Push-Location $Repo
    try { & $Command } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRORE] $Title fallito: leggi i messaggi sopra." -ForegroundColor Red
        exit 1
    }
}
