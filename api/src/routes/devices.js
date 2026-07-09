const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { mysqlDate } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await query(`
    SELECT *,
      CASE
        WHEN last_seen_at IS NULL THEN 1
        WHEN TIMESTAMPDIFF(SECOND, last_seen_at, UTC_TIMESTAMP()) > 60 THEN 1
        ELSE 0
      END AS agent_offline
    FROM devices
    ORDER BY agent_offline DESC, last_status ASC, employee_name ASC, hostname ASC
  `);
  res.json({ devices: rows });
});

router.get('/:id', async (req, res) => {
  const rows = await query('SELECT * FROM devices WHERE id = ? LIMIT 1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'device_not_found' });
  res.json({ device: rows[0] });
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
  res.json({ device: rows[0] });
});

module.exports = router;
