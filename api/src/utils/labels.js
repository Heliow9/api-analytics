const STATUS_LABELS = {
  online: { label: 'Online', severity: 'ok', group: 'online' },
  ok: { label: 'Online', severity: 'ok', group: 'online' },
  degraded: { label: 'Instável', severity: 'warning', group: 'degraded' },
  offline: { label: 'Queda/Falha', severity: 'critical', group: 'offline' },
  unknown: { label: 'Desconhecido', severity: 'warning', group: 'unknown' }
};

const REASON_LABELS = {
  ok: {
    label: 'Conexão normal',
    short: 'OK',
    severity: 'ok',
    hint: 'Todos os testes principais responderam dentro do limite configurado.'
  },
  no_adapter_found: {
    label: 'Nenhum adaptador de rede encontrado',
    short: 'Sem adaptador',
    severity: 'critical',
    hint: 'O Windows não retornou placa de rede ativa e os testes de internet também falharam. Pode ser driver, dispositivo desabilitado ou falha no adaptador.'
  },
  adapter_detection_limited: {
    label: 'Adaptador não identificado, mas internet está funcionando',
    short: 'Detecção limitada',
    severity: 'warning',
    hint: 'O Windows não retornou todos os dados do adaptador, porém DNS/Internet responderam. Não tratar como queda; revisar driver/permissão se repetir.'
  },
  adapter_disabled: {
    label: 'Adaptador de rede desativado no Windows',
    short: 'Adaptador desativado',
    severity: 'critical',
    hint: 'A placa existe, mas está administrativamente desativada ou fora de operação.'
  },
  adapter_driver_or_hardware_issue: {
    label: 'Possível falha de driver ou hardware do adaptador',
    short: 'Driver/adaptador',
    severity: 'critical',
    hint: 'O adaptador apareceu com estado anormal, ausente, não presente ou sem operação.'
  },
  cable_or_wifi_disconnected: {
    label: 'Cabo removido ou Wi‑Fi desconectado',
    short: 'Cabo/Wi‑Fi desconectado',
    severity: 'critical',
    hint: 'O adaptador está presente, mas sem link físico. Em Ethernet, normalmente indica cabo removido, mau contato ou switch/porta desligada.'
  },
  network_link_disconnected: {
    label: 'Link de rede desconectado',
    short: 'Link desconectado',
    severity: 'critical',
    hint: 'O Windows informou que a interface perdeu o link de comunicação.'
  },
  no_valid_ip: {
    label: 'Sem IP válido',
    short: 'Sem IP',
    severity: 'critical',
    hint: 'A placa está ativa, mas não recebeu IPv4 válido. Verifique DHCP, cabo, Wi‑Fi, VLAN ou roteador.'
  },
  no_gateway: {
    label: 'Sem gateway padrão',
    short: 'Sem gateway',
    severity: 'critical',
    hint: 'O computador tem IP, mas não possui rota padrão para sair da rede local.'
  },
  gateway_unreachable: {
    label: 'Gateway/roteador não respondeu',
    short: 'Gateway sem resposta',
    severity: 'critical',
    hint: 'A rede local aparenta falha. O roteador/switch/gateway não respondeu ao teste.'
  },
  dns_failure: {
    label: 'Falha de DNS',
    short: 'DNS falhou',
    severity: 'critical',
    hint: 'O computador está conectado, mas não conseguiu resolver nomes. Pode ser DNS, roteador, provedor ou bloqueio.'
  },
  no_internet_http_failure: {
    label: 'Cabo conectado, mas sem internet',
    short: 'Sem internet',
    severity: 'critical',
    hint: 'A rede local/DNS pode estar parcial, porém o teste HTTP externo falhou.'
  },
  api_unreachable: {
    label: 'Internet ok, mas API RealNet inacessível',
    short: 'API inacessível',
    severity: 'critical',
    hint: 'O computador tinha internet, mas não conseguiu validar a API. Verifique servidor, DNS, SSL, firewall ou rota.'
  },
  high_latency: {
    label: 'Latência alta',
    short: 'Latência alta',
    severity: 'warning',
    hint: 'A conexão respondeu, mas com atraso acima do limite configurado.'
  },
  packet_loss: {
    label: 'Perda de pacotes',
    short: 'Perda de pacotes',
    severity: 'warning',
    hint: 'A conexão respondeu, mas houve perda de pacotes acima do limite configurado.'
  },
  agent_no_contact: {
    label: 'Máquina desligada, sem internet ou agente parado',
    short: 'Sem contato',
    severity: 'critical',
    hint: 'A API deixou de receber batimentos do agente. Pode indicar computador desligado, energia, internet totalmente ausente ou agente parado.'
  },
  computer_restarted: {
    label: 'Reinicialização detectada',
    short: 'Reiniciou',
    severity: 'warning',
    hint: 'O agente voltou com horário de boot diferente do anterior. Pode ter havido reinício normal ou desligamento abrupto.'
  },
  unexpected_shutdown: {
    label: 'Possível desligamento abrupto detectado',
    short: 'Desligamento abrupto',
    severity: 'critical',
    hint: 'Eventos do Windows indicam desligamento inesperado ou perda de energia.'
  },
  agent_started: {
    label: 'Agente iniciado',
    short: 'Agente iniciou',
    severity: 'ok',
    hint: 'O serviço/tarefa do agente iniciou nessa máquina.'
  }
};

const EVENT_LABELS = {
  link_disconnected: 'Cabo/Wi‑Fi desconectado',
  adapter_problem: 'Adaptador/driver',
  no_ip: 'Sem IP',
  no_gateway: 'Sem gateway',
  gateway_unreachable: 'Gateway sem resposta',
  dns_failure: 'Falha DNS',
  internet_unreachable: 'Sem internet',
  api_unreachable: 'API inacessível',
  instability: 'Instabilidade',
  agent_no_contact: 'Sem contato com agente',
  computer_restarted: 'Reinicialização',
  unexpected_shutdown: 'Desligamento abrupto',
  offline: 'Offline',
  degraded: 'Instável',
  network_issue: 'Falha de rede'
};

function statusInfo(status) {
  return STATUS_LABELS[String(status || '').toLowerCase()] || STATUS_LABELS.unknown;
}

function reasonInfo(reason) {
  return REASON_LABELS[String(reason || '').toLowerCase()] || {
    label: reason || 'Não informado',
    short: reason || '-',
    severity: 'warning',
    hint: 'Causa recebida sem tradução cadastrada. Verifique os detalhes técnicos do evento.'
  };
}

function eventLabel(eventType) {
  return EVENT_LABELS[String(eventType || '').toLowerCase()] || eventType || 'Falha de rede';
}

function decorateStatus(row) {
  const agentOffline = Number(row.agent_offline || 0) === 1;
  const info = agentOffline ? reasonInfo('agent_no_contact') : reasonInfo(row.last_reason || 'unknown');
  const st = agentOffline ? { label: 'Agente sem contato', severity: 'critical', group: 'offline' } : statusInfo(row.last_status);
  return {
    status_label: st.label,
    status_group: st.group,
    severity: info.severity || st.severity,
    reason_label: info.label,
    reason_short: info.short,
    action_hint: info.hint,
    event_label: eventLabel(row.last_event_type || '')
  };
}

module.exports = { statusInfo, reasonInfo, eventLabel, decorateStatus };
