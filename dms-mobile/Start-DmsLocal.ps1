# Starts only DMS. Does not stop, restart or reconfigure SFA on 4000/8081.
[CmdletBinding()]
param([string]$SalesforceOrg = 'sfaNewOrg', [switch]$RestartBackend,
    [switch]$SkipSalesforceCheck, [switch]$UseExistingBuild)
$ErrorActionPreference = 'Stop'
$dmsFolder = $PSScriptRoot
$projectFolder = Split-Path -Parent $dmsFolder
$backendFolder = Join-Path $projectFolder 'sales-rep-mobile/backend'
$runtimeFolder = Join-Path $dmsFolder '.runtime'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$null = Get-Command npm.cmd -ErrorAction Stop
$salesforceCli = (Get-Command sf.cmd -ErrorAction Stop).Source

function Get-Listener([int]$Port) {
    @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-ForHttp([string]$Url, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    throw "Service did not become ready: $Url. Check logs in $runtimeFolder."
}

$backendRunning = (Get-Listener 4001).Count -gt 0
$webRunning = (Get-Listener 8082).Count -gt 0
# Never kill an arbitrary process occupying a port. Reuse only processes this
# launcher previously recorded, otherwise ask the user to inspect the conflict.
foreach ($service in @(@{Port=4001; Name='backend'}, @{Port=8082; Name='web'})) {
    $listeners = @(Get-Listener $service.Port)
    if ($listeners.Count -eq 0) { continue }
    $pidFile = Join-Path $runtimeFolder ($service.Name + '.pid')
    if (-not (Test-Path -LiteralPath $pidFile)) {
        throw "Port $($service.Port) is already in use. Inspect that service before starting DMS; no process was stopped."
    }
    $recorded = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $running = Get-Process -Id $recorded.Id -ErrorAction Stop
    if ($running.StartTime.ToUniversalTime().Ticks.ToString() -ne $recorded.StartTicks -or
        @($listeners.OwningProcess | Select-Object -Unique).Count -ne 1 -or
        $listeners[0].OwningProcess -ne $recorded.Id) {
        throw "Port $($service.Port) belongs to a different process. No process was stopped."
    }
}

if (-not $SkipSalesforceCheck) {
Write-Host 'Checking the saved Salesforce login (no access tokens are displayed)...'
# Use the native Windows launcher and the CLI's structured result. A shell's
# inherited exit-code variable is not evidence that Salesforce rejected login.
$sfOutput = & $salesforceCli data query --target-org $SalesforceOrg --query 'SELECT Id FROM DMS_Distributor__c LIMIT 1' --json
try { $sfCheck = ($sfOutput -join [Environment]::NewLine) | ConvertFrom-Json }
catch { throw 'Salesforce CLI did not return a readable result. Check the CLI installation and retry.' }
if ($null -eq $sfCheck -or $null -eq $sfCheck.status -or $sfCheck.status -ne 0) {
    $sfMessage = if ($sfCheck.message) { [string]$sfCheck.message } else { 'No successful query result was returned.' }
    throw "Salesforce check failed for $SalesforceOrg. $sfMessage"
}
Write-Host 'Salesforce connection verified.'
} else {
    Write-Host 'Starting the local portal without requiring an online Salesforce connection. Live data still requires internet and valid Salesforce authentication.'
}

New-Item -ItemType Directory -Path $runtimeFolder -Force | Out-Null
# Windows encrypts this signing secret for the current Windows account. It stays
# stable between starts; it is not committed, printed or copied into the app.
$secretPath = Join-Path $runtimeFolder 'session-secret.dpapi'
if (-not (Test-Path -LiteralPath $secretPath)) {
    $randomBytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $secureSecret = ConvertTo-SecureString ([Convert]::ToBase64String($randomBytes)) -AsPlainText -Force
    $encryptedSecret = ConvertFrom-SecureString $secureSecret
    [IO.File]::WriteAllText($secretPath, $encryptedSecret)
}
$secureSecret = ConvertTo-SecureString (Get-Content -LiteralPath $secretPath -Raw)
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try { $env:JWT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
$env:PORT = '4001'
$env:USE_MOCK_DATA = 'false'
$env:AUTH_ALLOW_TEST_CODE = 'false'
$env:SALESFORCE_ORG_ALIAS = $SalesforceOrg
$env:APP_PUBLIC_URL = 'http://localhost:8082'
$env:EXPO_PUBLIC_API_URL = 'http://localhost:4001/api'

function Start-DmsProcess([string]$Name, [string]$Folder, [string[]]$NodeArguments) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $process = Start-Process -FilePath $nodePath -ArgumentList $NodeArguments -WorkingDirectory $Folder -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtimeFolder "$Name-$stamp.out.log") `
        -RedirectStandardError (Join-Path $runtimeFolder "$Name-$stamp.err.log")
    $record = @{Id=$process.Id; StartTicks=$process.StartTime.ToUniversalTime().Ticks.ToString()}
    [IO.File]::WriteAllText((Join-Path $runtimeFolder "$Name.pid"), ($record | ConvertTo-Json))
}

if (-not $backendRunning -or $RestartBackend) {
    Push-Location $backendFolder
    try {
        if (-not (Test-Path 'node_modules/typescript')) {
            & npm.cmd ci --workspaces=false --include=dev
            if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
        }
        if (-not $UseExistingBuild -or -not (Test-Path 'dist/server.js')) {
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
        }
    } finally { Pop-Location }
    if ($backendRunning) {
        # Recheck ownership immediately before stopping only this launcher's DMS backend.
        $recordedBackend = Get-Content -LiteralPath (Join-Path $runtimeFolder 'backend.pid') -Raw | ConvertFrom-Json
        $backendProcess = Get-Process -Id $recordedBackend.Id -ErrorAction Stop
        $backendListeners = @(Get-Listener 4001)
        if ($backendProcess.StartTime.ToUniversalTime().Ticks.ToString() -ne $recordedBackend.StartTicks -or
            $backendListeners.Count -eq 0 -or
            @($backendListeners | Where-Object { $_.OwningProcess -ne $recordedBackend.Id }).Count -gt 0) {
            throw 'DMS backend ownership changed. Nothing was stopped.'
        }
        Stop-Process -InputObject $backendProcess -ErrorAction Stop
        Wait-Process -Id $recordedBackend.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    Start-DmsProcess 'backend' $backendFolder @('dist/server.js')
}
Wait-ForHttp 'http://localhost:4001/api/health'
$health = Invoke-RestMethod 'http://localhost:4001/api/health' -TimeoutSec 5
if (-not $health.success -or $health.data.mockMode -ne $false) { throw 'DMS backend is not in live Salesforce mode.' }

if (-not $webRunning) {
    Push-Location $dmsFolder
    try {
        if (-not (Test-Path 'node_modules/expo/bin/cli')) {
            & npm.cmd ci --include=dev
            if ($LASTEXITCODE -ne 0) { throw 'DMS web dependency installation failed.' }
        }
    } finally { Pop-Location }
    Start-DmsProcess 'web' $dmsFolder @('node_modules/expo/bin/cli', 'start', '--web', '--localhost', '--port', '8082')
}
Wait-ForHttp 'http://localhost:8082/'
Write-Host 'DMS is ready at http://localhost:8082/. SFA was not changed.'
Write-Host 'Sign in as Distributor 1, then open Orders > Primary Orders and Refresh and sync.'
Write-Host 'After a computer restart, run this launcher again. Salesforce login and internet access must remain valid.'
