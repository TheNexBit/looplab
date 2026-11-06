@rem Double-click launcher: runs powershell\fetch-ffmpeg.ps1 and pauses at the end.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\fetch-ffmpeg.ps1" %*
@pause
