@rem Double-click launcher: runs powershell\dev.ps1 and pauses on error.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\dev.ps1" %*
@if errorlevel 1 pause
