# ===================================================================
#  Sviluppo: avvia Looplab dai sorgenti (tauri dev).
#  - modifichi src\        -> la finestra si aggiorna da sola
#  - modifichi il Rust     -> l'app si ricompila e si riavvia da sola
#  - F12 nella finestra apre i DevTools
#  Impostazioni e cache vanno nella cartella dati di sviluppo su D:\,
#  mai in AppData su C:\. Per terminare chiudi la finestra (o Ctrl+C).
#  La prima compilazione Rust richiede qualche minuto, le successive no.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - dev'

Write-Host 'Avvio Looplab in modalita sviluppo...'
Write-Host "Dati di sviluppo: $DevData"
Invoke-Step 'tauri dev' { npm run app }
