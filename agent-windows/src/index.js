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
const { getAdapterInfo, pingHost, dnsOk, httpOk, getSystemInfo } = require('./windowsNetwork');
const { maybeAutoUpdate } = require('./updater');
const { sendInventory, pollAndRunCommand } = require('./remoteControl');

const VERSION = '1.3.0';
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
const stateFile = path.join(dataDir, 'state.json');
const loadedEnv = process.env.REALNET_AGENT_ENV_LOADED || 'nenhum';
const startedAt = new Date().toISOString();
let sampleCount = 0;
let bootAuditSent = false;
let inventoryInProgress = false;
let commandInProgress = false;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  try { fs.appendFileSync(logFile, line); } catch {}
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}
function readQueue() { return readJson(queueFile, []); }
function writeQueue(items) { writeJson(queueFile, items.slice(-500)); }

function norm(v) { return String(v || '').toLowerCase(); }

function classify({ adapter, gatewayPing, ping, dns, http, apiHealth }) {
  const status = norm(adapter.adapterStatus);
  const link = norm(adapter.linkStatus);
  const admin = norm(adapter.diagnostics?.adminStatus);
  const media = norm(adapter.diagnostics?.mediaConnectionState);
  const operational = norm(adapter.diagnostics?.operationalStatus);
  const hasIp = Array.isArray(adapter.ips) && adapter.ips.length > 0;
  const hasAdapter = Boolean(adapter.adapterName) || (adapter.allAdapters || []).length > 0 || hasIp;
  const internetWorks = Boolean(dns && http);

  // Regra anti-falso-positivo: se DNS e Internet HTTP responderam, a máquina está online.
  // Alguns Windows, principalmente rodando como SYSTEM/tarefa agendada, podem não retornar Get-NetAdapter corretamente.
  // Nesse caso, adaptador vira aviso técnico, não queda.
  if (internetWorks) {
    if ((ping.packetLoss || 0) >= LOSS_WARN) return { status: 'degraded', reason: 'packet_loss' };
    if ((ping.avgMs || 0) > LAT_WARN) return { status: 'degraded', reason: 'high_latency' };
    return { status: 'online', reason: 'ok' };
  }

  if (!hasAdapter && !internetWorks) return { status: 'offline', reason: 'no_adapter_found' };
  if (admin.includes('disabled') || status.includes('disabled') || link === 'disabled') return { status: 'offline', reason: 'adapter_disabled' };
  if (['not present', 'notpresent', 'hardware not present', 'hardware malfunction', 'unknown', 'degraded'].some(x => status.includes(x) || operational.includes(x) || link.includes(x))) {
    return { status: 'offline', reason: 'adapter_driver_or_hardware_issue' };
  }
  if ((status.includes('disconnected') || link.includes('disconnected') || media.includes('disconnected')) && !internetWorks) {
    return { status: 'offline', reason: 'cable_or_wifi_disconnected' };
  }
  if (!hasIp) return { status: 'offline', reason: 'no_valid_ip' };
  if (!adapter.gateway) return { status: 'offline', reason: 'no_gateway' };
  if (adapter.gateway && gatewayPing.ok === false) return { status: 'offline', reason: 'gateway_unreachable' };
  if (!dns) return { status: 'offline', reason: 'dns_failure' };
  if (!http) return { status: 'offline', reason: 'no_internet_http_failure' };
  if ((ping.packetLoss || 0) >= LOSS_WARN) return { status: 'degraded', reason: 'packet_loss' };
  if ((ping.avgMs || 0) > LAT_WARN) return { status: 'degraded', reason: 'high_latency' };
  return { status: 'online', reason: 'ok' };
}

function applyStabilityDebounce(sample) {
  const state = readJson(stateFile, {});
  const current = sample.network || {};
  const problem = current.status === 'offline' || current.status === 'degraded';
  const now = new Date().toISOString();
  const threshold = Math.max(1, Number(process.env.FAILURE_CONFIRM_SAMPLES || 2));

  if (!problem) {
    writeJson(stateFile, {
      ...state,
      bootTime: sample.system?.bootTime || state.bootTime,
      lastSampleAt: now,
      lastGoodNetwork: current,
      consecutiveProblemReason: null,
      consecutiveProblemCount: 0,
      agentVersion: VERSION
    });
    return sample;
  }

  const sameReason = state.consecutiveProblemReason === current.reason;
  const count = sameReason ? Number(state.consecutiveProblemCount || 0) + 1 : 1;

  // Se for uma falha isolada de coleta/adaptador, segura para não ficar piscando online/offline.
  if (count < threshold && ['no_adapter_found', 'adapter_driver_or_hardware_issue', 'network_link_disconnected'].includes(current.reason)) {
    sample.network.status = state.lastGoodNetwork?.status || 'online';
    sample.network.reason = state.lastGoodNetwork?.reason || 'ok';
    sample.network.debounceSuppressed = true;
    sample.diagnostics = sample.diagnostics || {};
    sample.diagnostics.debounce = { suppressedReason: current.reason, count, threshold };
  }

  writeJson(stateFile, {
    ...state,
    bootTime: sample.system?.bootTime || state.bootTime,
    lastSampleAt: now,
    consecutiveProblemReason: current.reason,
    consecutiveProblemCount: count,
    agentVersion: VERSION
  });
  return sample;
}

