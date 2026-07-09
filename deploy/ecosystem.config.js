module.exports = {
  apps: [{
    name: 'realnet-api',
    cwd: '/home/ubuntu/realnet-monitor-suite/api',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: { NODE_ENV: 'production' }
  }]
};
