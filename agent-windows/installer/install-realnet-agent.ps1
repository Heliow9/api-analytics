# RealNet Agent - instalador simples sem Node.js externo
# Execute como Administrador.

$ErrorActionPreference = "Stop"

# Configure uma vez antes de distribuir para o estagiário.
$ApiUrl = "https://dashrealapi.duckdns.org/api"
$AgentKey = "COLE_A_CHAVE_DO_SERVIDOR_AQUI"

$InstallDir = "$env:ProgramFiles\RealNetAgent"
$DataDir = "$env:ProgramData\RealNetAgent"
$ExeSource = Join-Path $PSScriptRoot "realnet-agent.exe"
$ExeDest = Join-Path $InstallDir "realnet-agent.exe"
$TaskName = "RealNet Monitor Agent"

function Assert-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "Abra o PowerShell como Administrador e rode novamente."
  }
}

Assert-Admin

if (!(Test-Path $ExeSource)) {
  throw "Não encontrei realnet-agent.exe na mesma pasta deste instalador."
}

if ($AgentKey -eq "COLE_A_CHAVE_DO_SERVIDOR_AQUI" -or [string]::IsNullOrWhiteSpace($AgentKey)) {
  throw "Edite este instalador e coloque a AGENT_API_KEY antes de distribuir."
}

$EmployeeName = Read-Host "Nome da pessoa que usa esta máquina"
if ([string]::IsNullOrWhiteSpace($EmployeeName)) { throw "Nome obrigatório." }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Copy-Item $ExeSource $ExeDest -Force

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
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

# Cria tarefa como SYSTEM. O agente fica em loop, sem precisar Node instalado.
$action = "`"$ExeDest`""
schtasks /Create /TN $TaskName /TR $action /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
schtasks /Run /TN $TaskName | Out-Null

Write-Host "\nRealNet Agent instalado com sucesso."
Write-Host "Pessoa: $EmployeeName"
Write-Host "Pasta: $InstallDir"
Write-Host "Config: $DataDir\.env"
Write-Host "Log: $DataDir\agent.log"
Write-Host "\nAguarde 10 a 20 segundos e atualize o dashboard."
