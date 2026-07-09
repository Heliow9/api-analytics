let wss = null;

function attach(server) {
  const WebSocket = require('ws');
  wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }));
  });
}

function broadcast(type, payload) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload, at: new Date().toISOString() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(message);
  }
}

module.exports = { attach, broadcast };
