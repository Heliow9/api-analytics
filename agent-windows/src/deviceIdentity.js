const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(process.env.ProgramData || process.cwd(), 'RealNetAgent');
const identityFile = path.join(dataDir, 'device.json');

function ensureIdentity() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(identityFile)) {
    try { return JSON.parse(fs.readFileSync(identityFile, 'utf8')).deviceId; } catch {}
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(identityFile, JSON.stringify({ deviceId: id, createdAt: new Date().toISOString() }, null, 2));
  return id;
}

module.exports = { ensureIdentity, dataDir };
