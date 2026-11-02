# Interactive setup only. The user enters and submits the credential in this masked window.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$verificationScript = Join-Path $PSScriptRoot 'verify-gmail-sender.cjs'
$settingsFolder = Join-Path $env:LOCALAPPDATA 'SFA-DMS/Mail'

$form = New-Object Windows.Forms.Form
$form.Text = 'DMS - Private Gmail sender setup'
$form.Size = New-Object Drawing.Size(650,530)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [Drawing.Color]::White
$form.Font = New-Object Drawing.Font('Segoe UI',10)
$instructions = New-Object Windows.Forms.Label
$instructions.Location = New-Object Drawing.Point(24,20)
$instructions.Size = New-Object Drawing.Size(590,115)
$instructions.Text = "1. Open Google App Passwords and create one named DMS portal.`r`n2. Enter it below, only in this private window.`r`n3. Click Verify and save. Tell Codex when the status says Saved.`r`n`r`nDo not use your normal Gmail password or send any password in chat."
$form.Controls.Add($instructions)
$openGoogle = New-Object Windows.Forms.Button
$openGoogle.Location = New-Object Drawing.Point(24,137)
$openGoogle.Size = New-Object Drawing.Size(270,37)
$openGoogle.Text = 'Open Google App Passwords'
$openGoogle.Add_Click({ Start-Process 'https://myaccount.google.com/apppasswords' })
$form.Controls.Add($openGoogle)
$emailLabel = New-Object Windows.Forms.Label
$emailLabel.Location = New-Object Drawing.Point(24,192)
$emailLabel.Size = New-Object Drawing.Size(570,24)
$emailLabel.Text = 'Gmail account that will send DMS login codes'
$form.Controls.Add($emailLabel)
$emailBox = New-Object Windows.Forms.TextBox
$emailBox.Location = New-Object Drawing.Point(24,221)
$emailBox.Size = New-Object Drawing.Size(590,30)
$emailBox.Text = 'aishwaryahs14123@gmail.com'
$form.Controls.Add($emailBox)
$passwordLabel = New-Object Windows.Forms.Label
$passwordLabel.Location = New-Object Drawing.Point(24,266)
$passwordLabel.Size = New-Object Drawing.Size(570,24)
$passwordLabel.Text = 'Google App Password (16 letters; kept private)'
$form.Controls.Add($passwordLabel)
$passwordBox = New-Object Windows.Forms.TextBox
$passwordBox.Location = New-Object Drawing.Point(24,295)
$passwordBox.Size = New-Object Drawing.Size(590,30)
$passwordBox.UseSystemPasswordChar = $true
$passwordBox.MaxLength = 64
$form.Controls.Add($passwordBox)
$save = New-Object Windows.Forms.Button
$save.Location = New-Object Drawing.Point(24,345)
$save.Size = New-Object Drawing.Size(290,40)
$save.Text = 'Verify and save Gmail sender'
$form.Controls.Add($save)
$status = New-Object Windows.Forms.Label
$status.Location = New-Object Drawing.Point(24,400)
$status.Size = New-Object Drawing.Size(590,75)
$status.Text = 'The password is encrypted for this Windows account and stored outside the project. This check does not send an email.'
$form.Controls.Add($status)
$save.Add_Click({
    $sender = $emailBox.Text.Trim().ToLowerInvariant()
    $appPassword = $passwordBox.Text -replace '\s',''
    if ($sender -notmatch '^[a-z0-9._%+-]+@(gmail|googlemail)\.com$' -or $appPassword -notmatch '^[a-zA-Z]{16}$') {
        $status.Text = 'Enter your Gmail address and the 16-letter App Password from Google.'
        $appPassword = $null
        return
    }
    $save.Enabled = $false
    $status.Text = 'Checking the Gmail connection securely...'
    [Windows.Forms.Application]::DoEvents()
    $check = $null
    try {
        $startInfo = New-Object Diagnostics.ProcessStartInfo
        $startInfo.FileName = $nodePath
        $startInfo.Arguments = '"' + $verificationScript + '"'
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardInput = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $check = [Diagnostics.Process]::Start($startInfo)
        $safeOutput = $check.StandardOutput.ReadToEndAsync()
        $ignoredErrors = $check.StandardError.ReadToEndAsync()
        $check.StandardInput.WriteLine((@{ user=$sender; password=$appPassword } | ConvertTo-Json -Compress))
        $check.StandardInput.Close()
        if (-not $check.WaitForExit(30000)) {
            $check.Kill()
            throw 'Connection timeout'
        }
        $result = $safeOutput.Result | ConvertFrom-Json
        if (-not $result.verified) {
            $status.Text = if ($result.category -eq 'EAUTH') {
                'Google rejected the sign-in. Use an App Password from the Gmail account shown above, not its normal password.'
            } else { 'The Gmail connection could not be verified. Check the App Password and your internet connection.' }
            return
        }
        $null = New-Item -ItemType Directory -Path $settingsFolder -Force
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true,$false)
        $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.SetOwner($owner)
        foreach ($principal in @($owner,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $settingsFolder -AclObject $acl
        $protectedPassword = ConvertFrom-SecureString (ConvertTo-SecureString $appPassword -AsPlainText -Force)
        $settings = @{ user=$sender; protectedPassword=$protectedPassword; savedAtUtc=[DateTime]::UtcNow.ToString('o') }
        $temporaryPath = Join-Path $settingsFolder 'gmail.pending.json'
        [IO.File]::WriteAllText($temporaryPath,($settings | ConvertTo-Json))
        Move-Item -LiteralPath $temporaryPath -Destination (Join-Path $settingsFolder 'gmail.json') -Force
        [IO.File]::WriteAllText((Join-Path $settingsFolder 'setup-status.json'),(@{ state='saved'; user=$sender; savedAtUtc=$settings.savedAtUtc } | ConvertTo-Json))
        $passwordBox.Clear()
        $status.ForeColor = [Drawing.Color]::DarkGreen
        $status.Text = 'Saved. Gmail authentication succeeded. Tell Codex so the DMS backend can be restarted and one login email tested.'
    } catch {
        # Never display exception messages: providers and process helpers can echo credentials.
        $status.Text = 'Setup did not finish. Nothing has been activated. Check the connection and try again.'
    } finally {
        $appPassword = $null
        $protectedPassword = $null
        $settings = $null
        if ($null -ne $check) { $check.Dispose() }
        $save.Enabled = $true
    }
})
$form.Add_FormClosed({ $passwordBox.Clear() })
[void]$form.ShowDialog()
$form.Dispose()
