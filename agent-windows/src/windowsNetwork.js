const os = require('os');
const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

function execPowershell(command, timeout = 8000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { timeout, maxBuffer: 1024 * 1024 * 8 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || '').trim());
    });
  });
}

function execCmd(command, args = [], timeout = 7000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 1024 * 1024 * 4 }, (err, stdout) => {
      resolve({ ok: !err, text: String(stdout || '') });
    });
  });
}

function getIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal && !String(n.address).startsWith('169.254.')) ips.push(n.address);
    }
  }
  return ips;
}

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function detectType(name = '', description = '') {
  const txt = `${name} ${description}`.toLowerCase();
  if (/wi-?fi|wireless|wlan|802\.11|sem fio/.test(txt)) return 'wifi';
  if (/ethernet|gbe|lan|realtek|intel\(r\).*connection|pci|controlador|family controller/.test(txt)) return 'ethernet';
  if (/bluetooth|loopback|virtual|vpn|tap|hyper-v|vmware|virtualbox|wsl|npcap/.test(txt)) return 'virtual';
  return 'outro';
}

async function getWifiSsid() {
  const out = await execPowershell(`
    $txt = netsh wlan show interfaces 2>$null;
    $line = $txt | Where-Object {$_ -match '^\s*SSID\s+:'} | Select-Object -First 1;
    if ($line) { ($line -replace '^\s*SSID\s+:\s*','').Trim() }
  `, 5000);
  return out || null;
}

async function getGatewayFromRoute() {
  if (process.platform !== 'win32') return null;
  const { text } = await execCmd('cmd.exe', ['/c', 'route print -4 0.0.0.0'], 5000);
  // Linhas típicas: 0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.8     25
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m && !m[1].startsWith('0.')) return m[1];
  }
  return null;
}

function buildFallback() {
  const fallbackIps = getIps();
  return {
    adapterName: fallbackIps.length ? 'Detectado pelo Windows' : null,
    adapterDescription: null,
    adapterStatus: fallbackIps.length ? 'Up' : 'Unknown',
    linkStatus: fallbackIps.length ? 'connected' : 'unknown',
    connectionType: null,
    wifiSsid: null,
    gateway: null,
    ips: fallbackIps,
    detectionWarning: fallbackIps.length ? 'adapter_detection_limited' : null,
    diagnostics: { source: 'node_os_networkInterfaces', detectionWarning: fallbackIps.length ? 'adapter_detection_limited' : null },
    allAdapters: []
  };
}

