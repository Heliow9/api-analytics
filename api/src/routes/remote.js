const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { mysqlDate } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

const commandLabels = {
  kill_process: 'Finalizar processo/aplicativo',
  stop_service: 'Parar serviço do Windows',
  start_service: 'Iniciar serviço do Windows',
  restart_service: 'Reiniciar serviço do Windows',
  restart_computer: 'Reiniciar computador',
  shutdown_computer: 'Desligar computador',
  cancel_shutdown: 'Cancelar desligamento/reinício agendado',
  refresh_inventory: 'Atualizar inventário agora'
};

function safeJson(v) { try { return JSON.stringify(v || {}); } catch { return '{}'; } }

async function ensureDevice(id) {
  const rows = await query('SELECT id, hostname, employee_name, title FROM devices WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

router.get('/devices/:id/processes', async (req, res) => {
  const device = await ensureDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'device_not_found' });
  const rows = await query(`
    SELECT * FROM device_processes_current
    WHERE device_id = ?
    ORDER BY has_window DESC, memory_mb DESC, name ASC
    LIMIT 500
  `, [req.params.id]);
  res.json({ device, processes: rows });
});

router.get('/devices/:id/services', async (req, res) => {
  const device = await ensureDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'device_not_found' });
  const rows = await query(`
    SELECT * FROM device_services_current
    WHERE device_id = ?
    ORDER BY CASE WHEN state = 'Running' THEN 0 ELSE 1 END, display_name ASC
    LIMIT 800
  `, [req.params.id]);
  res.json({ device, services: rows });
});

router.get('/devices/:id/commands', async (req, res) => {
  const rows = await query(`
    SELECT * FROM device_commands
    WHERE device_id = ?
    ORDER BY id DESC
    LIMIT 120
  `, [req.params.id]);
  res.json({ commands: rows });
});

router.post('/devices/:id/commands', async (req, res) => {
  const device = await ensureDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'device_not_found' });

  const body = req.body || {};
  const commandType = String(body.command_type || body.command || '').trim();
  if (!commandLabels[commandType]) return res.status(400).json({ error: 'invalid_command' });

  const args = body.args || {};
  let targetType = body.target_type || null;
  let targetId = body.target_id || null;
  let targetName = body.target_name || null;

  if (commandType === 'kill_process') {
    targetType = 'process';
    targetId = String(args.pid || body.pid || targetId || '').trim();
    targetName = String(args.name || body.name || targetName || '').trim();
    if (!targetId) return res.status(400).json({ error: 'pid_required' });
  }
  if (['stop_service', 'start_service', 'restart_service'].includes(commandType)) {
    targetType = 'service';
    targetName = String(args.serviceName || args.name || body.serviceName || targetName || '').trim();
    if (!targetName) return res.status(400).json({ error: 'service_name_required' });
  }
  if (commandType === 'restart_computer' && body.confirm !== 'REINICIAR') {
    return res.status(400).json({ error: 'confirm_required', message: 'Digite REINICIAR para confirmar.' });
  }
  if (commandType === 'shutdown_computer' && body.confirm !== 'DESLIGAR') {
    return res.status(400).json({ error: 'confirm_required', message: 'Digite DESLIGAR para confirmar.' });
  }

  const now = mysqlDate();
  const result = await query(`
    INSERT INTO device_commands
      (device_id, command_type, command_label, target_type, target_id, target_name, args_json,
       status, requested_by, requested_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `, [
    req.params.id, commandType, commandLabels[commandType], targetType, targetId, targetName,
    safeJson({ ...args, confirm: undefined }), req.admin?.email || req.admin?.id || 'admin', now, now, now
  ]);

  await query(
    'INSERT INTO agent_audit (device_id, event_type, message, raw_payload, created_at) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, 'remote_command_requested', `Comando solicitado: ${commandLabels[commandType]}`, safeJson({ commandType, targetType, targetId, targetName, by: req.admin?.email || req.admin?.id }), now]
  );

  res.json({ ok: true, commandId: result.insertId, status: 'pending' });
});

module.exports = router;
