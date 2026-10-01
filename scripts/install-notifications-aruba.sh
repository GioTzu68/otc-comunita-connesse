#!/usr/bin/env bash
# Install OTC on the migrated VPS, preserving its private PVP configuration.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
ssh -o BatchMode=yes -o ConnectTimeout=10 menestrello-vps 'mkdir -p /home/ubuntu/otc-notify/incoming'
scp "$root/notification-service/visit_notify.py" "$root/notification-service/visit_details.py" menestrello-vps:/home/ubuntu/otc-notify/incoming/
ssh -o BatchMode=yes menestrello-vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/otc-notify
sudo -n true
test -r /home/ubuntu/pvp-monitor/config.py
sudo -n test -f /etc/caddy/Caddyfile
if sudo -n test -e /etc/systemd/system/otc-notify.service; then
  echo 'otc-notify.service esiste già: nessuna configurazione sovrascritta.' >&2
  exit 1
fi
if sudo -n grep -Fq 'otc-notify.77.81.229.206.sslip.io' /etc/caddy/Caddyfile; then
  echo 'Dominio OTC già configurato: occorre verificare la configurazione prima di modificarla.' >&2
  exit 1
fi
python3 -m py_compile incoming/visit_notify.py incoming/visit_details.py
python3 - <<'PY'
import ast
from pathlib import Path
names=set()
for n in ast.parse(Path('/home/ubuntu/pvp-monitor/config.py').read_text()).body:
 if isinstance(n,ast.Assign):
  for target in n.targets:
   if isinstance(target,ast.Name) and target.id in ('TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID'):
    if not ast.literal_eval(n.value):raise SystemExit('Configurazione Telegram vuota.')
    names.add(target.id)
if len(names)!=2:raise SystemExit('Configurazione Telegram incompleta.')
print('Configurazione Telegram presente; credenziali non visualizzate.')
PY
backup="backup-aruba-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup"
sudo -n cp /etc/caddy/Caddyfile "$backup/Caddyfile"
for file in visit_notify.py visit_details.py; do
  if [ -f "$file" ]; then cp "$file" "$backup/"; fi
  cp "incoming/$file" "$file"
done
cat > incoming/otc-notify.service <<'UNIT'
[Unit]
Description=OTC visit notifications and contact relay
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/otc-notify
ExecStart=/usr/bin/python3 /home/ubuntu/otc-notify/visit_notify.py
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
sudo -n cat /etc/caddy/Caddyfile > incoming/Caddyfile
cat >> incoming/Caddyfile <<'CADDY'

# OTC notifications on Aruba
otc-notify.77.81.229.206.sslip.io {
    reverse_proxy 127.0.0.1:8112
 }
CADDY

sudo -n caddy validate --config "$PWD/incoming/Caddyfile" --adapter caddyfile
rollback() {
  trap - ERR
  echo 'Installazione non completata: ripristino della configurazione precedente.' >&2
  sudo -n systemctl disable --now otc-notify.service || true
  sudo -n rm -f /etc/systemd/system/otc-notify.service
  sudo -n cp "$backup/Caddyfile" /etc/caddy/Caddyfile
  sudo -n systemctl daemon-reload
  sudo -n systemctl reload caddy || true
  for file in visit_notify.py visit_details.py; do
    if [ -f "$backup/$file" ]; then cp "$backup/$file" "$file"; fi
  done
}
trap rollback ERR
sudo -n install -m 644 incoming/otc-notify.service /etc/systemd/system/otc-notify.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now otc-notify.service
curl --fail --silent --retry 5 --retry-delay 1 --retry-connrefused http://127.0.0.1:8112/health
sudo -n install -m 644 incoming/Caddyfile /etc/caddy/Caddyfile
sudo -n systemctl reload caddy
trap - ERR
printf '\nServizio installato. Backup: %s\n' "$backup"
if curl --fail --silent --show-error --connect-timeout 5 --max-time 15 --retry 3 --retry-delay 3 https://otc-notify.77.81.229.206.sslip.io/health; then
  printf '\nHTTPS pronto.\n'
else
  printf '\nServizio locale attivo; HTTPS non ancora pronto. Non aggiornare il sito prima del controllo.\n'
fi
REMOTE
