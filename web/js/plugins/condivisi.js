// ---------- Plugins: the ones the master shares with the players ----------
// The master picks, in the home's gear (⚙ › Plugin), which plugins to share and whether each one is needed to
// enter (server/plugins.js, server/game-server.js). Here, on the player's table:
//
//   - nothing is downloaded or run without a yes: the player sees what each plugin is (theme, sandboxed code,
//     full access, its permissions) and chooses. Full-access ones go through the same two warnings as in the home.
//   - a plugin the master made necessary keeps the player in front of the door: until they accept they do not
//     enter, but «Leave» is always there.
//   - the files arrive in pieces through the game connection (uffa-link, or the relay from the website), are
//     checked against the fingerprint the master announced (the consent is tied to it) and stay in memory only.
//   - the consent is remembered for exactly those files: next time they are loaded without asking again; a new
//     version (even one changed file) asks again.
//   - what can run where: the desktop app everything; the website themes and sandboxed code (full access needs a
//     LIBRE VTT installed on the computer); the phone and tablet apps only themes (store rules: no code downloaded).
//
// Protocol (with the host):  ← plugins.offerta { gate, list }   → plugins.chiedi { id, hash }
//                            ← plugins.pezzo { id, hash, k, n, d }   ← plugins.no { id, hash, motivo }
//                            → hello { …, plugins: 1, pluginsOk: [{ id, hash }] }   → plugins.accettati { list }
(function () {
  'use strict';
  const tr = (s, v) => (window.tr ? window.tr(s, v) : String(s).replace(/\{(\w+)\}/g, (x, k) => v && v[k] != null ? v[k] : x));
  const lang = () => (window.LIBRE_I18N && window.LIBRE_I18N.lingua) || 'it';
  const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/, HASH_RE = /^[a-f0-9]{64}$/;
  const PERMS = ['chat.read', 'chat.write', 'chat.commands', 'ui.buttons', 'ui.notify'];
  const PERM_TXT = { 'chat.read': 'leggere la chat', 'chat.write': 'scrivere in chat', 'chat.commands': 'comandi in chat', 'ui.buttons': 'pulsanti sul tavolo', 'ui.notify': 'avvisi sul tavolo' };
  const P = () => window.LIBRE && window.LIBRE.plugins;
  const key = p => p.id + '@' + p.hash;
  const send = o => { try { if (typeof netSend === 'function') netSend(o); } catch {} };

  // ---------- the consent, for exactly these files ----------
  const OK_KEY = 'libre.plgMaster';
  let ok = {};
  try { ok = JSON.parse(localStorage.getItem(OK_KEY) || '{}') || {}; } catch { ok = {}; }
  const saveOk = () => {
    const e = Object.entries(ok).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 50);
    ok = Object.fromEntries(e);
    try { localStorage.setItem(OK_KEY, JSON.stringify(ok)); } catch {}
  };
  const consented = p => !!(ok[p.hash] && ok[p.hash].id === p.id);

  // ---------- what this table can run ----------
  // 'full' the desktop app · 'sandbox' the website · 'theme' the phone and tablet apps
  let cap = null;
  function capSync() {
    if (window.LIBRE_NATIVO && window.LIBRE_NATIVO.disponibile) return 'theme';
    if (window.LIBRE_WEB) return 'sandbox';
    return cap;
  }
  async function capacity() {
    const c = capSync();
    if (c) return c;
    try { const r = await fetch('api/plugins', { cache: 'no-store' }); const j = r.ok ? await r.json() : {}; cap = j.ricevutiPieni ? 'full' : 'sandbox'; }
    catch { cap = 'sandbox'; }
    return cap;
  }
  function whyNot(p, c) {
    if (c === 'theme' && p.access !== 'none') return tr('Nell\'app per telefoni e tablet si possono usare solo i plugin senza codice (i temi).');
    if (p.access === 'full' && c !== 'full') return tr('Ha l\'accesso completo: si può usare solo con LIBRE VTT installato sul computer, non dal sito.');
    return '';
  }

  // ---------- what the master offers ----------
  // «No» to an optional one is remembered for exactly those files, like a yes: a new version is offered again
  const NO_KEY = 'libre.plgMasterNo';
  let offer = [], gate = false, refused = new Set();
  try { refused = new Set((JSON.parse(localStorage.getItem(NO_KEY) || '[]') || []).filter(k => typeof k === 'string')); } catch {}
  const refuse = p => {
    refused.add(key(p));
    try { localStorage.setItem(NO_KEY, JSON.stringify([...refused].slice(-100))); } catch {}
  };
  const txt = v => typeof v === 'string' ? v : v && typeof v === 'object' ? (v[lang()] || v.en || v.it || Object.values(v)[0] || '') : '';
  function clean(p) {
    if (!p || !ID_RE.test(String(p.id)) || !HASH_RE.test(String(p.hash))) return null;
    const s = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const name = typeof p.name === 'object' && p.name ? p.name : s(p.name, 300);
    return {
      id: p.id, hash: p.hash, name: txt(name) ? name : p.id, description: p.description && typeof p.description === 'object' ? p.description : s(p.description, 300),
      version: s(p.version, 40) || '?', author: s(p.author, 120), license: s(p.license, 60),
      access: ['none', 'sandbox', 'full'].includes(p.access) ? p.access : 'none',
      permissions: Array.isArray(p.permissions) ? p.permissions.filter(x => PERMS.includes(x)) : [],
      style: s(p.style, 200) || null, client: s(p.client, 200) || null,
      locales: Array.isArray(p.locales) ? p.locales.filter(l => /^[a-z]{2}$/.test(l)) : [],
      kinds: Array.isArray(p.kinds) ? p.kinds.filter(k => ['theme', 'code'].includes(k)) : [],
      bytes: Math.max(0, +p.bytes || 0), required: !!p.required
    };
  }
  const nameOf = p => txt(p.name) || p.id;

  async function onOffer(m) {
    offer = (Array.isArray(m.list) ? m.list : []).map(clean).filter(Boolean).slice(0, 30);
    gate = !!m.gate;
    // what the master no longer shares (or shares in another version) goes away
    const pl = P();
    if (pl) for (const r of pl.received()) if (!offer.some(p => p.id === r.id && p.hash === r.hash)) pl.removeReceived(r.id);
    const c = await capacity();
    if (busy) return;                            // downloading what they just accepted: the screen stays as it is
    if (gate) { show(true); return; }
    // already at the table: the ones with a consent load by themselves (the consent was for these files)
    for (const p of offer) if (consented(p) && !whyNot(p, c) && !isLoaded(p)) load(p).then(tellHost, e => note(tr('Il plugin «{nome}» del master non si carica: {msg}', { nome: nameOf(p), msg: e.message })));
    const fresh = offer.filter(p => !consented(p) && !whyNot(p, c) && !refused.has(key(p)));
    if (fresh.length) show(false, fresh);
    else if (box && !gate) close();
  }
  const isLoaded = p => { const pl = P(); return !!(pl && pl.received().some(r => r.id === p.id && r.hash === p.hash)) || loading.has(key(p)); };
  function tellHost() { const pl = P(); if (pl && typeof NET !== 'undefined' && NET.on) send({ t: 'plugins.accettati', list: pl.received() }); }

  // ---------- downloading: pieces, the fingerprint, memory ----------
  const waiting = new Map();      // key -> { parts, got, n, ok, ko, timer }
  const loading = new Map();      // key -> Promise
  function download(p) {
    const k = key(p);
    if (waiting.has(k)) return waiting.get(k).promise;
    let w;
    const promise = new Promise((resolve, reject) => {
      w = { parts: [], got: 0, n: 0, resolve, reject };
      w.timer = setTimeout(() => { waiting.delete(k); reject(new Error(tr('non è arrivato in tempo'))); }, 180000);
    });
    w.promise = promise;
    waiting.set(k, w);
    send({ t: 'plugins.chiedi', id: p.id, hash: p.hash });
    return promise;
  }
  function onPiece(m) {
    const w = waiting.get(m.id + '@' + m.hash);
    if (!w) return;
    const n = +m.n, k = +m.k;
    if (!Number.isInteger(n) || n < 1 || n > 200 || !Number.isInteger(k) || k < 0 || k >= n || typeof m.d !== 'string') return;
    w.n = n;
    if (w.parts[k] == null) { w.parts[k] = m.d; w.got++; }
    progress(m.id, w.got, n);
    if (w.got < n) return;
    clearTimeout(w.timer);
    waiting.delete(m.id + '@' + m.hash);
    try {
      const list = JSON.parse(w.parts.join(''));
      if (!Array.isArray(list)) throw new Error('?');
      w.resolve(list.map(x => [String(x[0]), String(x[1])]));
    } catch { w.reject(new Error(tr('è arrivato rovinato'))); }
  }
  function onNo(m) {
    const k = m.id + '@' + m.hash, w = waiting.get(k);
    if (!w) return;
    clearTimeout(w.timer); waiting.delete(k);
    w.reject(new Error(tr(String(m.motivo || 'non disponibile').slice(0, 200))));
  }
  const fromB64 = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  // the same fingerprint as the folder on the master's computer (server/plugins.js): path \0 bytes \0, in order
  async function fingerprint(files) {
    const enc = new TextEncoder(), parts = [];
    let n = 0;
    for (const [f, b] of files) { const x = enc.encode(f); parts.push(x, new Uint8Array([0]), b, new Uint8Array([0])); n += x.length + b.length + 2; }
    const all = new Uint8Array(n);
    let i = 0;
    for (const x of parts) { all.set(x, i); i += x.length; }
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
    return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function load(p) {
    const k = key(p);
    if (loading.has(k)) return loading.get(k);
    const job = (async () => {
      const raw = await download(p);
      if (raw.some(([f]) => !f || f.split('/').some(s => !s || s === '..' || s.startsWith('.')))) throw new Error(tr('è arrivato rovinato'));
      const files = raw.map(([f, b]) => [f, fromB64(b)]);
      if (await fingerprint(files) !== p.hash) throw new Error(tr('i file non corrispondono a quelli del master'));
      if (p.access === 'full') {                 // full access: this computer's LIBRE VTT keeps it in memory, for the import
        const r = await fetch('api/plugins/ricevuti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, hash: p.hash, files: raw }) });
        if (!r.ok) throw new Error(await r.text().catch(() => String(r.status)));
      }
      const pl = P();
      if (!pl || pl.disabled) throw new Error(tr('i plugin sono spenti su questo tavolo'));
      await pl.addReceived({ id: p.id, name: p.name, version: p.version, hash: p.hash, access: p.access, permissions: p.permissions, style: p.style, client: p.client, locales: p.locales }, new Map(files));
    })();
    loading.set(k, job);
    job.finally(() => loading.delete(k)).catch(() => {});
    return job;
  }

  // ---------- the screen ----------
  let box = null, busy = false;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' kB';
  function note(t) {
    if (box && box.querySelector('.plgPortaStato')) { const s = box.querySelector('.plgPortaStato'); s.textContent = t; s.hidden = false; return; }
    if (typeof netSay === 'function') netSay(t, 'warn');
  }
  function progress(id, got, n) {
    if (!box) return;
    const s = box.querySelector('.plgPortaStato');
    const p = offer.find(x => x.id === id);
    if (s && p) { s.hidden = false; s.classList.remove('err'); s.textContent = tr('Scarico «{nome}»… {k} di {n}', { nome: nameOf(p), k: got, n }); }
  }
  function close() { if (box) { try { box.close(); } catch {} box.remove(); box = null; } busy = false; }

  /** The list of what the master shares. `asGate`: they cannot enter until they accept the necessary ones. */
  async function show(asGate, only) {
    const c = await capacity();
    const list = asGate ? offer : (only || offer);
    if (!list.length) { close(); return; }
    close();
    // a modal <dialog>: above everything, also above the table's own dialogs (the help, the name…)
    box = el('dialog', 'plgPorta');
    box.id = 'plgPorta';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'plgPortaTit');
    box.dataset.noi18n = '';
    box.dataset.gate = asGate ? '1' : '0';
    const card = el('div', 'plgPortaCarta');
    const h = el('h2', '', asGate ? tr('Il master chiede dei plugin per entrare') : tr('Il master condivide dei plugin'));
    h.id = 'plgPortaTit';
    const intro = el('p', 'plgPortaNota', asGate
      ? tr('Per entrare in questa partita devi accettare quelli segnati come necessari. Niente si scarica e niente parte finché non dici sì. Se non vuoi, puoi uscire.')
      : tr('Puoi usarli o giocare senza. Niente si scarica e niente parte finché non dici sì.'));
    const ul = el('div', 'plgPortaLista');
    const picks = new Map();
    let blocked = '';
    for (const p of list) {
      const why = whyNot(p, c);
      if (why && p.required && asGate) blocked = why;
      const row = el('label', 'plgPortaRiga' + (p.access === 'full' ? ' pieno' : '') + (why ? ' no' : ''));
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !why && (p.required || consented(p));
      cb.disabled = !!why || (asGate && p.required);
      picks.set(key(p), { p, cb });
      const mid = el('div');
      const t = el('div', 'nome');
      t.append(el('span', '', nameOf(p)), el('span', 'ver', 'v' + p.version + (p.author ? ' · ' + p.author : '') + ' · ' + kb(p.bytes)));
      mid.append(t);
      const d = txt(p.description); if (d) mid.append(el('p', 'desc', d));
      const chips = el('div', 'chips');
      chips.append(el('span', 'chip' + (p.required ? ' nec' : ''), p.required ? tr('Necessario per entrare') : tr('Facoltativo')));
      if (p.kinds.includes('theme')) chips.append(el('span', 'chip', tr('Tema')));
      if (p.access === 'sandbox') chips.append(el('span', 'chip', tr('Codice in sandbox')));
      if (p.access === 'full') chips.append(el('span', 'chip rosso', tr('⚠ Accesso completo')));
      mid.append(chips);
      if (p.access === 'sandbox' && p.permissions.length) mid.append(el('p', 'desc', tr('Permessi: {lista}', { lista: p.permissions.map(x => tr(PERM_TXT[x] || x)).join(', ') })));
      if (why) mid.append(el('p', 'stato err', why));
      row.append(cb, mid);
      ul.append(row);
    }
    const status = el('p', 'plgPortaStato');
    status.hidden = !blocked;
    if (blocked) { status.classList.add('err'); status.textContent = tr('Da qui non puoi entrare in questa partita: {motivo}', { motivo: blocked }); }
    const btns = el('div', 'plgPortaBottoni');
    const no = el('button', 'b', asGate ? tr('Esci') : tr('No, grazie'));
    const yes = el('button', 'b go', asGate ? tr('Accetta ed entra') : tr('Usa quelli scelti'));
    no.type = yes.type = 'button';
    yes.disabled = !!blocked;
    btns.append(no, yes);
    card.append(h, intro, ul, status, btns);
    box.append(card);
    document.body.append(box);
    try { box.showModal(); } catch { box.setAttribute('open', ''); }
    (blocked ? no : yes).focus();
    no.onclick = () => {
      if (asGate) { close(); if (typeof netDisconnect === 'function') netDisconnect(); return; }
      for (const p of list) refuse(p);
      close();
    };
    box.addEventListener('cancel', e => { e.preventDefault(); if (!busy && card.contains(no)) no.click(); });   // Esc = «Leave» / «Not now»
    yes.onclick = async () => {
      if (busy) return;
      const chosen = [...picks.values()].filter(x => x.cb.checked).map(x => x.p);
      for (const p of list) if (!chosen.includes(p)) {
        if (!p.required) refuse(p);
        if (ok[p.hash]) { delete ok[p.hash]; saveOk(); }                 // changed their mind: it goes away
        const pl = P(); if (pl && pl.received().some(r => r.id === p.id)) pl.removeReceived(p.id);
      }
      // full access: the two warnings, one plugin at a time (nothing has been downloaded yet)
      for (const p of chosen) if (p.access === 'full' && !consented(p)) {
        if (!await warnings(card, p)) return;
      }
      busy = true;
      yes.disabled = no.disabled = true;
      for (const p of chosen) { ok[p.hash] = { id: p.id, access: p.access, t: Date.now() }; refused.delete(key(p)); }
      saveOk();
      try {
        for (const p of chosen) if (!isLoaded(p) || loading.has(key(p))) await load(p);
      } catch (e) {
        busy = false; yes.disabled = no.disabled = false;
        status.hidden = false; status.classList.add('err');
        status.textContent = tr('Non sono riuscito a scaricarlo: {msg}', { msg: e.message });
        return;
      }
      busy = false;
      if (asGate) {
        status.hidden = false; status.classList.remove('err');
        status.textContent = tr('Fatto: entro…');
        if (typeof netSaluta === 'function') netSaluta();   // the same connection, now with the consent: the host lets them in
      } else { close(); tellHost(); }
    };
  }

  // the same two warnings as in the home (launcher.html): the second one with the name to type and 5 seconds
  function warnings(card, p) {
    return new Promise(done => {
      const keep = [...card.childNodes];
      const back = v => { card.replaceChildren(...keep); done(v); };
      const one = () => {
        const ul = el('ul');
        for (const x of ['leggere e cambiare le tue campagne, le schede e la chat;', 'usare la tua identità di gioco nelle partite in cui entri;', 'mandare dati su internet senza chiedertelo;', 'rompere il tavolo o farlo comportare in modo strano.']) ul.append(el('li', '', tr(x)));
        const b = el('div', 'plgPortaBottoni'), go = el('button', 'b rischio', tr('Continua…')), stop = el('button', 'b go', tr('Annulla'));
        go.type = stop.type = 'button';
        b.append(go, stop);
        card.replaceChildren(el('div', 'plgPortaIcona', '⚠'), el('h2', '', tr('Questo plugin può controllare LIBRE VTT e il tuo computer')),
          el('p', '', nameOf(p) + ' v' + p.version + ' · ' + (p.author ? tr('di {autore}', { autore: p.author }) : tr('autore sconosciuto')) + ' · ' + tr('dal master')),
          el('p', '', tr('Chiede l\'accesso completo: non gira nella sandbox e ha gli stessi poteri di LIBRE VTT. Potrebbe:')), ul,
          el('p', '', tr('Applicalo solo se sai chi l\'ha fatto e ti fidi. LIBRE VTT non lo ha controllato.')), b);
        stop.focus();
        stop.onclick = () => back(false);
        go.onclick = two;
      };
      const two = () => {
        const inp = el('input'); inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', tr('Nome del plugin'));
        const err = el('p', 'stato err'); err.hidden = true;
        const b = el('div', 'plgPortaBottoni'), go = el('button', 'b rischio'), stop = el('button', 'b go', tr('Annulla'));
        go.type = stop.type = 'button';
        b.append(go, stop);
        let s = 5;
        go.disabled = true; go.textContent = tr('Consenti comunque') + ' (' + s + ')';
        const t = setInterval(() => { s--; go.textContent = tr('Consenti comunque') + (s > 0 ? ' (' + s + ')' : ''); if (s <= 0) { clearInterval(t); go.disabled = false; } }, 1000);
        card.replaceChildren(el('div', 'plgPortaIcona', '⚠'), el('h2', '', tr('Consenti comunque l\'accesso completo?')),
          el('p', '', tr('Per confermare, scrivi il nome del plugin: {nome}', { nome: nameOf(p) })), inp,
          el('p', 'plgPortaNota', tr('Il consenso vale solo per questi file. Se il plugin cambia (una versione nuova o anche un solo file), te lo richiederemo.')), err, b);
        stop.focus();
        stop.onclick = () => { clearInterval(t); back(false); };
        go.onclick = e => {
          if (!e.isTrusted) return;                // a real click only
          const names = [p.id, ...(typeof p.name === 'string' ? [p.name] : Object.values(p.name || {}))].map(x => String(x).trim().toLowerCase());
          if (!names.includes(inp.value.trim().toLowerCase())) { err.textContent = tr('il nome scritto non corrisponde'); err.hidden = false; return; }
          clearInterval(t);
          back(true);
        };
      };
      one();
    });
  }

  // «/plugin master» in the chat: the list of what the master shares, again (to change one's mind)
  function command(e) {
    const input = document.getElementById('chatInput');
    if (!input || !/^\/plugins?\s+master$/i.test(input.value.trim())) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    input.value = ''; input.style.height = '';
    if (!offer.length || gate) { if (typeof netSay === 'function') netSay(tr('Il master non condivide plugin in questa partita.'), 'warn'); return; }
    show(false, offer);
  }
  {
    const input = document.getElementById('chatInput'), btn = document.getElementById('chatSend');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) command(e); }, true);
    if (btn) btn.addEventListener('click', command, true);
  }

  window.LIBRE = window.LIBRE || {};
  window.LIBRE.condivisi = Object.freeze({
    ricevi(m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'plugins.offerta') onOffer(m);
      else if (m.t === 'plugins.pezzo') onPiece(m);
      else if (m.t === 'plugins.no') onNo(m);
    },
    /** For the hello: the master's plugins this player already said yes to (and that can run here). */
    perSaluto() {
      const c = capSync() || 'full';
      return Object.entries(ok).filter(([, v]) => !whyNot({ access: v.access || 'none' }, c)).map(([hash, v]) => ({ id: v.id, hash })).slice(0, 50);
    },
    /** Let in: the door closes (the plugins already loaded stay). */
    dentro() { gate = false; if (box && box.dataset.gate === '1') close(); },
    /** Out of the game (by choice or sent away): the screen closes and the master's plugins go away. */
    fuori() {
      close(); gate = false; offer = [];
      for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error(tr('uscito dalla partita'))); }
      waiting.clear();
      const pl = P(); if (pl) for (const r of pl.received()) pl.removeReceived(r.id);
    },
    /** Forget every yes and no given to the master's plugins. */
    dimentica() { ok = {}; saveOk(); refused = new Set(); try { localStorage.removeItem(NO_KEY); } catch {} }
  });
})();
