$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendFolder = Join-Path $projectRoot "backend"
$mobileFolder = Join-Path $projectRoot "mobile"
$logFolder = Join-Path $projectRoot "local-logs"

function Ensure-Dependencies {
    param([string]$ProjectFolder)
    if (-not (Test-Path (Join-Path $ProjectFolder "node_modules"))) {
        Write-Host "Installing dependencies in $ProjectFolder..."
        npm install --prefix $ProjectFolder
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed in $ProjectFolder." }
    }
}

function Start-LocalService {
    param([string]$ServiceName, [string]$WorkingFolder, [string[]]$Arguments)
    $standardOutput = Join-Path $logFolder "$ServiceName-output.log"
    $standardError = Join-Path $logFolder "$ServiceName-error.log"
    Start-Process -FilePath "node.exe" -ArgumentList $Arguments -WorkingDirectory $WorkingFolder `
        -RedirectStandardOutput $standardOutput -RedirectStandardError $standardError `
        -WindowStyle Hidden | Out-Null
}

Ensure-Dependencies -ProjectFolder $backendFolder
Ensure-Dependencies -ProjectFolder $mobileFolder

Write-Host "Building the Salesforce integration API..."
npm run build --prefix $backendFolder
if ($LASTEXITCODE -ne 0) { throw "The backend build failed." }

Write-Host "Building the web application..."
Push-Location $mobileFolder
try {
    npx expo export --platform web
    if ($LASTEXITCODE -ne 0) { throw "The web build failed." }
} finally {
    Pop-Location
}

& (Join-Path $projectRoot "Stop-Localhost.ps1")
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
Start-LocalService -ServiceName "backend" -WorkingFolder $projectRoot -Arguments @("backend/dist/server.js")
Start-LocalService -ServiceName "website" -WorkingFolder $projectRoot -Arguments @("Local-Web-Server.cjs")

Write-Host "Local application started."
Write-Host "Website: http://localhost:8081"
Write-Host "API:     http://localhost:4000/api"
