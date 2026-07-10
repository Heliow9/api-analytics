# Atualiza agente já instalado preservando C:\ProgramData\RealNetAgent\.env
# Execute como Administrador dentro da pasta installer contendo payload\node.exe, payload\src e payload\node_modules.

$ErrorActionPreference = "Stop"
$InstallDir = "$env:ProgramFiles\RealNetAgent"
$DataDir = "$env:ProgramData\RealNetAgent"
$PayloadSource = Join-Path $PSScriptRoot "payload"
$NodeSource = Join-Path $PayloadSource "node.exe"
$NodeDest = Join-Path $InstallDir "node.exe"
$AppDest = Join-Path $InstallDir "app"
$TaskName = "RealNet Monitor Agent"

function Assert-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) { throw "Abra o PowerShell como Administrador." }
}
Assert-Admin

if (!(Test-Path (Join-Path $DataDir ".env"))) { throw "Config .env não encontrada. Use install-realnet-agent.ps1 para primeira instalação." }
if (!(Test-Path $NodeSource)) { throw "payload\node.exe não encontrado." }
if (!(Test-Path (Join-Path $PayloadSource "src\index.js"))) { throw "payload\src\index.js não encontrado." }
if (!(Test-Path (Join-Path $PayloadSource "node_modules"))) { throw "payload\node_modules não encontrado." }

try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$InstallDir*" } | Stop-Process -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

if (Test-Path $AppDest) { Remove-Item -Recurse -Force $AppDest }
New-Item -ItemType Directory -Force -Path $AppDest | Out-Null
Copy-Item $NodeSource $NodeDest -Force
Copy-Item (Join-Path $PayloadSource "src") (Join-Path $AppDest "src") -Recurse -Force
Copy-Item (Join-Path $PayloadSource "node_modules") (Join-Path $AppDest "node_modules") -Recurse -Force
Copy-Item (Join-Path $PayloadSource "package.json") (Join-Path $AppDest "package.json") -Force

# Garante variáveis novas sem apagar identificação existente
$envPath = Join-Path $DataDir ".env"
$envText = Get-Content $envPath -Raw
$adds = @{
  "AUTO_UPDATE"="true";
  "UPDATE_CHECK_INTERVAL_MINUTES"="30";
  "UPDATE_CHECK_EVERY_SAMPLES"="30";
  "FAILURE_CONFIRM_SAMPLES"="2";
}
foreach ($k in $adds.Keys) {
  if ($envText -notmatch "(?m)^$k=") { Add-Content -Path $envPath -Value "$k=$($adds[$k])" }
}

$IndexPath = Join-Path $AppDest "src\index.js"
$ActionObj = New-ScheduledTaskAction -Execute $NodeDest -Argument "`"$IndexPath`""
$TriggerObj = New-ScheduledTaskTrigger -AtStartup
$PrincipalObj = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $ActionObj -Trigger $TriggerObj -Principal $PrincipalObj -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "RealNet Agent atualizado para v5/1.2.0. Aguarde 10 a 20 segundos e atualize o dashboard."
