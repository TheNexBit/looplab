# ===================================================================
#  Crea la chiave che firma gli aggiornamenti (una volta sola).
#  - Va in D:\.config\tauri\looplab.key (mai nel progetto, mai su C:\)
#  - Tauri ti chiede una password: sceglila e conservala bene,
#    servira' a ogni build ufficiale
#  - Se perdi chiave o password, gli utenti non potranno piu' ricevere
#    aggiornamenti automatici: fai una copia di sicurezza della cartella
# ===================================================================
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\release-config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - genera chiave'

if (Test-Path $PrivateKey) {
    Write-Host "La chiave esiste gia': $PrivateKey" -ForegroundColor Yellow
    Write-Host 'Non la ricreo: una chiave nuova renderebbe impossibili gli aggiornamenti delle versioni gia'' installate.'
    exit 0
}
New-Item -ItemType Directory -Force $KeyDir | Out-Null
Invoke-Step 'Generazione chiave' { npx tauri signer generate -w $PrivateKey }
Write-Host "`nChiave privata: $PrivateKey" -ForegroundColor Green
Write-Host "Chiave pubblica: $PublicKey"
