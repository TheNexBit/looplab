@rem Double-click launcher: runs powershell\modello-tempo.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\modello-tempo.ps1" %*
@pause
