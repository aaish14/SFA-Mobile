$ErrorActionPreference = 'Stop'
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$salesforceCli = Join-Path $projectRoot '..\work\sf-cli\node_modules\.bin\sf.cmd'

Write-Host 'Opening Salesforce authorization for sfaNewOrg...' -ForegroundColor Cyan
& $salesforceCli org login web `
    --alias sfaNewOrg `
    --instance-url 'https://orgfarm-33ef5eba22-dev-ed.develop.my.salesforce.com' `
    --set-default `
    --browser edge

if ($LASTEXITCODE -ne 0) {
    throw 'Salesforce authorization did not complete. Please retry and finish the browser login immediately.'
}

Write-Host 'Salesforce authorization completed. Return to Codex and reply: Logged in' -ForegroundColor Green
Read-Host 'Press Enter to close'
