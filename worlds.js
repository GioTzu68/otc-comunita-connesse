'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const gateway = document.querySelector('.world-gateway');
  if (!gateway) return;
  let hovering = null, enterTimer, leaveTimer, entering = false;
  const preview = door => {
    clearTimeout(leaveTimer); clearTimeout(enterTimer); hovering = door;
    gateway.dataset.activeWorld = door.dataset.world;
    enterTimer = setTimeout(() => window.OTCAudio?.previewSector(door.dataset.world), 180);
  };
  const leave = door => {
    clearTimeout(enterTimer);
    leaveTimer = setTimeout(() => {
      if (hovering !== door) return;
      hovering = null; delete gateway.dataset.activeWorld;
      window.OTCAudio?.previewSector(null);
    }, 120);
  };
  gateway.querySelectorAll('.world-door').forEach(door => {
    door.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') preview(door); });
    door.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') leave(door); });
    door.addEventListener('focus', () => preview(door));
    door.addEventListener('blur', () => leave(door));
    door.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const target = document.querySelector(door.getAttribute('href')); if (!target) return;
      e.preventDefault(); if (entering) return; entering = true;
      clearTimeout(enterTimer); clearTimeout(leaveTimer); hovering = null;
      delete gateway.dataset.activeWorld; window.OTCAudio?.previewSector(null);
      const finish = () => {
        history.pushState(null, '', door.getAttribute('href'));
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
        const title = target.querySelector('h2'); title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true });
        dispatchEvent(new Event('scroll')); entering = false;
      };
      if (reduced.matches || document.documentElement.classList.contains('motion-paused') || !door.animate) { finish(); return; }
      const photo = door.querySelector('.door-photo');
      const movement = photo.animate([
        { transform: getComputedStyle(photo).transform },
        { transform: 'scale(1.3)' }
      ], { duration: 280, easing: 'ease-out' });
      movement.finished.then(finish).catch(() => { if (entering) finish(); });
    });
  });
  const audioButton = document.querySelector('#gateway-audio');
  audioButton.addEventListener('click', () => {
    const state = window.OTCAudio?.state();
    if (state?.enabled && state.ready) document.querySelector('#sound-toggle').click();
    else window.OTCAudio?.enable();
  });
  function audioState(state) {
    audioButton.textContent = state.enabled && state.ready ? 'Disattiva l’audio' : 'Attiva l’audio';
    document.querySelector('#gateway-audio-note').textContent = !state.enabled ? 'Audio disattivato.' : !state.ready ? 'Un clic attiva musica e parole.' : state.theme === 'religious' ? 'Cattedrale · Musica e parole latine con traduzione.' : 'Comunità · Musica per gli spazi di partecipazione.';
  }
  document.addEventListener('otc:audio-state', e => audioState(e.detail));
  if (window.OTCAudio) audioState(window.OTCAudio.state());
  const journeys = {
    religious: [
      ['religioso-amplificazione-audio','Amplificazione audio','La parola, più vicina.','Dall’ambone all’ultima fila: microfoni e diffusori per una parola chiara, nel rispetto dell’acustica della chiesa.','Microfono e ambone','78% 76%','78% 58%',2.05],
      ['religioso-impianti-elettrici-e-illuminazione','Illuminazione','La luce valorizza il luogo.','Luce e impianti elettrici accompagnano la liturgia e mettono in risalto l’architettura.','Archi e illuminazione','46% 20%','48% 26%',1.7],
      ['religioso-arredi-sacri-e-parrocchiali','Arredi sacri','Ogni gesto trova il suo posto.','Altare, ambone e arredi: soluzioni che dialogano con lo spazio e con la vita della comunità.','Altare e arredi liturgici','58% 72%','59% 60%',1.85]
    ],
    public: [
      ['pubblico-conference-system','Conference system','Una voce alla volta. Tutti partecipano.','Microfoni e postazioni per ascoltare, intervenire e gestire il confronto nelle sale consiliari.','Microfoni e postazioni','50% 70%','36% 64%',1.85],
      ['pubblico-illuminazione-e-domotica','Illuminazione e domotica','Lo spazio, nella luce giusta.','Illuminazione e controllo per adattare gli ambienti pubblici alle attività di ogni giorno.','Luce e architettura','54% 15%','64% 28%',1.65],
      ['pubblico-arredi-per-aule-e-sale','Arredi per aule e sale','Il posto giusto per il confronto.','Tavoli, sedute e postazioni: spazi organizzati per lavorare e partecipare insieme.','Sedute e tavoli','55% 72%','67% 73%',1.8]
    ]
  };
  function openService(id) { const detail = document.getElementById(id); if (detail?.matches('details')) detail.open = true; }
  document.querySelectorAll('[data-cinema]').forEach(cinema => {
    const items = journeys[cinema.dataset.cinema], options = cinema.querySelector('.cinema-options');
    let selected = 0, timer;
    function select(index, explore = true) {
      selected = index; const item = items[index];
      const photo = cinema.querySelector('.cinema-photo');
      photo.classList.remove('cinema-exploring');
      const artwork = document.getElementById(item[0])?.querySelector('.service-art');
      if (artwork) photo.replaceChildren(artwork.cloneNode(true));
      cinema.style.setProperty('--shot-position', '50% 50%'); cinema.style.setProperty('--shot-origin', '50% 50%'); cinema.style.setProperty('--shot-zoom', 1.3);
      cinema.querySelector('.cinema-location').textContent = item[4];
      cinema.querySelector('.cinema-photo').alt = item[4];
      cinema.querySelector('.cinema-count').textContent = `0${index+1} / 03`;
      cinema.querySelector('.cinema-title').textContent = item[2]; cinema.querySelector('.cinema-description').textContent = item[3];
      cinema.querySelector('.cinema-link').href = '#' + item[0];
      if (explore) { void photo.offsetWidth; photo.classList.add('cinema-exploring'); }
      [...options.children].forEach((link,i) => { if(i===index) link.setAttribute('aria-current','true'); else link.removeAttribute('aria-current'); });
    }
    items.forEach((item,index) => {
      const link = document.createElement('a'); link.className = 'cinema-option'; link.href = '#' + item[0];
      const number = document.createElement('span'); number.textContent = '0' + (index+1); link.append(number, document.createTextNode(item[1]));
      link.addEventListener('pointerenter', e => { if(e.pointerType==='mouse') { clearTimeout(timer); timer=setTimeout(()=>select(index),100); } });
      link.addEventListener('pointerleave', () => clearTimeout(timer));
      link.addEventListener('focus', () => select(index));
      link.addEventListener('click', () => { clearTimeout(timer); select(index); openService(item[0]); }); options.append(link);
    });
    cinema.querySelector('.cinema-link').addEventListener('click', () => openService(items[selected][0]));
    cinema.querySelector('.cinema-stage').addEventListener('pointerenter', e => { if(e.pointerType === 'mouse') select(selected); });
    select(0, false);
  });
  gateway.querySelectorAll('.world-door').forEach(door => {
    door.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || reduced.matches) return;
      const r = door.getBoundingClientRect();
      door.style.setProperty('--door-x', `${((e.clientX-r.left)/r.width-.5)*12}px`);
      door.style.setProperty('--door-y', `${((e.clientY-r.top)/r.height-.5)*12}px`);
      door.style.setProperty('--shine-x', `${(e.clientX-r.left)/r.width*100}%`);
      door.style.setProperty('--shine-y', `${(e.clientY-r.top)/r.height*100}%`);
    });
    door.addEventListener('pointerleave', () => { door.style.setProperty('--door-x','0px'); door.style.setProperty('--door-y','0px'); });
  });
  document.querySelectorAll('.service-item').forEach(detail => {
    detail.addEventListener('toggle', () => {
      detail.classList.remove('service-opened');
      if(detail.open) { void detail.offsetWidth; detail.classList.add('service-opened'); }
    });
  });
  const deepLink = () => openService(location.hash.slice(1));
  addEventListener('hashchange', deepLink); deepLink();
})();
