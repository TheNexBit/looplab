@rem Double-click launcher: runs powershell\pulisci.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\pulisci.ps1" %*
@pause
