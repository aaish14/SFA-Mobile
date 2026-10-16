@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%Build-And-Start-Localhost.ps1"
if errorlevel 1 (
  echo The localhost application could not be started. Review the message above.
  pause
  exit /b 1
)
start "" "http://localhost:8081"
exit /b 0
