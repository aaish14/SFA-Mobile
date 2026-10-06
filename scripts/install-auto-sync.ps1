param(
    [int]$Minutes = 15
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot 'sync-org-to-github.ps1'
$taskName = 'SFA Mobile - Salesforce to GitHub Sync'

if ($Minutes -lt 5) {
    throw 'Choose an interval of at least 5 minutes.'
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`""

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $Minutes)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Retrieves SFA metadata from sfaNewOrg and pushes source changes to GitHub.' `
    -Force | Out-Null

Write-Host "Automatic sync is enabled every $Minutes minutes."
