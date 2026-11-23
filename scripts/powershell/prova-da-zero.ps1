# ===================================================================
#  Prova da zero: avvia Looplab dai sorgenti come lo vedrebbe una
#  persona che lo apre per la prima volta.
#  - usa una cartella dati vuota (D:\.cache\looplab\prova-da-zero),
#    svuotata all'avvio e cancellata alla chiusura dell'app
#  - i tuoi dati di sviluppo (corsi, brani, impostazioni) non vengono toccati
#  Chiudi prima ogni Looplab aperto: le due copie usano lo stesso programma.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - prova da zero'

if (Get-Process looplab -ErrorAction SilentlyContinue) {
    Write-Host '[ERRORE] Looplab e'' gia'' aperto: chiudilo e riprova.' -ForegroundColor Red
    exit 1
}

$Fresh = 'D:\.cache\looplab\prova-da-zero'
if (Test-Path $Fresh) { Remove-Item $Fresh -Recurse -Force }
New-Item -ItemType Directory -Path $Fresh | Out-Null

$env:LOOPLAB_DATA_DIR = $Fresh
Write-Host 'Avvio Looplab come alla prima apertura...'
Write-Host "Dati temporanei: $Fresh (cancellati alla chiusura)"
try {
    Invoke-Step 'tauri dev (prova da zero)' { npm run app }
} finally {
    Remove-Item $Fresh -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Dati temporanei cancellati.'
}
