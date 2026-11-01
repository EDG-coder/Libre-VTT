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
    // da che numero il d20 di un attacco è un critico (il campione: 19-20, poi 18-20). È un campo della scheda;
    // per una sola arma basta scrivere «19-20» nel suo nome o nel bonus.
    const sh = typeof sheets !== 'undefined' && sheets.find(x => x.id === id);
    if (sh && sh.f && typeof bindField === 'function') {
      const l = document.createElement('label');
      l.className = 'tiroCrit';
      l.title = tr('Da che numero il d20 di un attacco è un critico. Per una sola arma scrivi «19-20» nel suo nome o nel bonus.');
      l.innerHTML = `${tr('Critico da')} <select data-f="critDa">${['', '19', '18', '17', '16', '15'].map(v => `<option value="${v}">${v || '20'}</option>`).join('')}</select>`;
      b.append(l);
      bindField(l.querySelector('select'), w._body, sh);
      // il nome sotto il segnalino si vede solo se lo si chiede qui
      const nv = document.createElement('label');
      nv.className = 'check tiroNome'; nv.title = tr('Mostra il nome del personaggio sotto i suoi segnalini sulla mappa');
      nv.innerHTML = `<input type="checkbox" data-f="nomeSuToken"> ${tr('Nome sul segnalino')}`;
      b.append(nv);
      bindField(nv.querySelector('input'), w._body, sh);
      nv.querySelector('input').addEventListener('change', () => setTimeout(() => { if (typeof updateTokenBars === 'function') updateTokenBars(); }, 0));
      if (sh.tpl !== 'simple' && sh.tpl !== 'generica') {
        const av = document.createElement('button');
        av.type = 'button'; av.className = 'btn ghost tiroAvanzate'; av.textContent = tr('⚙ Avanzate');
        av.title = tr('Abilità, modificatori, movimento e sensi, difese, risorse, riquadri, incantesimi');
        av.addEventListener('click', () => (window.avanzateScheda || avanzate)(w, sh));
        b.append(av);
      }
    }
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
  // ---------- ⚙ Avanzate: il primo pezzo del menu avanzato della scheda ----------
  // Abilità (Tuttofare, mezza competenza per abilità), Attacchi (intervallo critico), Iniziativa (bonus,
  // vantaggio fisso). Sono campi della scheda: si salvano con lei e valgono in tutti i calcoli.
  function avanzate(w, sh) {
    const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const d = document.createElement('dialog'); d.className = 'compDlg avanzDlg';
    const abil = (typeof SKILLS !== 'undefined' ? SKILLS : []).slice().sort((a, b) => tr(a[1]).localeCompare(tr(b[1])));
    d.innerHTML = `<h3>⚙ ${esc(tr('Avanzate'))} · <span data-noi18n>${esc(sh.name)}</span></h3>
      <section><h4>${esc(tr('Abilità'))}</h4>
        <label class="check"><input type="checkbox" data-f="tuttofare"> <b>${esc(tr('Tuttofare'))}</b></label>
        <p class="note">${esc(tr('Metà del bonus di competenza (per difetto) a tutte le prove di abilità senza competenza e all\'iniziativa.'))}</p>
        <p class="note">${esc(tr('Mezza competenza solo in alcune abilità:'))}</p>
        <div class="avanzAb">${abil.map(([k, n]) => `<label class="check"><input type="checkbox" data-f="kh_${k}"> ${esc(tr(n))}</label>`).join('')}</div></section>
      <section><h4>${esc(tr('Attacchi'))}</h4>
        <label>${esc(tr('Critico da'))} <select data-f="critDa">${['', '19', '18', '17', '16', '15'].map(v => `<option value="${v}">${v ? v + '-20' : '20'}</option>`).join('')}</select></label>
        <p class="note">${esc(tr('Da che numero il d20 di un attacco è un critico. Per una sola arma scrivi «19-20» nel suo nome o nel bonus.'))}</p></section>
      <section><h4>${esc(tr('Iniziativa'))}</h4>
        <div class="creaRiga"><label>${esc(tr('Bonus iniziativa'))} <input type="number" data-f="initb" style="width:70px"></label>
        <label>${esc(tr('Sempre con'))} <select data-f="iniVant"><option value="">${esc(tr('Normale'))}</option><option value="adv">${esc(tr('Vantaggio'))}</option><option value="dis">${esc(tr('Svantaggio'))}</option></select></label></div></section>
      <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn" data-a="ok">${esc(tr('Fatto'))}</button></div>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-f]').forEach(el => bindField(el, w._body, sh));
    d.querySelector('[data-a=ok]').onclick = () => d.close();
    d.addEventListener('close', () => {
      d.remove();
      // gli stessi campi nella scheda (la casella «Critico da» della barra, «Bonus iniziativa»)
      w._body.querySelectorAll('[data-f="critDa"], [data-f="initb"]').forEach(el => { el.value = sh.f[el.dataset.f] ?? ''; });
      if (typeof recalc === 'function') recalc(w._body, sh);
    });
    d.showModal();
  }
  window._tiriScheda = { modoDi, barra, avanzate };
})();
