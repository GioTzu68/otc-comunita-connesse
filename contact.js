'use strict';
(() => {
  const menu = document.querySelector('.site-menu'), form = document.querySelector('#contact-form');
  const status = document.querySelector('#contact-status'), button = form.querySelector('[type=submit]');
  let sending = false, requestId = crypto.randomUUID().replaceAll('-', '');
  document.addEventListener('click', e => { if (menu && (!menu.contains(e.target) || e.target.closest('a'))) menu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu?.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
    if (sending) return;
    form.elements.area.value = link.dataset.sector;
    if (!form.elements.message.value.trim()) form.elements.message.value = 'Vorrei informazioni su: ' + link.dataset.service + '.\n';
  }));
  document.querySelector('[data-contact-assistance]').addEventListener('click', () => {
    if (!sending && !form.elements.message.value.trim()) form.elements.message.value = 'Richiesta di assistenza per il mio impianto:\n';
  });
  function revealService() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const item = document.getElementById(id);
    if (item?.classList.contains('service-item')) { item.open = true; item.scrollIntoView({block:'start'}); }
  }
  window.addEventListener('hashchange', revealService); revealService();
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (sending || !form.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(form)); payload.id = requestId;
    sending = true; button.disabled = true; button.textContent = 'Invio in corso…';
    status.textContent = 'Invio della richiesta a OTC…'; status.dataset.error = 'false';
    try {
      const response = await fetch('https://otc-notify.80.225.86.224.sslip.io/contact', {
        method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.message || 'Invio non riuscito. Riprova oppure scrivi a info@otconline.it.');
      status.textContent = data.message || 'Messaggio inviato. Grazie per averci contattato.';
      form.reset(); requestId = crypto.randomUUID().replaceAll('-', '');
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error.name === 'TimeoutError' ? 'Non abbiamo ricevuto la conferma dell’invio. Per evitare doppioni, contattaci a info@otconline.it.' : error.message === 'Failed to fetch' ? 'Connessione non disponibile. I dati sono rimasti nel modulo: riprova oppure scrivi a info@otconline.it.' : error.message;
    } finally { sending = false; button.disabled = false; button.innerHTML = 'Invia messaggio <span aria-hidden="true">↗</span>'; status.focus(); }
  });
})();
