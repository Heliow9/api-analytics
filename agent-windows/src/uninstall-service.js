const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'RealNet Monitor Agent',
  script: path.join(__dirname, 'index.js')
});
svc.on('uninstall', () => console.log('Serviço removido.'));
svc.on('error', (err) => console.error(err));
svc.uninstall();
