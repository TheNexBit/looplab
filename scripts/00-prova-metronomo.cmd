@rem Copia di prova del metronomo (ramo "metronomo"): dati, porta 1422 e nome suoi, Looplab non viene toccato.
@pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0powershell\dev.ps1" %*
@if errorlevel 1 pause
