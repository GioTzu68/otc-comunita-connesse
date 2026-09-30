#!/usr/bin/env bash
# Run on the owner's Mac, where the existing menestrello-vps SSH alias is configured.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
ssh -o BatchMode=yes -o ConnectTimeout=10 menestrello-vps 'mkdir -p /home/ubuntu/otc-notify/incoming'
scp "$root/notification-service/visit_notify.py" "$root/notification-service/visit_details.py" menestrello-vps:/home/ubuntu/otc-notify/incoming/
ssh -o BatchMode=yes menestrello-vps 'bash -s' <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/otc-notify
python3 -m py_compile incoming/visit_notify.py incoming/visit_details.py
service=$(python3 - <<'PY'
from pathlib import Path
matches=[p.stem for p in Path('/etc/systemd/system').glob('*.service') if 'visit_notify.py' in p.read_text(errors='ignore')]
if len(matches)!=1:raise SystemExit('Cannot uniquely identify the notification service; no files replaced.')
print(matches[0])
PY
)
backup="backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup"
cp visit_notify.py "$backup/"
if [ -f visit_details.py ]; then cp visit_details.py "$backup/"; fi
cp incoming/visit_notify.py incoming/visit_details.py .
if ! sudo -n systemctl restart "$service" || ! curl --fail --silent --retry 4 --retry-delay 1 --retry-connrefused http://127.0.0.1:8112/health; then
  cp "$backup/visit_notify.py" .
  if [ -f "$backup/visit_details.py" ]; then cp "$backup/visit_details.py" .; else rm -f visit_details.py; fi
  sudo -n systemctl restart "$service"
  echo 'Update failed; restored previous notification service.' >&2
  exit 1
fi
printf '\nNotification service updated. Backup: %s\n' "$backup"
REMOTE
