# RealNet Agent - empacotamento sem depender de Node.js instalado nas maquinas clientes.
# Este script baixa o Node.js portable, instala dependencias do agente e monta a pasta installer/payload.
# Execute no seu computador de desenvolvimento, dentro do Windows.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$NodeVersion = "20.19.4"
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
$BuildDir = Join-Path $PWD "build\tmp"
$PayloadDir = Join-Path $PWD "installer\payload"
$NodeZip = Join-Path $BuildDir $NodeZipName
$NodeExtractDir = Join-Path $BuildDir "node-v$NodeVersion-win-x64"

Write-Host "Preparando pastas..."
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
if (Test-Path $PayloadDir) { Remove-Item -Recurse -Force $PayloadDir }
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path $PayloadDir | Out-Null

Write-Host "Instalando dependencias do agente..."
npm install --omit=dev

Write-Host "Baixando Node.js portable $NodeVersion..."
Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip

Write-Host "Extraindo Node.js portable..."
Expand-Archive -Path $NodeZip -DestinationPath $BuildDir -Force

Write-Host "Montando payload do instalador..."
Copy-Item (Join-Path $NodeExtractDir "node.exe") (Join-Path $PayloadDir "node.exe") -Force
Copy-Item (Join-Path $PWD "package.json") (Join-Path $PayloadDir "package.json") -Force
Copy-Item (Join-Path $PWD "src") (Join-Path $PayloadDir "src") -Recurse -Force
Copy-Item (Join-Path $PWD "node_modules") (Join-Path $PayloadDir "node_modules") -Recurse -Force

Write-Host ""
Write-Host "Pacote portable criado com sucesso em:"
Write-Host "  $PayloadDir"
Write-Host ""
Write-Host "Para instalar nas maquinas, entregue ao estagiario a pasta installer inteira, contendo:"
Write-Host "  installer\install-realnet-agent.ps1"
Write-Host "  installer\payload\node.exe"
Write-Host "  installer\payload\src"
Write-Host "  installer\payload\node_modules"
Write-Host ""
