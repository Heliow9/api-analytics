const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const { dataDir } = require('./deviceIdentity');

const updateDir = path.join(dataDir, 'updates');
const updateStateFile = path.join(dataDir, 'update-state.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
async function downloadFile(url, dest, headers = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const response = await axios.get(url, { responseType: 'stream', timeout: 60000, headers });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    response.data.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}
function writeUpdaterScript({ zipPath, version, apiUrl, agentKey, deviceId }) {
  const scriptPath = path.join(updateDir, `apply-update-${version}.ps1`);
  const content = `
$ErrorActionPreference = "Stop"
$TaskName = "RealNet Monitor Agent"
$AppRoot = "C:\\Program Files\\RealNetAgent"
$AppDir = Join-Path $AppRoot "app"
$BackupRoot = "C:\\ProgramData\\RealNetAgent\\backup"
$ZipPath = "${zipPath.replace(/`/g, '``').replace(/"/g, '`"')}"
$Version = "${version}"
$ApiUrl = "${apiUrl}"
$AgentKey = "${agentKey}"
$DeviceId = "${deviceId}"
$Work = "C:\\ProgramData\\RealNetAgent\\updates\\extract-$Version"
$Log = "C:\\ProgramData\\RealNetAgent\\update.log"
function Log($m) { Add-Content -Path $Log -Value ("[{0}] {1}" -f (Get-Date).ToString("s"), $m) }
function Report($status, $message) {
  try {
    $body = @{ deviceId=$DeviceId; version=$Version; status=$status; message=$message; at=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$ApiUrl/agents/update/report" -Method POST -Headers @{"x-agent-key"=$AgentKey} -ContentType "application/json" -Body $body -TimeoutSec 15 | Out-Null
  } catch { Log "Falha ao reportar: $($_.Exception.Message)" }
}
Start-Sleep -Seconds 5
try {
  Log "Iniciando atualização para $Version"
  Report "started" "Atualização iniciada no Windows."
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Seconds 2
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$AppRoot*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
  New-Item -ItemType Directory -Force -Path $Work | Out-Null
  Expand-Archive -Path $ZipPath -DestinationPath $Work -Force
  $Candidate = $Work
  if (Test-Path (Join-Path $Work "app")) { $Candidate = Join-Path $Work "app" }
  elseif (Test-Path (Join-Path $Work "src")) { $Candidate = $Work }
  elseif ((Get-ChildItem $Work -Directory | Select-Object -First 1) -and (Test-Path (Join-Path ((Get-ChildItem $Work -Directory | Select-Object -First 1).FullName) "src"))) { $Candidate = (Get-ChildItem $Work -Directory | Select-Object -First 1).FullName }
  if (!(Test-Path (Join-Path $Candidate "src\index.js"))) { throw "Pacote de atualização inválido: src\index.js não encontrado." }
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  $Backup = Join-Path $BackupRoot ("app-before-" + $Version + "-" + (Get-Date -Format "yyyyMMddHHmmss"))
  if (Test-Path $AppDir) { Copy-Item -Recurse -Force $AppDir $Backup }
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Candidate "*") $AppDir
  try { Start-ScheduledTask -TaskName $TaskName } catch { schtasks /Run /TN $TaskName | Out-Null }
  Log "Atualização concluída para $Version"
  Report "success" "Agente atualizado com sucesso."
} catch {
  Log "Erro na atualização: $($_.Exception.Message)"
  Report "failed" $_.Exception.Message
  try { Start-ScheduledTask -TaskName $TaskName } catch {}
  exit 1
}
`;
  fs.writeFileSync(scriptPath, content, 'utf8');
  return scriptPath;
}

async function maybeAutoUpdate({ apiUrl, agentKey, deviceId, version, log }) {
  const enabled = String(process.env.AUTO_UPDATE || 'true').toLowerCase() !== 'false';
  if (!enabled || process.platform !== 'win32') return;
  const state = readJson(updateStateFile, {});
  const now = Date.now();
  const minInterval = Math.max(5, Number(process.env.UPDATE_CHECK_INTERVAL_MINUTES || 30)) * 60 * 1000;
  if (state.lastCheckAt && now - new Date(state.lastCheckAt).getTime() < minInterval) return;
  writeJson(updateStateFile, { ...state, lastCheckAt: new Date().toISOString() });

  try {
    const { data } = await axios.get(`${apiUrl}/agents/update/check`, {
      headers: { 'x-agent-key': agentKey },
      params: { version, deviceId, platform: 'win32', arch: process.arch },
      timeout: 15000
    });
    if (!data || !data.updateAvailable) {
      log && log(`auto-update: sem atualização. versão atual=${version}`);
      return;
    }
    const latestVersion = data.latestVersion;
    const zipPath = path.join(updateDir, `realnet-agent-${latestVersion}.zip`);
    log && log(`auto-update: atualização disponível ${version} -> ${latestVersion}. baixando...`);
    await downloadFile(data.downloadUrl, zipPath, { 'x-agent-key': agentKey });
    const hash = await sha256File(zipPath);
    if (String(hash).toLowerCase() !== String(data.sha256 || '').toLowerCase()) {
      throw new Error(`SHA256 inválido. esperado=${data.sha256} recebido=${hash}`);
    }
    await axios.post(`${apiUrl}/agents/update/report`, { deviceId, version: latestVersion, status: 'downloaded', message: 'Pacote baixado e hash validado.' }, { headers: { 'x-agent-key': agentKey }, timeout: 15000 }).catch(()=>{});
    const scriptPath = writeUpdaterScript({ zipPath, version: latestVersion, apiUrl, agentKey, deviceId });
    log && log(`auto-update: aplicador criado em ${scriptPath}. iniciando aplicação...`);
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (err) {
    writeJson(updateStateFile, { ...readJson(updateStateFile, {}), lastErrorAt: new Date().toISOString(), lastError: err.message });
    log && log(`auto-update: falhou: ${err.message}`);
  }
}

module.exports = { maybeAutoUpdate };
