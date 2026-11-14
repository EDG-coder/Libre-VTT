// ---------- Slot di talenti e abilità nella scheda (Standard e Open 5e, 2014 e 2024) ----------
// Nei riquadri «Talenti», «Tratti razziali & privilegi da background» e «Privilegi di classe» ogni
// talento o abilità può stare in uno slot suo: un titolo e un testo. Così in chat si manda solo
// quello che serve, non tutto il riquadro.
//   ＋        crea uno slot nuovo (si apre già da modificare)
//   titolo    un clic lo manda in chat (passandoci sopra si illumina del colore della scheda)
//   ⚙         modifica titolo e testo, sposta, elimina
//   ▸ / ▾     mostra o nasconde il testo sotto il titolo (di base è chiuso)
// Gli slot stanno nei campi della scheda come JSON, così si salvano, si esportano e in partita
// arrivano agli altri come ogni altro campo:  slot_feats, slot_racial, slot_classf  [{ id, t, d }]
// L'area di testo che c'era resta sotto gli slot, con quello che c'era scritto.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nid = () => Math.random().toString(36).slice(2, 9);
  const MAX = 100;                                               // slot per riquadro: un limite solo per sicurezza
  // il campo di testo che c'era → la chiave degli slot e il nome del pulsante «＋»
  const RIQUADRI = { feats: '＋ Talento', racial: '＋ Tratto', classf: '＋ Abilità' };
  const chiave = campo => 'slot_' + campo;

  const leggi = (s, campo) => {
    try { const v = JSON.parse(s.f[chiave(campo)] || '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object').slice(0, MAX) : []; }
    catch { return []; }
  };
  function scrivi(s, campo, lista) {
    if (lista.length) s.f[chiave(campo)] = JSON.stringify(lista.map(x => ({ id: x.id, t: String(x.t || ''), d: String(x.d || '') })));
    else delete s.f[chiave(campo)];
    if (typeof schedaCambiata === 'function') schedaCambiata(s); else if (typeof scheduleSheets === 'function') scheduleSheets();
  }

  // in chat le [[2d6 | Danni]] si leggono come «Danni (2d6)», come per gli incantesimi
  const piano = t => String(t || '').replace(/\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g, (_, ex, nm) => (nm ? `${nm} (${ex})` : ex));
  function inChat(s, x) {
    const t = piano(x.t).trim(), d = piano(x.d).trim();
    if (!t && !d) return;
    if (!d) addChat({ kind: 'text', text: `${s.name}: ${t}` });
    else addChat({ kind: 'rule', title: `${s.name} · ${t || tr('Senza titolo')}`, text: d });
  }

  // ---------- disegno ----------
  function riga(x, aperto, modifica, campo) {
    if (modifica) {
      return `<div class="capSlot capMod" data-id="${esc(x.id)}">
        <input type="text" class="capInT" maxlength="120" value="${esc(x.t)}" placeholder="${esc(tr('Titolo'))}" aria-label="${esc(tr('Titolo'))}">
        <textarea class="capInD" placeholder="${esc(tr('Il testo: cosa fa. Metti [[1d6 | Danni]] per un tiro.'))}" aria-label="${esc(tr('Testo'))}">${esc(x.d)}</textarea>
        <div class="capBtns"><button type="button" class="capOk">✓ ${esc(tr('Fatto'))}</button><button type="button" class="capSu" title="${esc(tr('Sposta su'))}" aria-label="${esc(tr('Sposta su'))}">↑</button><button type="button" class="capGiu" title="${esc(tr('Sposta giù'))}" aria-label="${esc(tr('Sposta giù'))}">↓</button><button type="button" class="capVia" title="${esc(tr('Elimina questo slot'))}">🗑 ${esc(tr('Elimina'))}</button></div>
      </div>`;
    }
    const titolo = String(x.t || '').trim() || tr('Senza titolo');
    return `<div class="capSlot${aperto ? ' aperto' : ''}" data-id="${esc(x.id)}">
      <div class="capHead"><button type="button" class="capTit" title="${esc(tr('Manda in chat'))}">${esc(titolo)}</button><button type="button" class="capEdit" title="${esc(tr('Modifica'))}" aria-label="${esc(tr('Modifica'))}">⚙</button><button type="button" class="capTog${String(x.d || '').trim() ? ' has' : ''}" title="${esc(tr('Mostra o nascondi il testo'))}" aria-expanded="${aperto}">${aperto ? '▾' : '▸'}</button></div>
      ${aperto ? `<div class="capCorpo">${esc(String(x.d || '').trim() || tr('(nessun testo)'))}</div>` : ''}
    </div>`;
  }

  // Dove i riquadri sono piccoli (un foglio disegnato in scala) titolo e testo si scrivono in una tendina
  // sopra la scheda; nelle schede Standard e Open si scrivono nel riquadro.
  const fluttua = host => !!host.closest('.sPage');
  const editor = host => (host._pop && !host._pop.hidden ? host._pop : host).querySelector('.capMod');

  function disegna(host, s) {
    const campo = host.dataset.capslot, st = host._st, lista = leggi(s, campo);
    // uno slot appena creato e ancora vuoto non è salvato: resta sullo schermo finché lo si modifica
    const nuovo = st.mod && !lista.some(x => x.id === st.mod) ? { id: st.mod, t: '', d: '' } : null;
    const tutti = nuovo ? lista.concat(nuovo) : lista, pop = fluttua(host);
    host.innerHTML = tutti.filter(x => !(pop && x === nuovo)).map(x => riga(x, st.aperti.has(x.id), !pop && st.mod === x.id, campo)).join('') +
      (lista.length < MAX && !(st.mod && !pop) ? `<button type="button" class="capAdd">${esc(tr(RIQUADRI[campo]))}</button>` : '');
    host.closest('.capHost')?.classList.toggle('capPieno', !!lista.length);
    if (pop && st.mod) {
      const x = tutti.find(y => y.id === st.mod);
      host.querySelector(`.capSlot[data-id="${CSS.escape(st.mod)}"]`)?.classList.add('inMod');
      apriTendina(host, s, x, host.querySelector(`.capSlot[data-id="${CSS.escape(st.mod)}"]`) || host.querySelector('.capAdd') || host);
    } else if (host._pop) host._pop.hidden = true;
  }

  function apriTendina(host, s, x, vicino) {
    let pop = host._pop;
    if (!pop) {
      pop = host._pop = document.createElement('div');
      pop.className = 'capPop'; pop.hidden = true;
      document.body.appendChild(pop);
      ascolta(pop, host, s);
    }
    const eraChiusa = pop.hidden || pop.dataset.id !== x.id;
    pop.dataset.id = x.id;
    pop.innerHTML = riga(x, false, true, host.dataset.capslot);
    pop.hidden = false;
    if (eraChiusa) {
      const r = vicino.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      pop.style.top = (r.bottom + h + 10 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    }
  }

  // salva quello che c'è scritto nello slot aperto per la modifica
  function salvaModifica(host, s) {
    const st = host._st, el = st.mod && editor(host);
    if (!el || el.dataset.id !== st.mod) return;
    const campo = host.dataset.capslot, lista = leggi(s, campo), x = lista.find(y => y.id === st.mod);
    const t = el.querySelector('.capInT').value, d = el.querySelector('.capInD').value;
    if (x) { if (x.t === t && x.d === d) return; x.t = t; x.d = d; }
    else if (t.trim() || d.trim()) lista.push({ id: st.mod, t, d });
    else return;
    scrivi(s, campo, lista);
  }

  function chiudiModifica(host, s) {
    clearTimeout(host._timer);
    salvaModifica(host, s);
    const campo = host.dataset.capslot, lista = leggi(s, campo), x = lista.find(y => y.id === host._st.mod);
    if (x && !String(x.t).trim() && !String(x.d).trim()) scrivi(s, campo, lista.filter(y => y !== x));   // vuoto: non serve
    host._st.mod = null;
  }
  function apriModifica(host, s, id) {
    if (host._st.mod) chiudiModifica(host, s);
    host._st.mod = id;
    disegna(host, s);
    const inp = editor(host)?.querySelector('.capInT'); if (inp) { inp.focus(); inp.select(); }
  }

  function clic(e, host, s) {
    const b = e.target.closest('button'); if (!b) return;
    const campo = host.dataset.capslot, st = host._st;
    if (b.classList.contains('capAdd')) return apriModifica(host, s, nid());
    const el = b.closest('.capSlot'), id = el && el.dataset.id; if (!id) return;
    const lista = leggi(s, campo), x = lista.find(y => y.id === id);
    if (b.classList.contains('capTit')) { if (x) inChat(s, x); return; }
    if (b.classList.contains('capTog')) { if (st.aperti.has(id)) st.aperti.delete(id); else st.aperti.add(id); disegna(host, s); return; }
    if (b.classList.contains('capEdit')) return apriModifica(host, s, id);
    if (b.classList.contains('capOk')) { chiudiModifica(host, s); disegna(host, s); host.querySelector('.capAdd')?.focus(); return; }
    if (b.classList.contains('capVia')) {
      clearTimeout(host._timer);
      const pieno = x && (String(x.t).trim() || String(x.d).trim());
      if (pieno && !confirm(tr('Eliminare «{n}»?', { n: String(x.t).trim() || tr('Senza titolo') }))) return;
      st.mod = null; st.aperti.delete(id);
      if (x) scrivi(s, campo, lista.filter(y => y.id !== id));
      disegna(host, s);
      return;
    }
    if (b.classList.contains('capSu') || b.classList.contains('capGiu')) {
      const su = b.classList.contains('capSu');
      salvaModifica(host, s);
      const l2 = leggi(s, campo), i = l2.findIndex(y => y.id === id), j = i + (su ? -1 : 1);
      if (i < 0 || j < 0 || j >= l2.length) return;
      [l2[i], l2[j]] = [l2[j], l2[i]];
      scrivi(s, campo, l2);
      b.blur(); disegna(host, s);
      editor(host)?.querySelector(su ? '.capSu' : '.capGiu')?.focus();
    }
  }
  // i pulsanti, la scrittura (si salva mentre si scrive, come gli altri campi) e i tasti: nel riquadro e nella tendina
  function ascolta(el, host, s) {
    el.addEventListener('click', e => clic(e, host, s));
    el.addEventListener('input', e => {
      if (!e.target.closest('.capMod')) return;
      clearTimeout(host._timer); host._timer = setTimeout(() => salvaModifica(host, s), 400);
    });
    el.addEventListener('keydown', e => {
      if (!e.target.closest('.capMod')) return;
      e.stopPropagation();                                       // le scorciatoie della mappa non scattano mentre si scrive
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.target.classList.contains('capInT') || e.metaKey || e.ctrlKey))) {
        e.preventDefault(); chiudiModifica(host, s); disegna(host, s);
        host.querySelector('.capAdd')?.focus();
      }
    });
  }

  function monta(host, s) {
    host._st = { aperti: new Set(), mod: null }; host._s = s;
    ascolta(host, host, s);
    disegna(host, s);
  }
  // un clic fuori dalla tendina la chiude (quello che c'è scritto resta salvato)
  addEventListener('pointerdown', e => {
    for (const pop of document.querySelectorAll('.capPop:not([hidden])')) {
      const host = [...document.querySelectorAll('.capList')].find(h => h._pop === pop);
      if (!host || !host.isConnected) { pop.remove(); continue; }
      if (pop.contains(e.target) || host.contains(e.target)) continue;              // nel riquadro ci pensano i suoi pulsanti
      chiudiModifica(host, host._s); disegna(host, host._s);
    }
  }, true);

  // ---------- nella finestra della scheda ----------
  function prepara(w, s) {
    if (!w || !w._body || !s || (s.tpl !== 'standard' && s.tpl !== 'dnd5e')) return;
    for (const campo of Object.keys(RIQUADRI)) {
      const ta = w._body.querySelector(`textarea[data-f="${campo}"]`);
      if (!ta || ta.parentElement.querySelector(':scope > .capList')) continue;
      const host = document.createElement('div');
      host.className = 'capList'; host.dataset.capslot = campo;
      ta.after(host);                                            // dopo l'area (il 💬 prende il titolo dal primo figlio); il CSS lo mette sopra
      (ta.closest('.sTa') || ta.closest('.box'))?.classList.add('capHost');
      monta(host, s);
    }
  }
  function ridisegna(s) {
    const w = typeof wins !== 'undefined' && wins.get(s.id);
    if (!w || !w._body) return;
    const att = document.activeElement;
    for (const h of w._body.querySelectorAll('.capList')) {
      // non si ridisegna dove si sta scrivendo (la modifica che arriva da un altro si vede dopo)
      if (!h._st || (h._st.mod && att && att.closest('.capMod') && (h.contains(att) || (h._pop && h._pop.contains(att))))) continue;
      disegna(h, s);
    }
  }
  window.slotCapacita = { prepara, ridisegna, leggi };

  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                                  // eslint-disable-line no-global-assign
      const w = prima.apply(this, arguments);
      const s = typeof sheets !== 'undefined' && sheets.find(x => x.id === id);
      if (w && s) prepara(w, s);
      return w;
    };
  }
  // una scheda cambiata da un altro (in partita): si ridisegnano gli slot
  addEventListener('libre-scheda-aggiornata', e => { const s = e.detail && sheets.find(x => x.id === e.detail.id); if (s) ridisegna(s); });
})();
