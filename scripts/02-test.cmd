@rem Double-click launcher: runs powershell\test.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\test.ps1" %*
@pause
