const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const { initDb } = require('./initDb');
const realtime = require('./realtime');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

app.get('/health', (req, res) => res.json({ ok: true, service: 'realnet-monitor-api', at: new Date().toISOString() }));
app.get(`${config.apiBasePath}/health`, (req, res) => res.json({ ok: true, service: 'realnet-monitor-api', at: new Date().toISOString() }));

app.use(`${config.apiBasePath}/auth`, require('./routes/auth'));
app.use(`${config.apiBasePath}/devices`, require('./routes/devices'));
app.use(`${config.apiBasePath}/agents`, require('./routes/agents'));
app.use(`${config.apiBasePath}/reports`, require('./routes/reports'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: config.nodeEnv === 'development' ? err.message : undefined });
});

async function start() {
  await initDb();
  const server = http.createServer(app);
  realtime.attach(server);
  server.listen(config.port, () => console.log(`[api] Rodando na porta ${config.port}`));
}

start().catch((err) => {
  console.error('[api] Falha ao iniciar', err);
  process.exit(1);
});
