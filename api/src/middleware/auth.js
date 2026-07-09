const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'token_required' });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function requireAgentKey(req, res, next) {
  const key = req.headers['x-agent-key'];
  if (!key || key !== config.agentApiKey) return res.status(401).json({ error: 'invalid_agent_key' });
  next();
}

module.exports = { requireAuth, requireAgentKey };
