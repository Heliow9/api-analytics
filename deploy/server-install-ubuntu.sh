#!/usr/bin/env bash
set -e

# Execute dentro da pasta /home/ubuntu/realnet-monitor-suite
sudo apt update
sudo apt install -y nginx curl build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

sudo npm install -g pm2

cd /home/ubuntu/realnet-monitor-suite/api
npm install --omit=dev

cd /home/ubuntu/realnet-monitor-suite/dashboard
npm install
npm run build
sudo mkdir -p /var/www/dashboardreal
sudo rm -rf /var/www/dashboardreal/*
sudo cp -r dist/* /var/www/dashboardreal/

cd /home/ubuntu/realnet-monitor-suite
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu || true

sudo cp deploy/nginx-dashrealapi.conf /etc/nginx/sites-available/dashrealapi
sudo cp deploy/nginx-dashboardreal.conf /etc/nginx/sites-available/dashboardreal
sudo ln -sf /etc/nginx/sites-available/dashrealapi /etc/nginx/sites-enabled/dashrealapi
sudo ln -sf /etc/nginx/sites-available/dashboardreal /etc/nginx/sites-enabled/dashboardreal
sudo nginx -t
sudo systemctl reload nginx

echo "Instalação base finalizada. Confira DNS, .env da API e SSL." 
