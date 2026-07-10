function isProblemStatus(status) {
  return !['online', 'ok'].includes(String(status || '').toLowerCase());
}

function classifyEvent(status, reason) {
  const r = String(reason || '').toLowerCase();
  if (['no_adapter_found', 'adapter_disabled', 'adapter_driver_or_hardware_issue'].includes(r)) return 'adapter_problem';
  if (r.includes('cable') || r.includes('wifi') || r.includes('link_disconnected') || r.includes('disconnected')) return 'link_disconnected';
  if (r.includes('no_valid_ip')) return 'no_ip';
  if (r.includes('no_gateway')) return 'no_gateway';
  if (r.includes('gateway')) return 'gateway_unreachable';
  if (r.includes('dns')) return 'dns_failure';
  if (r.includes('internet')) return 'internet_unreachable';
  if (r.includes('api')) return 'api_unreachable';
  if (r.includes('latency') || r.includes('packet')) return 'instability';
  if (r.includes('agent_no_contact')) return 'agent_no_contact';
  if (r.includes('computer_restarted')) return 'computer_restarted';
  if (r.includes('unexpected_shutdown')) return 'unexpected_shutdown';
  if (String(status).toLowerCase() === 'offline') return 'offline';
  if (String(status).toLowerCase() === 'degraded') return 'degraded';
  return 'network_issue';
}

module.exports = { isProblemStatus, classifyEvent };
