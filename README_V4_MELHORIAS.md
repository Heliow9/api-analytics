# RealNet Monitor v4 - melhorias de diagnóstico

## Melhorias principais

- Causas e eventos traduzidos para português no dashboard e CSV.
- Watchdog na API: cria evento de `Agente sem contato` quando a máquina para de enviar heartbeat.
- Melhor diferenciação entre:
  - cabo removido / Wi-Fi desconectado;
  - adaptador desativado;
  - possível problema de driver/hardware;
  - sem IP válido;
  - sem gateway;
  - gateway sem resposta;
  - DNS falhou;
  - cabo conectado, mas sem internet;
  - latência alta;
  - perda de pacotes;
  - máquina desligada/agente parado/sem contato.
- Agente coleta evidências técnicas do Windows:
  - adaptador ativo;
  - status do adaptador;
  - estado de mídia/link;
  - tipo de conexão ethernet/wifi;
  - SSID Wi-Fi quando aplicável;
  - gateway;
  - boot time do Windows;
  - uptime;
  - eventos recentes de energia/desligamento do Windows.
- Dashboard com filtros rápidos, busca, detalhes por máquina, últimas auditorias e últimos eventos.
- Relatórios agora agrupam por causa provável em português.

## Como atualizar no servidor

```bash
cd /home/ubuntu/realnet-monitor-suite
git pull origin main

cd api
npm install --omit=dev
pm2 restart realnet-api --update-env
pm2 save
pm2 logs realnet-api
```

A API fará os `ALTER TABLE` necessários automaticamente no primeiro start.

Depois recompile o dashboard:

```bash
cd /home/ubuntu/realnet-monitor-suite/dashboard
npm install
npm run build
sudo rm -rf /var/www/dashboardreal/*
sudo cp -r dist/* /var/www/dashboardreal/
sudo chown -R www-data:www-data /var/www/dashboardreal
sudo systemctl reload nginx
```

## Variáveis novas recomendadas na API

```env
OFFLINE_THRESHOLD_SECONDS=90
WATCHDOG_INTERVAL_SECONDS=30
```

## Como atualizar agente nas máquinas já instaladas

Para máquinas que já possuem `C:\Program Files\RealNetAgent`, copie a nova pasta `agent-windows\src` para:

```text
C:\Program Files\RealNetAgent\app\src
```

Depois reinicie a tarefa:

```powershell
Stop-ScheduledTask -TaskName "RealNet Monitor Agent" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "RealNet Monitor Agent"
```

Para novas instalações, use o mesmo instalador portable, mas com esta pasta `src` atualizada antes de distribuir.
