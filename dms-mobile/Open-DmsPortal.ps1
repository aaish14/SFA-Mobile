# Desktop entry point: ensure the background guardian exists before opening DMS.
$ErrorActionPreference = 'Stop'
$guardianScript = Join-Path $PSScriptRoot 'Keep-DmsLocalRunning.ps1'
Start-Process -FilePath "$PSHOME\powershell.exe" -ArgumentList "-NoProfile -WindowStyle Hidden -File `"$guardianScript`"" -WindowStyle Hidden
$readyBy = (Get-Date).AddSeconds(120)
do {
    try {
        $page = Invoke-WebRequest 'http://localhost:8082/' -UseBasicParsing -TimeoutSec 3
        if ($page.StatusCode -eq 200) { Start-Process 'http://localhost:8082/'; return }
    } catch { }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $readyBy)
throw "DMS is still starting. Check $PSScriptRoot\.runtime\guardian.log and try again."