async function getAdapterInfo() {
  const fallback = buildFallback();

  const ps = `
    $ErrorActionPreference = 'SilentlyContinue';

    function ToList($value) {
      if ($null -eq $value) { return @() }
      if ($value -is [Array]) { return @($value) }
      return @($value)
    }

    $ipConfigs = @(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.IPAddress -ne $null });
    $preferredConfig = $ipConfigs | Where-Object { $_.DefaultIPGateway -ne $null } | Select-Object -First 1;
    if ($null -eq $preferredConfig) { $preferredConfig = $ipConfigs | Select-Object -First 1 }

    $netAdapters = @(Get-CimInstance Win32_NetworkAdapter | Where-Object {
      $_.PhysicalAdapter -eq $true -and
      $_.Name -notmatch 'Bluetooth|Virtual|VPN|TAP|Hyper-V|VMware|VirtualBox|Loopback|Npcap|WSL'
    } | Select-Object Name, NetConnectionID, NetEnabled, NetConnectionStatus, MACAddress, Speed, AdapterType, PNPDeviceID, Manufacturer, ServiceName, Index, InterfaceIndex);

    $activeAdapter = $null;
    if ($preferredConfig -ne $null) {
      $activeAdapter = $netAdapters | Where-Object { $_.Index -eq $preferredConfig.Index } | Select-Object -First 1;
    }
    if ($activeAdapter -eq $null) { $activeAdapter = $netAdapters | Where-Object { $_.NetEnabled -eq $true } | Select-Object -First 1 }
    if ($activeAdapter -eq $null) { $activeAdapter = $netAdapters | Select-Object -First 1 }

    $adapterName = $null; $adapterDescription = $null; $adapterStatus = $null; $linkStatus = 'unknown'; $adminStatus = $null;
    if ($activeAdapter -ne $null) {
      $adapterName = if ($activeAdapter.NetConnectionID) { $activeAdapter.NetConnectionID } else { $activeAdapter.Name };
      $adapterDescription = $activeAdapter.Name;
      $adminStatus = if ($activeAdapter.NetEnabled -eq $true) { 'Enabled' } elseif ($activeAdapter.NetEnabled -eq $false) { 'Disabled' } else { 'Unknown' };
      switch ($activeAdapter.NetConnectionStatus) {
        0 { $adapterStatus = 'Disconnected'; $linkStatus = 'disconnected' }
        1 { $adapterStatus = 'Connecting'; $linkStatus = 'connecting' }
        2 { $adapterStatus = 'Connected'; $linkStatus = 'connected' }
        3 { $adapterStatus = 'Disconnecting'; $linkStatus = 'disconnecting' }
        4 { $adapterStatus = 'Hardware not present'; $linkStatus = 'not_present' }
        5 { $adapterStatus = 'Hardware disabled'; $linkStatus = 'disabled' }
        6 { $adapterStatus = 'Hardware malfunction'; $linkStatus = 'hardware_issue' }
        7 { $adapterStatus = 'Media disconnected'; $linkStatus = 'disconnected' }
        8 { $adapterStatus = 'Authenticating'; $linkStatus = 'connecting' }
        9 { $adapterStatus = 'Authentication succeeded'; $linkStatus = 'connected' }
        10 { $adapterStatus = 'Authentication failed'; $linkStatus = 'auth_failed' }
        11 { $adapterStatus = 'Invalid address'; $linkStatus = 'invalid_address' }
        12 { $adapterStatus = 'Credentials required'; $linkStatus = 'credentials_required' }
        Default { $adapterStatus = if ($activeAdapter.NetEnabled -eq $true) { 'Up' } else { 'Unknown' } }
      }
    }

    $ips = @(); $gateway = $null; $dnsServers = @();
    if ($preferredConfig -ne $null) {
      $ips = @(ToList $preferredConfig.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.' });
      $gateway = @(ToList $preferredConfig.DefaultIPGateway | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1);
      $dnsServers = @(ToList $preferredConfig.DNSServerSearchOrder | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' });
    }

    $type = $null;
    if ($activeAdapter -ne $null) {
      $desc = (($activeAdapter.Name) + ' ' + ($activeAdapter.NetConnectionID) + ' ' + ($activeAdapter.AdapterType));
      if ($desc -match 'Wi-Fi|Wireless|WLAN|802\.11|sem fio') { $type = 'wifi' }
      elseif ($desc -match 'Ethernet|GbE|LAN|Realtek|Intel|PCI') { $type = 'ethernet' }
      else { $type = 'outro' }
    }

    [PSCustomObject]@{
      adapterName = $adapterName;
      adapterDescription = $adapterDescription;
      adapterStatus = $adapterStatus;
      adminStatus = $adminStatus;
      mediaConnectionState = $adapterStatus;
      operationalStatus = $linkStatus;
      macAddress = if ($activeAdapter) {$activeAdapter.MACAddress} else {$null};
      linkSpeed = if ($activeAdapter -and $activeAdapter.Speed) {[string]$activeAdapter.Speed} else {$null};
      driverInformation = if ($activeAdapter) {$activeAdapter.Manufacturer} else {$null};
      driverFileName = if ($activeAdapter) {$activeAdapter.ServiceName} else {$null};
      linkStatus = $linkStatus;
      connectionType = $type;
      gateway = $gateway;
      dnsServers = @($dnsServers);
      ips = @($ips);
      allAdapters = @($netAdapters);
    } | ConvertTo-Json -Compress -Depth 5
  `;

  const out = await execPowershell(ps, 10000);
  let obj = null;
  if (out) {
    try { obj = JSON.parse(out); } catch { obj = null; }
  }

  let result = fallback;
  if (obj) {
    const ips = toArray(obj.ips).filter(Boolean);
    const allAdapters = toArray(obj.allAdapters);
    const adapterName = obj.adapterName || fallback.adapterName;
    const adapterDescription = obj.adapterDescription || null;
    const connectionType = obj.connectionType || detectType(adapterName, adapterDescription);
    const wifiSsid = connectionType === 'wifi' ? await getWifiSsid() : null;
    result = {
      ...fallback,
      ...obj,
      adapterName,
      adapterDescription,
      connectionType,
      wifiSsid,
      ips: ips.length ? ips : fallback.ips,
      allAdapters,
      detectionWarning: (!obj.adapterName && fallback.ips.length) ? 'adapter_detection_limited' : null,
      diagnostics: {
        source: 'Win32_NetworkAdapterConfiguration/Win32_NetworkAdapter',
        detectionWarning: (!obj.adapterName && fallback.ips.length) ? 'adapter_detection_limited' : null,
        adapterDescription,
        adminStatus: obj.adminStatus || null,
        mediaConnectionState: obj.mediaConnectionState || null,
        operationalStatus: obj.operationalStatus || null,
        macAddress: obj.macAddress || null,
        linkSpeed: obj.linkSpeed || null,
        driverInformation: obj.driverInformation || null,
        driverFileName: obj.driverFileName || null,
        dnsServers: toArray(obj.dnsServers),
        allAdapters
      }
    };
  }

  if (!result.gateway) {
    const gw = await getGatewayFromRoute();
    if (gw) result.gateway = gw;
  }

  // Regra de segurança contra falso negativo: se existe IP IPv4 válido, nunca declarar "sem adaptador".
  if ((!result.adapterName || result.linkStatus === 'no_adapter') && result.ips && result.ips.length) {
    result.adapterName = result.adapterName || 'Adaptador ativo detectado';
    result.adapterStatus = result.adapterStatus || 'Up';
    result.linkStatus = 'connected';
    result.detectionWarning = 'adapter_detection_limited';
    result.diagnostics = { ...(result.diagnostics || {}), detectionWarning: 'adapter_detection_limited' };
  }

  return result;
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
        || normalized.match(/(\d+(?:[.,]\d+)?)%\s*de\s*perda/i)
        || normalized.match(/perdidos\s*=\s*\d+\s*\((\d+(?:[.,]\d+)?)%\s*de\s*perda\)/i);
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
  try {
    const parsed = JSON.parse(out);
    return { ...fallback, ...parsed, recentPowerEvents: toArray(parsed.recentPowerEvents) };
  } catch { return fallback; }
}

module.exports = { getAdapterInfo, pingHost, dnsOk, httpOk, getSystemInfo };
