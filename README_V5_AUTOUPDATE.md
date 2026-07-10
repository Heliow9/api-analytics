# RealNet Monitor v5

## Correções principais

- Corrige falso diagnóstico `Nenhum adaptador de rede encontrado` quando DNS/Internet estão funcionando.
- Substitui dependência frágil de `Get-NetAdapter` por coleta via `Win32_NetworkAdapterConfiguration` e fallback por IP real do Windows/Node.
- Adiciona debounce de falhas de adaptador para evitar piscar online/offline por uma coleta isolada.
- Adiciona auto atualização do agente Windows.
- Adiciona tela `Atualizações` no dashboard.
- Adiciona tabelas `agent_releases` e `agent_update_history` na API.

## Atualizar servidor

```bash
cd /home/ubuntu/realnet-monitor-suite
git pull origin main

cd /home/ubuntu/realnet-monitor-suite/api
npm install --omit=dev
pm2 restart realnet-api --update-env
pm2 save

cd /home/ubuntu/realnet-monitor-suite/dashboard
npm install
npm run build
sudo rm -rf /var/www/dashboardreal/*
sudo cp -r dist/* /var/www/dashboardreal/
sudo chown -R www-data:www-data /var/www/dashboardreal
sudo systemctl reload nginx
```

Adicione no `.env` da API:

```env
PUBLIC_BASE_URL=https://dashrealapi.duckdns.org
RELEASES_DIR=/home/ubuntu/realnet-monitor-suite/api/uploads/agent-releases
OFFLINE_THRESHOLD_SECONDS=90
WATCHDOG_INTERVAL_SECONDS=30
```

## Atualizar agente já instalado manualmente uma vez

Na máquina cliente, entregue a pasta `installer` gerada por:

```powershell
cd C:\projects\realnet-monitor-suite\agent-windows
powershell -ExecutionPolicy Bypass -File .\build\build-portable-installer.ps1
```

Depois rode como Administrador dentro de `installer`:

```powershell
powershell -ExecutionPolicy Bypass -File .\update-realnet-agent-v5.ps1
```

## Publicar próxima atualização automática

No seu Windows de desenvolvimento:

```powershell
cd C:\projects\realnet-monitor-suite\agent-windows
powershell -ExecutionPolicy Bypass -File .\build\build-portable-installer.ps1
powershell -ExecutionPolicy Bypass -File .\build\build-update-package.ps1
```

O ZIP sai em:

```text
agent-windows\dist\realnet-agent-1.2.0-update.zip
```

Suba esse arquivo no dashboard em `Atualizações`.

Os agentes verificam automaticamente a cada 30 minutos. Para reduzir em teste, ajuste no `.env` da máquina:

```env
UPDATE_CHECK_INTERVAL_MINUTES=5
UPDATE_CHECK_EVERY_SAMPLES=6
```

## Importante sobre GitHub

Não subir para o GitHub:

```text
*.zip
*.exe
agent-windows/installer/payload/
agent-windows/dist/
agent-windows/node_modules/
```
