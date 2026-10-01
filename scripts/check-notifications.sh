#!/usr/bin/env bash
# Read-only checks; never prints credentials or visitor records.
set -uo pipefail
printf 'Endpoint pubblico: '
curl --fail --silent --show-error --connect-timeout 5 --max-time 12 https://otc-notify.80.225.86.224.sslip.io/health || true
printf '\nControlli sul server:\n'
ssh -o BatchMode=yes -o ConnectTimeout=10 menestrello-vps 'cd /home/ubuntu/otc-notify && python3 -' <<'PY'
import json, runpy, sqlite3, time, urllib.request, urllib.error
from pathlib import Path
try:
    with urllib.request.urlopen('http://127.0.0.1:8112/health',timeout=5) as r:
        print('Servizio locale:',r.status,json.load(r))
except Exception as e: print('Servizio locale: ERRORE',type(e).__name__)
try:
    module=runpy.run_path('visit_notify.py')
    config=module['settings']()
    for method,body in [('getMe',{}),('getChat',{'chat_id':config['TELEGRAM_CHAT_ID']})]:
        request=urllib.request.Request('https://api.telegram.org/bot'+config['TELEGRAM_BOT_TOKEN']+'/'+method,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request,timeout=12) as response:
                result=json.load(response)
                print('Telegram '+method+':', 'OK' if result.get('ok') else 'ERRORE')
        except urllib.error.HTTPError as e: print('Telegram '+method+': HTTP',e.code)
        except Exception as e: print('Telegram '+method+': ERRORE',type(e).__name__)
    path=Path(module['DB'])
    if path.exists():
        with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
            for table,column in [('visits','created'),('summaries','started')]:
                try:
                    count=db.execute('SELECT count(*) FROM '+table+' WHERE '+column+'>?',(time.time()-1800,)).fetchone()[0]
                    print(table+' negli ultimi 30 minuti:',count)
                except sqlite3.Error: print(table+': tabella non disponibile')
except Exception as e: print('Configurazione servizio: ERRORE',type(e).__name__)
print('Nota: getMe e getChat non inviano messaggi; non verificano da soli sendMessage.')
PY
