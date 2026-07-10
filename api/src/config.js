require('dotenv').config();

const required = ['JWT_SECRET', 'AGENT_API_KEY', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Variável ausente: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3333),
  apiBasePath: process.env.API_BASE_PATH || '/api',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  agentApiKey: process.env.AGENT_API_KEY || 'dev-agent-key-change-me',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  offlineThresholdSeconds: Number(process.env.OFFLINE_THRESHOLD_SECONDS || 90),
  watchdogIntervalSeconds: Number(process.env.WATCHDOG_INTERVAL_SECONDS || 30),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  defaultAdmin: {
    name: process.env.DEFAULT_ADMIN_NAME || 'Administrador',
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@real.local',
    password: process.env.DEFAULT_ADMIN_PASSWORD || '22021419'
  },
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
  }
};
