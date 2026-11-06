@rem Double-click launcher: runs powershell\genera-chiave.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\genera-chiave.ps1" %*
@pause
