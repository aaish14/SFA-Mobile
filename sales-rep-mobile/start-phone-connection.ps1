$ErrorActionPreference = 'Stop'
$runtimeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logRoot = Join-Path $runtimeRoot 'logs'
$statePath = Join-Path $logRoot 'phone-connection.json'
$cloudflaredPath = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

# A phone connection must point to the live backend, never the mock data service.
function Test-SfaHealth([string]$BaseUrl) {
    try {
        $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 4
        return ($health.success -eq $true -and $health.data.mockMode -eq $false -and $health.message -eq 'SFA API is ready')
    } catch { return $false }
}

if (-not (Test-SfaHealth 'http://127.0.0.1:4000/api')) {
    throw 'The local SFA backend is not responding on port 4000. Start SFA before opening the phone connection.'
}
if (-not (Test-Path -LiteralPath $cloudflaredPath)) { throw 'The installed Cloudflare tunnel application was not found.' }
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

# Reuse the current address when it still works; do not create a new tunnel unnecessarily.
if (Test-Path -LiteralPath $statePath) {
    $savedConnection = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($savedConnection.processId)" -ErrorAction SilentlyContinue
    $ownsTunnel = $ownedProcess -and $ownedProcess.ExecutablePath -eq $cloudflaredPath -and $ownedProcess.CommandLine.Contains('http://127.0.0.1:4000')
    if ($ownsTunnel -and (Test-SfaHealth $savedConnection.apiUrl)) {
        Write-Output "SFA_PHONE_API=$($savedConnection.apiUrl)"
        Write-Output 'Connection is ready. Keep this laptop and its internet connection running.'
        return
    }
    # Only this launcher's own expired tunnel may be stopped, not any unrelated tunnel or backend.
    if ($ownsTunnel) { Stop-Process -Id $ownedProcess.ProcessId }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputLog = Join-Path $logRoot "phone-tunnel-$stamp.out.log"
$errorLog = Join-Path $logRoot "phone-tunnel-$stamp.err.log"
$tunnel = Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:4000', '--protocol', 'http2', '--edge-ip-version', '4', '--no-autoupdate') -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
$deadline = (Get-Date).AddSeconds(45)
$apiUrl = $null
while ((Get-Date) -lt $deadline -and -not $tunnel.HasExited) {
    if (Test-Path -LiteralPath $errorLog) {
        $logText = Get-Content -LiteralPath $errorLog -Raw
        $match = [regex]::Match("$logText", 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $apiUrl = "$($match.Value)/api"
            if (Test-SfaHealth $apiUrl) { break }
        }
    }
    Start-Sleep -Seconds 1
}
if ($apiUrl) {
    # Runtime state contains only the public address and process/log locations, never credentials.
    [pscustomobject]@{ apiUrl = $apiUrl; processId = $tunnel.Id; outputLog = $outputLog; errorLog = $errorLog } |
        ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
if (-not $apiUrl -or -not (Test-SfaHealth $apiUrl)) {
    throw "The phone connection did not become ready. See $errorLog. No backend or saved data was changed."
}
Write-Output "SFA_PHONE_API=$apiUrl"
Write-Output 'Connection is ready. Keep this laptop and its internet connection running.'
Write-Output 'If the old address expired, enter this address under Server connection in SFA version 13 or later.'
