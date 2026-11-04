@rem Double-click launcher: runs the PowerShell script with the same name and pauses on error.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dpn0.ps1" %*
@if errorlevel 1 pause
