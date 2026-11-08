@rem Rifa i campioni della voce che conta del metronomo con la voce italiana di Windows (servono solo per rigenerarli).
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\genera-voce.ps1" %*
@if errorlevel 1 pause