async function buildSample() {
  sampleCount += 1;
  const includePowerEvents = sampleCount === 1 || sampleCount % 60 === 0;
  const [adapter, system] = await Promise.all([getAdapterInfo(), getSystemInfo(includePowerEvents)]);
  const gatewayPing = adapter.gateway ? await pingHost(adapter.gateway, 1) : { ok: null, avgMs: null, packetLoss: null };
  const ping = await pingHost(PING_TARGET, 2);
  const dns = await dnsOk(DNS_TEST_HOST);
  const http = await httpOk(HTTP_TEST_URL);
  const apiHealth = await httpOk(API_URL.replace(/\/api\/?$/, '') + '/health');
  const cls = classify({ adapter, gatewayPing, ping, dns, http, apiHealth });
  const lastState = readJson(stateFile, {});
  const currentBoot = system.bootTime || null;
  const bootChanged = lastState.bootTime && currentBoot && lastState.bootTime !== currentBoot;

  const built = {
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
    agentStart: !bootAuditSent,
    bootChanged,
    system: {
      bootTime: system.bootTime,
      uptimeSeconds: system.uptimeSeconds,
      startedAt,
      recentPowerEvents: system.recentPowerEvents || []
    },
    diagnostics: {
      adapterName: adapter.adapterName,
      adapterStatus: adapter.adapterStatus,
      connectionType: adapter.connectionType,
      wifiSsid: adapter.wifiSsid,
      adapter: adapter.diagnostics,
      tests: {
        gatewayPing,
        publicPing: ping,
        dnsHost: DNS_TEST_HOST,
        httpTestUrl: HTTP_TEST_URL,
        pingTarget: PING_TARGET,
        latencyWarningMs: LAT_WARN,
        packetLossWarningPercent: LOSS_WARN
      }
    },
    network: {
      adapterName: adapter.adapterName,
      adapterStatus: adapter.adapterStatus,
      linkStatus: adapter.linkStatus,
      connectionType: adapter.connectionType,
      wifiSsid: adapter.wifiSsid,
      ips: adapter.ips,
      gateway: adapter.gateway,
      gatewayPingMs: gatewayPing.avgMs,
      dnsOk: dns,
      internetOk: http,
      apiOk: apiHealth,
      latencyMs: ping.avgMs,
      packetLoss: ping.packetLoss,
      status: cls.status,
      reason: cls.reason,
      adapterDetectionWarning: adapter.detectionWarning || null
    }
  };
  return applyStabilityDebounce(built);
}

async function sendSample(sample) {
  await axios.post(`${API_URL}/agents/heartbeat`, sample, {
    headers: { 'x-agent-key': AGENT_KEY },
    timeout: 9000
  });
}

async function sendAudit(eventType, message, extra = {}) {
  try {
    await axios.post(`${API_URL}/agents/audit`, {
      deviceId: ensureIdentity(), eventType, message, hostname: os.hostname(), agentVersion: VERSION, at: new Date().toISOString(), ...extra
    }, { headers: { 'x-agent-key': AGENT_KEY }, timeout: 8000 });
  } catch (err) {
    log(`audit não enviado: ${eventType} ${err.message}`);
  }
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

async function maybeSendInventory(deviceId, force = false) {
  const every = Math.max(3, Number(process.env.INVENTORY_EVERY_SAMPLES || 6));
  if (!force && sampleCount !== 1 && sampleCount % every !== 0) return;
  if (inventoryInProgress) return;
  inventoryInProgress = true;
  try { await sendInventory({ apiUrl: API_URL, agentKey: AGENT_KEY, deviceId, log }); }
  catch (err) { log(`inventário não enviado: ${err.message}`); }
  finally { inventoryInProgress = false; }
}

async function maybePollCommand(deviceId) {
  const every = Math.max(1, Number(process.env.COMMAND_POLL_EVERY_SAMPLES || 1));
  if (sampleCount % every !== 0) return;
  if (commandInProgress) return;
  commandInProgress = true;
  try {
    const forceInventory = await pollAndRunCommand({ apiUrl: API_URL, agentKey: AGENT_KEY, deviceId, log });
    if (forceInventory) await maybeSendInventory(deviceId, true);
  } catch (err) { log(`consulta de comandos falhou: ${err.message}`); }
  finally { commandInProgress = false; }
}

async function loop() {
  try {
    const sample = await buildSample();
    try {
      await sendSample(sample);
      bootAuditSent = true;
      log(`enviado status=${sample.network.status} reason=${sample.network.reason} lat=${sample.network.latencyMs ?? '-'}ms loss=${sample.network.packetLoss ?? '-'}% adapter=${sample.network.adapterName || '-'}`);
      await flushQueue();
      maybePollCommand(sample.deviceId).catch(()=>{});
      maybeSendInventory(sample.deviceId).catch(()=>{});
      if (sampleCount === 1 || sampleCount % Math.max(6, Number(process.env.UPDATE_CHECK_EVERY_SAMPLES || 30)) === 0) {
        maybeAutoUpdate({ apiUrl: API_URL, agentKey: AGENT_KEY, deviceId: sample.deviceId, version: VERSION, log }).catch(()=>{});
      }
      if (sample.bootChanged) await sendAudit('computer_restarted', 'Reinicialização detectada pelo agente.', { system: sample.system });
    } catch (err) {
      const q = readQueue(); q.push(sample); writeQueue(q);
      log(`API indisponível, amostra salva localmente. ${err.message}`);
    }
  } catch (err) {
    log(`erro de coleta: ${err.stack || err.message}`);
  }
}

log(`RealNet Agent iniciado. API=${API_URL} Intervalo=${INTERVAL/1000}s Config=${loadedEnv} Versão=${VERSION}`);
sendAudit('agent_started', 'Agente iniciado no Windows.', { startedAt }).finally(() => {});
loop();
setInterval(loop, INTERVAL);
