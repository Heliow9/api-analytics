$ErrorActionPreference = "SilentlyContinue"
$TaskName = "RealNet Monitor Agent"
schtasks /End /TN "$TaskName" | Out-Null
schtasks /Delete /TN "$TaskName" /F | Out-Null
Remove-Item -Recurse -Force "$env:ProgramFiles\RealNetAgent"
Write-Host "RealNet Agent removido. Os logs/configuracoes em ProgramData foram preservados."
