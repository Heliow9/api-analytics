const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { eventLabel, reasonInfo } = require('../utils/labels');

const router = express.Router();
router.use(requireAuth);

function filters(req) {
  const from = req.query.from ? `${req.query.from} 00:00:00` : '1970-01-01 00:00:00';
  const to = req.query.to ? `${req.query.to} 23:59:59` : '2999-12-31 23:59:59';
  const deviceId = req.query.deviceId || null;
  return { from, to, deviceId };
}

function decorateEvent(row) {
  const info = reasonInfo(row.probable_cause);
  return {
    ...row,
    event_label: row.event_label || eventLabel(row.event_type),
    probable_cause_label: row.probable_cause_label || info.label,
    action_hint: info.hint,
    severity: row.severity || info.severity
  };
}

router.get('/summary', async (req, res) => {
  const { from, to, deviceId } = filters(req);
  const params = [from, to];
  let deviceWhere = '';
  if (deviceId) { deviceWhere = 'AND e.device_id = ?'; params.push(deviceId); }

  const events = await query(`
    SELECT
      COUNT(*) AS total_events,
      SUM(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()) ELSE duration_seconds END) AS total_seconds,
      MAX(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()) ELSE duration_seconds END) AS max_seconds
    FROM network_events e
    WHERE e.started_at BETWEEN ? AND ? ${deviceWhere}
  `, params);

  const byDevice = await query(`
    SELECT d.id, d.title, d.employee_name, d.department, d.hostname,
      COUNT(e.id) AS total_events,
      SUM(CASE WHEN e.ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, e.started_at, UTC_TIMESTAMP()) ELSE e.duration_seconds END) AS total_seconds,
      MAX(CASE WHEN e.ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, e.started_at, UTC_TIMESTAMP()) ELSE e.duration_seconds END) AS max_seconds
    FROM devices d
    LEFT JOIN network_events e ON e.device_id = d.id AND e.started_at BETWEEN ? AND ?
    ${deviceId ? 'WHERE d.id = ?' : ''}
    GROUP BY d.id, d.title, d.employee_name, d.department, d.hostname
    ORDER BY total_seconds DESC
  `, deviceId ? [from, to, deviceId] : [from, to]);

  const byType = await query(`
    SELECT event_type, event_label, COUNT(*) AS total_events,
      SUM(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()) ELSE duration_seconds END) AS total_seconds
    FROM network_events e
    WHERE e.started_at BETWEEN ? AND ? ${deviceWhere}
    GROUP BY event_type, event_label
    ORDER BY total_events DESC
  `, params);

  const byCause = await query(`
    SELECT probable_cause, probable_cause_label, severity, COUNT(*) AS total_events,
      SUM(CASE WHEN ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()) ELSE duration_seconds END) AS total_seconds
    FROM network_events e
    WHERE e.started_at BETWEEN ? AND ? ${deviceWhere}
    GROUP BY probable_cause, probable_cause_label, severity
    ORDER BY total_events DESC
  `, params);

  const sampleQuality = await query(`
    SELECT
      AVG(latency_ms) AS avg_latency_ms,
      MAX(latency_ms) AS max_latency_ms,
      AVG(packet_loss) AS avg_packet_loss,
      MAX(packet_loss) AS max_packet_loss,
      COUNT(*) AS total_samples
    FROM network_samples s
    WHERE s.collected_at BETWEEN ? AND ? ${deviceId ? 'AND s.device_id = ?' : ''}
  `, deviceId ? [from, to, deviceId] : [from, to]);

  res.json({
    summary: events[0],
    byDevice,
    byType: byType.map(r => ({ ...r, event_label: r.event_label || eventLabel(r.event_type) })),
    byCause: byCause.map(r => ({ ...r, probable_cause_label: r.probable_cause_label || reasonInfo(r.probable_cause).label })),
    sampleQuality: sampleQuality[0]
  });
});

router.get('/events', async (req, res) => {
  const { from, to, deviceId } = filters(req);
  const params = [from, to];
  let deviceWhere = '';
  if (deviceId) { deviceWhere = 'AND e.device_id = ?'; params.push(deviceId); }
  const rows = await query(`
    SELECT e.*, CASE WHEN e.ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, e.started_at, UTC_TIMESTAMP()) ELSE e.duration_seconds END AS duration_seconds_current, d.title, d.employee_name, d.department, d.hostname
    FROM network_events e
    JOIN devices d ON d.id = e.device_id
    WHERE e.started_at BETWEEN ? AND ? ${deviceWhere}
    ORDER BY e.started_at DESC
    LIMIT 1000
  `, params);
  res.json({ events: rows.map(decorateEvent) });
});

router.get('/samples', async (req, res) => {
  const { from, to, deviceId } = filters(req);
  const params = [from, to];
  let deviceWhere = '';
  if (deviceId) { deviceWhere = 'AND s.device_id = ?'; params.push(deviceId); }
  const rows = await query(`
    SELECT s.*, d.title, d.employee_name, d.department, d.hostname
    FROM network_samples s
    JOIN devices d ON d.id = s.device_id
    WHERE s.collected_at BETWEEN ? AND ? ${deviceWhere}
    ORDER BY s.collected_at DESC
    LIMIT 3000
  `, params);
  res.json({ samples: rows });
});

router.get('/events.csv', async (req, res) => {
  const { from, to, deviceId } = filters(req);
  const params = [from, to];
  let deviceWhere = '';
  if (deviceId) { deviceWhere = 'AND e.device_id = ?'; params.push(deviceId); }
  const rows = await query(`
    SELECT e.id, d.employee_name, d.title, d.department, d.hostname, e.started_at, e.ended_at,
      CASE WHEN e.ended_at IS NULL THEN TIMESTAMPDIFF(SECOND, e.started_at, UTC_TIMESTAMP()) ELSE e.duration_seconds END AS duration_seconds,
      e.event_type, e.event_label, e.probable_cause, e.probable_cause_label, e.severity, e.source
    FROM network_events e
    JOIN devices d ON d.id = e.device_id
    WHERE e.started_at BETWEEN ? AND ? ${deviceWhere}
    ORDER BY e.started_at DESC
    LIMIT 10000
  `, params);
  const header = ['id','funcionario','titulo','setor','maquina','inicio','fim','duracao_segundos','tipo','tipo_pt','causa_provavel','causa_pt','gravidade','origem'];
  const escape = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [header.join(';')].concat(rows.map(r => header.map(h => escape({
    id:r.id, funcionario:r.employee_name, titulo:r.title, setor:r.department, maquina:r.hostname, inicio:r.started_at,
    fim:r.ended_at, duracao_segundos:r.duration_seconds, tipo:r.event_type, tipo_pt:r.event_label || eventLabel(r.event_type), causa_provavel:r.probable_cause,
    causa_pt:r.probable_cause_label || reasonInfo(r.probable_cause).label, gravidade:r.severity, origem:r.source
  }[h])).join(';'))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="eventos_rede.csv"');
  res.send('\ufeff' + csv);
});

module.exports = router;
