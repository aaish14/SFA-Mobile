param(
    [string]$SalesforceOrg = 'sfaNewOrg',
    [string]$GitBranch = 'main'
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectDirectory 'manifest\auto-sync-package.xml'
$logDirectory = Join-Path $projectDirectory 'work'
$logPath = Join-Path $logDirectory 'salesforce-github-auto-sync.log'
$sfCommand = 'C:\Users\aishw\AppData\Roaming\npm\sf.cmd'
$gitCommand = 'C:\Program Files\Git\cmd\git.exe'
$mutex = New-Object System.Threading.Mutex($false, 'SFA_Salesforce_GitHub_AutoSync')

if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Start-Transcript -Path $logPath -Append | Out-Null
    Set-Location -LiteralPath $projectDirectory
    $env:SF_DISABLE_LOG_FILE = 'true'

    & $gitCommand pull --rebase origin $GitBranch
    if ($LASTEXITCODE -ne 0) { throw 'Git pull failed.' }

    & $sfCommand project retrieve start --target-org $SalesforceOrg --manifest $manifestPath --ignore-conflicts --wait 30
    if ($LASTEXITCODE -ne 0) { throw 'Salesforce metadata retrieval failed.' }

    & $gitCommand add --all
    & $gitCommand diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'No Salesforce metadata changes were found.'
    } else {
        $syncTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        & $gitCommand commit -m "Automatic Salesforce sync - $syncTime"
        if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }

        & $gitCommand push origin $GitBranch
        if ($LASTEXITCODE -ne 0) { throw 'Git push failed.' }
        Write-Host "Salesforce metadata synchronized at $syncTime."
    }
} catch {
    Write-Error $_
    exit 1
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
