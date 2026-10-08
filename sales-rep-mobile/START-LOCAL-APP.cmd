@echo off
setlocal
cd /d "%~dp0"

echo Starting the standalone SFA API on http://localhost:4000...
start "SFA API" cmd /k "cd /d ""%~dp0backend"" && npm run dev"

echo Starting the standalone mobile web app on http://localhost:8081...
start "SFA Mobile" cmd /k "cd /d ""%~dp0mobile"" && set EXPO_PUBLIC_API_URL=http://localhost:4000/api&&npm run web"

echo.
echo The app is separate from Salesforce.
echo Salesforce is used only through the backend API.
echo Open http://localhost:8081 after Metro finishes loading.
endlocal
