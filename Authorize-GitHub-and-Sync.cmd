@echo off
setlocal
cd /d "%~dp0"

set "GH_EXE=%~dp0work\gh-cli\bin\gh.exe"

if not exist "%GH_EXE%" (
    echo GitHub CLI was not found in the project tools folder.
    pause
    exit /b 1
)

echo Starting secure GitHub authorization for aaish14...
echo Y| "%GH_EXE%" auth login --hostname github.com --git-protocol https --web
if errorlevel 1 (
    echo GitHub authorization was not completed.
    pause
    exit /b 1
)

"%GH_EXE%" auth setup-git
git config core.longpaths true
git config http.sslBackend openssl

echo Pushing the complete SFA project to GitHub...
git push origin main
if errorlevel 1 (
    echo The GitHub push failed. No Salesforce files were deleted.
    pause
    exit /b 1
)

echo Enabling automatic Salesforce-to-GitHub synchronization every 15 minutes...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-auto-sync.ps1" -Minutes 15

echo.
echo GitHub synchronization is configured successfully.
pause
