# Local-only Gmail credentials. Windows DPAPI binds the encrypted value to this Windows user.
function Get-DmsGmailSettings {
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
