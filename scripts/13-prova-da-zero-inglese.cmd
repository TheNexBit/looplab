@rem Double-click launcher: runs powershell\prova-da-zero.ps1 as on an English Windows and pauses on error.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\prova-da-zero.ps1" -Lingua en %*
@if errorlevel 1 pause
