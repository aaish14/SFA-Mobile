@echo off
setlocal
cd /d "%~dp0"

echo Installing backend dependencies...
pushd backend
call npm install --workspaces=false
if errorlevel 1 goto :failed
popd

echo Installing mobile dependencies...
pushd mobile
call npm install --workspaces=false
if errorlevel 1 goto :failed
popd

echo.
echo Installation completed. Double-click START-LOCAL-APP.cmd next.
pause
exit /b 0

:failed
echo.
echo Installation failed. Close any Node or Expo processes and try again.
pause
exit /b 1
