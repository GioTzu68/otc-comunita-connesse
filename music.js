'use strict';
(() => {
  const $ = s => document.querySelector(s), root = document.documentElement;
  const toggle = $('#sound-toggle'), subtitle = $('#latin-subtitle');
  let enabled = true, theme = 'public', section = '', ctx, master, compressor;
  let bed = null, bedGeneration = 0, bedLoading = false, narration = null, latinTimer, captionTimer;
  let latinGeneration = 0, latinIndex = 0, announcementCount = 0, scrollFrame = 0, wordFrame = 0;
  const cache = new Map();
  const catalog = fetch('assets/audio-catalog.json').then(r => { if (!r.ok) throw Error('catalog'); return r.json(); });
  catalog.catch(() => {});
  const ready = () => ctx?.state === 'running' && !document.hidden;
  function emit() {
    root.dataset.atmosphere = theme;
    root.dataset.audioState = !enabled ? 'off' : ready() ? 'playing' : 'waiting';
    toggle.setAttribute('aria-checked', String(enabled));
    const label = !enabled ? 'Attiva audio' : ready() ? 'Disattiva audio' : 'Audio attivo: parte al primo clic';
    toggle.setAttribute('aria-label', label); toggle.title = label;
    root.classList.toggle('sound-playing', enabled && ready());
    document.dispatchEvent(new CustomEvent('otc:audio-state', { detail: { enabled, ready: ready(), theme, section } }));
  }
  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw Error('unsupported');
    ctx = new AudioCtx(); master = ctx.createGain(); master.gain.value = 1;
    compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -3; compressor.knee.value = 3;
    compressor.ratio.value = 12; compressor.attack.value = .003; compressor.release.value = .25;
    compressor.connect(master); master.connect(ctx.destination);
    ctx.addEventListener('statechange', () => { emit(); if (enabled && ready()) startBed(); });
    return ctx;
  }
  async function buffer(url, signal) {
    ensureContext();
    if (!signal && cache.has(url)) return cache.get(url);
    const task = fetch(url, { signal }).then(r => { if (!r.ok) throw Error('audio'); return r.arrayBuffer(); }).then(b => ctx.decodeAudioData(b));
    if (!signal) { cache.set(url, task); task.catch(() => cache.delete(url)); }
    return task;
  }
  function fade(gain, value, duration = .7) {
    gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(value, ctx.currentTime + duration);
  }
  function stopNode(node, duration = .15) {
    if (!node) return;
    fade(node.gain, 0, duration);
    try { node.source.stop(ctx.currentTime + duration); } catch {}
    node.source.onended = () => { node.source.disconnect(); node.gain.disconnect(); };
  }
  function bedLevel() { return announcementCount ? .10 : narration ? .48 : .85; }
  function stopLatin() {
    latinGeneration++; cancelAnimationFrame(wordFrame); clearTimeout(latinTimer); clearTimeout(captionTimer); latinTimer = null;
    subtitle.classList.remove('visible'); subtitle.setAttribute('aria-hidden', 'true');
    stopNode(narration); narration = null; if (bed) fade(bed.gain, bedLevel());
  }
  function latinAllowed() { return enabled && ready() && theme === 'religious' && !announcementCount; }
  function scheduleLatin(delay = 6000) {
    if (!latinAllowed() || narration || latinTimer) return;
    latinTimer = setTimeout(() => { latinTimer = null; playLatin(); }, delay);
  }
  async function playLatin() {
    if (!latinAllowed()) return;
    const generation = ++latinGeneration;
    try {
      const { latin } = await catalog, phrase = latin[latinIndex % latin.length];
      const decoded = await buffer(phrase.audio);
      if (generation !== latinGeneration || !latinAllowed()) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = decoded;
      gain.gain.value = .9; source.connect(gain); gain.connect(compressor); narration = { source, gain };
      const text = $('#latin-text');
      const tokens = phrase.text.split(/\s+/);
      text.setAttribute('aria-label', phrase.text);
      text.replaceChildren(...tokens.map((word, i) => {
        const span = document.createElement('span'); span.className = 'latin-word'; span.textContent = word;
        span.setAttribute('aria-hidden', 'true');
        return span;
      }));
      $('#latin-translation').textContent = phrase.translation;
      const wordNodes = [...text.children], startAt = ctx.currentTime + .06;
      function followWords() {
        if (generation !== latinGeneration) return;
        const elapsed = ctx.currentTime - startAt;
        wordNodes.forEach((node, i) => {
          const cue = phrase.words?.[i];
          const active = cue && elapsed >= cue.start && elapsed < cue.start + cue.duration;
          node.classList.toggle('active-word', Boolean(active));
          node.classList.toggle('spoken-word', Boolean(cue && elapsed >= cue.start));
        });
        if (elapsed < phrase.spokenDuration) wordFrame = requestAnimationFrame(followWords);
      }
      wordFrame = requestAnimationFrame(followWords);
      subtitle.setAttribute('aria-hidden', 'false'); subtitle.classList.add('visible');
      if (bed) fade(bed.gain, bedLevel(), .6);
      captionTimer = setTimeout(() => { subtitle.classList.remove('visible'); subtitle.setAttribute('aria-hidden', 'true'); }, (phrase.spokenDuration + .4) * 1000);
      source.onended = () => {
        if (generation !== latinGeneration) return;
        source.disconnect(); gain.disconnect(); narration = null;
        if (bed) fade(bed.gain, bedLevel()); scheduleLatin(10000);
      };
      source.start(startAt); latinIndex++;
    } catch { if (generation === latinGeneration) scheduleLatin(15000); }
  }
  async function startBed() {
    if (!enabled || !ready() || bedLoading) return;
    if (bed?.theme === theme) { scheduleLatin(); return; }
    const wanted = theme, generation = ++bedGeneration; bedLoading = true;
    try {
      const decoded = await buffer('assets/' + (wanted === 'public' ? 'comunita' : 'cattedrale') + '-loop.wav');
      if (generation !== bedGeneration || !enabled || !ready() || wanted !== theme) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = decoded; source.loop = true; source.loopStart = 0; source.loopEnd = decoded.duration;
      gain.gain.value = 0; source.connect(gain); gain.connect(compressor);
      stopNode(bed, 1.6); bed = { source, gain, theme: wanted }; source.start(); fade(gain, bedLevel(), 1.6);
      scheduleLatin();
    } catch { $('#audio-status').textContent = 'Audio non disponibile. Usa l’interruttore per riprovare.'; }
    finally { if (generation === bedGeneration) { bedLoading = false; emit(); } }
  }
  function activate() {
    if (!enabled || document.hidden) return;
    try { ensureContext(); ctx.resume().then(() => { emit(); startBed(); }).catch(() => emit()); } catch { enabled = false; emit(); }
  }
  function setSection(next) {
    const element = document.querySelector(next); if (!element) return;
    const newTheme = element.dataset.atmosphere || 'public';
    if (section === next && theme === newTheme) return;
    section = next;
    if (theme !== newTheme) { theme = newTheme; bedGeneration++; bedLoading = false; stopLatin(); if (enabled && ready()) startBed(); }
    emit();
  }
  function trackSection() {
    scrollFrame = 0; const line = Math.min(innerHeight * .43, 360);
    const sections = [...document.querySelectorAll('main > section')];
    const active = sections.find(e => { const r = e.getBoundingClientRect(); return r.top <= line && r.bottom > line; });
    if (active) setSection('#' + active.id);
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    if (enabled) activate(); else { bedGeneration++; bedLoading = false; stopNode(bed, .25); bed = null; stopLatin(); }
    emit();
  });
  document.addEventListener('click', e => { if (e.target.closest('#sound-toggle')) return; if (enabled && !ready()) activate(); });
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' && enabled && !ready()) activate(); });
  window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(trackSection); }, { passive: true });
  window.addEventListener('resize', trackSection);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLatin(); ctx?.suspend(); emit(); }
    else { trackSection(); activate(); }
  });
  window.addEventListener('pagehide', () => { stopLatin(); ctx?.suspend(); });
  window.addEventListener('pageshow', () => { trackSection(); activate(); });
  // Shared audio output: one volume, one mute switch, no device-dependent voice selection.
  window.OTCAudio = {
    catalog,
    enable() { enabled = true; activate(); emit(); },
    async speak(url, signal) {
      ensureContext(); await ctx.resume(); if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const decoded = await buffer(url, signal); if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Promise((resolve, reject) => {
        const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = decoded;
        gain.gain.value = 1; source.connect(gain); gain.connect(compressor);
        announcementCount++; stopLatin(); if (bed) fade(bed.gain, bedLevel(), .2);
        let finished = false;
        const finish = aborted => {
          if (finished) return; finished = true; signal.removeEventListener('abort', abort);
          source.disconnect(); gain.disconnect(); announcementCount--;
          if (bed) fade(bed.gain, bedLevel(), 1); scheduleLatin();
          aborted ? reject(new DOMException('Aborted', 'AbortError')) : resolve();
        };
        const abort = () => { try { source.stop(); } catch {} finish(true); };
        signal.addEventListener('abort', abort, { once: true }); source.onended = () => finish(false); source.start();
      });
    },
    state: () => ({ enabled, ready: ready(), theme, section })
  };
  trackSection(); emit(); activate();
})();
