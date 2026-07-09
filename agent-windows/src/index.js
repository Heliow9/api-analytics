const { loadConfig } = require('./configLoader');
const { runSetupWizard } = require('./setup-wizard');
if (process.argv.includes('--setup')) {
  runSetupWizard().catch((err) => { console.error(err); process.exit(1); });
  return;
}
loadConfig();
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { ensureIdentity, dataDir } = require('./deviceIdentity');
const { getAdapterInfo, pingHost, dnsOk, httpOk } = require('./windowsNetwork');

const VERSION = '1.0.0';
const API_URL = process.env.AGENT_API_URL || 'https://dashrealapi.duckdns.org/api';
const AGENT_KEY = process.env.AGENT_API_KEY || '';
const INTERVAL = Math.max(5, Number(process.env.INTERVAL_SECONDS || 10)) * 1000;
const DNS_TEST_HOST = process.env.DNS_TEST_HOST || 'google.com';
const HTTP_TEST_URL = process.env.HTTP_TEST_URL || 'https://www.google.com/generate_204';
const PING_TARGET = process.env.PING_TARGET || '1.1.1.1';
const LAT_WARN = Number(process.env.LATENCY_WARNING_MS || 300);
const LOSS_WARN = Number(process.env.PACKET_LOSS_WARNING_PERCENT || 10);
const queueFile = path.join(dataDir, 'offline-queue.json');
const logFile = path.join(dataDir, 'agent.log');
const loadedEnv = process.env.REALNET_AGENT_ENV_LOADED || 'nenhum';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  try { fs.appendFileSync(logFile, line); } catch {}
}

function readQueue() {
  try { return JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch { return []; }
}
function writeQueue(items) {
  try { fs.writeFileSync(queueFile, JSON.stringify(items.slice(-500), null, 2)); } catch {}
}

function classify({ adapter, gatewayPing, ping, dns, http }) {
  if (adapter.linkStatus !== 'connected') return { status: 'offline', reason: 'cable_or_wifi_disconnected' };
  if (!adapter.ips || !adapter.ips.length) return { status: 'offline', reason: 'no_valid_ip' };
  if (adapter.gateway && !gatewayPing.ok) return { status: 'offline', reason: 'gateway_unreachable' };
  if (!dns) return { status: 'offline', reason: 'dns_failure' };
  if (!http) return { status: 'offline', reason: 'no_internet_http_failure' };
  if ((ping.avgMs || 0) > LAT_WARN) return { status: 'degraded', reason: 'high_latency' };
  if ((ping.packetLoss || 0) >= LOSS_WARN) return { status: 'degraded', reason: 'packet_loss' };
  return { status: 'online', reason: 'ok' };
}

async function buildSample() {
  const adapter = await getAdapterInfo();
  const gatewayPing = adapter.gateway ? await pingHost(adapter.gateway, 1) : { ok: null, avgMs: null, packetLoss: null };
  const ping = await pingHost(PING_TARGET, 2);
  const dns = await dnsOk(DNS_TEST_HOST);
  const http = await httpOk(HTTP_TEST_URL);
  const apiHealth = await httpOk(API_URL.replace(/\/api\/?$/, '') + '/health');
  const cls = classify({ adapter, gatewayPing, ping, dns, http });
  return {
    deviceId: ensureIdentity(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    osPlatform: os.platform(),
    osRelease: os.release(),
    username: os.userInfo().username,
    title: process.env.DEVICE_TITLE || '',
    employeeName: process.env.EMPLOYEE_NAME || '',
    department: process.env.DEPARTMENT || '',
    agentVersion: VERSION,
    network: {
      adapterName: adapter.adapterName,
      linkStatus: adapter.linkStatus,
      ips: adapter.ips,
      gateway: adapter.gateway,
      gatewayPingMs: gatewayPing.avgMs,
      dnsOk: dns,
      internetOk: http,
      apiOk: apiHealth,
      latencyMs: ping.avgMs,
      packetLoss: ping.packetLoss,
      status: cls.status,
      reason: cls.reason
    }
  };
}

async function sendSample(sample) {
  await axios.post(`${API_URL}/agents/heartbeat`, sample, {
    headers: { 'x-agent-key': AGENT_KEY },
    timeout: 8000
  });
}

async function flushQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try { await sendSample(item); }
    catch { remaining.push(item); }
  }
  writeQueue(remaining);
}

async function loop() {
  try {
    const sample = await buildSample();
    try {
      await sendSample(sample);
      log(`enviado status=${sample.network.status} reason=${sample.network.reason}`);
      await flushQueue();
    } catch (err) {
      const q = readQueue(); q.push(sample); writeQueue(q);
      log(`API indisponível, amostra salva localmente. ${err.message}`);
    }
  } catch (err) {
    log(`erro de coleta: ${err.stack || err.message}`);
  }
}

log(`RealNet Agent iniciado. API=${API_URL} Intervalo=${INTERVAL/1000}s Config=${loadedEnv}`);
loop();
setInterval(loop, INTERVAL);
