@rem Copia di prova della separazione degli strumenti (ramo "stems"): dati, porta 1423 e nome suoi, Looplab non viene toccato.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\dev.ps1" %*
@if errorlevel 1 pause
