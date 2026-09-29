'use strict';
(()=>{
  const root=document.documentElement;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.toggle('motion-paused',media.matches);
  media.addEventListener('change',e=>root.classList.toggle('motion-paused',e.matches));
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target);}}),{threshold:.08});
    document.querySelectorAll('.section-heading,.solution-card,.demo-intro,.demo-workspace,.product-story,.explorer,.connect-section,.closing').forEach((el,i)=>{el.classList.add('reveal-item');el.style.setProperty('--reveal-delay',`${(i%2)*80}ms`);observer.observe(el);});
  }
  document.addEventListener('otc:broadcast',e=>document.querySelector('.map-panel').classList.toggle('broadcasting',e.detail==='start'));
  document.addEventListener('otc:feature',()=>{const panel=document.querySelector('.explorer-detail');panel.classList.remove('detail-enter');void panel.offsetWidth;panel.classList.add('detail-enter');});
})();
