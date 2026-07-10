const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { mysqlDate } = require('../utils/dates');
const { decorateStatus } = require('../utils/labels');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

function decorate(row) {
  const d = { ...row };
  d.seconds_since_contact = d.last_seen_at ? Number(d.seconds_since_contact || 0) : null;
  const labels = decorateStatus(d);
  return { ...d, ...labels };
}

router.get('/', async (req, res) => {
  const rows = await query(`
    SELECT *,
      CASE
        WHEN last_seen_at IS NULL THEN 1
        WHEN TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) > ? THEN 1
        ELSE 0
      END AS agent_offline,
      CASE WHEN last_seen_at IS NULL THEN NULL ELSE TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) END AS seconds_since_contact
    FROM devices
    ORDER BY agent_offline DESC, last_status ASC, employee_name ASC, hostname ASC
  `, [config.offlineThresholdSeconds]);
  res.json({ devices: rows.map(decorate), offlineThresholdSeconds: config.offlineThresholdSeconds });
});

router.get('/:id', async (req, res) => {
  const rows = await query(`
    SELECT *,
      CASE
        WHEN last_seen_at IS NULL THEN 1
        WHEN TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) > ? THEN 1
        ELSE 0
      END AS agent_offline,
      CASE WHEN last_seen_at IS NULL THEN NULL ELSE TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) END AS seconds_since_contact
    FROM devices WHERE id = ? LIMIT 1
  `, [config.offlineThresholdSeconds, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'device_not_found' });
  res.json({ device: decorate(rows[0]) });
});

router.get('/:id/detail', async (req, res) => {
  const rows = await query('SELECT * FROM devices WHERE id = ? LIMIT 1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'device_not_found' });
  const samples = await query('SELECT * FROM network_samples WHERE device_id = ? ORDER BY collected_at DESC LIMIT 120', [req.params.id]);
  const events = await query('SELECT * FROM network_events WHERE device_id = ? ORDER BY started_at DESC LIMIT 80', [req.params.id]);
  const audit = await query('SELECT * FROM agent_audit WHERE device_id = ? ORDER BY created_at DESC LIMIT 80', [req.params.id]);
  res.json({ device: decorate(rows[0]), samples, events, audit });
});

router.patch('/:id', async (req, res) => {
  const allowed = ['title', 'employee_name', 'department', 'is_enabled'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });
  updates.push('updated_at = ?');
  params.push(mysqlDate());
  params.push(req.params.id);
  await query(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`, params);
  const rows = await query('SELECT * FROM devices WHERE id = ? LIMIT 1', [req.params.id]);
  res.json({ device: decorate(rows[0]) });
});

module.exports = router;
