# Read the sender already connected on this computer. Windows DPAPI restricts
# decryption to this Windows account; no password is stored in this project.
function Get-SfaGmailSettings {
    # A Windows PowerShell child can inherit PowerShell 7's module search path.
    # Import its own security module explicitly so DPAPI works after a restart.
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    $settingsPath = Join-Path $env:LOCALAPPDATA 'SFA-DMS/Mail/gmail.json'
    if (-not (Test-Path -LiteralPath $settingsPath)) { return $null }
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $securePassword = ConvertTo-SecureString $settings.protectedPassword
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        return @{ User = [string]$settings.user; Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}

# Set only the child backend environment; callers restore the parent values
# before starting the website or any other process.
function Set-SfaMailEnvironment {
    $settings = Get-SfaGmailSettings
    if ($null -eq $settings) { return $false }
    $env:SMTP_HOST = 'smtp.gmail.com'
    $env:SMTP_PORT = '465'
    $env:SMTP_SECURE = 'true'
    $env:SMTP_USER = $settings.User
    $env:SMTP_PASSWORD = $settings.Password
    $env:EMAIL_FROM = 'SFA Mobile <' + $settings.User + '>'
    return $true
}
