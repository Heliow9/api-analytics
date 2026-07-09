# RealNet Agent - instalador sem Node.js manual

Esta versão permite gerar um `realnet-agent.exe` standalone. Depois disso, o estagiário instala nas máquinas sem instalar Node.js manualmente.

## 1. Gerar o executável do agente

No Windows do desenvolvedor, dentro da pasta:

```powershell
cd C:\projects\realnet-monitor-suite\agent-windows
powershell -ExecutionPolicy Bypass -File .\build\build-exe.ps1
```

Será criado:

```text
agent-windows\dist\realnet-agent.exe
```

## 2. Preparar instalador simples em PowerShell

Edite:

```text
agent-windows\installer\install-realnet-agent.ps1
```

Troque:

```powershell
$AgentKey = "COLE_A_CHAVE_DO_SERVIDOR_AQUI"
```

pela chave do servidor:

```bash
cat /home/ubuntu/realnet-monitor-suite/api/.env | grep AGENT_API_KEY
```

Depois copie para um pendrive/pasta de rede estes dois arquivos:

```text
realnet-agent.exe
install-realnet-agent.ps1
```

Eles precisam ficar na mesma pasta.

## 3. Instalar em cada computador

No computador do funcionário, abrir PowerShell como Administrador e rodar:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-realnet-agent.ps1
```

O instalador pergunta somente:

```text
Nome da pessoa que usa esta máquina
```

O setor e o título da máquina podem ser alterados depois no dashboard em `Identificar`.

## 4. Gerar instalador .EXE com Inno Setup, opcional

Instale o Inno Setup no Windows do desenvolvedor. Depois compile:

```powershell
iscc .\installer\RealNetAgent.iss /DAgentKey="SUA_AGENT_API_KEY"
```

O instalador final ficará em:

```text
agent-windows\installer\output\RealNetAgentSetup.exe
```

## 5. Logs

No computador monitorado:

```text
C:\ProgramData\RealNetAgent\agent.log
```

## 6. Remoção

Com PowerShell como Administrador:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-realnet-agent.ps1
```
