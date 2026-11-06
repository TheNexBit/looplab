# ===================================================================
#  Cancella le cartelle generate da Looplab:
#  - dist                 interfaccia compilata (si rigenera da sola)
#  - dati di sviluppo     impostazioni, cache e profilo WebView2 di prova
#  - dati di prova build  quelli usati da 03-prova-build.cmd
#  Sorgenti, node_modules e la cache Rust condivisa NON vengono toccati.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - pulisci'

$targets = @((Join-Path $Repo 'dist'), $DevData, 'D:\.cache\looplab\build-data') | Where-Object { Test-Path $_ }
if ($targets.Count -eq 0) {
    Write-Host 'Niente da cancellare.'
    exit 0
}

Write-Host 'Verranno cancellate:'
$targets | ForEach-Object { Write-Host "  $_" }
if ((Read-Host 'Confermi? (s/n)') -ne 's') { exit 0 }

$failed = $false
foreach ($dir in $targets) {
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    if (Test-Path $dir) {
        Write-Host "[ERRORE] $dir non cancellata del tutto: chiudi Looplab e riprova." -ForegroundColor Red
        $failed = $true
    } else {
        Write-Host "Cancellata $dir"
    }
}
if ($failed) { exit 1 }
Write-Host 'Fatto.'
