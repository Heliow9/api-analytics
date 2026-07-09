const express = require('express');
const { query } = require('../db');
const { requireAgentKey } = require('../middleware/auth');
const { mysqlDate, asDate } = require('../utils/dates');
const { isProblemStatus, classifyEvent } = require('../utils/status');
const realtime = require('../realtime');

const router = express.Router();

router.post('/heartbeat', requireAgentKey, async (req, res) => {
  const body = req.body || {};
  const network = body.network || {};
  const now = mysqlDate();
  const collectedAt = mysqlDate(asDate(body.timestamp));
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId_required' });

  const ipAddress = Array.isArray(network.ips) ? network.ips.join(', ') : (network.ip || null);
  const status = network.status || body.status || 'unknown';
  const reason = network.reason || body.reason || null;

  await query(`
    INSERT INTO devices
      (id, hostname, os_platform, os_release, username_windows, title, employee_name, department,
       agent_version, last_seen_at, last_status, last_reason, last_ip, last_latency_ms, last_packet_loss,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      hostname = VALUES(hostname),
      os_platform = VALUES(os_platform),
      os_release = VALUES(os_release),
      username_windows = VALUES(username_windows),
      title = IF(VALUES(title) IS NULL OR VALUES(title) = '', title, VALUES(title)),
      employee_name = IF(VALUES(employee_name) IS NULL OR VALUES(employee_name) = '', employee_name, VALUES(employee_name)),
      department = IF(VALUES(department) IS NULL OR VALUES(department) = '', department, VALUES(department)),
      agent_version = VALUES(agent_version),
      last_seen_at = VALUES(last_seen_at),
      last_status = VALUES(last_status),
      last_reason = VALUES(last_reason),
      last_ip = VALUES(last_ip),
      last_latency_ms = VALUES(last_latency_ms),
      last_packet_loss = VALUES(last_packet_loss),
      updated_at = VALUES(updated_at)
  `, [
    deviceId, body.hostname || null, body.osPlatform || null, body.osRelease || null, body.username || null,
    body.title || null, body.employeeName || null, body.department || null, body.agentVersion || null,
    now, status, reason, ipAddress, network.latencyMs ?? null, network.packetLoss ?? null,
    now, now
  ]);

  await query(`
    INSERT INTO network_samples
      (device_id, collected_at, adapter_name, link_status, ip_address, gateway, gateway_latency_ms,
       dns_ok, internet_ok, api_ok, latency_ms, packet_loss, status, reason, raw_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    deviceId, collectedAt, network.adapterName || null, network.linkStatus || null, ipAddress, network.gateway || null,
    network.gatewayPingMs ?? null, network.dnsOk == null ? null : Number(Boolean(network.dnsOk)),
    network.internetOk == null ? null : Number(Boolean(network.internetOk)),
    network.apiOk == null ? null : Number(Boolean(network.apiOk)),
    network.latencyMs ?? null, network.packetLoss ?? null, status, reason,
    JSON.stringify(body).slice(0, 16000000), now
  ]);

  const problem = isProblemStatus(status);
  const openEvents = await query(
    'SELECT * FROM network_events WHERE device_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1',
    [deviceId]
  );
  const openEvent = openEvents[0];

  if (problem && !openEvent) {
    await query(`
      INSERT INTO network_events
        (device_id, started_at, event_type, probable_cause, evidence_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      deviceId, collectedAt, classifyEvent(status, reason), reason,
      JSON.stringify({ network, firstSampleAt: collectedAt }), now, now
    ]);
  }

  if (!problem && openEvent) {
    await query(`
      UPDATE network_events
      SET ended_at = ?, duration_seconds = TIMESTAMPDIFF(SECOND, started_at, ?), updated_at = ?
      WHERE id = ?
    `, [collectedAt, collectedAt, now, openEvent.id]);
  }

  realtime.broadcast('heartbeat', { deviceId, status, reason, lastSeenAt: now });
  res.json({ ok: true, receivedAt: now });
});

router.post('/audit', requireAgentKey, async (req, res) => {
  const { deviceId, eventType, message } = req.body || {};
  await query(
    'INSERT INTO agent_audit (device_id, event_type, message, created_at) VALUES (?, ?, ?, ?)',
    [deviceId || null, eventType || 'agent_event', message || null, mysqlDate()]
  );
  res.json({ ok: true });
});

module.exports = router;
