// ---------- In cima a ogni scheda: «Pubblico / Privato» e «Svantaggio / Normale / Vantaggio» ----------
// Valgono per tutti i tiri fatti da quella scheda (caratteristiche, abilità, attacchi, [[…]] nei testi),
// anche per le schede dei mostri del master e per le voci dei mostri del compendio.
// In vantaggio o svantaggio si tirano due d20 e si vedono tutti e due i risultati alla pari, senza dire
// quale vale: lo sceglie chi tira (in chat: «14 · 9»).
// La scelta resta per quella scheda su questo dispositivo.
(function () {
  const tr = window.tr || (s => s);
  const leggi = id => { try { return JSON.parse(localStorage.getItem('uffa-tiro-' + id)) || null; } catch { return null; } };
  const scrivi = (id, v) => { try { localStorage.setItem('uffa-tiro-' + id, JSON.stringify(v)); } catch {} };
  const modi = new Map();                                // id finestra → { segreto, adv }
  const modoDi = id => modi.get(id) || leggi(id) || { segreto: false, adv: 'none' };

  function barra(w) {
    if (!w || w.querySelector(':scope > .sbody > .tiroBar')) return;
    const id = w.dataset.id, m = modoDi(id);
    const b = document.createElement('div');
    b.className = 'tiroBar';
    b.innerHTML = `<div class="tiroSeg" role="radiogroup" aria-label="${tr('Chi vede i tiri di questa scheda')}">
        <button type="button" role="radio" data-s="0">${tr('🌐 Pubblico')}</button><button type="button" role="radio" data-s="1" title="${tr('Il risultato lo vedete solo tu e il master')}">${tr('🔒 Privato')}</button></div>
      <div class="tiroSeg" role="radiogroup" aria-label="${tr('Vantaggio o svantaggio per i tiri di questa scheda')}">
        <button type="button" role="radio" data-a="dis" title="${tr('Due d20: vedi tutti e due i risultati')}">${tr('Svantaggio')}</button><button type="button" role="radio" data-a="none">${tr('Normale')}</button><button type="button" role="radio" data-a="adv" title="${tr('Due d20: vedi tutti e due i risultati')}">${tr('Vantaggio')}</button></div>`;
    const segna = () => {
      const x = modoDi(id);
      b.querySelectorAll('[data-s]').forEach(e => { const on = (e.dataset.s === '1') === !!x.segreto; e.classList.toggle('on', on); e.setAttribute('aria-checked', on); });
      b.querySelectorAll('[data-a]').forEach(e => { const on = e.dataset.a === x.adv; e.classList.toggle('on', on); e.setAttribute('aria-checked', on); e.classList.toggle(e.dataset.a, on); });
    };
    b.addEventListener('click', e => {
      const x = { ...modoDi(id) }, t = e.target.closest('button'); if (!t) return;
      if (t.dataset.s) x.segreto = t.dataset.s === '1';
      if (t.dataset.a) x.adv = t.dataset.a;
      modi.set(id, x); scrivi(id, x); segna();
    });
    segna();
    w._body.prepend(b);
    void m;
  }
  // ogni finestra di scheda (anche quella di un mostro del compendio) ha la sua barra
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) { const w = prima.apply(this, arguments); if (w) barra(w); return w; };   // eslint-disable-line no-global-assign
  }
  addEventListener('libre-voce-aperta', e => { if (e.detail && e.detail.mostro) barra(e.detail.w); });

  // il tiro parte da un clic dentro una finestra: per quel clic valgono le sue scelte
  let finestra = null;
  document.addEventListener('click', e => {
    const w = e.target.closest && e.target.closest('.sheetWin');
    finestra = w && w.querySelector(':scope > .sbody > .tiroBar') ? w : null;
    if (finestra) setTimeout(() => { finestra = null; }, 0);
  }, true);
  const d20 = /(^|[+-])1?d20(?![\dk])/i;
  const prima = rollExpr;
  rollExpr = function (expr, label) {                    // eslint-disable-line no-global-assign
    if (!finestra || typeof diceMode === 'undefined') return prima.apply(this, arguments);
    const m = modoDi(finestra.dataset.id), salvo = { adv: diceMode.adv, secret: diceMode.secret };
    diceMode.adv = m.adv; diceMode.secret = !!m.segreto;
    window.tiroDoppio = m.adv !== 'none' && d20.test(String(expr).replace(/\s+/g, ''));
    try { return prima.apply(this, arguments); }
    finally { diceMode.adv = salvo.adv; diceMode.secret = salvo.secret; window.tiroDoppio = false; }
  };
  window._tiriScheda = { modoDi, barra };
})();
