# Execute como Administrador dentro da pasta agent-windows
# 1) Edite o arquivo .env antes de instalar
# 2) Depois execute: powershell -ExecutionPolicy Bypass -File .\install-agent.ps1

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Arquivo .env criado. Edite AGENT_API_URL, AGENT_API_KEY, DEVICE_TITLE, EMPLOYEE_NAME e DEPARTMENT antes de continuar." -ForegroundColor Yellow
  exit 1
}

npm install
npm run install-service
Write-Host "RealNet Monitor Agent instalado como serviço do Windows." -ForegroundColor Green
