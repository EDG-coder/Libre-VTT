// ---------- Contatori dei consumabili nella scheda (Standard e Open 5e) ----------
// Una griglia di riquadri, uno per consumabile o uso limitato (Passo velato, Imposizione delle mani,
// dadi vita del warlock…): il totale in alto, quanti ne restano grande al centro, il nome sotto.
//   ＋        aggiunge un contatore
//   🔓 / 🔒   sbloccato: nome, totale e valore si scrivono; bloccato: solo − e + (e ↺ per tornare al totale)
//   nome      da bloccato, un clic manda in chat quanti ne restano
// Il totale può essere un numero o un testo («3d8»): se è un numero, il valore non lo supera.
// Sta nei campi della scheda come JSON, così si salva, si esporta e in partita arriva agli altri:
//   contatori  [{ id, n, tot, val }]      contatoriChiusi  '1' quando è bloccato
// Nella Open 5e è un riquadro della prima pagina; nella Standard (che ricalca la scheda di carta e
// non ha posto) sta sopra le pagine, sotto «Risorse e riquadri».
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nid = () => Math.random().toString(36).slice(2, 9);
  const MAX = 60;
  const K = 'contatori', KB = 'contatoriChiusi', APERTO = 'libre-contatori-';

  const leggi = s => {
    try { const v = JSON.parse(s.f[K] || '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, MAX) : []; }
    catch { return []; }
  };
  function scrivi(s, lista) {
    if (lista.length) s.f[K] = JSON.stringify(lista.map(x => ({ id: x.id, n: String(x.n || ''), tot: String(x.tot ?? ''), val: +x.val || 0 })));
    else delete s.f[K];
    salva(s);
  }
  function salva(s) { if (typeof schedaCambiata === 'function') schedaCambiata(s); else if (typeof scheduleSheets === 'function') scheduleSheets(); }
  const numTot = x => (/^\s*\d+\s*$/.test(String(x.tot ?? '')) ? +x.tot : null);
  const limita = (x, v) => { const t = numTot(x); v = Math.max(0, Math.round(+v || 0)); return t == null ? Math.min(v, 9999) : Math.min(v, t); };
  const bloccato = s => s.f[KB] === '1';

  function riquadro(x, chiuso) {
    const tot = String(x.tot ?? '');
    if (chiuso) {
      return `<div class="ctTile" data-id="${esc(x.id)}">
        <div class="ctTop"><span>${esc(tr('Totale'))}</span><b>${esc(tot || '—')}</b></div>
        <div class="ctMid"><button type="button" class="ctMeno" aria-label="${esc(tr('Usa uno'))}" title="${esc(tr('Usa uno'))}">−</button><b class="ctNum">${+x.val || 0}</b><button type="button" class="ctPiu" aria-label="${esc(tr('Recupera uno'))}" title="${esc(tr('Recupera uno'))}">+</button></div>
        <button type="button" class="ctNome" title="${esc(tr('Manda in chat'))}">${esc(String(x.n || '').trim() || tr('Senza nome'))}</button>
        ${numTot(x) != null ? `<button type="button" class="ctReset" title="${esc(tr('Torna al totale'))}" aria-label="${esc(tr('Torna al totale'))}">↺</button>` : ''}
      </div>`;
    }
    return `<div class="ctTile ctMod" data-id="${esc(x.id)}">
      <div class="ctTop"><span>${esc(tr('Totale'))}</span><input type="text" class="ctIn" data-k="tot" value="${esc(tot)}" maxlength="12" aria-label="${esc(tr('Totale'))}" placeholder="—"></div>
      <div class="ctMid"><input type="number" min="0" class="ctIn ctNumIn" data-k="val" value="${+x.val || 0}" aria-label="${esc(tr('Quanti ne restano'))}"></div>
      <input type="text" class="ctIn ctNomeIn" data-k="n" value="${esc(x.n)}" maxlength="40" placeholder="${esc(tr('Nome'))}" aria-label="${esc(tr('Nome'))}">
      <button type="button" class="ctVia" title="${esc(tr('Elimina'))}" aria-label="${esc(tr('Elimina'))}">✕</button>
    </div>`;
  }

  function disegna(host, s) {
    const lista = leggi(s), chiuso = bloccato(s);
    host.classList.toggle('ctChiuso', chiuso);
    host.innerHTML = `<div class="ctGriglia">${lista.map(x => riquadro(x, chiuso)).join('')}</div>
      ${!lista.length ? `<p class="ctVuoto">${esc(tr('Nessun contatore. Con ＋ ne aggiungi uno: incantesimi da usare una volta, Imposizione delle mani, dadi vita…'))}</p>` : ''}
      <div class="ctBarra">${lista.length < MAX ? `<button type="button" class="ctAdd" title="${esc(tr('Aggiungi un contatore'))}" aria-label="${esc(tr('Aggiungi un contatore'))}">＋</button>` : '<span></span>'}
      <button type="button" class="ctLock" title="${esc(chiuso ? tr('Sblocca per modificare nomi e totali') : tr('Blocca: restano solo − e +'))}" aria-label="${esc(chiuso ? tr('Sblocca') : tr('Blocca'))}">${chiuso ? '🔒' : '🔓'}</button></div>`;
  }

  function monta(host, s) {
    host.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('ctLock')) { if (bloccato(s)) delete s.f[KB]; else s.f[KB] = '1'; salva(s); disegna(host, s); return; }
      if (b.classList.contains('ctAdd')) {
        const lista = leggi(s), x = { id: nid(), n: '', tot: '1', val: 1 };
        lista.push(x); delete s.f[KB]; scrivi(s, lista); disegna(host, s);
        host.querySelector(`.ctTile[data-id="${CSS.escape(x.id)}"] .ctNomeIn`)?.focus();
        return;
      }
      const el = b.closest('.ctTile'); if (!el) return;
      const lista = leggi(s), x = lista.find(y => y.id === el.dataset.id); if (!x) return;
      if (b.classList.contains('ctVia')) {
        if (String(x.n || '').trim() && !confirm(tr('Eliminare «{n}»?', { n: x.n }))) return;
        scrivi(s, lista.filter(y => y !== x)); disegna(host, s); return;
      }
      if (b.classList.contains('ctMeno') || b.classList.contains('ctPiu') || b.classList.contains('ctReset')) {
        const prima = +x.val || 0;
        x.val = b.classList.contains('ctReset') ? numTot(x) : limita(x, prima + (b.classList.contains('ctPiu') ? 1 : -1));
        if (x.val === prima) return;
        scrivi(s, lista); disegna(host, s);
        if (b.classList.contains('ctMeno')) inChat(s, x);
        return;
      }
      if (b.classList.contains('ctNome')) inChat(s, x);
    });
    // da sbloccato: si salva mentre si scrive, senza ridisegnare (il cursore resta dov'è)
    host.addEventListener('input', e => {
      const i = e.target.closest('.ctIn'); if (!i) return;
      const lista = leggi(s), x = lista.find(y => y.id === i.closest('.ctTile').dataset.id); if (!x) return;
      x[i.dataset.k] = i.dataset.k === 'val' ? (i.value === '' ? 0 : +i.value) : i.value;
      scrivi(s, lista);
    });
    // uscendo dal campo il valore si sistema (non sotto zero, non oltre il totale)
    host.addEventListener('change', e => {
      const i = e.target.closest('.ctIn'); if (!i || (i.dataset.k !== 'val' && i.dataset.k !== 'tot')) return;
      const lista = leggi(s), x = lista.find(y => y.id === i.closest('.ctTile').dataset.id); if (!x) return;
      const v = limita(x, x.val);
      if (v !== x.val) { x.val = v; scrivi(s, lista); }
      const n = i.closest('.ctTile').querySelector('.ctNumIn'); if (n && document.activeElement !== n) n.value = v;
    });
    host.addEventListener('keydown', e => { if (e.target.closest('.ctIn')) e.stopPropagation(); });   // niente scorciatoie della mappa mentre si scrive
    disegna(host, s);
  }

  function inChat(s, x) {
    const t = numTot(x) != null || String(x.tot || '').trim() ? `${+x.val || 0}/${String(x.tot).trim()}` : `${+x.val || 0}`;
    addChat({ kind: 'text', text: `${s.name}: ${String(x.n || '').trim() || tr('Senza nome')} (${t})` });
  }

  // ---------- nella finestra della scheda ----------
  function prepara(w, s) {
    if (!w || !w._body || !s || (s.tpl !== 'standard' && s.tpl !== 'dnd5e') || w._body.querySelector('.ctHost')) return;
    const host = document.createElement('div');
    host.className = 'ctHost';
    if (w.classList.contains('stdWin')) {
      // Standard: un pannello che si apre e si chiude, sopra le pagine
      const d = document.createElement('details');
      d.className = 'ctPanel';
      try { d.open = localStorage.getItem(APERTO + s.id) !== '0'; } catch { d.open = true; }
      d.addEventListener('toggle', () => { try { localStorage.setItem(APERTO + s.id, d.open ? '1' : '0'); } catch {} });
      d.innerHTML = `<summary><span>🧪 ${esc(tr('Consumabili e usi'))}</span></summary>`;
      d.appendChild(host);
      const dopo = w._body.querySelector(':scope > .avPanel') || w._body.querySelector(':scope > .tiroBar');
      if (dopo) dopo.after(d); else w._body.prepend(d);
    } else {
      // Open 5e: un riquadro della prima pagina, subito dopo «Privilegi & tratti limitati»
      const box = document.createElement('div');
      box.className = 'box full ctBox';
      box.innerHTML = `<h5>${esc(tr('Consumabili e usi'))}</h5>`;
      box.appendChild(host);
      const lim = w._body.querySelector('[data-f="lf0n"]')?.closest('.box');
      if (lim) lim.after(box); else (w._body.querySelector('.spage .sgrid') || w._body).appendChild(box);
    }
    monta(host, s);
  }
  function ridisegna(s) {
    const w = typeof wins !== 'undefined' && wins.get(s.id), h = w && w._body && w._body.querySelector('.ctHost');
    if (h && !h.contains(document.activeElement)) disegna(h, s);
  }
  window.contatoriScheda = { prepara, ridisegna, leggi };

  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                                  // eslint-disable-line no-global-assign
      const w = prima.apply(this, arguments);
      const s = typeof sheets !== 'undefined' && sheets.find(x => x.id === id);
      if (w && s) prepara(w, s);
      return w;
    };
  }
  addEventListener('libre-scheda-aggiornata', e => { const s = e.detail && sheets.find(x => x.id === e.detail.id); if (s) ridisegna(s); });
})();
