const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'RealNet Monitor Agent',
  description: 'Agente corporativo de monitoramento técnico de conexão de internet.',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: ['--harmony'],
  wait: 2,
  grow: 0.5,
  maxRestarts: 20
});

svc.on('install', () => {
  console.log('Serviço instalado. Iniciando...');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('Serviço já está instalado.'));
svc.on('error', (err) => console.error(err));
svc.install();
