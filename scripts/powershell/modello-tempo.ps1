# ===================================================================
#  Installa il modello di "Analizza tempo" (Beat This!, CPJKU, MIT)
#  in src-tauri\models\, escluso da git come FFmpeg.
#  - Il file ONNX nasce da crates\beat-detect\tools\export_onnx.py,
#    che scarica il checkpoint ufficiale e ne verifica lo SHA-256
#  - Qui si controlla l'impronta del file ONNX gia' esportato
#  Dove prenderlo in un PC nuovo (download o installer) e' ancora da
#  decidere: per ora la copia viene da D:\sandbox\tempo-ref\models.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - modello del tempo'

$Name = 'beat_this-final0.onnx'
$Source = Join-Path 'D:\sandbox\tempo-ref\models' $Name
$Target = Join-Path $Repo "src-tauri\models\$Name"

if (-not (Test-Path $Source)) {
  Write-Host "Manca $Source." -ForegroundColor Red
  Write-Host 'Esportalo con: pwsh -File D:\sandbox\tempo-ref\run.ps1 crates\beat-detect\tools\export_onnx.py final0'
  exit 1
}
New-Item -ItemType Directory -Force (Split-Path $Target) | Out-Null
Copy-Item $Source $Target -Force
$hash = (Get-FileHash $Target -Algorithm SHA256).Hash.ToLower()
Write-Host "Modello installato: $Target"
Write-Host "SHA-256 $hash" -ForegroundColor Green
