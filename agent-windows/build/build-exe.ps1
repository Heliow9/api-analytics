$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Instalando dependências..."
npm install

Write-Host "Gerando executável standalone Windows x64..."
npm run build:exe

Write-Host "\nExecutável criado em:"
Write-Host "  $PWD\dist\realnet-agent.exe"
Write-Host "\nPróximo passo: copie dist\realnet-agent.exe junto com installer\install-realnet-agent.ps1 para instalar nas máquinas."
