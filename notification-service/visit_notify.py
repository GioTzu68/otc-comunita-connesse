"""OTC visit notifications. Token and recipient remain in the existing private PVP config."""
import ast, hashlib, hmac, http.cookiejar, json, os, re, sqlite3, time, secrets, threading, urllib.request, urllib.parse, urllib.error
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo
from visit_details import handle as handle_visit
ORIGINS = {'https://giotzu68.github.io', 'https://otc-comunita-connesse.giotzu.chatgpt.site'}
PAGES = {'servizi-pubblici':'Catalogo enti pubblici','servizi-religiosi':'Catalogo enti religiosi','azienda':'Azienda','offerte':'Offerte','lavori-eseguiti':'Lavori eseguiti','assistenza':'Assistenza','inizio':'Pagina iniziale','soluzioni':'Soluzioni','menestrello':'Menestrello — enti pubblici','esperienza':'Comunità religiose','connect':'Area clienti','contatti':'Contatti'}
CONFIG = Path(os.environ.get('PVP_CONFIG','/home/ubuntu/pvp-monitor/config.py'))
DB = os.environ.get('OTC_VISITS_DB','/home/ubuntu/otc-notify/visits.sqlite3')
def settings():
    out={}
    for n in ast.parse(CONFIG.read_text()).body:
        if isinstance(n,ast.Assign):
            for target in n.targets:
                if isinstance(target,ast.Name) and target.id in ['TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID']:out[target.id]=ast.literal_eval(n.value)
    return out

