@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "RUNTIME_ROOT=C:\Users\aishw\Documents\Codex\sfa-mobile-local"

if not exist "%RUNTIME_ROOT%\backend\node_modules\tsx\dist\cli.mjs" goto :runtime_missing
if not exist "%RUNTIME_ROOT%\mobile\node_modules\expo\bin\cli" goto :runtime_missing

echo Updating the runnable copy with the latest project source...
xcopy "%PROJECT_ROOT%backend\src\*" "%RUNTIME_ROOT%\backend\src\" /E /I /Y /Q >nul
xcopy "%PROJECT_ROOT%mobile\src\*" "%RUNTIME_ROOT%\mobile\src\" /E /I /Y /Q >nul
copy /Y "%PROJECT_ROOT%mobile\App.tsx" "%RUNTIME_ROOT%\mobile\App.tsx" >nul

echo Starting the Salesforce integration API on http://localhost:4000...
start "SFA API - keep open" /D "%RUNTIME_ROOT%\backend" cmd /k "node node_modules\tsx\dist\cli.mjs watch src\server.ts"

echo Starting the external mobile application on http://localhost:8081...
start "SFA Mobile - keep open" /D "%RUNTIME_ROOT%\mobile" cmd /k "set EXPO_PUBLIC_API_URL=http://localhost:4000/api&& node node_modules\expo\bin\cli start --web --port 8081 --offline"

echo.
echo Wait until the mobile window says: Web is waiting on http://localhost:8081
echo Then open or refresh http://localhost:8081 in Microsoft Edge.
echo Keep both SFA command windows open while using the application.
ping 127.0.0.1 -n 9 >nul
start "" "http://localhost:8081"
exit /b 0

:runtime_missing
echo The installed local runtime is missing.
echo Run INSTALL-DEPENDENCIES.cmd or ask Codex to restore the runtime.
pause
exit /b 1
