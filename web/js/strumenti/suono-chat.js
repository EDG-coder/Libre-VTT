// ---------- 🔔 Suono dei messaggi della chat ----------
// Un suono breve quando arriva un messaggio di un altro (non i tuoi, non quelli nascosti, non quelli
// caricati entrando). Impostazioni › Chat: acceso o spento, volume e suoneria. Le suonerie di base le
// genera l'app (nessun file da scaricare); quelle importate (mp3, ogg, wav, m4a, quante vuoi) restano
// nel browser di questo dispositivo (IndexedDB) e si possono cancellare. Al massimo un suono ogni 1,5 s.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const CH = 'libre-suono-chat';
  const BASE = [
    { id: 'base:goccia', nome: 'Goccia' },
    { id: 'base:campanello', nome: 'Campanello' },
    { id: 'base:due-note', nome: 'Due note' }
  ];
  const leggi = () => { try { return { on: false, vol: 60, id: 'base:goccia', ...(JSON.parse(localStorage.getItem(CH)) || {}) }; } catch { return { on: false, vol: 60, id: 'base:goccia' }; } };
  const scrivi = v => { try { localStorage.setItem(CH, JSON.stringify(v)); } catch {} };
  let imp = leggi();

  // ---------- le suonerie importate, in IndexedDB ----------
  const DB = 'libre-suonerie';
  function db() {
    return new Promise((ok, no) => {
      if (typeof indexedDB === 'undefined') return no(new Error('niente IndexedDB'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('suoni', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
  }
  async function tx(modo, fn) {
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction('suoni', modo), st = t.objectStore('suoni');
      let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => { d.close(); ok(out); }; t.onerror = () => { d.close(); no(t.error); };
    });
  }
  const elenco = () => tx('readonly', st => st.getAll()).catch(() => []);
  const salva = rec => tx('readwrite', st => st.put(rec));
  const togli = id => tx('readwrite', st => st.delete(id));

  // ---------- suonare ----------
  let ac = null, ultimo = 0;
  const contesto = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } return ac; };
  // le note delle suonerie di base: [frequenza, inizio, durata]
  const NOTE = { 'base:goccia': [[880, 0, .18], [1320, .06, .16]], 'base:campanello': [[1568, 0, .5], [2093, 0, .35]], 'base:due-note': [[660, 0, .14], [990, .13, .2]] };
  function tono(note, vol) {
    const c = contesto(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime + .01;
    for (const [f, da, dur] of note) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + da);
      g.gain.linearRampToValueAtTime(.35 * vol, t0 + da + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + da + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + da); o.stop(t0 + da + dur + .05);
    }
  }
  const urlCache = new Map();
  async function suona(id, prova) {
    const v = Math.max(0, Math.min(100, +imp.vol || 0)) / 100;
    if (!v) return;
    if (!prova) { const ora = Date.now(); if (ora - ultimo < 1500) return; ultimo = ora; }
    id = id || imp.id;
    if (NOTE[id]) return tono(NOTE[id], v);
    let u = urlCache.get(id);
    if (!u) {
      const rec = (await elenco()).find(x => x.id === id);
      if (!rec) return tono(NOTE['base:goccia'], v);         // cancellata: quella di base
      u = URL.createObjectURL(rec.blob); urlCache.set(id, u);
    }
    try { const a = new Audio(u); a.volume = v; await a.play(); } catch {}
  }
  window.suonoChatProva = id => suona(id, true);

  // ---------- quando arriva un messaggio ----------
  // Solo quelli che arrivano dal server mentre sei dentro (netChat): lo storico caricato entrando non
  // passa da qui. Non i propri, non quelli nascosti (i tiri segreti degli altri), e non i tiri di dado.
  if (typeof netChat === 'function') {
    const prima = netChat;
    netChat = function (msg) {                               // eslint-disable-line no-global-assign
      const r = prima.apply(this, arguments);
      try {
        const mio = msg && typeof NET !== 'undefined' && NET.me && msg.byId === NET.me.token;
        if (imp.on && msg && !mio && !msg.hidden && (msg.kind === 'text' || msg.kind === 'rule')) suona();
      } catch {}
      return r;
    };
  }

  // ---------- Impostazioni › Chat ----------
  const sect = document.querySelector('.sect[data-sect="chat"]');
  if (!sect) return;
  const box = document.createElement('div');
  box.className = 'suonoChat';
  box.innerHTML = `<label class="check"><input id="scOn" type="checkbox"> ${tr('Suono dei messaggi')}</label>
    <label class="row">${tr('Volume')} <input id="scVol" type="range" min="0" max="100" step="5"> <output id="scVolOut"></output>%</label>
    <label class="row">${tr('Suoneria')} <select id="scSel"></select> <button id="scProva" type="button" class="btn ghost" title="${tr('Prova')}" aria-label="${tr('Prova')}">▶</button> <button id="scVia" type="button" class="btn ghost danger" title="${tr('Cancella questa suoneria')}" aria-label="${tr('Cancella questa suoneria')}">🗑</button></label>
    <button id="scImporta" type="button" class="btn ghost">${tr('🎵 Importa suonerie…')}</button>
    <input id="scFile" type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.ogg,.wav,.m4a" multiple hidden>
    <p class="note">${tr('Suona quando arriva un messaggio di un altro. Le suonerie importate restano in questo dispositivo.')}</p>`;
  sect.append(box);
  const sel = $('scSel');
  async function riempi() {
    const mie = await elenco();
    sel.replaceChildren(...[...BASE.map(b => ({ id: b.id, nome: tr(b.nome) })), ...mie.map(m => ({ id: m.id, nome: m.nome }))].map(x => {
      const o = document.createElement('option'); o.value = x.id; o.textContent = x.nome; if (!x.id.startsWith('base:')) o.setAttribute('data-noi18n', ''); return o;
    }));
    if (![...sel.options].some(o => o.value === imp.id)) imp.id = 'base:goccia';
    sel.value = imp.id;
    $('scVia').hidden = imp.id.startsWith('base:');
  }
  const aggiorna = () => { $('scOn').checked = !!imp.on; $('scVol').value = imp.vol; $('scVolOut').textContent = imp.vol; };
  $('scOn').addEventListener('change', e => { imp.on = e.target.checked; scrivi(imp); if (imp.on) contesto(); });
  $('scVol').addEventListener('input', e => { imp.vol = +e.target.value; $('scVolOut').textContent = imp.vol; scrivi(imp); });
  sel.addEventListener('change', () => { imp.id = sel.value; scrivi(imp); $('scVia').hidden = imp.id.startsWith('base:'); suona(imp.id, true); });
  $('scProva').addEventListener('click', () => suona(sel.value, true));
  $('scVia').addEventListener('click', async () => {
    const id = sel.value; if (id.startsWith('base:')) return;
    if (!confirm(tr('Cancellare «{n}» da questo dispositivo?', { n: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '' }))) return;
    await togli(id).catch(() => {});
    const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
    imp.id = 'base:goccia'; scrivi(imp); riempi();
  });
  $('scImporta').addEventListener('click', () => $('scFile').click());
  $('scFile').addEventListener('change', async e => {
    let ultimoId = null;
    for (const f of e.target.files || []) {
      if (!/^audio\//.test(f.type) && !/\.(mp3|ogg|wav|m4a)$/i.test(f.name)) continue;
      if (f.size > 20 * 1024 * 1024) { alert(tr('«{n}» è troppo grande (al massimo 20 MB).', { n: f.name })); continue; }
      const id = 'mia:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { await salva({ id, nome: f.name.replace(/\.[^.]+$/, '').slice(0, 60), blob: f }); ultimoId = id; }
      catch { alert(tr('Non riesco a salvare la suoneria in questo browser.')); break; }
    }
    e.target.value = '';
    if (ultimoId) { imp.id = ultimoId; scrivi(imp); }
    await riempi();
  });
  aggiorna(); riempi();
})();
