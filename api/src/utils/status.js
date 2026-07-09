function isProblemStatus(status) {
  return !['online', 'ok'].includes(String(status || '').toLowerCase());
}

function classifyEvent(status, reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('cable') || r.includes('disconnected') || r.includes('wifi')) return 'link_disconnected';
  if (r.includes('gateway')) return 'gateway_unreachable';
  if (r.includes('dns')) return 'dns_failure';
  if (r.includes('internet')) return 'internet_unreachable';
  if (r.includes('latency') || r.includes('packet')) return 'instability';
  if (r.includes('api')) return 'api_unreachable';
  if (String(status).toLowerCase() === 'offline') return 'offline';
  if (String(status).toLowerCase() === 'degraded') return 'degraded';
  return 'network_issue';
}

module.exports = { isProblemStatus, classifyEvent };
