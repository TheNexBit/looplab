@rem Double-click launcher: runs powershell\prova-stems.ps1 and pauses on error.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\prova-stems.ps1" %*
@if errorlevel 1 pause
