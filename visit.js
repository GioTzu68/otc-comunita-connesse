'use strict';
(() => {
  if (location.origin !== 'https://giotzu68.github.io' || !location.pathname.startsWith('/otc-comunita-connesse/')) return;
  const endpoint = 'https://otc-notify.77.81.229.206.sslip.io';
  const choiceKey = 'otc-visit-choice-v2', profileKey = 'otc-visitor-v2', sessionKey = 'otc-session-v2';
  const pages = new Set(['servizi-pubblici','servizi-religiosi','azienda','offerte','lavori-eseguiti','assistenza','inizio','soluzioni','menestrello','esperienza','connect','contatti']);
  const uuid = () => crypto.randomUUID().replaceAll('-', '');
  const read = (storage,key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
  const write = (storage,key,value) => { try { storage.setItem(key,JSON.stringify(value)); } catch {} };
  const remove = (storage,key) => { try { storage.removeItem(key); } catch {} };
  let choice = read(localStorage,choiceKey);
  if (!choice || choice.expires < Date.now() || !['yes','no'].includes(choice.value)) choice = null;
  let consent = choice?.value === 'yes', profile = null;
  let session = read(sessionStorage,sessionKey);
  if (!session || session.expires < Date.now() || !/^[a-f0-9]{32}$/.test(session.id)) session = {id:uuid(),page:pages.has(location.hash.slice(1))?location.hash.slice(1):'inizio',expires:Date.now()+1800000};
  const sections = new Set(), services = new Set(), events = new Set();
  let seconds = 0, token = session.token || '', sending = false, dirty = true, lastSent = 0, attempts = 0;
  function loadProfile() {
    profile = read(localStorage,profileKey);
    if (!profile || profile.expires < Date.now() || !/^[a-f0-9]{32}$/.test(profile.id) || !Number.isInteger(profile.count)) profile = {id:uuid(),count:0};
    if (session.visitor !== profile.id) { profile.count = Math.min(100000,profile.count+1); session.visitor = profile.id; }
    profile.expires = Date.now()+90*86400000;
    write(localStorage,profileKey,profile); write(sessionStorage,sessionKey,session);
  }
  if (consent) loadProfile();
  function payload() {
    const data = {id:session.id,page:session.page,consent};
    if (consent) Object.assign(data,{visitor:profile.id,count:profile.count,sections:[...sections],services:[...services],events:[...events],seconds});
    if (token) data.token = token;
    return data;
  }
  async function send() {
    if (document.hidden || sending || !dirty || attempts>=3 || (token && Date.now()-lastSent<25000)) return;
    sending = true; const body = JSON.stringify(payload());
    try {
      const response = await fetch(endpoint+(token?'/visit/update':'/visit'),{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000)});
      if (response.status === 429) { lastSent=Date.now(); attempts=0; return; }
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (['sent','updated'].includes(result.status)) console.info('OTC visit notification: '+result.status);
      if (result.token) { token=result.token; session.token=token; write(sessionStorage,sessionKey,session); }
      if (!token) { dirty=false; attempts=3; } // Server suppression or old endpoint: never resend.
      else { dirty=body!==JSON.stringify(payload()); attempts=0; }
      lastSent=Date.now();
    } catch { attempts++; } finally { sending=false; }
  }
  const mark = (set,value) => { if (consent && !set.has(value)) { set.add(value);dirty=true;attempts=0; } };
  let panel;
  function showPreferences() {
    panel?.remove();
    panel=document.createElement('section'); panel.className='visit-preferences'; panel.setAttribute('aria-label','Preferenze dettagli visite');
    panel.innerHTML='<h2>Dettagli delle visite</h2><p>All’apertura OTC riceve su Telegram un avviso con ora e sezione iniziale. Puoi autorizzare anche un codice anonimo del browser, i ritorni, il tipo di dispositivo, browser e sistema operativo, le sezioni e i servizi consultati, le attività e il tempo attivo. Nessun nome, testo dei moduli o indirizzo IP viene incluso nei messaggi.</p><p>Il codice resta in questo browser per 90 giorni dall’ultima visita. I riepiloghi tecnici sul server durano 24 ore; i messaggi restano nella chat Telegram del gestore. Puoi cambiare scelta qui in qualsiasi momento.</p><div><button type="button" data-choice="no">Solo avviso di apertura</button><button type="button" data-choice="yes">Autorizza dettagli e ritorni</button></div>';
    document.body.append(panel);
    panel.addEventListener('click',e=>{
      const button=e.target.closest('[data-choice]'); if (!button) return;
      consent=button.dataset.choice==='yes';
      choice={value:consent?'yes':'no',expires:Date.now()+90*86400000};write(localStorage,choiceKey,choice);
      sections.clear();services.clear();events.clear();seconds=0;
      if (consent) loadProfile(); else {remove(localStorage,profileKey);delete session.visitor;write(sessionStorage,sessionKey,session);}
      dirty=true;attempts=0;lastSent=0;panel.remove();panel=null;preferences.textContent='Preferenze visite'+(consent?' · dettagli attivi':'');send();
    });
  }
  const preferences=document.createElement('button');preferences.type='button';preferences.className='visit-settings';preferences.textContent='Preferenze visite'+(consent?' · dettagli attivi':'');preferences.addEventListener('click',showPreferences);
  (document.querySelector('.visit-notice') || document.querySelector('footer'))?.append(preferences);
  document.addEventListener('toggle',e=>{if (e.target.matches?.('details.service-item[open]')) mark(services,e.target.id);},true);
  document.addEventListener('click',e=>{
    const el=e.target.closest('a,button');if (!el) return;
    const href=el.getAttribute('href')||'';
    if(href==='#contatti')mark(events,'contacts');
    if(href.startsWith('mailto:'))mark(events,'email');
    if(href.startsWith('tel:'))mark(events,'phone');
    if(el.dataset.feature)mark(events,el.dataset.feature);
  });
  document.addEventListener('submit',e=>{if(e.target.id==='contact-form')mark(events,'contact-submit');},true);
  document.addEventListener('otc:visit-audio',e=>{mark(events,e.detail);});
  document.addEventListener('otc:broadcast',e=>{if(e.detail==='complete')mark(events,'broadcast');});
  const observer = new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting && !document.hidden)mark(sections,entry.target.id);}},{threshold:0,rootMargin:'-25% 0px -25% 0px'});
  document.querySelectorAll('main section[id]').forEach(el=>{if(pages.has(el.id))observer.observe(el);});
  setTimeout(send,4000);
  setInterval(()=>{if(!document.hidden){if(consent){seconds+=5;if(seconds%30===0)dirty=true;document.querySelectorAll('main section[id]').forEach(el=>{const rect=el.getBoundingClientRect();if(pages.has(el.id)&&rect.bottom>innerHeight*.25&&rect.top<innerHeight*.75)mark(sections,el.id);});}send();}},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)send();});
  window.addEventListener('pagehide',()=>{if(token&&dirty&&!sending){fetch(endpoint+'/visit/update',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload()),keepalive:true}).catch(()=>{});}});
})();
