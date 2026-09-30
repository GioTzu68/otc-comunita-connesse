'use strict';
(() => {
  const q = s => document.querySelector(s), field = q('#message'), button = q('#listen'), note = q('#voice-note');
  let examples = [], index = 0, paused = false, custom = false, controller = null, nextTimer = null;
  let playing = false, state = window.OTCAudio.state(), version = 0;
  const eligible = () => state.enabled && state.ready && state.section === '#menestrello' && !document.hidden;
  function render() {
    button.textContent = playing ? '■ Ferma' : '▷ Ascolta';
    q('#example-cycle').textContent = custom ? 'Riprendi esempi' : paused ? 'Riprendi esempi' : 'Pausa esempi';
    q('#example-topic').textContent = custom ? 'Il tuo messaggio' : `${examples[index]?.title || 'Avvisi del Comune'} · ${index + 1}/5`;
  }
  function stop() { version++; controller?.abort(); controller = null; clearTimeout(nextTimer); nextTimer = null; playing = false; render(); }
  function showExample() { if (!examples.length || busy) return; field.value = examples[index].text; count(); render(); }
  function schedule(delay = 3500) {
    if (!eligible() || paused || custom || playing || nextTimer || !examples.length || busy) return;
    nextTimer = setTimeout(() => { nextTimer = null; if (eligible() && !paused && !custom) play(false); }, delay);
  }
  async function play(manual) {
    if (playing || !field.value.trim() || !examples.length) return;
    if (manual) { window.OTCAudio.enable(); document.dispatchEvent(new CustomEvent('otc:visit-audio',{detail:'demo-listen'})); }
    if (!manual && !eligible()) return;
    const current = ++version; controller = new AbortController(); const activeController = controller; const signal = activeController.signal;
    playing = true; render(); note.textContent = 'Preparazione della voce Menestrello…'; let blobUrl, timeout;
    try {
      let url = 'assets/demo-' + examples[index].id + '.mp3';
      if (signal.aborted || current !== version) return;
      note.textContent = custom ? 'Il tuo messaggio · voce Elsa di Menestrello.' : `${examples[index].title} · esempio dimostrativo. Gli avvisi proseguono automaticamente.`;
      await window.OTCAudio.speak(url, signal);
      if (current !== version) return;
      playing = false; controller = null; render();
      if (manual) document.dispatchEvent(new CustomEvent('otc:visit-audio',{detail:'demo-complete'}));
      if (!custom && !paused) {
        nextTimer = setTimeout(() => { nextTimer = null; if (!eligible() || paused || custom) return; index = (index + 1) % examples.length; showExample(); schedule(600); }, 4500);
      } else note.textContent = 'Ascolto completato.';
    } catch (error) {
      if (current !== version) return;
      playing = false; controller = null; paused = true; render();
      note.textContent = error.name === 'AbortError' ? 'Sintesi interrotta. Premi Ascolta per riprovare.' : 'Audio non disponibile. ' + (custom ? error.message : 'Premi Ascolta per riprovare.');
    } finally { clearTimeout(timeout); if (blobUrl) URL.revokeObjectURL(blobUrl); }
  }
  button.addEventListener('click', () => { if (playing) { paused = true; stop(); note.textContent = 'Ascolto in pausa.'; } else { paused = false; clearTimeout(nextTimer); nextTimer = null; play(true); } });
  q('#example-cycle').addEventListener('click', () => { const resume = paused || custom; stop(); paused = !resume; custom = false; showExample(); if (resume) schedule(200); });
  function step(delta) { if (!examples.length || busy) return; stop(); custom = false; index = (index + delta + examples.length) % examples.length; showExample(); schedule(500); }
  q('#example-prev').addEventListener('click', () => step(-1)); q('#example-next').addEventListener('click', () => step(1));
  document.addEventListener('otc:audio-state', e => { state = e.detail; if (!eligible()) stop(); else schedule(); });
  document.addEventListener('otc:broadcast', e => { if (e.detail === 'start') stop(); else schedule(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  window.OTCAudio.catalog.then(data => { examples = data.examples; showExample(); schedule(); }).catch(() => { note.textContent = 'Esempi audio non disponibili. Ricarica la pagina.'; button.disabled = true; });
})();
