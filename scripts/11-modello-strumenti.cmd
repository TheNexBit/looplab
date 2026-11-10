@rem Double-click launcher: runs powershell\modello-strumenti.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\modello-strumenti.ps1" %*
@pause
