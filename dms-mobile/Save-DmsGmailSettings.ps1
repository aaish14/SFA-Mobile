# Input is supplied privately through stdin by the loopback-only setup helper.
$ErrorActionPreference = 'Stop'
try {
    # Node can inherit PowerShell 7's module search path. Load this host's security
    # module explicitly so Windows PowerShell can encrypt settings and apply ACLs.
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    $inputSettings = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($inputSettings.user -notmatch '^[a-z0-9._%+-]+@(gmail|googlemail)\.com$' -or $inputSettings.password -notmatch '^[a-zA-Z]{16}$') { exit 1 }
    $settingsFolder = Join-Path $env:LOCALAPPDATA 'SFA-DMS/Mail'
    $null = New-Item -ItemType Directory -Path $settingsFolder -Force
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($owner)
    foreach ($principal in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $settingsFolder -AclObject $acl
    $encrypted = ConvertFrom-SecureString (ConvertTo-SecureString $inputSettings.password -AsPlainText -Force)
    $savedAtUtc = [DateTime]::UtcNow.ToString('o')
    $settings = @{ user=$inputSettings.user; protectedPassword=$encrypted; savedAtUtc=$savedAtUtc }
    $pending = Join-Path $settingsFolder 'gmail.pending.json'
    [IO.File]::WriteAllText($pending,($settings | ConvertTo-Json))
    Move-Item -LiteralPath $pending -Destination (Join-Path $settingsFolder 'gmail.json') -Force
    [IO.File]::WriteAllText((Join-Path $settingsFolder 'setup-status.json'),(@{state='saved';user=$inputSettings.user;savedAtUtc=$savedAtUtc}|ConvertTo-Json))
    [Console]::Out.Write('saved')
} catch { exit 1 } finally { $inputSettings=$null; $settings=$null; $encrypted=$null }
