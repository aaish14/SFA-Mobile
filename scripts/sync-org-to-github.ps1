param(
    [string]$OrgAlias = 'sfaNewOrg',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$salesforceCli = 'C:\Program Files\sf\bin\sf.cmd'

Set-Location $projectRoot

if (-not (Test-Path $salesforceCli)) {
    throw 'Salesforce CLI was not found at the expected location.'
}

Write-Host "Retrieving the SFA project metadata from $OrgAlias..."
& $salesforceCli project retrieve start `
    --manifest 'manifest/project-source.xml' `
    --target-org $OrgAlias `
    --wait 20

if ($LASTEXITCODE -ne 0) {
    throw 'Salesforce metadata retrieval failed. GitHub was not changed.'
}

git add --all
if ($LASTEXITCODE -ne 0) {
    throw 'Git could not stage the retrieved Salesforce files.'
}

git diff --cached --quiet

if ($LASTEXITCODE -eq 0) {
    Write-Host 'The Salesforce org and GitHub project are already synchronized.'
    exit 0
}

$syncTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
git commit -m "Sync Salesforce org - $syncTime"
git push origin $Branch

if ($LASTEXITCODE -ne 0) {
    throw 'The metadata was committed locally, but the GitHub push failed.'
}

Write-Host 'Salesforce org metadata was synchronized successfully.'

