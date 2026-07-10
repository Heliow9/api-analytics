const { execFile, spawn } = require('child_process');
const axios = require('axios');
const os = require('os');

function ps(script, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout, windowsHide: true, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', error: err ? err.message : null });
    });
  });
}

function parseJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

async function collectProcesses() {
  if (process.platform !== 'win32') return [];
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $items = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 350 | ForEach-Object {
      [PSCustomObject]@{
        pid = $_.Id
        name = $_.ProcessName
        path = $_.Path
        windowTitle = $_.MainWindowTitle
        cpuSeconds = if ($_.CPU -ne $null) { [math]::Round($_.CPU, 2) } else { $null }
        memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 2)
        hasWindow = -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle)
      }
    }
    $items | ConvertTo-Json -Compress -Depth 4
  `;
  const out = await ps(script, 25000);
  const data = parseJson(out.stdout, []);
  return Array.isArray(data) ? data : (data ? [data] : []);
}

async function collectServices() {
  if (process.platform !== 'win32') return [];
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    Get-CimInstance Win32_Service | Sort-Object State, DisplayName | ForEach-Object {
      [PSCustomObject]@{
        name = $_.Name
        displayName = $_.DisplayName
        state = $_.State
        startMode = $_.StartMode
        processId = $_.ProcessId
        pathName = $_.PathName
        startName = $_.StartName
      }
    } | ConvertTo-Json -Compress -Depth 4
  `;
  const out = await ps(script, 25000);
  const data = parseJson(out.stdout, []);
  return Array.isArray(data) ? data : (data ? [data] : []);
}

const deniedProcesses = new Set([
  'system','idle','registry','smss','csrss','wininit','winlogon','services','lsass','lsaiso','fontdrvhost','dwm','memory compression'
]);
const deniedServices = new Set([
  'rpcss','dcomlaunch','plugplay','eventlog','winmgmt','schedule','samss','lanmanworkstation','lanmanserver','nsi','dhcp','dnscache','mpssvc','eventsystem','profsvc','power'
]);

function normalizeName(v) { return String(v || '').trim().toLowerCase().replace(/\.exe$/,''); }

async function executeCommand(command) {
  const type = command.command_type || command.commandType;
  const args = command.args || {};
  if (type === 'refresh_inventory') {
    return { ok: true, message: 'Atualização de inventário solicitada.' };
  }

  if (type === 'kill_process') {
    const pid = Number(command.target_id || args.pid);
    const name = normalizeName(command.target_name || args.name);
    if (!pid || pid < 5) throw new Error('PID inválido ou protegido.');
    if (deniedProcesses.has(name)) throw new Error(`Processo protegido bloqueado: ${name}`);
    const out = await ps(`Stop-Process -Id ${pid} -Force -ErrorAction Stop; "processo_finalizado"`, 15000);
    if (!out.ok) throw new Error(out.stderr || out.error || 'Falha ao finalizar processo.');
    return { ok: true, message: `Processo ${command.target_name || pid} finalizado.` };
  }

  if (['stop_service','start_service','restart_service'].includes(type)) {
    const name = String(command.target_name || args.serviceName || args.name || '').replace(/'/g, "''");
    if (!name) throw new Error('Nome do serviço não informado.');
    if (deniedServices.has(normalizeName(name))) throw new Error(`Serviço crítico bloqueado: ${name}`);
    const action = type === 'stop_service'
      ? `Stop-Service -Name '${name}' -Force -ErrorAction Stop; "servico_parado"`
      : type === 'start_service'
        ? `Start-Service -Name '${name}' -ErrorAction Stop; "servico_iniciado"`
        : `Restart-Service -Name '${name}' -Force -ErrorAction Stop; "servico_reiniciado"`;
    const out = await ps(action, 25000);
    if (!out.ok) throw new Error(out.stderr || out.error || 'Falha ao operar serviço.');
    return { ok: true, message: out.stdout.trim() || 'Comando executado no serviço.' };
  }

  if (type === 'restart_computer') {
    const seconds = Math.max(15, Number(args.delaySeconds || 30));
    spawn('shutdown.exe', ['/r', '/t', String(seconds), '/c', 'Reinicialização solicitada pelo RealNet Monitor.'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true, message: `Reinicialização agendada para ${seconds} segundos.` };
  }

  if (type === 'shutdown_computer') {
    const seconds = Math.max(15, Number(args.delaySeconds || 30));
    spawn('shutdown.exe', ['/s', '/t', String(seconds), '/c', 'Desligamento solicitado pelo RealNet Monitor.'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true, message: `Desligamento agendado para ${seconds} segundos.` };
  }

  if (type === 'cancel_shutdown') {
    const out = await ps(`shutdown.exe /a; "cancelado"`, 10000);
    if (!out.ok) throw new Error(out.stderr || out.error || 'Falha ao cancelar desligamento.');
    return { ok: true, message: 'Desligamento/reinício agendado cancelado.' };
  }

  throw new Error(`Comando não suportado: ${type}`);
}

async function sendInventory({ apiUrl, agentKey, deviceId, log }) {
  const [processes, services] = await Promise.all([collectProcesses(), collectServices()]);
  await axios.post(`${apiUrl}/agents/inventory`, {
    deviceId,
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    processes,
    services
  }, { headers: { 'x-agent-key': agentKey }, timeout: 25000 });
  log && log(`inventário enviado: processos=${processes.length} serviços=${services.length}`);
}

async function pollAndRunCommand({ apiUrl, agentKey, deviceId, log }) {
  const { data } = await axios.get(`${apiUrl}/agents/commands/poll`, {
    headers: { 'x-agent-key': agentKey },
    params: { deviceId },
    timeout: 12000
  });
  const command = data && data.command;
  if (!command) return false;
  log && log(`comando recebido #${command.id}: ${command.command_label || command.command_type}`);
  try {
    const result = await executeCommand(command);
    await axios.post(`${apiUrl}/agents/commands/${command.id}/result`, {
      status: 'success',
      message: result.message,
      result,
      at: new Date().toISOString()
    }, { headers: { 'x-agent-key': agentKey }, timeout: 12000 });
    log && log(`comando #${command.id} concluído: ${result.message}`);
    return command.command_type === 'refresh_inventory';
  } catch (err) {
    await axios.post(`${apiUrl}/agents/commands/${command.id}/result`, {
      status: 'failed',
      message: err.message,
      at: new Date().toISOString()
    }, { headers: { 'x-agent-key': agentKey }, timeout: 12000 }).catch(()=>{});
    log && log(`comando #${command.id} falhou: ${err.message}`);
    return false;
  }
}

module.exports = { sendInventory, pollAndRunCommand };
