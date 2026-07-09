# RealNet Monitor Suite

Solução para monitorar quedas de internet nas máquinas Windows dos funcionários, com API, dashboard web, banco MySQL e agente Windows instalado como serviço.

## O que já está pronto

- API Node.js/Express para receber medições dos agentes.
- Banco MySQL 5.6 compatível com o banco `analytics_real`.
- Dashboard React para tempo real, relatórios e troca de senha do administrador.
- Agente Windows que mede:
  - cabo/rede desconectada;
  - IP válido;
  - gateway;
  - DNS;
  - internet HTTP;
  - latência;
  - perda de pacotes;
  - API central disponível;
  - identificação da máquina e pessoa usuária.
- CSV de eventos com início, fim, duração em segundos e causa provável.

## Dados usados conforme print

Banco:

```env
DB_HOST=analytics-real.mysql.uhserver.com
DB_PORT=3306
DB_NAME=analytics_real
DB_USER=admin_analytic
DB_PASSWORD=COLOQUE_A_SENHA_DO_BANCO_AQUI
```

Domínios/endpoints previstos:

```env
Dashboard: https://dashboardreal
API:       https://dashrealapi
```

Caso seus domínios tenham complemento, por exemplo `.com.br`, ajuste nos arquivos `.env` e nos arquivos do Nginx.

## Login inicial do dashboard

```text
E-mail: admin@real.local
Senha: 22021419
```

Troque a senha em **Segurança > Alterar senha** assim que acessar pela primeira vez.

## Subir no servidor Ubuntu/Lightsail

No seu servidor:

```bash
cd /home/ubuntu
unzip realnet-monitor-suite.zip
cd realnet-monitor-suite/api
cp .env.example .env
nano .env
```

No arquivo `.env`, preencha obrigatoriamente:

```env
DB_PASSWORD=senha_real_do_banco
JWT_SECRET=uma_chave_grande_e_secreta
AGENT_API_KEY=uma_chave_grande_para_os_agentes
CORS_ORIGIN=https://dashboardreal
```

Depois configure o dashboard:

```bash
cd /home/ubuntu/realnet-monitor-suite/dashboard
cp .env.example .env
nano .env
```

Ajuste se necessário:

```env
VITE_API_URL=https://dashrealapi/api
VITE_WS_URL=wss://dashrealapi/ws
```

Instale tudo:

```bash
cd /home/ubuntu/realnet-monitor-suite
chmod +x deploy/server-install-ubuntu.sh
./deploy/server-install-ubuntu.sh
```

Se ainda não tiver SSL, primeiro teste com HTTP:

```env
VITE_API_URL=http://dashrealapi/api
VITE_WS_URL=ws://dashrealapi/ws
CORS_ORIGIN=http://dashboardreal
```

Depois instale certificado com Certbot, caso o domínio seja público e válido:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dashboardreal -d dashrealapi
```

Se o seu domínio real for `dashboardreal.seudominio.com.br`, substitua nos comandos.

## Conferir API

```bash
curl http://127.0.0.1:3333/health
pm2 logs realnet-api
```

A primeira inicialização da API cria as tabelas automaticamente no MySQL e cria o administrador inicial.

## Instalar agente em uma máquina Windows

Na máquina do funcionário, copie a pasta `agent-windows`.

Abra PowerShell como Administrador:

```powershell
cd C:\caminho\agent-windows
copy .env.example .env
notepad .env
```

Edite:

```env
AGENT_API_URL=https://dashrealapi/api
AGENT_API_KEY=a_mesma_chave_do_servidor
DEVICE_TITLE=Financeiro 01
EMPLOYEE_NAME=Maria Silva
DEPARTMENT=Financeiro
INTERVAL_SECONDS=10
```

Instale como serviço:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-agent.ps1
```

O serviço aparecerá no Windows como:

```text
RealNet Monitor Agent
```

Os logs locais ficam em:

```text
C:\ProgramData\RealNetAgent\agent.log
```

## Identificação da pessoa/máquina

Você pode identificar de duas formas:

1. No `.env` do agente:

```env
DEVICE_TITLE=Financeiro 01
EMPLOYEE_NAME=Maria Silva
DEPARTMENT=Financeiro
```

2. Pelo dashboard, clicando em **Identificar** na linha da máquina.

## Como o sistema classifica quedas

| Causa provável | Quando ocorre |
|---|---|
| `cable_or_wifi_disconnected` | adaptador sem conexão física/rede |
| `no_valid_ip` | máquina sem IP válido |
| `gateway_unreachable` | cabo conectado, mas gateway não responde |
| `dns_failure` | DNS falhou |
| `no_internet_http_failure` | cabo conectado, mas sem internet HTTP |
| `high_latency` | internet respondeu, mas com latência alta |
| `packet_loss` | houve perda de pacotes |
| `api_unreachable` | internet pode estar ok, mas a API não respondeu |

## Segurança e uso corporativo

Este projeto foi preparado para monitoramento técnico de rede e disponibilidade, sem capturar conteúdo pessoal, conversas, senhas ou páginas completas do navegador.

Para impedir remoção indevida, use o caminho profissional:

- usuário Windows sem administrador local;
- instalação por TI com credencial administrativa;
- GPO, Intune, RMM ou política de domínio;
- registro de parada/remoção do serviço;
- política interna informando a finalidade do monitoramento.

Evite qualquer instalação oculta ou tentativa de dificultar remoção por técnicas de malware. Em ambiente corporativo, o correto é controle administrativo + política interna.

## Próximas melhorias recomendadas

- Relatório em PDF com logo da empresa.
- Alertas por e-mail/WhatsApp quando queda durar mais que X segundos.
- Tela de auditoria do agente.
- Instalador `.msi` assinado para distribuição em massa.
- Retenção automática de amostras antigas, por exemplo manter amostras por 90 dias e eventos por 2 anos.
