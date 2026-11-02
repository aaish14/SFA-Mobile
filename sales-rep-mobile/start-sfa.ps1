$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDirectory = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
. (Join-Path $projectRoot 'SfaMailSettings.ps1')

function Start-SfaProcess {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )

    $stdout = Join-Path $logDirectory "$Name-output.log"
    $stderr = Join-Path $logDirectory "$Name-error.log"
    $mailNames = @('SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','EMAIL_FROM')
    $previousMail = @{}
    foreach ($mailName in $mailNames) {
        $previousMail[$mailName] = [Environment]::GetEnvironmentVariable($mailName, 'Process')
    }
    try {
        if ($Name -eq 'backend') { Set-SfaMailEnvironment | Out-Null }
        return Start-Process -FilePath "node.exe" `
            -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden `
            -PassThru
    } finally {
        # The web process and calling shell must never inherit the mail password.
        foreach ($mailName in $mailNames) {
            [Environment]::SetEnvironmentVariable($mailName, $previousMail[$mailName], 'Process')
        }
    }
}

$backend = $null
$website = $null

while ($true) {
    if ($null -eq $backend -or $backend.HasExited) {
        $backend = Start-SfaProcess `
            -Name "backend" `
            -WorkingDirectory $projectRoot `
            -Arguments @("backend/dist/server.js")
    }

    if ($null -eq $website -or $website.HasExited) {
        $website = Start-SfaProcess `
            -Name "website" `
            -WorkingDirectory $projectRoot `
            -Arguments @("serve-web.cjs")
    }

    Start-Sleep -Seconds 10
}
