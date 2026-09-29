'use strict';
(() => {
  // Only the published public demo sends visit notices; previews stay silent.
  if (location.origin !== 'https://giotzu68.github.io' || !location.pathname.startsWith('/otc-comunita-connesse/')) return;
  const key = 'otc-visit-notice'; let scheduled = false, sent = false;
  const id = crypto.randomUUID().replaceAll('-', '');
  async function notify() {
    if (document.hidden || sent) { scheduled = false; return; }
    try { if (Date.now() - Number(sessionStorage.getItem(key)) < 30 * 60 * 1000) return; } catch {}
    sent = true;
    const section = location.hash.slice(1), allowed = ['inizio','soluzioni','menestrello','esperienza','connect','contatti'];
    try {
      const response = await fetch('https://otc-notify.80.225.86.224.sslip.io/visit', {
        method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: {'Content-Type':'application/json'}, body: JSON.stringify({id,page:allowed.includes(section)?section:'inizio'}),
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) { try { sessionStorage.setItem(key, String(Date.now())); } catch {} }
    } catch { /* Notifications never block the website or the audio experience. */ }
  }
  function schedule() { if (!document.hidden && !scheduled && !sent) { scheduled = true; setTimeout(notify, 4000); } }
  document.addEventListener('visibilitychange', schedule); schedule();
})();
