# ===================================================================
#  Prova della fase 30 (Setlist e Live mode), dal ramo fase-30.
#  - usa una COPIA dei tuoi dati di sviluppo (libreria, spartiti, suoni)
#    in D:\.cache\looplab\prova-setlist: la libreria passa al formato
#    nuovo solo nella copia, i dati veri non vengono toccati
#  - la copia resta tra un avvio e l'altro; -DaCapo la rifà da zero
#  - va tolto (con la cartella) quando la fase 30 entra in main
#  Chiudi prima ogni Looplab aperto: le copie usano lo stesso programma.
# ===================================================================
param([switch]$DaCapo)
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - prova Setlist (fase 30)'

if (Get-Process looplab -ErrorAction SilentlyContinue) {
    Write-Host '[ERRORE] Looplab e'' gia'' aperto: chiudilo e riprova.' -ForegroundColor Red
    exit 1
}

$Source = 'D:\.cache\looplab\dev-data'
$Trial = 'D:\.cache\looplab\prova-setlist'
if ($DaCapo -and (Test-Path $Trial)) { Remove-Item $Trial -Recurse -Force }
if (-not (Test-Path $Trial)) {
    New-Item -ItemType Directory -Path $Trial | Out-Null
    foreach ($item in 'libreria.db', 'windows.json', 'spartiti', 'suoni') {
        $from = Join-Path $Source $item
        if (Test-Path $from) { Copy-Item $from -Destination $Trial -Recurse }
    }
    Write-Host "Copia dei dati pronta: $Trial"
}

$env:LOOPLAB_DATA_DIR = $Trial
Write-Host 'Avvio Looplab (fase 30) con la copia dei dati...'
Invoke-Step 'tauri dev (prova Setlist)' { npm run app }
