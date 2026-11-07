@rem Double-click launcher: runs powershell\portable.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\portable.ps1" %*
@pause
