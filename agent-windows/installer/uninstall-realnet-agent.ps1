# RealNet Agent - desinstalador
# Execute como Administrador.
$TaskName = "RealNet Monitor Agent"
schtasks /End /TN $TaskName 2>$null | Out-Null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
Remove-Item -Recurse -Force "$env:ProgramFiles\RealNetAgent" -ErrorAction SilentlyContinue
Write-Host "RealNet Agent removido. Logs/config em $env:ProgramData\RealNetAgent foram preservados."
