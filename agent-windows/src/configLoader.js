const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function getProgramDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'RealNetAgent');
  }
  return path.join(process.env.HOME || '.', '.realnet-agent');
}

function getConfigCandidates() {
  return uniq([
    process.env.REALNET_AGENT_ENV,
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.execPath || ''), '.env'),
    path.join(getProgramDataDir(), '.env')
  ]);
}

function loadConfig() {
  const candidates = getConfigCandidates();
  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) {
        dotenv.config({ path: file, override: false });
        process.env.REALNET_AGENT_ENV_LOADED = file;
        return file;
      }
    } catch {}
  }
  dotenv.config();
  return null;
}

function ensureProgramDataDir() {
  const dir = getProgramDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { loadConfig, getProgramDataDir, ensureProgramDataDir };
