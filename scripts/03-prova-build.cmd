@rem Double-click launcher: runs powershell\prova-build.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\prova-build.ps1" %*
@pause
