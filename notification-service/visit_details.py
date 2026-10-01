"""Validated, consent-based visit summaries. No person or machine identification."""
import json, re, secrets, sqlite3, threading, time, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
SERVICES = {'pubblico-siti-web': 'Siti web per enti pubblici', 'pubblico-conference-system': 'Conference system', 'pubblico-votazione-elettronica': 'Votazione elettronica', 'pubblico-traduzione-simultanea': 'Traduzione simultanea', 'pubblico-arredi-per-aule-e-sale': 'Arredi per aule e sale', 'pubblico-sonorizzazione-professionale': 'Sonorizzazione professionale', 'pubblico-bando-pubblico': 'Bando pubblico', 'pubblico-videoproiezione-e-multimedia': 'Videoproiezione e multimedia', 'pubblico-streaming-e-videoconferenza': 'Streaming e videoconferenza', 'pubblico-messaggistica-informativa': 'Messaggistica informativa', 'pubblico-impianti-elettrici': 'Impianti elettrici', 'pubblico-illuminazione-e-domotica': 'Illuminazione e domotica', 'pubblico-antifurto-e-videosorveglianza': 'Antifurto e videosorveglianza', 'pubblico-orologeria-pubblica': 'Orologeria pubblica', 'pubblico-automazione-campane': 'Automazione campane', 'pubblico-allontanamento-volatili': 'Allontanamento volatili', 'religioso-amplificazione-audio': 'Amplificazione audio', 'religioso-radio-parrocchiali': 'Radio parrocchiali', 'religioso-videoproiezione': 'Videoproiezione', 'religioso-riproduzione-organo': 'Riproduzione organo', 'religioso-impianti-campanari': 'Impianti campanari', 'religioso-riproduzione-campane': 'Riproduzione campane', 'religioso-orologi-da-torre': 'Orologi da torre', 'religioso-allontanamento-volatili': 'Allontanamento volatili', 'religioso-impianti-elettrici-e-illuminazione': 'Impianti elettrici e illuminazione', 'religioso-riscaldamento': 'Riscaldamento', 'religioso-climatizzazione': 'Climatizzazione', 'religioso-impianti-antintrusione': 'Impianti antintrusione', 'religioso-domotica': 'Domotica', 'religioso-vetrate-e-mosaici-artistici': 'Vetrate e mosaici artistici', 'religioso-arredi-sacri-e-parrocchiali': 'Arredi sacri e parrocchiali', 'religioso-allestimento-oratori': 'Allestimento oratori', 'religioso-informatica': 'Informatica', 'religioso-armadi-di-sicurezza': 'Armadi di sicurezza'}
LOCK = threading.Lock()
EVENTS = {'demo-listen':'Ascolto Menestrello avviato manualmente', 'demo-complete':'Ascolto Menestrello completato', 'broadcast':'Diffusione simulata provata', 'contacts':'Contatti aperti', 'email':'Clic email', 'phone':'Clic telefono', 'contact-submit':'Invio modulo contatti tentato', 'audio':'Esplorazione audio', 'luce':'Esplorazione illuminazione', 'controllo':'Esplorazione controllo impianti'}

def validate(data, pages):
    if not isinstance(data,dict):raise ValueError()
    fields={'id','page','consent','visitor','count','sections','services','events','seconds'}
    if set(data)-fields-{'token'} or not {'id','page'}<=set(data):raise ValueError()
    if not isinstance(data['id'],str) or not re.fullmatch(r'[a-f0-9]{32}',data['id']) or data['page'] not in pages:raise ValueError()
    consent=data.get('consent',False)
    if type(consent) is not bool:raise ValueError()
    if 'token' in data and (not isinstance(data['token'],str) or not re.fullmatch(r'[a-f0-9]{64}',data['token'])):raise ValueError()
    result={'id':data['id'],'page':data['page'],'consent':consent}
    if not consent:
        if set(data)-{'id','page','consent','token'}:raise ValueError()
        return result
    visitor=data.get('visitor','');count=data.get('count',0);seconds=data.get('seconds',0)
    if not isinstance(visitor,str) or not re.fullmatch(r'[a-f0-9]{32}',visitor):raise ValueError()
    if type(count) is not int or not 1<=count<=100000 or type(seconds) is not int or not 0<=seconds<=86400:raise ValueError()
    result.update(visitor=visitor,count=count,seconds=seconds)
    for key,allowed in [('sections',pages),('services',SERVICES),('events',EVENTS)]:
        values=data.get(key,[])
        if not isinstance(values,list) or len(values)>len(allowed) or any(not isinstance(v,str) or v not in allowed for v in values) or len(set(values))!=len(values):raise ValueError()
        result[key]=values
    return result

def device(ua):
    ua=ua[:1000]
    kind='Tablet' if re.search(r'iPad|Tablet|Android(?!.*Mobile)',ua,re.I) else 'Telefono' if re.search(r'iPhone|Mobile',ua,re.I) else 'Computer'
    osname=next((label for pattern,label in [('Windows','Windows'),('Android','Android'),('iPhone|iPad','iOS / iPadOS'),('Macintosh|Mac OS','macOS'),('CrOS','ChromeOS'),('Linux','Linux')] if re.search(pattern,ua,re.I)),'Sistema non riconosciuto')
    browser=next((label for pattern,label in [('Edg/|EdgiOS|EdgA','Edge'),('OPR/|Opera','Opera'),('Firefox|FxiOS','Firefox'),('Chrome|CriOS','Chrome'),('Safari','Safari')] if re.search(pattern,ua,re.I)),'Browser non riconosciuto')
    return f'{kind} · {browser} · {osname}'

