# Per-user DMS startup/recovery. Never stops a process or touches SFA ports.
[CmdletBinding()]
param([switch]$Once)
$ErrorActionPreference = 'Stop'
$guardianMutex = [Threading.Mutex]::new($false, 'Local\DmsPortalLocalGuardian')
$ownsGuardian = $false
try {
    try { $ownsGuardian = $guardianMutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $ownsGuardian = $true }
    if (-not $ownsGuardian) { return }
    $runtimeFolder = Join-Path $PSScriptRoot '.runtime'
    New-Item -ItemType Directory -Path $runtimeFolder -Force | Out-Null
    $guardianLog = Join-Path $runtimeFolder 'guardian.log'
    do {
        $retryDelay = 30
        try {
            $backendUp = @(Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
            $webUp = @(Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
            if (-not $backendUp -or -not $webUp) {
                if ((Test-Path $guardianLog) -and (Get-Item $guardianLog).Length -gt 2MB) {
                    Move-Item -LiteralPath $guardianLog -Destination "$guardianLog.previous" -Force
                }
                Add-Content -LiteralPath $guardianLog -Value "$(Get-Date -Format o) Starting missing DMS services."
                & (Join-Path $PSScriptRoot 'Start-DmsLocal.ps1') -SkipSalesforceCheck -UseExistingBuild *>> $guardianLog
                Add-Content -LiteralPath $guardianLog -Value "$(Get-Date -Format o) Local DMS services ready."
            }
        } catch {
            # Back off without killing unknown port owners or changing login security.
            Add-Content -LiteralPath $guardianLog -Value "$(Get-Date -Format o) Startup failed: $($_.Exception.Message)"
            $retryDelay = 120
            if ($Once) { throw }
        }
        if (-not $Once) { Start-Sleep -Seconds $retryDelay }
    } while (-not $Once)
} finally {
    if ($ownsGuardian) { $guardianMutex.ReleaseMutex() }
    $guardianMutex.Dispose()
}
