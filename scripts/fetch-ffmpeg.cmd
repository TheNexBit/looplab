@rem Double-click launcher: runs the PowerShell script with the same name and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dpn0.ps1" %*
@pause
