const os = require('os');
const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

function execPowershell(command, timeout = 8000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { timeout, maxBuffer: 1024 * 1024 * 4 }, (err, stdout) => {
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

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

async function getWifiSsid() {
  const out = await execPowershell(`
    $txt = netsh wlan show interfaces 2>$null;
    $line = $txt | Where-Object {$_ -match '^\s*SSID\s+:'} | Select-Object -First 1;
    if ($line) { ($line -replace '^\s*SSID\s+:\s*','').Trim() }
  `, 5000);
  return out || null;
}

async function getAdapterInfo() {
  const fallbackIps = getIps();
  const fallback = {
    adapterName: null,
    adapterStatus: fallbackIps.length ? 'Up' : 'Disconnected',
    linkStatus: fallbackIps.length ? 'connected' : 'disconnected',
    connectionType: null,
    wifiSsid: null,
    gateway: null,
    ips: fallbackIps,
    diagnostics: { source: 'fallback_os_networkInterfaces' },
    allAdapters: []
  };

  const ps = `
    $ErrorActionPreference = 'SilentlyContinue';
    $configs = @(Get-NetIPConfiguration | Where-Object {$_.IPv4Address -ne $null});
    $preferred = $configs | Where-Object {$_.IPv4DefaultGateway -ne $null} | Select-Object -First 1;
    if ($preferred -eq $null) { $preferred = $configs | Select-Object -First 1 }
    $adapters = @(Get-NetAdapter -IncludeHidden | Select-Object Name, InterfaceDescription, ifIndex, Status, MacAddress, LinkSpeed, MediaConnectionState, AdminStatus, InterfaceOperationalStatus, DriverInformation, DriverFileName);
    $activeAdapter = $null;
    if ($preferred -ne $null) { $activeAdapter = $adapters | Where-Object {$_.ifIndex -eq $preferred.InterfaceIndex} | Select-Object -First 1 }
    if ($activeAdapter -eq $null) { $activeAdapter = $adapters | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1 }
    if ($activeAdapter -eq $null) { $activeAdapter = $adapters | Select-Object -First 1 }
    $ips = @(); $gateway = $null;
    if ($preferred -ne $null) {
      $ips = @($preferred.IPv4Address | ForEach-Object {$_.IPAddress});
      if ($preferred.IPv4DefaultGateway) { $gateway = $preferred.IPv4DefaultGateway.NextHop }
    }
    $type = $null;
    if ($activeAdapter -ne $null) {
      if (($activeAdapter.Name + ' ' + $activeAdapter.InterfaceDescription) -match 'Wi-Fi|Wireless|WLAN|802\.11') { $type = 'wifi' }
      elseif (($activeAdapter.Name + ' ' + $activeAdapter.InterfaceDescription) -match 'Ethernet|PCIe|GbE|LAN') { $type = 'ethernet' }
      else { $type = 'outro' }
    }
    [PSCustomObject]@{
      adapterName = if ($activeAdapter) {$activeAdapter.Name} else {$null};
      adapterDescription = if ($activeAdapter) {$activeAdapter.InterfaceDescription} else {$null};
      adapterStatus = if ($activeAdapter) {$activeAdapter.Status} else {$null};
      adminStatus = if ($activeAdapter) {$activeAdapter.AdminStatus} else {$null};
      mediaConnectionState = if ($activeAdapter) {$activeAdapter.MediaConnectionState} else {$null};
      operationalStatus = if ($activeAdapter) {$activeAdapter.InterfaceOperationalStatus} else {$null};
      macAddress = if ($activeAdapter) {$activeAdapter.MacAddress} else {$null};
      linkSpeed = if ($activeAdapter) {$activeAdapter.LinkSpeed} else {$null};
      driverInformation = if ($activeAdapter) {$activeAdapter.DriverInformation} else {$null};
      driverFileName = if ($activeAdapter) {$activeAdapter.DriverFileName} else {$null};
      linkStatus = if ($activeAdapter -and $activeAdapter.Status -eq 'Up') {'connected'} elseif ($activeAdapter -and $activeAdapter.Status -eq 'Disconnected') {'disconnected'} elseif ($activeAdapter) {$activeAdapter.Status} else {'no_adapter'};
      connectionType = $type;
      gateway = $gateway;
      ips = @($ips);
      allAdapters = @($adapters);
    } | ConvertTo-Json -Compress -Depth 5
  `;

  const out = await execPowershell(ps);
  if (!out) return fallback;
  try {
    const obj = JSON.parse(out);
    const wifiSsid = obj.connectionType === 'wifi' ? await getWifiSsid() : null;
    const ips = toArray(obj.ips).filter(Boolean);
    const allAdapters = toArray(obj.allAdapters);
    return {
      ...fallback,
      ...obj,
      wifiSsid,
      ips: ips.length ? ips : fallbackIps,
      allAdapters,
      diagnostics: {
        source: 'Get-NetAdapter/Get-NetIPConfiguration',
        adapterDescription: obj.adapterDescription || null,
        adminStatus: obj.adminStatus || null,
        mediaConnectionState: obj.mediaConnectionState || null,
        operationalStatus: obj.operationalStatus || null,
        macAddress: obj.macAddress || null,
        linkSpeed: obj.linkSpeed || null,
        driverInformation: obj.driverInformation || null,
        driverFileName: obj.driverFileName || null,
        allAdapters
      }
    };
  } catch {
    return fallback;
  }
}

function pingHost(host, count = 2) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin ? ['-n', String(count), '-w', '1500', host] : ['-c', String(count), '-W', '2', host];
    execFile('ping', args, { timeout: 7000 }, (err, stdout) => {
      const text = stdout || '';
      const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let packetLoss = err ? 100 : 0;
      let avgMs = null;

      const lossPct = normalized.match(/\((\d+(?:[.,]\d+)?)%\s*(?:de\s*)?(?:perda|loss)/i)
        || normalized.match(/(\d+(?:[.,]\d+)?)%\s*(?:packet\s*)?loss/i)
        || normalized.match(/(\d+(?:[.,]\d+)?)%\s*de\s*perda/i);
      if (lossPct) packetLoss = Number(String(lossPct[1]).replace(',', '.'));

      const avgNamed = normalized.match(/(?:Average|Media)\s*=\s*(\d+(?:[.,]\d+)?)\s*ms/i);
      const avgUnix = normalized.match(/=\s*[\d.]+\/(\d+(?:\.\d+)?)\//);
      if (avgNamed) avgMs = Math.round(Number(String(avgNamed[1]).replace(',', '.')));
      else if (avgUnix) avgMs = Math.round(Number(avgUnix[1]));
      else {
        const msMatches = [...normalized.matchAll(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/gi)];
        if (msMatches.length) avgMs = Math.round(Number(String(msMatches[msMatches.length - 1][1]).replace(',', '.')));
      }

      resolve({ ok: !err || packetLoss < 100, avgMs, packetLoss, raw: text.slice(0, 3000) });
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

async function getSystemInfo(includePowerEvents = false) {
  const fallback = {
    bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    uptimeSeconds: Math.round(os.uptime()),
    recentPowerEvents: []
  };
  if (process.platform !== 'win32') return fallback;
  const ps = `
    $ErrorActionPreference = 'SilentlyContinue';
    $os = Get-CimInstance Win32_OperatingSystem;
    $boot = $os.LastBootUpTime.ToUniversalTime().ToString('o');
    $events = @();
    if (${includePowerEvents ? '$true' : '$false'}) {
      $events = @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,1074,6005,6006,6008; StartTime=(Get-Date).AddHours(-48)} -MaxEvents 12 | ForEach-Object {
        [PSCustomObject]@{ id=$_.Id; timeCreated=$_.TimeCreated.ToUniversalTime().ToString('o'); provider=$_.ProviderName; message=($_.Message -replace '[\r\n]+', ' ') }
      });
    }
    [PSCustomObject]@{
      bootTime = $boot;
      uptimeSeconds = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds;
      recentPowerEvents = @($events)
    } | ConvertTo-Json -Compress -Depth 4
  `;
  const out = await execPowershell(ps, includePowerEvents ? 12000 : 6000);
  if (!out) return fallback;
  try { return { ...fallback, ...JSON.parse(out), recentPowerEvents: toArray(JSON.parse(out).recentPowerEvents) }; }
  catch { return fallback; }
}

module.exports = { getAdapterInfo, pingHost, dnsOk, httpOk, getSystemInfo };
