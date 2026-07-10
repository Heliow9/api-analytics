const { query } = require('../db');
const { mysqlDate } = require('../utils/dates');
const { reasonInfo, eventLabel } = require('../utils/labels');

let timer = null;

async function runOnce(thresholdSeconds = 90) {
  const now = mysqlDate();
  const info = reasonInfo('agent_no_contact');
  const rows = await query(`
    SELECT d.*
    FROM devices d
    LEFT JOIN network_events e ON e.device_id = d.id AND e.ended_at IS NULL
    WHERE d.is_enabled = 1
      AND d.last_seen_at IS NOT NULL
      AND TIMESTAMPDIFF(SECOND, d.last_seen_at, UTC_TIMESTAMP()) > ?
      AND e.id IS NULL
    LIMIT 200
  `, [thresholdSeconds]);

  for (const d of rows) {
    await query(`
      INSERT INTO network_events
        (device_id, started_at, event_type, event_label, probable_cause, probable_cause_label, severity, source, evidence_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      d.id,
      d.last_seen_at,
      'agent_no_contact',
      eventLabel('agent_no_contact'),
      'agent_no_contact',
      info.label,
      info.severity,
      'api_watchdog',
      JSON.stringify({ lastSeenAt: d.last_seen_at, thresholdSeconds, lastReason: d.last_reason, hostname: d.hostname }).slice(0, 16000000),
      now,
      now
    ]);
  }

  return rows.length;
}

function startOfflineWatchdog({ thresholdSeconds = 90, intervalSeconds = 30 } = {}) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    runOnce(thresholdSeconds).catch(err => console.error('[watchdog] erro', err));
  }, Math.max(15, intervalSeconds) * 1000);
  runOnce(thresholdSeconds).catch(err => console.error('[watchdog] erro inicial', err));
  console.log(`[watchdog] Monitorando agentes sem contato. threshold=${thresholdSeconds}s interval=${intervalSeconds}s`);
}

module.exports = { startOfflineWatchdog, runOnce };
