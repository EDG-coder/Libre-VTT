// ---------- Plugins: loading and applying them on the table ----------
// Which plugins to apply is decided in the home (⚙ › Plugin); the table asks the local server every few
// seconds (api/plugins) and follows: a plugin switched on is applied, one switched off is taken away,
// without reloading the page.
//
// Three states, as in the design: «downloaded» (the folder on disk), «loaded» (its files read and kept
// in memory here: CSS, code, translations) and «applied» (running on the table). Switching a plugin off
// brings it back to «loaded»: switching it on again is instant and reads nothing from disk.
//
// Code runs in one of two ways:
//   sandbox  an invisible <iframe> with no origin and no network (plugin-sandbox.html); it can only ask
//            for what its permissions allow (chat.read, chat.write, chat.commands, ui.buttons, ui.notify)
//   full     imported into this page, like LIBRE VTT's own code: it can hook any function (registry.js)
//            and touch anything. It is applied only after the two warnings in the home.
(function () {
  'use strict';
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (x, k) => v && v[k] != null ? v[k] : x);
  const tr = (s, v) => (window.tr ? window.tr(s, v) : fill(s, v));
  const REG = window.LIBRE && window.LIBRE.registry;
  const lang = () => (window.LIBRE_I18N && window.LIBRE_I18N.lingua) || 'it';
  const PERM = { 'chat.write': 'chat.write', 'commands.add': 'chat.commands', 'ui.button': 'ui.buttons', 'ui.notify': 'ui.notify', 'storage.set': null };
  const EVENT_PERM = { 'chat.message': 'chat.read', 'scene.changed': null };

  const loaded = new Map();     // `${id}@${hash}` -> { info, css: <style>, code, strings, module }
  const applied = new Map();    // id -> { key, info, frame?, listeners, buttons, commands, unhooks, errors }
  let lastList = '';

  // ---------- the little dock: plugin buttons, notices, the red badge for full access ----------
  let dock = null;
  function dockEl() {
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'pluginDock';
    dock.innerHTML = '<div class="plgBtns"></div><div class="plgNotes" aria-live="polite"></div>';
    document.body.appendChild(dock);
    return dock;
  }
  function notify(owner, text) {
    const n = document.createElement('div');
    n.className = 'plgNote';
    n.dataset.noi18n = '';
    n.textContent = (owner ? owner + ': ' : '') + String(text).slice(0, 300);
    dockEl().querySelector('.plgNotes').appendChild(n);
    setTimeout(() => n.remove(), 5000);
  }
  // The red dot: a few pixels in the top-left corner while a full-access plugin is applied, under
  // everything else (it never covers a button). It is hidden only with «/plugin pallino» typed in the chat
  // and confirmed by a click: both must be real input (isTrusted), so a plugin cannot switch it off by
  // calling functions or faking events. Its listeners are added here, before any plugin runs.
  const DOT_KEY = 'libre.plgDot';
  let dotOff = false;
  try { dotOff = localStorage.getItem(DOT_KEY) === '0'; } catch {}
  let dot = null;
  function dotEl() {
    if (dot && dot.isConnected) return dot;
    dot = document.createElement('div');
    dot.id = 'plgDot';
    dot.hidden = true;
    dot.setAttribute('role', 'img');
    document.body.appendChild(dot);
    return dot;
  }
  function refreshBadge() {
    const full = [...applied.values()].filter(a => a.info.access === 'full');
    const d = dotEl();
    d.hidden = !full.length || dotOff;
    const t = tr('Plugin con accesso completo applicati: {nomi}. Si gestiscono dalla rotellina della home.', { nomi: full.map(a => nameOf(a.info)).join(', ') });
    d.title = t;
    d.setAttribute('aria-label', t);
  }
  const chatLine = text => notify('', text);      // only on this screen: a chat line would reach the others
  function askHideDot() {
    if (document.getElementById('plgDotAsk')) return;
    const box = document.createElement('div');
    box.id = 'plgDotAsk';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const p = document.createElement('p');
    p.textContent = tr('Nascondere il pallino rosso che segnala i plugin con accesso completo? Si rimette con lo stesso comando.');
    const no = document.createElement('button'), yes = document.createElement('button');
    no.type = yes.type = 'button';
    no.textContent = tr('Lascialo');
    yes.textContent = tr('Nascondi');
    yes.className = 'plgDotYes';
    const row = document.createElement('div');
    row.append(no, yes);
    box.append(p, row);
    document.body.appendChild(box);
    box.tabIndex = -1;
    box.focus();                                   // not on a button: the Enter of the command would press it
    const close = () => box.remove();
    no.addEventListener('click', close);
    yes.addEventListener('click', e => {
      if (!e.isTrusted) return;                    // only a real click: a plugin's .click() does nothing
      close();
      dotOff = true;
      try { localStorage.setItem(DOT_KEY, '0'); } catch {}
      refreshBadge();
      chatLine(tr('Pallino dei plugin nascosto. Per rimetterlo scrivi /plugin pallino.'));
    });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  function dotCommand(e) {
    const input = document.getElementById('chatInput');
    if (!e.isTrusted || !input || !/^\/plugins?\s+(pallino|dot)$/i.test(input.value.trim())) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    input.value = '';
    input.style.height = '';
    if (dotOff) {
      dotOff = false;
      try { localStorage.removeItem(DOT_KEY); } catch {}
      refreshBadge();
      chatLine(tr('Pallino dei plugin di nuovo visibile.'));
    } else askHideDot();
  }
  {
    const input = document.getElementById('chatInput'), send = document.getElementById('chatSend');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) dotCommand(e); }, true);
    if (send) send.addEventListener('click', dotCommand, true);
  }
  const nameOf = info => typeof info.name === 'string' ? info.name : (info.name && (info.name[lang()] || info.name.en || info.name.it || Object.values(info.name)[0])) || info.id;

  function reportError(id, err, where) {
    const a = applied.get(id);
    const msg = String(err && (err.message || err) || err);
    console.error(`[plugin ${id}]${where ? ' ' + where : ''}`, err);
    if (a) {
      a.errors.push(msg);
      if (a.errors.length === 1) notify(nameOf(a.info), tr('errore nel plugin: {msg}', { msg: msg.split('\n')[0] }));
    }
  }
  if (REG) REG.setErrorHandler((owner, e, name) => reportError(owner, e, 'hook ' + name));

  // ---------- events from the table, for every applied plugin ----------
  function emit(name, data) {
    for (const [id, a] of applied) {
      if (!a.subscribed.has(name)) continue;
      const need = EVENT_PERM[name];
      if (a.info.access === 'sandbox' && need && !a.info.permissions.includes(need)) continue;
      if (a.frame) a.frame.contentWindow && a.frame.contentWindow.postMessage({ type: 'event', name, data }, '*');
      else for (const fn of a.listeners.get(name) || []) { try { fn(data); } catch (e) { reportError(id, e, name); } }
    }
  }
  const msgData = m => ({ kind: m.kind, text: m.text, label: m.label, total: m.total, rolls: m.rolls, sides: m.sides, mod: m.mod, by: m.by, secret: !!m.secret, provisional: !!m.provvisorio, id: m.id });
  // our own hooks, always on: they only report what happens
  function coreHooks() {
    if (!REG || coreHooks.done) return;
    coreHooks.done = true;
    try { REG.hook('addChat', '__libre', { after: (r, args) => { try { emit('chat.message', JSON.parse(JSON.stringify(msgData(args[0] || {})))); } catch {} } }); } catch {}
    try { REG.hook('switchScene', '__libre', { after: (r, args) => { emit('scene.changed', { id: args[0] }); } }); } catch {}
    try {
      REG.hook('chatCommand', '__libre', {
        replace: (original, text) => {
          const m = /^\/([\w.-]+)\s*([\s\S]*)$/.exec(String(text || '').trim());
          if (m) for (const [id, a] of applied) {
            if (!a.commands.has(m[1].toLowerCase())) continue;
            const data = { name: m[1], args: m[2], text };
            if (a.frame) a.frame.contentWindow.postMessage({ type: 'event', name: 'command', data }, '*');
            else { try { a.commands.get(m[1].toLowerCase())(m[2], text); } catch (e) { reportError(id, e, '/' + m[1]); } }
            return true;
          }
          return original(text);
        }
      });
    } catch {}
  }

  // ---------- what a plugin can do (shared by both kinds) ----------
  function storageOf(id) { try { return JSON.parse(localStorage.getItem('libre-plugin:' + id) || '{}') || {}; } catch { return {}; } }
  function saveStorage(id, obj) { try { localStorage.setItem('libre-plugin:' + id, JSON.stringify(obj).slice(0, 500000)); } catch {} }
  function addButton(a, { label, title }, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plgBtn'; b.dataset.noi18n = '';
    b.textContent = String(label || '★').slice(0, 24);
    b.title = (title ? String(title).slice(0, 120) + ' · ' : '') + tr('plugin «{nome}»', { nome: nameOf(a.info) });
    const bid = a.info.id + ':' + (a.buttons.length + 1);
    b.onclick = () => onClick(bid);
    dockEl().querySelector('.plgBtns').appendChild(b);
    a.buttons.push(b);
    return bid;
  }
  function chatWrite(text) { if (typeof addChat === 'function') addChat({ kind: 'text', text: String(text).slice(0, 4000) }); }

  // the API a full-access plugin receives
  function fullApi(a, strings) {
    const id = a.info.id;
    const store = storageOf(id);
    return Object.freeze({
      id, access: 'full', get lang() { return lang(); },
      t: (key, vars) => fill(strings()[key] != null ? strings()[key] : key, vars),
      on(name, fn) { if (typeof fn !== 'function') return; a.subscribed.add(name); a.listeners.set(name, [...(a.listeners.get(name) || []), fn]); },
      hook: (name, spec) => { const off = REG.hook(name, id, spec); a.unhooks.push(off); return off; },
      registry: REG,
      chat: Object.freeze({ write: chatWrite }),
      ui: Object.freeze({ notify: text => notify(nameOf(a.info), text), button: ({ label, title, onClick } = {}) => addButton(a, { label, title }, () => { try { onClick && onClick(); } catch (e) { reportError(id, e, 'button'); } }) }),
      commands: Object.freeze({ add: (name, fn) => { a.commands.set(String(name).replace(/^\//, '').toLowerCase(), fn); } }),
      storage: Object.freeze({ get: k => store[k], set: (k, v) => { store[k] = v; saveStorage(id, store); } }),
      onCleanup: fn => a.cleanups.push(fn)
    });
  }

  // requests from a sandbox
  function onSandboxMessage(e) {
    for (const [id, a] of applied) {
      if (!a.frame || e.source !== a.frame.contentWindow) continue;
      const m = e.data || {};
      const reply = (ok, value, error) => a.frame.contentWindow.postMessage({ type: 'reply', call: m.call, ok, value, error }, '*');
      if (m.type === 'ready') a.frame.contentWindow.postMessage({ type: 'load', id, code: a.code, permissions: a.info.permissions, lang: lang(), strings: a.strings(), storage: storageOf(id) }, '*');
      else if (m.type === 'error') reportError(id, m.message);
      else if (m.type === 'subscribe') a.subscribed.add(String(m.name));
      else if (m.type === 'call') {
        const need = PERM[m.method];
        if (need === undefined) return reply(false, null, 'unknown method ' + m.method);
        if (need && !a.info.permissions.includes(need)) return reply(false, null, `permission «${need}» not declared in plugin.json`);
        const [x, y] = m.args || [];
        try {
          if (m.method === 'chat.write') chatWrite(x);
          else if (m.method === 'ui.notify') notify(nameOf(a.info), x);
          else if (m.method === 'ui.button') return reply(true, addButton(a, x || {}, bid => a.frame.contentWindow.postMessage({ type: 'event', name: 'ui.click', data: bid }, '*')));
          else if (m.method === 'commands.add') a.commands.set(String(x).replace(/^\//, '').toLowerCase(), true);
          else if (m.method === 'storage.set') { const s = storageOf(id); s[x] = y; saveStorage(id, s); }
          reply(true, null);
        } catch (err) { reply(false, null, String(err)); }
      }
      return;
    }
  }
  addEventListener('message', onSandboxMessage);

  // ---------- load (into memory) ----------
  async function load(info) {
    const key = info.id + '@' + info.hash;
    if (loaded.has(key)) return loaded.get(key);
    const base = 'plugins/' + encodeURIComponent(info.id) + '/';
    const get = async (f, as) => { const r = await fetch(base + f + '?v=' + info.hash.slice(0, 12), { cache: 'no-store' }); if (!r.ok) throw new Error(f + ': ' + r.status); return as === 'json' ? r.json() : r.text(); };
    const L = { info, strings: {} };
    await Promise.all((info.locales || []).map(async l => { try { L.strings[l] = await get('locales/' + l + '.json', 'json'); } catch {} }));
    if (info.style) {
      L.css = document.createElement('style');
      L.css.dataset.plugin = info.id;
      L.css.textContent = await get(info.style);
    }
    if (info.client && info.access === 'sandbox') L.code = await get(info.client);
    if (info.client && info.access === 'full') L.module = await import('/' + base + info.client + '?v=' + info.hash.slice(0, 12));
    for (const k of [...loaded.keys()]) if (k.startsWith(info.id + '@')) loaded.delete(k);   // older versions out of memory
    loaded.set(key, L);
    return L;
  }

  // ---------- apply / take away ----------
  async function apply(info) {
    let L;
    try { L = await load(info); } catch (e) { console.error('[plugin ' + info.id + '] load', e); notify(nameOf(info), tr('non si carica: {msg}', { msg: e.message })); return; }
    const a = { key: info.id + '@' + info.hash, info, listeners: new Map(), subscribed: new Set(), buttons: [], commands: new Map(), unhooks: [], cleanups: [], errors: [] };
    a.strings = () => L.strings[lang()] || L.strings.en || L.strings.it || Object.values(L.strings)[0] || {};
    applied.set(info.id, a);
    if (L.css) applyCss();
    if (info.access === 'sandbox' && L.code) {
      a.code = L.code;
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      f.src = 'plugin-sandbox.html';
      a.frame = f;
      document.body.appendChild(f);
    } else if (info.access === 'full' && L.module) {
      const start = L.module.activate || L.module.default;
      try {
        if (typeof start !== 'function') throw new Error('client.js must export a function activate(vtt)');
        await start(fullApi(a, a.strings));
      } catch (e) { reportError(info.id, e, 'activate'); }
    }
    refreshBadge();
  }
  async function takeAway(id) {
    const a = applied.get(id);
    if (!a) return;
    applied.delete(id);
    const L = loaded.get(a.key);
    if (a.frame) {
      try { a.frame.contentWindow.postMessage({ type: 'deactivate' }, '*'); } catch {}
      const f = a.frame; setTimeout(() => f.remove(), 400);
    }
    if (L && L.module && typeof L.module.deactivate === 'function') { try { await L.module.deactivate(); } catch (e) { console.error(e); } }
    for (const fn of a.cleanups) { try { fn(); } catch {} }
    for (const off of a.unhooks) { try { off(); } catch {} }
    if (REG) REG.unhookAll(id);
    a.buttons.forEach(b => b.remove());
    applyCss();
    refreshBadge();
  }
  // the CSS of the applied plugins, after the table's own, in the plugins' order (the last one wins)
  let order = [];
  function applyCss() {
    for (const L of loaded.values()) if (L.css && L.css.isConnected && !applied.has(L.info.id)) L.css.remove();
    for (const id of order) {
      const a = applied.get(id); if (!a) continue;
      const L = loaded.get(a.key);
      if (L && L.css) document.head.appendChild(L.css);       // appendChild moves it: the order follows the list
    }
  }

  // ---------- follow the home ----------
  let busy = false;
  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch('api/plugins', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const list = Array.isArray(j.plugins) ? j.plugins : [];
      const sig = JSON.stringify(list.map(p => p.id + '@' + p.hash));
      if (sig === lastList) return;
      lastList = sig;
      coreHooks();
      const want = new Map(list.map(p => [p.id, p]));
      for (const [id, a] of [...applied]) if (!want.has(id) || want.get(id).hash !== a.info.hash) await takeAway(id);
      order = list.map(p => p.id);
      for (const p of list) if (!applied.has(p.id)) await apply(p);
      applyCss();
    } catch {} finally { busy = false; }
  }
  window.LIBRE = window.LIBRE || {};
  if (new URLSearchParams(location.search).has('noplugins')) { window.LIBRE.plugins = { disabled: true }; return; }
  sync();
  setInterval(sync, 4000);
  addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  window.LIBRE = window.LIBRE || {};
  window.LIBRE.plugins = Object.freeze({
    applied: () => [...applied.values()].map(a => ({ id: a.info.id, version: a.info.version, access: a.info.access, errors: a.errors.slice() })),
    loaded: () => [...loaded.keys()],
    sync
  });
})();
