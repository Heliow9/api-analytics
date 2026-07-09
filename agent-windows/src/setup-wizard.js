const fs = require('fs');
const readline = require('readline');
const { ensureProgramDataDir } = require('./configLoader');

function ask(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise(resolve => rl.question(`${question}${suffix}: `, ans => resolve((ans || defaultValue || '').trim())));
}

function envEscape(value) {
  return String(value || '').replace(/\r?\n/g, ' ').trim();
}

async function runSetupWizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== RealNet Agent - Configuração inicial ===');
  const apiUrl = await ask(rl, 'URL da API', process.env.AGENT_API_URL || 'https://dashrealapi.duckdns.org/api');
  const apiKey = await ask(rl, 'Chave AGENT_API_KEY');
  const employeeName = await ask(rl, 'Nome da pessoa que usa esta máquina');
  const interval = await ask(rl, 'Intervalo de coleta em segundos', '10');
  rl.close();

  const dir = ensureProgramDataDir();
  const envPath = `${dir}\\.env`;
  const content = [
    `AGENT_API_URL=${envEscape(apiUrl)}`,
    `AGENT_API_KEY=${envEscape(apiKey)}`,
    `EMPLOYEE_NAME=${envEscape(employeeName)}`,
    'DEVICE_TITLE=',
    'DEPARTMENT=',
    `INTERVAL_SECONDS=${envEscape(interval || '10')}`,
    'DNS_TEST_HOST=google.com',
    'HTTP_TEST_URL=https://www.google.com/generate_204',
    'PING_TARGET=1.1.1.1',
    'LATENCY_WARNING_MS=300',
    'PACKET_LOSS_WARNING_PERCENT=10',
    ''
  ].join('\r\n');
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`Configuração salva em: ${envPath}`);
}

module.exports = { runSetupWizard };
