# Install only current-user shortcuts; no admin rights or stored password needed.
$ErrorActionPreference = 'Stop'
$shellLink = New-Object -ComObject WScript.Shell
$powerShellExe = Join-Path $PSHOME 'powershell.exe'
foreach ($entry in @(
    @{ Folder = [Environment]::GetFolderPath('Startup'); Name = 'DMS Portal Auto Start.lnk'; Script = 'Keep-DmsLocalRunning.ps1' },
    @{ Folder = [Environment]::GetFolderPath('Desktop'); Name = 'Open DMS Portal.lnk'; Script = 'Open-DmsPortal.ps1' }
)) {
    $shortcutPath = Join-Path $entry.Folder $entry.Name
    $scriptPath = Join-Path $PSScriptRoot $entry.Script
    $link = $shellLink.CreateShortcut($shortcutPath)
    if ((Test-Path -LiteralPath $shortcutPath) -and $link.Arguments -notlike "*$scriptPath*") {
        throw "An unrelated shortcut exists at $shortcutPath. Nothing was overwritten."
    }
    $link.TargetPath = $powerShellExe
    $link.Arguments = "-NoProfile -WindowStyle Hidden -File `"$scriptPath`""
    $link.WorkingDirectory = $PSScriptRoot
    $link.WindowStyle = 7
    $link.Description = 'Start the local DMS portal. Does not change SFA.'
    $link.Save()
    Write-Output "Installed: $shortcutPath"
}
Write-Output 'DMS will start at Windows sign-in. Remove DMS Portal Auto Start.lnk from your Startup folder to disable automatic startup.'
