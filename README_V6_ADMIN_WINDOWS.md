# RealNet Monitor v6 - Administração Windows e comandos remotos

## Novidades

- Tela **Administração Windows** no dashboard.
- Inventário de processos ativos da máquina, semelhante ao Gerenciador de Tarefas.
- Inventário de serviços do Windows.
- Finalizar processo/aplicativo por PID.
- Iniciar, parar e reiniciar serviço do Windows.
- Reiniciar computador remotamente.
- Desligar computador remotamente.
- Cancelar desligamento/reinício agendado.
- Fila e histórico de comandos com auditoria.
- Auto atualização mantida, agora agente versão `1.3.0`.

## Segurança operacional

Os comandos são executados pelo agente instalado como SYSTEM. Por segurança, a versão v6 bloqueia processos e serviços críticos do Windows, como `lsass`, `winlogon`, `services`, `RpcSs`, `PlugPlay`, `EventLog`, `Winmgmt` e outros. Reiniciar/desligar exigem confirmação textual no dashboard.

## Variáveis novas do agente

```env
INVENTORY_EVERY_SAMPLES=6
COMMAND_POLL_EVERY_SAMPLES=1
```

Com `INTERVAL_SECONDS=10`, o inventário é enviado a cada 60 segundos, e a fila de comandos é verificada a cada 10 segundos.

## Atualização

1. Atualize API e dashboard pelo Git.
2. Publique o ZIP `realnet-agent-1.3.0-update.zip` em **Atualizações**.
3. As máquinas com auto update ativo baixarão e aplicarão automaticamente.

