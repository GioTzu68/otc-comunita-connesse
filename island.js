'use strict';
(() => {
  const visual = document.querySelector('.island-visual'); if(!visual) return;
  const button=visual.querySelector('.island-flight'), phase=visual.querySelector('.flight-phase');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let timer, cues=[], played=false;
  function stop() {
    clearTimeout(timer); cues.forEach(clearTimeout); cues=[];
    visual.classList.remove('island-flying'); button.setAttribute('aria-pressed','false');
    button.textContent='Ripeti il volo ↗'; phase.textContent='In tutta la Sardegna. Vicini al tuo progetto.';
  }
  function fly() {
    stop(); played=true;
    if(reduced.matches) { button.textContent='Vista dell’isola'; return; }
    void visual.offsetWidth; visual.classList.add('island-flying');
    button.textContent='Ferma il volo ⏸'; button.setAttribute('aria-pressed','true');
    ['Dalle coste…','…ai paesi dell’interno.','Dai luoghi della parola…','…agli spazi della partecipazione.'].forEach((text,i)=>cues.push(setTimeout(()=>phase.textContent=text,i*3000)));
    timer=setTimeout(stop,12500);
  }
  button.addEventListener('click',()=>visual.classList.contains('island-flying')?stop():fly());
  reduced.addEventListener('change',()=>{if(reduced.matches) stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  if('IntersectionObserver' in window) {
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting && !played && !reduced.matches) fly();
      else if(!e.isIntersecting && visual.classList.contains('island-flying')) stop();
    }),{threshold:.35}); observer.observe(visual);
  }
})();