def reserve(visit, address, secret, now):
    digest=hmac.new(secret.encode(),(str(int(now//86400))+address).encode(),hashlib.sha256).hexdigest()
    with sqlite3.connect(DB,timeout=5) as db:
        db.execute('CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, address TEXT, created REAL)')
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM visits WHERE created < ?', (now-86400,))
        if db.execute('SELECT 1 FROM visits WHERE id=?',(visit,)).fetchone():return 'duplicate'
        recent=db.execute('SELECT count(*) FROM visits WHERE address=? AND created>?',(digest,now-1800)).fetchone()[0]
        hour=db.execute('SELECT count(*) FROM visits WHERE created>?',(now-3600,)).fetchone()[0]
        burst=db.execute('SELECT count(*) FROM visits WHERE created>?',(now-60,)).fetchone()[0]
        if recent>=2 or hour>=30 or burst>=5:return 'limited'
        db.execute('INSERT INTO visits VALUES (?,?,?)',(visit,digest,now))
    return 'accepted'

def validate_contact(data):
    limits={'contact_name':120,'organization':160,'email':254,'phone':40,'message':5000,'area':30,'website':200,'id':32}
    if not isinstance(data,dict) or set(data)!=set(limits):raise ValueError('Controlla i campi della richiesta.')
    clean={}
    for key,limit in limits.items():
        value=data[key]
        if not isinstance(value,str) or len(value)>limit or '\x00' in value:raise ValueError('Controlla la lunghezza dei campi.')
        clean[key]=value.strip()
    if not clean['contact_name'] or not clean['message']:raise ValueError('Nome e messaggio sono obbligatori.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',clean['email']):raise ValueError('Inserisci un indirizzo email valido.')
    if clean['area'] not in ('enti-pubblici','enti-religiosi') or not re.fullmatch(r'[a-f0-9]{32}',clean['id']):raise ValueError('Richiesta non valida.')
    return clean

def reserve_contact(request_id,address,secret,now):
    digest=hmac.new(secret.encode(),(str(int(now//86400))+address).encode(),hashlib.sha256).hexdigest()
    with sqlite3.connect(DB,timeout=5) as db:
        db.execute('CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, address TEXT, created REAL, state TEXT)')
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM contacts WHERE created<?',(now-86400,))
        row=db.execute('SELECT state FROM contacts WHERE id=?',(request_id,)).fetchone()
        if row:return row[0]
        n=db.execute('SELECT count(*) FROM contacts WHERE address=? AND created>?',(digest,now-3600)).fetchone()[0]
        total=db.execute('SELECT count(*) FROM contacts WHERE created>?',(now-3600,)).fetchone()[0]
        if n>=5 or total>=40:return 'limited'
        db.execute('INSERT INTO contacts VALUES (?,?,?,?)',(request_id,digest,now,'pending'))
    return 'accepted'

def contact_state(request_id,state):
    with sqlite3.connect(DB) as db:db.execute('UPDATE contacts SET state=? WHERE id=?',(state,request_id))

def forward_contact(data):
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def post(fields):
        request=urllib.request.Request('https://www.otcsrl.it/wp-admin/admin-ajax.php',data=urllib.parse.urlencode(fields).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OTC-contact-relay/1.0'})
        try:
            with opener.open(request,timeout=10) as response:return json.loads(response.read(65536))
        except urllib.error.HTTPError as error:return json.loads(error.read(65536))
    token=post({'action':'otc_contact_token'})
    if not isinstance(token,dict) or not token.get('success'):raise ValueError('token_unavailable')
    fields={key:data[key] for key in ['contact_name','organization','email','phone','message','area','website']}
    fields.update(action='otc_contact',nonce=token['data']['nonce'])
    result=post(fields)
    if not isinstance(result,dict):raise ValueError('invalid_response')
    return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass  # Do not log visitor addresses or request payloads.
    def reply(self,status,data):
        b=json.dumps(data).encode();self.send_response(status)
        if self.headers.get('Origin') in ORIGINS:self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
        self.send_header('Vary','Origin');self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)))
        self.end_headers();self.wfile.write(b)
    def do_GET(self):self.reply(200 if self.path=='/health' else 404,{'ok':self.path=='/health'})
    def do_OPTIONS(self):
        if self.path not in ('/visit','/visit/update','/contact') or self.headers.get('Origin') not in ORIGINS:return self.reply(403,{'ok':False})
        self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods','POST');self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Vary','Origin');self.send_header('Access-Control-Max-Age','600');self.end_headers()
    def contact(self):
        if self.headers.get('Origin') not in ORIGINS:return self.reply(403,{'success':False})
        if not self.headers.get('Content-Type','').startswith('application/json'):return self.reply(415,{'success':False})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>24000:return self.reply(413,{'success':False,'message':'Richiesta troppo lunga.'})
            self.connection.settimeout(5)
            data=validate_contact(json.loads(self.rfile.read(length)))
        except (ValueError,TypeError,TimeoutError):return self.reply(400,{'success':False,'message':'Controlla nome, email, messaggio e lunghezza dei campi.'})
        if data['website']:return self.reply(200,{'success':True,'message':'Richiesta ricevuta.'})
        address=self.headers.get('X-Forwarded-For',self.client_address[0]).split(',')[-1].strip()
        outcome=reserve_contact(data['id'],address,settings()['TELEGRAM_BOT_TOKEN'],time.time())
        if outcome=='sent':return self.reply(200,{'success':True,'message':'Il tuo messaggio è già stato inviato. Grazie per averci contattato.'})
        if outcome=='limited':return self.reply(429,{'success':False,'message':'Hai effettuato diversi invii. Riprova più tardi oppure scrivi a info@otconline.it.'})
        if outcome!='accepted':return self.reply(409,{'success':False,'message':'Non ripetiamo la richiesta precedente per evitare doppioni. Per una conferma scrivi a info@otconline.it.'})
        try:
            result=forward_contact(data)
            if result.get('success'):
                contact_state(data['id'],'sent')
                print('OTC contact accepted by original website',flush=True)
                return self.reply(200,{'success':True,'message':result.get('data',{}).get('message','Messaggio inviato. Grazie per averci contattato.')})
            contact_state(data['id'],'failed')
            return self.reply(422,{'success':False,'message':'Il servizio contatti non ha accettato l’invio. Scrivi a info@otconline.it.'})
        except Exception:
            return self.reply(503,{'success':False,'message':'Non abbiamo ricevuto la conferma dell’invio. Per evitare doppioni scrivi a info@otconline.it.'})
    def do_POST(self):
        if self.path=='/contact':return self.contact()
        if self.path not in ('/visit','/visit/update') or self.headers.get('Origin') not in ORIGINS:return self.reply(403,{'ok':False})
        return handle_visit(self,DB,PAGES,settings(),reserve)

if __name__=='__main__':
    os.umask(0o077)
    ThreadingHTTPServer(('127.0.0.1',8112),Handler).serve_forever()
