const express = require('express');
const { query } = require('../db');
const { requireAgentKey } = require('../middleware/auth');
const { mysqlDate, asDate } = require('../utils/dates');
const { isProblemStatus, classifyEvent } = require('../utils/status');
const { reasonInfo, eventLabel } = require('../utils/labels');
const realtime = require('../realtime');

const router = express.Router();

function boolToDb(v) {
  return v == null ? null : Number(Boolean(v));
}

function safeJson(value, max = 16000000) {
  try { return JSON.stringify(value).slice(0, max); } catch { return null; }
}

function normalizeIp(network) {
  return Array.isArray(network.ips) ? network.ips.join(', ') : (network.ip || null);
}

async function insertEvent({ deviceId, startedAt, status, reason, network, source = 'agent' }) {
  const eventType = classifyEvent(status, reason);
  const info = reasonInfo(reason);
  const now = mysqlDate();
  await query(`
    INSERT INTO network_events
      (device_id, started_at, event_type, event_label, probable_cause, probable_cause_label, severity, source, evidence_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    deviceId, startedAt, eventType, eventLabel(eventType), reason, info.label, info.severity, source,
    safeJson({ network, firstSampleAt: startedAt }), now, now
  ]);
}

async function closeOpenEvent(deviceId, endedAt) {
  const openEvents = await query(
    'SELECT * FROM network_events WHERE device_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1',
    [deviceId]
  );
  const openEvent = openEvents[0];
  if (!openEvent) return null;
  await query(`
    UPDATE network_events
    SET ended_at = ?, duration_seconds = TIMESTAMPDIFF(SECOND, started_at, ?), updated_at = ?
    WHERE id = ?
  `, [endedAt, endedAt, mysqlDate(), openEvent.id]);
  return openEvent;
}

router.post('/heartbeat', requireAgentKey, async (req, res) => {
  const body = req.body || {};
  const network = body.network || {};
  const diagnostics = body.diagnostics || {};
  const system = body.system || {};
  const now = mysqlDate();
  const collectedAt = mysqlDate(asDate(body.timestamp));
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId_required' });

  const previousRows = await query('SELECT * FROM devices WHERE id = ? LIMIT 1', [deviceId]);
  const previous = previousRows[0];

  const ipAddress = normalizeIp(network);
  const status = network.status || body.status || 'unknown';
  const reason = network.reason || body.reason || null;
  const rInfo = reasonInfo(reason);
  const evType = classifyEvent(status, reason);
  const bootTime = system.bootTime ? mysqlDate(asDate(system.bootTime)) : null;

  await query(`
    INSERT INTO devices
      (id, hostname, os_platform, os_release, username_windows, title, employee_name, department,
       agent_version, last_seen_at, last_seen_server_at, last_status, last_reason, last_reason_label, last_event_type,
       last_ip, last_latency_ms, last_packet_loss, last_adapter_name, last_adapter_status, last_link_status,
       last_connection_type, last_wifi_ssid, last_gateway, last_dns_ok, last_internet_ok, last_api_ok,
       last_boot_time, last_uptime_seconds, last_sample_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      last_seen_server_at = VALUES(last_seen_server_at),
      last_status = VALUES(last_status),
      last_reason = VALUES(last_reason),
      last_reason_label = VALUES(last_reason_label),
      last_event_type = VALUES(last_event_type),
      last_ip = VALUES(last_ip),
      last_latency_ms = VALUES(last_latency_ms),
      last_packet_loss = VALUES(last_packet_loss),
      last_adapter_name = VALUES(last_adapter_name),
      last_adapter_status = VALUES(last_adapter_status),
      last_link_status = VALUES(last_link_status),
      last_connection_type = VALUES(last_connection_type),
      last_wifi_ssid = VALUES(last_wifi_ssid),
      last_gateway = VALUES(last_gateway),
      last_dns_ok = VALUES(last_dns_ok),
      last_internet_ok = VALUES(last_internet_ok),
      last_api_ok = VALUES(last_api_ok),
      last_boot_time = VALUES(last_boot_time),
      last_uptime_seconds = VALUES(last_uptime_seconds),
      last_sample_json = VALUES(last_sample_json),
      updated_at = VALUES(updated_at)
  `, [
    deviceId, body.hostname || null, body.osPlatform || null, body.osRelease || null, body.username || null,
    body.title || null, body.employeeName || null, body.department || null, body.agentVersion || null,
    collectedAt, now, status, reason, rInfo.label, evType, ipAddress, network.latencyMs ?? null, network.packetLoss ?? null,
    network.adapterName || diagnostics.adapterName || null,
    network.adapterStatus || diagnostics.adapterStatus || null,
    network.linkStatus || null,
    network.connectionType || diagnostics.connectionType || null,
    network.wifiSsid || diagnostics.wifiSsid || null,
    network.gateway || null,
    boolToDb(network.dnsOk), boolToDb(network.internetOk), boolToDb(network.apiOk),
    bootTime, system.uptimeSeconds ?? null, safeJson(body), now, now
  ]);

  await query(`
    INSERT INTO network_samples
      (device_id, collected_at, adapter_name, adapter_status, link_status, connection_type, wifi_ssid,
       ip_address, gateway, gateway_latency_ms, dns_ok, internet_ok, api_ok, latency_ms, packet_loss,
       status, reason, reason_label, boot_time, uptime_seconds, diagnostics_json, raw_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    deviceId, collectedAt, network.adapterName || diagnostics.adapterName || null,
    network.adapterStatus || diagnostics.adapterStatus || null,
    network.linkStatus || null,
    network.connectionType || diagnostics.connectionType || null,
    network.wifiSsid || diagnostics.wifiSsid || null,
    ipAddress, network.gateway || null, network.gatewayPingMs ?? null,
    boolToDb(network.dnsOk), boolToDb(network.internetOk), boolToDb(network.apiOk),
    network.latencyMs ?? null, network.packetLoss ?? null, status, reason, rInfo.label,
    bootTime, system.uptimeSeconds ?? null, safeJson(diagnostics), safeJson(body), now
  ]);

  if (previous?.last_boot_time && bootTime) {
    const prevBoot = new Date(String(previous.last_boot_time).replace(' ', 'T') + 'Z').getTime();
    const newBoot = new Date(String(bootTime).replace(' ', 'T') + 'Z').getTime();
    if (Math.abs(newBoot - prevBoot) > 60000) {
      await query(
        'INSERT INTO agent_audit (device_id, event_type, message, raw_payload, created_at) VALUES (?, ?, ?, ?, ?)',
        [deviceId, 'computer_restarted', 'Reinicialização detectada pelo horário de boot do Windows.', safeJson({ previousBoot: previous.last_boot_time, bootTime, recentPowerEvents: system.recentPowerEvents || [] }), now]
      );
    }
  }

  if (Array.isArray(system.recentPowerEvents)) {
    const unexpected = system.recentPowerEvents.find(e => [41, 6008].includes(Number(e.id)));
    if (unexpected && body.agentStart === true) {
      await query(
        'INSERT INTO agent_audit (device_id, event_type, message, raw_payload, created_at) VALUES (?, ?, ?, ?, ?)',
        [deviceId, 'unexpected_shutdown', 'Evento do Windows indica desligamento inesperado/perda de energia.', safeJson(unexpected), now]
      );
    }
  }

  const problem = isProblemStatus(status);
  const openRows = await query('SELECT * FROM network_events WHERE device_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [deviceId]);
  const openEvent = openRows[0];

  if (problem) {
    if (!openEvent) {
      await insertEvent({ deviceId, startedAt: collectedAt, status, reason, network, source: 'agent' });
    } else if (openEvent.event_type !== evType) {
      await closeOpenEvent(deviceId, collectedAt);
      await insertEvent({ deviceId, startedAt: collectedAt, status, reason, network, source: 'agent' });
    }
  } else if (openEvent) {
    await closeOpenEvent(deviceId, collectedAt);
  }

  realtime.broadcast('heartbeat', { deviceId, status, reason, reasonLabel: rInfo.label, lastSeenAt: collectedAt });
  res.json({ ok: true, receivedAt: now, collectedAt });
});

router.post('/audit', requireAgentKey, async (req, res) => {
  const { deviceId, eventType, message } = req.body || {};
  await query(
    'INSERT INTO agent_audit (device_id, event_type, message, raw_payload, created_at) VALUES (?, ?, ?, ?, ?)',
    [deviceId || null, eventType || 'agent_event', message || null, safeJson(req.body || {}), mysqlDate()]
  );
  realtime.broadcast('audit', { deviceId, eventType, message });
  res.json({ ok: true });
});

function cmpVersion(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split(/[.-]/).map(x => Number.parseInt(x, 10)).map(x => Number.isFinite(x) ? x : 0);
  const pb = String(b).split(/[.-]/).map(x => Number.parseInt(x, 10)).map(x => Number.isFinite(x) ? x : 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0; const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

router.get('/update/check', requireAgentKey, async (req, res) => {
  const currentVersion = String(req.query.version || '0.0.0');
  const deviceId = String(req.query.deviceId || '').trim();
  const releases = await query('SELECT * FROM agent_releases WHERE active = 1 ORDER BY created_at DESC, id DESC LIMIT 50');
  const newer = releases
    .filter(r => cmpVersion(r.version, currentVersion) > 0)
    .sort((a, b) => cmpVersion(b.version, a.version))[0];

  if (deviceId) {
    await query(
      'INSERT INTO agent_update_history (device_id, from_version, to_version, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [deviceId, currentVersion, newer?.version || null, newer ? 'available' : 'checked', newer ? 'Atualização disponível.' : 'Sem atualização disponível.', mysqlDate()]
    ).catch(() => {});
  }

  if (!newer) return res.json({ updateAvailable: false, currentVersion });
  res.json({
    updateAvailable: true,
    currentVersion,
    latestVersion: newer.version,
    downloadUrl: newer.download_url,
    sha256: newer.sha256,
    mandatory: Number(newer.mandatory || 0) === 1,
    notes: newer.notes || ''
  });
});

router.post('/update/report', requireAgentKey, async (req, res) => {
  const body = req.body || {};
  await query(`
    INSERT INTO agent_update_history (device_id, from_version, to_version, status, message, raw_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    body.deviceId || null,
    body.fromVersion || null,
    body.version || body.toVersion || null,
    body.status || 'reported',
    body.message || null,
    safeJson(body),
    mysqlDate()
  ]);
  realtime.broadcast('agent_update', { deviceId: body.deviceId, status: body.status, version: body.version || body.toVersion });
  res.json({ ok: true });
});


router.post('/inventory', requireAgentKey, async (req, res) => {
  const body = req.body || {};
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId_required' });
  const now = mysqlDate(asDate(body.timestamp) || new Date());
  const processes = Array.isArray(body.processes) ? body.processes.slice(0, 600) : [];
  const services = Array.isArray(body.services) ? body.services.slice(0, 1000) : [];

  await query('DELETE FROM device_processes_current WHERE device_id = ?', [deviceId]);
  for (const p of processes) {
    await query(`
      INSERT INTO device_processes_current
        (device_id, pid, name, path, window_title, username, cpu_seconds, memory_mb, has_window, collected_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      deviceId, Number(p.pid || 0), p.name || null, p.path || null, p.windowTitle || null,
      p.username || null, p.cpuSeconds ?? null, p.memoryMb ?? null, Number(Boolean(p.hasWindow || p.windowTitle)), now, safeJson(p)
    ]);
  }

  await query('DELETE FROM device_services_current WHERE device_id = ?', [deviceId]);
  for (const svc of services) {
    await query(`
      INSERT INTO device_services_current
        (device_id, name, display_name, state, start_mode, process_id, path_name, start_name, collected_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      deviceId, svc.name || null, svc.displayName || svc.name || null, svc.state || null, svc.startMode || null,
      svc.processId ?? null, svc.pathName || null, svc.startName || null, now, safeJson(svc)
    ]);
  }

  await query(
    'UPDATE devices SET last_inventory_at = ?, process_count = ?, service_count = ?, updated_at = ? WHERE id = ?',
    [now, processes.length, services.length, mysqlDate(), deviceId]
  ).catch(() => {});

  realtime.broadcast('inventory', { deviceId, processCount: processes.length, serviceCount: services.length, at: now });
  res.json({ ok: true, processCount: processes.length, serviceCount: services.length });
});

router.get('/commands/poll', requireAgentKey, async (req, res) => {
  const deviceId = String(req.query.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId_required' });
  const rows = await query(`
    SELECT * FROM device_commands
    WHERE device_id = ? AND status = 'pending'
    ORDER BY id ASC
    LIMIT 1
  `, [deviceId]);
  const cmd = rows[0];
  if (!cmd) return res.json({ command: null });
  await query(`
    UPDATE device_commands
    SET status = 'running', picked_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `, [mysqlDate(), mysqlDate(), cmd.id]);
  let args = {};
  try { args = JSON.parse(cmd.args_json || '{}'); } catch {}
  realtime.broadcast('remote_command', { deviceId, commandId: cmd.id, status: 'running', commandType: cmd.command_type });
  res.json({ command: { ...cmd, args } });
});

router.post('/commands/:id/result', requireAgentKey, async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const status = body.status === 'success' ? 'success' : 'failed';
  await query(`
    UPDATE device_commands
    SET status = ?, finished_at = ?, result_message = ?, raw_result = ?, updated_at = ?
    WHERE id = ?
  `, [status, mysqlDate(), body.message || null, safeJson(body), mysqlDate(), id]);
  const rows = await query('SELECT * FROM device_commands WHERE id = ? LIMIT 1', [id]);
  const cmd = rows[0];
  if (cmd) {
    await query(
      'INSERT INTO agent_audit (device_id, event_type, message, raw_payload, created_at) VALUES (?, ?, ?, ?, ?)',
      [cmd.device_id, 'remote_command_result', `${cmd.command_label || cmd.command_type}: ${status}`, safeJson(body), mysqlDate()]
    );
    realtime.broadcast('remote_command', { deviceId: cmd.device_id, commandId: id, status, commandType: cmd.command_type });
  }
  res.json({ ok: true });
});

module.exports = router;
