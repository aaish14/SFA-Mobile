param(
    [string]$SalesforceOrg = 'sfaNewOrg',
    [string]$GitBranch = 'main'
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectDirectory 'manifest\auto-sync-package.xml'
$logDirectory = Join-Path $projectDirectory 'work'
$logPath = Join-Path $logDirectory 'salesforce-github-auto-sync.log'
$mutex = [System.Threading.Mutex]::new($false, 'SFA_Salesforce_GitHub_AutoSync')

if (-not $mutex.WaitOne(0)) {
    exit 0
}

try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Start-Transcript -Path $logPath -Append | Out-Null
    Set-Location -LiteralPath $projectDirectory

    $env:SF_DISABLE_LOG_FILE = 'true'
    & sf project retrieve start --target-org $SalesforceOrg --manifest $manifestPath --ignore-conflicts --wait 30
    if ($LASTEXITCODE -ne 0) {
        throw "Salesforce metadata retrieval failed with exit code $LASTEXITCODE."
    }

    & git add --all
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'No Salesforce metadata changes were found.'
        exit 0
    }

    $syncTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    & git commit -m "Automatic Salesforce sync - $syncTime"
    if ($LASTEXITCODE -ne 0) {
        throw "Git commit failed with exit code $LASTEXITCODE."
    }

    & git pull --rebase origin $GitBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Git pull failed with exit code $LASTEXITCODE."
    }

    & git push origin $GitBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Git push failed with exit code $LASTEXITCODE."
    }

    Write-Host "Salesforce metadata was synchronized to GitHub at $syncTime."
} catch {
    Write-Error $_
    exit 1
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
