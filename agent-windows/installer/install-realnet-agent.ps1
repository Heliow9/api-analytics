# RealNet Agent - instalador sem Node.js externo
# Execute como Administrador.

$ErrorActionPreference = "Stop"

# Configure uma vez antes de distribuir para o estagiario.
$ApiUrl = "https://dashrealapi.duckdns.org/api"
$AgentKey = "COLE_A_CHAVE_DO_SERVIDOR_AQUI"

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
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Abra o PowerShell como Administrador e rode novamente."
  }
}

Assert-Admin

if (!(Test-Path $NodeSource)) {
  throw "Nao encontrei payload\node.exe. Rode build\build-portable-installer.ps1 antes de distribuir."
}
if (!(Test-Path (Join-Path $PayloadSource "src\index.js"))) {
  throw "Nao encontrei payload\src\index.js. Rode build\build-portable-installer.ps1 antes de distribuir."
}
if (!(Test-Path (Join-Path $PayloadSource "node_modules"))) {
  throw "Nao encontrei payload\node_modules. Rode build\build-portable-installer.ps1 antes de distribuir."
}
if ($AgentKey -eq "COLE_A_CHAVE_DO_SERVIDOR_AQUI" -or [string]::IsNullOrWhiteSpace($AgentKey)) {
  throw "Edite este instalador e coloque a AGENT_API_KEY antes de distribuir."
}

$EmployeeName = Read-Host "Nome da pessoa que usa esta maquina"
if ([string]::IsNullOrWhiteSpace($EmployeeName)) { throw "Nome obrigatorio." }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Para atualizacao limpa, remove somente a pasta app antiga.
if (Test-Path $AppDest) { Remove-Item -Recurse -Force $AppDest }
New-Item -ItemType Directory -Force -Path $AppDest | Out-Null

Copy-Item $NodeSource $NodeDest -Force
Copy-Item (Join-Path $PayloadSource "src") (Join-Path $AppDest "src") -Recurse -Force
Copy-Item (Join-Path $PayloadSource "node_modules") (Join-Path $AppDest "node_modules") -Recurse -Force
Copy-Item (Join-Path $PayloadSource "package.json") (Join-Path $AppDest "package.json") -Force

$envContent = @"
AGENT_API_URL=$ApiUrl
AGENT_API_KEY=$AgentKey
EMPLOYEE_NAME=$EmployeeName
DEVICE_TITLE=
DEPARTMENT=
INTERVAL_SECONDS=10
DNS_TEST_HOST=google.com
HTTP_TEST_URL=https://www.google.com/generate_204
PING_TARGET=1.1.1.1
LATENCY_WARNING_MS=300
PACKET_LOSS_WARNING_PERCENT=10
"@
Set-Content -Path (Join-Path $DataDir ".env") -Value $envContent -Encoding UTF8

# Remove tarefa antiga, se existir.
# Usando cmdlets do Agendador para evitar erro quando a tarefa ainda nao existe.
$oldTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($oldTask) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Cria tarefa como SYSTEM. O agente fica em loop, usando Node portable local.
$IndexPath = Join-Path $AppDest "src\index.js"
$ActionObj = New-ScheduledTaskAction -Execute $NodeDest -Argument "`"$IndexPath`""
$TriggerObj = New-ScheduledTaskTrigger -AtStartup
$PrincipalObj = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $ActionObj -Trigger $TriggerObj -Principal $PrincipalObj -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "RealNet Agent instalado com sucesso."
Write-Host "Pessoa: $EmployeeName"
Write-Host "Pasta: $InstallDir"
Write-Host "Config: $DataDir\.env"
Write-Host "Log: $DataDir\agent.log"
Write-Host ""
Write-Host "Aguarde 10 a 20 segundos e atualize o dashboard."
