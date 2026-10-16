$applicationPorts = 4000, 8081
foreach ($applicationPort in $applicationPorts) {
    Get-NetTCPConnection -LocalPort $applicationPort -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Write-Host "The local SFA website and API have been stopped."
