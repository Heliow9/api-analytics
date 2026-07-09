const os = require('os');
const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

function execPowershell(command, timeout = 6000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { timeout }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.trim());
    });
  });
}

function getIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  return ips;
}

async function getAdapterInfo() {
  const fallback = { adapterName: null, linkStatus: getIps().length ? 'connected' : 'disconnected', gateway: null, ips: getIps() };
  const ps = `
    $cfg = Get-NetIPConfiguration | Where-Object {$_.IPv4Address -ne $null} | Select-Object -First 1;
    if ($cfg -eq $null) { Write-Output '{}'; exit }
    $adapter = Get-NetAdapter -InterfaceIndex $cfg.InterfaceIndex -ErrorAction SilentlyContinue;
    [PSCustomObject]@{
      adapterName = $cfg.InterfaceAlias;
      linkStatus = if ($adapter.Status -eq 'Up') {'connected'} elseif ($adapter.Status -eq 'Disconnected') {'disconnected'} else {$adapter.Status};
      gateway = if ($cfg.IPv4DefaultGateway) {$cfg.IPv4DefaultGateway.NextHop} else {$null};
      ips = @($cfg.IPv4Address.IPAddress)
    } | ConvertTo-Json -Compress
  `;
  const out = await execPowershell(ps);
  if (!out) return fallback;
  try {
    const obj = JSON.parse(out);
    return { ...fallback, ...obj, ips: Array.isArray(obj.ips) ? obj.ips : (obj.ips ? [obj.ips] : fallback.ips) };
  } catch { return fallback; }
}

function pingHost(host, count = 2) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin ? ['-n', String(count), '-w', '1500', host] : ['-c', String(count), '-W', '2', host];
    execFile('ping', args, { timeout: 6000 }, (err, stdout) => {
      const text = stdout || '';
      const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let packetLoss = err ? 100 : 0;
      let avgMs = null;

      // Windows em PT-BR: "Perdidos = 0 (0% de perda)" / "Media = 12ms"
      // Windows em EN:    "Lost = 0 (0% loss)" / "Average = 12ms"
      // Linux:            "2 packets transmitted... 0% packet loss" / "rtt min/avg/max..."
      const lossPct = normalized.match(/\((\d+(?:[.,]\d+)?)%\s*(?:de\s*)?(?:perda|loss)/i)
        || normalized.match(/(\d+(?:[.,]\d+)?)%\s*(?:packet\s*)?loss/i)
        || normalized.match(/(\d+(?:[.,]\d+)?)%\s*de\s*perda/i);
      if (lossPct) packetLoss = Number(String(lossPct[1]).replace(',', '.'));

      const avgNamed = normalized.match(/(?:Average|Media)\s*=\s*(\d+(?:[.,]\d+)?)\s*ms/i);
      const avgUnix = normalized.match(/=\s*[\d.]+\/(\d+(?:\.\d+)?)\//);
      if (avgNamed) avgMs = Math.round(Number(String(avgNamed[1]).replace(',', '.')));
      else if (avgUnix) avgMs = Math.round(Number(avgUnix[1]));
      else {
        const msMatches = [...normalized.matchAll(/=\s*(\d+(?:[.,]\d+)?)\s*ms/gi)];
        if (msMatches.length) avgMs = Math.round(Number(String(msMatches[msMatches.length - 1][1]).replace(',', '.')));
      }

      resolve({ ok: !err || packetLoss < 100, avgMs, packetLoss });
    });
  });
}

async function dnsOk(host) {
  try { await dns.resolve(host); return true; } catch { return false; }
}

function httpOk(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch { resolve(false); }
  });
}

module.exports = { getAdapterInfo, pingHost, dnsOk, httpOk };