def text_for(data,pages,started,agent):
    lines=['🌐 Visita alla demo OTC','', 'Ora di apertura: '+datetime.fromtimestamp(started,ZoneInfo('Europe/Rome')).strftime('%d/%m/%Y %H:%M'), 'Pagina iniziale: '+pages[data['page']]]
    if data['consent']:
        lines+=['','👀 Browser OTC-'+data['visitor'][:8].upper(), 'Prima visita' if data['count']==1 else 'Ritorno · visita '+str(data['count']), '💻 '+agent, 'Tempo attivo osservato: '+str(data['seconds'])+' s']
        for key,title,labels in [('sections','Sezioni consultate',pages),('services','Servizi aperti',SERVICES),('events','Attività',EVENTS)]:
            if data[key]:lines.append(title+': '+', '.join(labels[v] for v in data[key]))
        lines+=['','Codice anonimo del browser; persona e PC non identificati. Dettagli facoltativi autorizzati dal visitatore.']
    else:lines+=['','Dettagli visite non autorizzati: nessun riconoscimento dei ritorni.']
    lines+=['','https://giotzu68.github.io/otc-comunita-connesse/']
    return '\n'.join(lines)[:4000]

def telegram(config,method,payload):
    payload={'chat_id':config['TELEGRAM_CHAT_ID'],**payload}
    req=urllib.request.Request('https://api.telegram.org/bot'+config['TELEGRAM_BOT_TOKEN']+'/'+method,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=12) as response:result=json.load(response)
    if not result.get('ok'):raise ValueError('telegram')
    return result['result']

def handle(handler,dbpath,pages,config,reserve):
    try:
        size=int(handler.headers.get('Content-Length','0'))
        if not 0<size<=6000 or not handler.headers.get('Content-Type','').startswith('application/json'):return handler.reply(400,{'ok':False})
        handler.connection.settimeout(5)
        raw=json.loads(handler.rfile.read(size));data=validate(raw,pages)
        if handler.path=='/visit/update' and 'token' not in raw:raise ValueError()
        if handler.path=='/visit' and 'token' in raw:raise ValueError()
    except (ValueError,TypeError,KeyError,TimeoutError):return handler.reply(400,{'ok':False})
    now=time.time()
    with LOCK,sqlite3.connect(dbpath,timeout=5) as db:
        db.execute('CREATE TABLE IF NOT EXISTS summaries (id TEXT PRIMARY KEY, token TEXT, message INTEGER, started REAL, updated REAL, summary TEXT, agent TEXT)')
        db.execute('DELETE FROM summaries WHERE started<?',(now-86400,))
        db.commit()
        if handler.path=='/visit/update':
            row=db.execute('SELECT token,message,started,updated,summary,agent FROM summaries WHERE id=?',(data['id'],)).fetchone()
            if not row or not secrets.compare_digest(raw['token'],row[0]):return handler.reply(403,{'ok':False})
            old=json.loads(row[4]);data['page']=old['page']
            if data['consent'] and old['consent'] and data['visitor']==old['visitor']:
                for key in ('sections','services','events'):data[key]=list(dict.fromkeys(old[key]+data[key]))
                data['seconds']=max(data['seconds'],old['seconds'])
                data['count']=max(data['count'],old['count'])
            agent=row[5] or device(handler.headers.get('User-Agent',''))
            summary=text_for(data,pages,row[2],agent)
            previous=text_for(old,pages,row[2],row[5])
            if summary==previous:return handler.reply(200,{'ok':True,'status':'unchanged'})
            # Revocation is always immediate; other edits are capped at one / 20 s.
            if data['consent'] and now-row[3]<20:return handler.reply(429,{'ok':False})
            try:telegram(config,'editMessageText',{'message_id':row[1],'text':summary,'disable_web_page_preview':True})
            except Exception:return handler.reply(503,{'ok':False})
            db.execute('UPDATE summaries SET updated=?,summary=?,agent=? WHERE id=?',(now,json.dumps(data),agent if data['consent'] else '',data['id']))
            return handler.reply(200,{'ok':True,'status':'updated'})
        address=handler.headers.get('X-Forwarded-For',handler.client_address[0]).split(',')[-1].strip()
        outcome=reserve(data['id'],address,config['TELEGRAM_BOT_TOKEN'],now)
        if outcome!='accepted':return handler.reply(200,{'ok':True,'status':outcome})
        agent=device(handler.headers.get('User-Agent',''))
        token=secrets.token_hex(32)
        try:
            message=telegram(config,'sendMessage',{'text':text_for(data,pages,now,agent),'disable_web_page_preview':True})
            db.execute('INSERT INTO summaries VALUES (?,?,?,?,?,?,?)',(data['id'],token,message['message_id'],now,now,json.dumps(data),agent if data['consent'] else ''))
        except Exception:
            db.execute('DELETE FROM visits WHERE id=?',(data['id'],))
            return handler.reply(503,{'ok':False})
        return handler.reply(200,{'ok':True,'status':'sent','token':token})
