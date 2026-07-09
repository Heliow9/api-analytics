const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { mysqlDate } = require('../utils/dates');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email_password_required' });

  const rows = await query('SELECT * FROM admins WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return res.status(401).json({ error: 'invalid_credentials' });

  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name }, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

router.get('/me', requireAuth, async (req, res) => {
  const rows = await query('SELECT id, name, email, created_at FROM admins WHERE id = ? LIMIT 1', [req.admin.id]);
  res.json({ admin: rows[0] || req.admin });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'passwords_required' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'new_password_min_8' });

  const rows = await query('SELECT * FROM admins WHERE id = ? LIMIT 1', [req.admin.id]);
  if (!rows.length) return res.status(404).json({ error: 'admin_not_found' });

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'current_password_invalid' });

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, mysqlDate(), req.admin.id]);
  res.json({ ok: true });
});

module.exports = router;
