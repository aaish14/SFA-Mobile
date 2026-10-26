@echo off
setlocal
if not exist "%~dp0.runtime" mkdir "%~dp0.runtime"
if not exist "%~dp0.runtime" (
  echo Cannot create the DMS startup log folder. Check folder access.
  pause
  exit /b 1
)
echo Starting DMS. Please keep this window open while Salesforce and the application are checked.
echo Startup output is saved to %~dp0.runtime\startup-last.log
powershell.exe -NoProfile -File "%~dp0Start-DmsLocal.ps1" > "%~dp0.runtime\startup-last.log" 2>&1
if errorlevel 1 (
  type "%~dp0.runtime\startup-last.log"
  echo DMS did not finish starting. Review the error above.
  pause
  exit /b 1
)
type "%~dp0.runtime\startup-last.log"
start "" "http://localhost:8082/"
