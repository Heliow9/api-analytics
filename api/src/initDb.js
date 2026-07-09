const bcrypt = require('bcryptjs');
const { query } = require('./db');
const config = require('./config');

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_admin_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR(80) NOT NULL,
      hostname VARCHAR(160) NULL,
      os_platform VARCHAR(80) NULL,
      os_release VARCHAR(120) NULL,
      username_windows VARCHAR(160) NULL,
      title VARCHAR(180) NULL,
      employee_name VARCHAR(180) NULL,
      department VARCHAR(140) NULL,
      agent_version VARCHAR(40) NULL,
      last_seen_at DATETIME NULL,
      last_status VARCHAR(40) NULL,
      last_reason VARCHAR(120) NULL,
      last_ip VARCHAR(80) NULL,
      last_latency_ms INT NULL,
      last_packet_loss DECIMAL(7,2) NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_devices_seen (last_seen_at),
      KEY idx_devices_status (last_status),
      KEY idx_devices_employee (employee_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS network_samples (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      device_id VARCHAR(80) NOT NULL,
      collected_at DATETIME NOT NULL,
      adapter_name VARCHAR(180) NULL,
      link_status VARCHAR(40) NULL,
      ip_address VARCHAR(80) NULL,
      gateway VARCHAR(80) NULL,
      gateway_latency_ms INT NULL,
      dns_ok TINYINT(1) NULL,
      internet_ok TINYINT(1) NULL,
      api_ok TINYINT(1) NULL,
      latency_ms INT NULL,
      packet_loss DECIMAL(7,2) NULL,
      status VARCHAR(40) NOT NULL,
      reason VARCHAR(120) NULL,
      raw_payload MEDIUMTEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_samples_device_time (device_id, collected_at),
      KEY idx_samples_status_time (status, collected_at),
      CONSTRAINT fk_samples_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS network_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      device_id VARCHAR(80) NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME NULL,
      duration_seconds DECIMAL(14,3) NULL,
      event_type VARCHAR(60) NOT NULL,
      probable_cause VARCHAR(140) NULL,
      evidence_text MEDIUMTEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_events_device_started (device_id, started_at),
      KEY idx_events_open (device_id, ended_at),
      KEY idx_events_type (event_type),
      CONSTRAINT fk_events_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS agent_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      device_id VARCHAR(80) NULL,
      event_type VARCHAR(80) NOT NULL,
      message VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_audit_device_time (device_id, created_at),
      KEY idx_audit_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const existing = await query('SELECT id FROM admins WHERE email = ? LIMIT 1', [config.defaultAdmin.email]);
  if (!existing.length) {
    const hash = await bcrypt.hash(config.defaultAdmin.password, 12);
    const now = new Date();
    await query(
      'INSERT INTO admins (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [config.defaultAdmin.name, config.defaultAdmin.email, hash, now, now]
    );
    console.log(`[init] Admin inicial criado: ${config.defaultAdmin.email} / senha padrão configurada.`);
  }
}

module.exports = { initDb };
