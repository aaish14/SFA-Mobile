@echo off
setlocal
echo Restarting only DMS with the corrected Salesforce connection. SFA stays running.
powershell.exe -NoProfile -File "%~dp0Start-DmsLocal.ps1" -RestartBackend
if errorlevel 1 (
  echo Restart failed. Please share the error displayed above.
  pause
  exit /b 1
)
start "" "http://localhost:8082/"
pause
