@rem Copia di prova di archivio e backup (ramo "archivio", con la separazione degli strumenti): dati, porta 1423 e nome suoi, Looplab non viene toccato.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\dev.ps1" %*
@if errorlevel 1 pause
