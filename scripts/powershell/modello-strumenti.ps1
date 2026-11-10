# ===================================================================
#  Installa il modello di "Separa strumenti" (HTDemucs a 6 tracce,
#  Demucs 4.1) in src-tauri\models\, escluso da git come FFmpeg.
#  - Il file ONNX nasce da crates\stem-split\tools\export_demucs.py
#  - Licenza dei pesi NON chiara (vedi docs\ROADMAP.md, fase 18):
#    va bene per sviluppo e uso personale, non per pubblicare
#  Per ora la copia viene da D:\sandbox\tempo-ref\models.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - modello degli strumenti'

$Name = 'htdemucs_6s.onnx'
$Source = Join-Path 'D:\sandbox\tempo-ref\models' $Name
$Target = Join-Path $Repo "src-tauri\models\$Name"

if (-not (Test-Path $Source)) {
  Write-Host "Manca $Source." -ForegroundColor Red
  Write-Host 'Esportalo con: pwsh -File D:\sandbox\tempo-ref\run.ps1 crates\stem-split\tools\export_demucs.py'
  exit 1
}
New-Item -ItemType Directory -Force (Split-Path $Target) | Out-Null
Copy-Item $Source $Target -Force
$hash = (Get-FileHash $Target -Algorithm SHA256).Hash.ToLower()
Write-Host "Modello installato: $Target"
Write-Host "SHA-256 $hash" -ForegroundColor Green
