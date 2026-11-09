// ======================= Alt tenuto premuto: il segnalino a tutto schermo =======================
// Col mouse sopra un segnalino, tenendo premuto Alt (⌥ Option su Mac) lo si vede intero e grande
// quanto la finestra; lasciando il tasto torna tutto com'era. Non cambia niente sulla mappa e non
// manda niente in rete: mostra solo l'immagine che questo browser ha già (i segnalini sotto la nebbia
// o al buio a un giocatore non arrivano proprio, quindi non si possono «spiare» così).
(function () {
  'use strict';
  let x = -1, y = -1, tasti = 0, aperta = null;

  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; tasti = e.buttons; }, { passive: true, capture: true });

  const scrivendo = () => {
    const a = document.activeElement;
    return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };
  const strato = ph => ph.dataset.layer || 'tokens';
  const visibile = ph => {
    const s = getComputedStyle(ph);
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
  };

  /** Il segnalino sotto il mouse (quello più in alto), solo se lì sopra c'è proprio la mappa e non una finestra. */
  function segnalinoSotto() {
    if (x < 0 || typeof world === 'undefined' || typeof viewport === 'undefined') return null;
    if (viewport.classList.contains('layer-luce')) return null;          // lì Alt serve a non agganciare i muri
    const sopra = document.elementFromPoint(x, y);
    if (!sopra || !sopra.closest('#viewport')) return null;
    let meglio = null, zMeglio = -Infinity;
    for (const ph of world.querySelectorAll('.photo')) {
      if (ph.classList.contains('shape') || strato(ph) === 'map') continue;   // puntine e forme: non hanno un'immagine
      const img = ph.querySelector(':scope > img');
      if (!img || !img.complete || !img.naturalWidth || !visibile(ph)) continue;
      const r = ph.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const z = (strato(ph) === 'tokens' ? 1e9 : 0) + (parseInt(ph.style.zIndex, 10) || 0);
      if (z >= zMeglio) { meglio = ph; zMeglio = z; }
    }
    return meglio;
  }

  function apri(ph) {
    const img = ph.querySelector(':scope > img');
    const box = document.createElement('div');
    box.id = 'anteprimaSegnalino';
    box.setAttribute('aria-hidden', 'true');
    const grande = new Image();
    grande.src = img.currentSrc || img.src;
    grande.alt = '';
    grande.draggable = false;
    box.append(grande);
    document.body.append(box);
    aperta = box;
  }
  function chiudi() { if (aperta) { aperta.remove(); aperta = null; } }

  addEventListener('keydown', e => {
    if (e.key !== 'Alt') { chiudi(); return; }                         // Alt con un altro tasto: è una scorciatoia
    if (aperta) { e.preventDefault(); return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.shiftKey || tasti || scrivendo()) return;
    const ph = segnalinoSotto();
    if (!ph) return;
    e.preventDefault();                                                 // su Windows Alt da solo non apre il menu della finestra
    apri(ph);
  }, true);
  addEventListener('keyup', e => { if (e.key === 'Alt' && aperta) { e.preventDefault(); chiudi(); } }, true);
  addEventListener('pointerdown', chiudi, true);
  addEventListener('wheel', chiudi, { passive: true, capture: true });
  addEventListener('blur', chiudi);
  document.addEventListener('visibilitychange', chiudi);
})();
