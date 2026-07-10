# RealNet Agent - Instalador portable sem Node.js externo

Esta forma nao usa `pkg` e nao exige Node.js instalado nas maquinas dos funcionarios.
O Node.js portable fica embutido dentro da pasta `installer/payload`.

## Gerar pacote no computador de desenvolvimento

No PowerShell:

```powershell
cd C:\projects\realnet-monitor-suite\agent-windows
powershell -ExecutionPolicy Bypass -File .\build\build-portable-installer.ps1
```

Depois edite:

```text
installer\install-realnet-agent.ps1
```

E coloque a chave real em:

```powershell
$AgentKey = "COLE_A_CHAVE_DO_SERVIDOR_AQUI"
```

## Entregar ao estagiario

Entregue a pasta `installer` completa, contendo:

```text
installer\install-realnet-agent.ps1
installer\payload\node.exe
installer\payload\src\...
installer\payload\node_modules\...
```

## Instalar em cada maquina

Abrir PowerShell como Administrador dentro da pasta `installer` e rodar:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-realnet-agent.ps1
```

O instalador pergunta apenas o nome da pessoa. Departamento e titulo podem ser ajustados depois no dashboard.


## Ajuste v3.1
O instalador agora usa cmdlets do Agendador de Tarefas para remover/criar a tarefa, evitando erro quando a tarefa antiga ainda não existe.
