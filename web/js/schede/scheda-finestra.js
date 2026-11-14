// ---------- La scheda in una finestra a parte ----------
// Il pulsante ⧉ accanto a quello di chiusura porta la scheda fuori dal tavolo, in una finestra sua del
// browser (una «popup» senza schede né barra degli indirizzi: nell'app è una finestra come il pannello della
// sessione). Non è una copia: è la stessa finestra della scheda, spostata nell'altro documento. Il codice
// resta quello del tavolo, quindi quello che si scrive o si tira lì vale subito anche qui (salvataggio,
// segnalini, chat, partita in rete) e quello che arriva dagli altri si vede anche là.
// Chiudendo la finestra la scheda si chiude; con ↙ torna dentro il tavolo.
//
// Due cose da sapere per chi tocca il resto del codice:
// - Gli ascoltatori messi su window o document del tavolo (il menu del tasto destro, l'invio della scheda in
//   rete, il vantaggio della barra dei tiri…) ricevono anche i clic e le scritture della finestra: qui sotto
//   ogni evento della finestra viene ripetuto sul documento del tavolo, con lo stesso «target».
// - I menu, le finestrelle e i dialoghi che si aprono mentre si sta usando la finestra vengono portati lì
//   (e tornano nel tavolo appena si chiudono); document.getElementById li trova anche mentre sono là.
(function () {
  'use strict';
  if (typeof makeFrame !== 'function' || typeof winControls !== 'function' || typeof openSheet !== 'function') return;
  const T = s => (typeof tr === 'function' ? tr(s) : s);
  const nativo = () => !!(window.LIBRE_NATIVO && window.LIBRE_NATIVO.disponibile);
  const aperte = new Map();              // id della scheda → { f: la finestra, w: la scheda }
  let docAttivo = document;              // dove si sta lavorando adesso: lì vanno i menu che si aprono

  const fuori = w => !!(w && w._fuori && !w._fuori.f.closed);
  const finestre = () => [...aperte.values()].filter(a => !a.f.closed);
  const docVivo = d => d === document || finestre().some(a => a.f.document === d);

  // ---------- il pulsante, accanto a quello di chiusura ----------
  const primaControlli = winControls;
  winControls = function (w) {                                           // eslint-disable-line no-global-assign
    primaControlli.apply(this, arguments);
    if (nativo() || typeof window.open !== 'function') return;
    if (!(w._sheet || (typeof sheets !== 'undefined' && sheets.some(s => s.id === w.dataset.id)))) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sfin';
    const su = () => {
      const dentro = fuori(w);
      b.textContent = dentro ? '↙' : '⧉';
      b.title = dentro ? T('Rimetti la scheda nel tavolo') : T('Apri la scheda in una finestra a parte');
      b.setAttribute('aria-label', b.title);
    };
    su(); w._finSu = su;
    b.addEventListener('click', e => { e.stopPropagation(); fuori(w) ? riporta(w) : stacca(w); });
    if (settings.sheetClose === 'dot') w._left.append(b); else w._right.prepend(b);
  };

  // ---------- aprire, rimettere, chiudere ----------
  function scriviPagina(f, w) {
    const d = f.document, base = location.href;
    const fogli = [...document.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="icon"][href]')]
      .map(l => `<link rel="${l.rel}" href="${new URL(l.getAttribute('href'), base).href.replace(/"/g, '&quot;')}">`).join('');
    const stili = [...document.querySelectorAll('head style')].map(s => `<style>${s.textContent}</style>`).join('');
    d.open();
    d.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title>${fogli}${stili}</head><body class="schedaFuori"></body></html>`);
    d.close();
    copiaRadice(d);
    d.title = titolo(w);
  }
  const titolo = w => (w._sheet ? w._sheet.name : w._name.textContent) + ' · LIBRE VTT';
  // le variabili delle schede (colori, carattere, grandezza), il tema e la lingua stanno sulla radice del tavolo
  function copiaRadice(d) {
    const da = document.documentElement, a = d.documentElement;
    for (const at of [...a.attributes]) if (!da.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of [...da.attributes]) a.setAttribute(at.name, at.value);
    a.classList.add('schedaFuori');
  }
  const radiceOss = new MutationObserver(() => finestre().forEach(a => copiaRadice(a.f.document)));

  function stacca(w) {
    if (fuori(w)) { w._fuori.f.focus(); return; }
    const id = w.dataset.id, r = w.getBoundingClientRect();
    const larg = Math.round(Math.max(420, r.width)), alt = Math.round(Math.max(360, r.height));
    const sx = Math.round((window.screenX || 0) + Math.max(0, r.left) + 40), sy = Math.round((window.screenY || 0) + Math.max(0, r.top) + 40);
    let f = null;
    try { f = window.open('', 'libre-scheda-' + id, `popup,width=${larg},height=${alt},left=${sx},top=${sy}`); } catch {}
    if (!f || f.closed) {
      const t = T('Il browser non ha aperto la finestra: permetti le finestre popup per questa pagina e riprova.');
      if (typeof netSay === 'function') netSay(t, 'warn'); else if (typeof addChat === 'function') addChat({ kind: 'text', text: t });
      return;
    }
    try { scriviPagina(f, w); } catch (e) { console.warn(e); try { f.close(); } catch {} return; }
    porta(w, f, { larg, alt });
  }

  // mette la scheda dentro la finestra (anche quella nuova, dopo «Vedi come…» o un file ricaricato)
  function porta(w, f) {
    const id = w.dataset.id;
    w._fuori = { f };
    w._stilePrima = w.getAttribute('style') || '';
    w._statoPrima = w._state;
    if (w._state !== 'open' && typeof setWinState === 'function') primaStato(w, 'open');
    if (w._tool && w._tool.slot && w._tool.slot.isConnected) w._tool.slot.remove();
    w.classList.add('inFinestra');
    f.document.body.appendChild(w);
    aperte.set(id, { f, w });
    collega(f);
    if (w._finSu) w._finSu();
    adatta(w);
    setTimeout(() => adatta(w), 60);
    try { f.focus(); } catch {}
    sorveglia();
  }

  function riporta(w) {
    const a = aperte.get(w.dataset.id);
    rientra(w);
    if (a) { a.chiudendo = true; try { a.f.close(); } catch {} }
    if (typeof bringWin === 'function') bringWin(w);
    try { window.focus(); } catch {}
  }
  // la scheda torna nel tavolo, dove e grande com'era
  function rientra(w) {
    const a = aperte.get(w.dataset.id);
    if (a) aperte.delete(w.dataset.id);
    if (a) rimandaIndietro(a.f.document);
    w._fuori = null;
    w.classList.remove('inFinestra');
    if (w._stilePrima != null) w.setAttribute('style', w._stilePrima);
    document.body.appendChild(w);
    if (w._finSu) w._finSu();
    if (typeof dentroLoSchermo === 'function') dentroLoSchermo(w);
    adatta(w);
    if (!finestre().length) spegni();
  }

  // la finestra è stata chiusa (con la × del sistema, Cmd+W…): la scheda si chiude
  function chiusa(a) {
    if (a.finito) return;
    a.finito = true;
    const w = a.w;
    if (a.chiudendo || !w._fuori || w._fuori.f !== a.f) { aperte.get(w.dataset.id) === a && aperte.delete(w.dataset.id); rimandaIndietro(a.f.document); if (!finestre().length) spegni(); return; }
    rientra(w);
    if (typeof closeWin === 'function') closeWin(w);
  }

  // il foglio Standard si ridimensiona da solo sulla larghezza: glielo si ricorda dopo ogni spostamento
  function adatta(w) { try { if (w.classList.contains('stdWin') && typeof stdFit === 'function') stdFit(w); } catch {} }

  let sorvegliaT = 0;
  function sorveglia() {
    if (sorvegliaT) return;
    sorvegliaT = setInterval(() => {
      for (const a of [...aperte.values()]) {
        if (a.f.closed) { chiusa(a); continue; }
        try { const t = titolo(a.w); if (a.f.document.title !== t) a.f.document.title = t; } catch {}
      }
      if (!aperte.size) { clearInterval(sorvegliaT); sorvegliaT = 0; }
    }, 700);
  }

  // ---------- la finestra parla con il tavolo ----------
  const INOLTRA = ['pointerdown', 'pointerup', 'click', 'input', 'change', 'contextmenu', 'dragover', 'drop'];
  function collega(f) {
    if (f._libreCollegata) return;
    f._libreCollegata = true;
    const d = f.document;
    for (const tipo of INOLTRA) f.addEventListener(tipo, e => inoltra(e, f), true);
    f.addEventListener('keydown', e => {
      docAttivo = d;
      if (e.key === 'Escape') {
        if (typeof ctx !== 'undefined' && !ctx.hidden && typeof closeCtx === 'function') { closeCtx(); return; }
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) t.blur();
      }
    }, true);
    f.addEventListener('focusin', () => { docAttivo = d; }, true);
    f.addEventListener('blur', () => { if (typeof ctx !== 'undefined' && !ctx.hidden && ctx.ownerDocument === d && typeof closeCtx === 'function') closeCtx(); });
    // nella finestra la scheda non si trascina e non si riduce: occupa tutto lo spazio
    f.addEventListener('pointerdown', e => {
      if (e.button === 0 && e.target.closest && e.target.closest('.inFinestra > .stitle') && !e.target.closest('button, .sicon')) e.stopPropagation();
    }, true);
    f.addEventListener('dblclick', e => { if (e.target.closest && !e.target.closest('input, textarea, select, button, label')) e.stopPropagation(); }, true);
    f.addEventListener('resize', () => { for (const a of aperte.values()) if (a.f === f) adatta(a.w); });
    f.addEventListener('pagehide', () => { const a = [...aperte.values()].find(x => x.f === f); if (a) setTimeout(() => { if (a.f.closed) chiusa(a); }, 0); });
    new MutationObserver(ls => cambiati(ls, d)).observe(d.body, OSS);
  }

  // ogni evento della finestra arriva anche agli ascoltatori del tavolo, con lo stesso target
  function inoltra(e, f) {
    if (e.type === 'pointerdown' || e.type === 'click') docAttivo = f.document;
    let c = null;
    const C = window[e.constructor && e.constructor.name];
    try { c = new (typeof C === 'function' ? C : Event)(e.type, e); } catch { try { c = new Event(e.type, e); } catch { return; } }
    let fermo = false;
    Object.defineProperty(c, 'target', { value: e.target });
    Object.defineProperty(c, 'srcElement', { value: e.target });
    Object.defineProperty(c, 'composedPath', { value: () => e.composedPath() });
    if ('dataTransfer' in e) Object.defineProperty(c, 'dataTransfer', { value: e.dataTransfer });
    Object.defineProperty(c, '_daFinestra', { value: true });
    for (const m of ['stopPropagation', 'stopImmediatePropagation']) {
      const orig = c[m];
      Object.defineProperty(c, m, { value() { fermo = true; return orig.call(c); } });
    }
    try { document.dispatchEvent(c); } catch (err) { console.warn(err); }
    if (c.defaultPrevented) e.preventDefault();
    if (fermo) e.stopPropagation();
  }

  // ---------- menu, finestrelle e dialoghi: dove si sta lavorando ----------
  const OSS = { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] };
  const fluttuante = el => el && el.nodeType === 1 && !el.classList.contains('sheetWin') &&
    (el.tagName === 'DIALOG' || el.id === 'ctx' || /pop/i.test(typeof el.className === 'string' ? el.className : '') || /pop/i.test(el.id || ''));
  const visibile = el => (el.tagName === 'DIALOG' ? el.open : !el.hidden && el.isConnected);
  function cambiati(lista, doc) {
    const visti = new Set();
    for (const m of lista) {
      const els = m.type === 'childList' ? [...m.addedNodes] : [m.target];
      for (const el of els) if (el.nodeType === 1 && el.parentNode === doc.body) visti.add(el);
    }
    for (const el of visti) {
      if (!fluttuante(el)) continue;
      if (doc === document) {                                   // si apre nel tavolo mentre si usa una finestra: va là
        if (visibile(el) && docAttivo !== document && docVivo(docAttivo)) sposta(el, docAttivo);
      } else if (!visibile(el)) sposta(el, document);           // chiuso nella finestra: torna a casa
      else if (docAttivo !== doc && docVivo(docAttivo)) sposta(el, docAttivo);
    }
  }
  function sposta(el, doc) {
    if (el.ownerDocument === doc || !doc.body) return;
    const dialogo = el.tagName === 'DIALOG', aperto = dialogo && el.open, modale = aperto && el.matches(':modal');
    if (aperto) {                                                // chiuderlo e riaprirlo di là, senza che se ne accorga
      const zitto = ev => { ev.stopImmediatePropagation(); };
      el.addEventListener('close', zitto, { capture: true, once: true });
      el.close();
      setTimeout(() => el.removeEventListener('close', zitto, true), 0);
    }
    doc.body.appendChild(el);
    if (aperto) { try { modale ? el.showModal() : el.show(); } catch { el.setAttribute('open', ''); } }
  }
  function rimandaIndietro(d) {
    try { for (const el of [...d.body.children]) if (fluttuante(el)) { if (el.tagName === 'DIALOG' && el.open) el.close(); document.body.appendChild(el); } } catch {}
  }
  const tavoloOss = new MutationObserver(ls => cambiati(ls, document));
  const segnaTavolo = e => { if (!(e && e._daFinestra)) docAttivo = document; };

  // ---------- finché c'è almeno una finestra aperta ----------
  const gid = Document.prototype.getElementById;
  const att = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  let acceso = false;
  function accendi() {
    if (acceso) return;
    acceso = true;
    tavoloOss.observe(document.body, OSS);
    radiceOss.observe(document.documentElement, { attributes: true });
    addEventListener('pointerdown', segnaTavolo, true); addEventListener('keydown', segnaTavolo, true); addEventListener('focus', segnaTavolo);
    // $('…') trova anche quello che in questo momento sta nella finestra
    document.getElementById = function (id) {
      const el = gid.call(document, id);
      if (el) return el;
      for (const a of finestre()) { const x = gid.call(a.f.document, id); if (x) return x; }
      return null;
    };
    // il campo in cui si sta scrivendo nella finestra non va riscritto dagli aggiornamenti
    if (att && att.get) Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get() {
        for (const a of finestre()) { try { if (a.f.document.hasFocus()) return a.f.document.activeElement; } catch {} }
        return att.get.call(document);
      }
    });
  }
  function spegni() {
    if (!acceso) return;
    acceso = false; docAttivo = document;
    tavoloOss.disconnect(); radiceOss.disconnect();
    removeEventListener('pointerdown', segnaTavolo, true); removeEventListener('keydown', segnaTavolo, true); removeEventListener('focus', segnaTavolo);
    delete document.getElementById;
    delete document.activeElement;
  }
  const primaPorta = porta;
  porta = function (w, f) { accendi(); return primaPorta(w, f); };   // eslint-disable-line no-func-assign

  // ---------- le funzioni delle schede, quando la scheda è fuori ----------
  const primaStato = setWinState;
  setWinState = function (w, st) {                                       // eslint-disable-line no-global-assign
    if (fuori(w) && st !== 'open') { if (st === 'icon' || st === 'min') { riporta(w); return primaStato(w, st); } }
    return primaStato.apply(this, arguments);
  };
  // chiusa dal menu (o riaperta in un altro formato, o ricaricata da un file): se torna subito, resta nella finestra
  const inSospeso = new Map();
  const primaChiudi = closeWin;
  closeWin = function (w) {                                              // eslint-disable-line no-global-assign
    const a = fuori(w) && aperte.get(w.dataset.id);
    const r = primaChiudi.apply(this, arguments);
    if (a && a.w === w) {
      inSospeso.set(w.dataset.id, a);
      setTimeout(() => {
        if (inSospeso.get(w.dataset.id) !== a) return;
        inSospeso.delete(w.dataset.id);
        a.chiudendo = true; aperte.delete(w.dataset.id); rimandaIndietro(a.f.document);
        try { a.f.close(); } catch {}
        if (!finestre().length) spegni();
      }, 0);
    }
    return r;
  };
  const primaApri = openSheet;
  openSheet = function (id) {                                            // eslint-disable-line no-global-assign
    const vecchia = typeof wins !== 'undefined' && wins.get(id);
    if (vecchia && fuori(vecchia)) { try { vecchia._fuori.f.focus(); } catch {} return vecchia; }
    const w = primaApri.apply(this, arguments);
    const a = inSospeso.get(id);
    if (w && a && !a.f.closed) {
      inSospeso.delete(id);
      aperte.delete(id);
      porta(w, a.f);
    }
    return w;
  };
  // il tavolo si chiude o si ricarica: le finestre delle schede con lui
  addEventListener('pagehide', () => { for (const a of finestre()) { a.chiudendo = true; try { a.f.close(); } catch {} } });

  window.LIBRE_SCHEDA_FINESTRA = { stacca, riporta, aperte };
})();
