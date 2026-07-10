const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { mysqlDate } = require('../utils/dates');
const config = require('../config');

const router = express.Router();
const releaseDir = process.env.RELEASES_DIR || path.join(process.cwd(), 'uploads', 'agent-releases');
fs.mkdirSync(releaseDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, releaseDir),
  filename: (req, file, cb) => {
    const version = String(req.body.version || 'sem-versao').replace(/[^0-9A-Za-z._-]/g, '_');
    cb(null, `realnet-agent-${version}-${Date.now()}.zip`);
  }
});
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } });

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

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

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

router.get('/download/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(releaseDir, filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'file_not_found' });
  res.download(file, filename);
});

router.use(requireAuth);

router.get('/releases', async (req, res) => {
  const rows = await query('SELECT * FROM agent_releases ORDER BY created_at DESC, id DESC LIMIT 100');
  const history = await query(`
    SELECT h.*, d.hostname, d.employee_name, d.title, d.department
    FROM agent_update_history h
    LEFT JOIN devices d ON d.id = h.device_id
    ORDER BY h.created_at DESC
    LIMIT 200
  `);
  res.json({ releases: rows, history });
});

router.post('/releases', upload.single('file'), async (req, res) => {
  const version = String(req.body.version || '').trim();
  if (!version) return res.status(400).json({ error: 'version_required' });
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const hash = await sha256File(req.file.path);
  const downloadUrl = `${baseUrl(req)}${config.apiBasePath}/updates/download/${req.file.filename}`;
  const now = mysqlDate();
  const mandatory = req.body.mandatory === 'true' || req.body.mandatory === true || req.body.mandatory === '1' ? 1 : 0;
  const active = req.body.active === 'false' || req.body.active === false || req.body.active === '0' ? 0 : 1;
  await query(`
    INSERT INTO agent_releases (version, file_name, download_url, sha256, mandatory, notes, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [version, req.file.filename, downloadUrl, hash, mandatory, req.body.notes || null, active, now, now]);
  const rows = await query('SELECT * FROM agent_releases WHERE file_name = ? LIMIT 1', [req.file.filename]);
  res.json({ release: rows[0] });
});

router.patch('/releases/:id', async (req, res) => {
  const fields = [];
  const params = [];
  for (const key of ['active', 'mandatory', 'notes']) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`);
      if (key === 'active' || key === 'mandatory') params.push(Number(Boolean(req.body[key])));
      else params.push(req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });
  fields.push('updated_at = ?'); params.push(mysqlDate()); params.push(req.params.id);
  await query(`UPDATE agent_releases SET ${fields.join(', ')} WHERE id = ?`, params);
  const rows = await query('SELECT * FROM agent_releases WHERE id = ? LIMIT 1', [req.params.id]);
  res.json({ release: rows[0] });
});

router.delete('/releases/:id', async (req, res) => {
  const rows = await query('SELECT * FROM agent_releases WHERE id = ? LIMIT 1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  await query('DELETE FROM agent_releases WHERE id = ?', [req.params.id]);
  try { fs.unlinkSync(path.join(releaseDir, rows[0].file_name)); } catch {}
  res.json({ ok: true });
});

module.exports = { router, cmpVersion };
