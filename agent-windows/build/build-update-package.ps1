# Gera ZIP pequeno do app do agente para auto atualização.
# Execute depois do build-portable-installer.ps1.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
$Version = "1.2.0"
$OutDir = Join-Path $PWD "dist"
$Temp = Join-Path $PWD "build\update-app"
$Zip = Join-Path $OutDir "realnet-agent-$Version-update.zip"

if (Test-Path $Temp) { Remove-Item -Recurse -Force $Temp }
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
New-Item -ItemType Directory -Force -Path $Temp | Out-Null
Copy-Item (Join-Path $PWD "src") (Join-Path $Temp "src") -Recurse -Force
Copy-Item (Join-Path $PWD "node_modules") (Join-Path $Temp "node_modules") -Recurse -Force
Copy-Item (Join-Path $PWD "package.json") (Join-Path $Temp "package.json") -Force
if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path (Join-Path $Temp "*") -DestinationPath $Zip -Force
$Hash = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower()
Write-Host "Pacote de atualização criado: $Zip"
Write-Host "SHA256: $Hash"
Write-Host "Envie este ZIP no dashboard > Atualizações."
