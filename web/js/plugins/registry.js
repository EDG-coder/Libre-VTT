// ---------- Plugins: the registry (hooks everywhere) ----------
// Every function the table declares at the top level (about 400: rollExpr, addChat, netSend, showScene…)
// can be hooked by a plugin, without changing the code of that function:
//   before(...args)          → return nothing to go on, a new array of arguments, or { cancel: true, value }
//   replace(original, ...args) → do something else, calling original(...args) if you want
//   after(result, args)      → return nothing to keep the result, or a new result
// The functions keep their (Italian) names; a few have stable English aliases too (ALIASES), which are the
// names to prefer in plugins because they will not change. A hook is put on the global binding, so it is
// seen by every caller that looks the function up by name (almost all of them).
// Only full-access plugins can hook; sandboxed plugins get events (see loader.js).
(function () {
  'use strict';
  const BASE = window.__LIBRE_BASE_GLOBALS || new Set();
  const ALIASES = {
    'chat.add': 'addChat', 'chat.send': 'sendChat', 'chat.command': 'chatCommand', 'chat.render': 'renderChat',
    'dice.roll': 'rollDice', 'dice.rollExpression': 'rollExpr',
    'net.send': 'netSend', 'net.receive': 'netHandle', 'net.applyRole': 'applyRole',
    'scene.show': 'showScene', 'scene.switch': 'switchScene', 'scene.renderList': 'renderSceneUI',
    'board.render': 'render',
    'sheet.open': 'openSheet', 'sheet.renderList': 'renderSheetList'
  };
  const hooks = new Map();          // real name -> [{ owner, before, after, replace }]
  const originals = new Map();      // real name -> the function before any hook
  const wrappers = new Map();       // real name -> the wrapper put on window
  let onError = () => {};

  const realName = n => ALIASES[n] || n;
  const hookable = n => typeof window[n] === 'function' && !BASE.has(n) && !/^[A-Z]/.test(n) && n !== 'LIBRE';

  function makeWrapper(name) {
    const w = function (...args) {
      const list = hooks.get(name) || [];
      const original = originals.get(name);
      let a = args;
      for (const h of list) {
        if (!h.before) continue;
        try {
          const r = h.before.apply(this, a);
          if (Array.isArray(r)) a = r;
          else if (r && r.cancel) return r.value;
        } catch (e) { onError(h.owner, e, name); }
      }
      let core = original;
      for (const h of list) {
        if (!h.replace) continue;
        const prev = core, self = this;
        core = function (...x) {
          try { return h.replace.call(self, (...y) => prev.apply(self, y), ...x); }
          catch (e) { onError(h.owner, e, name); return prev.apply(self, x); }
        };
      }
      let result = core.apply(this, a);
      for (const h of list) {
        if (!h.after) continue;
        try { const r = h.after.call(this, result, a); if (r !== undefined) result = r; }
        catch (e) { onError(h.owner, e, name); }
      }
      return result;
    };
    Object.defineProperty(w, 'name', { value: name });
    w.__libreOriginal = originals.get(name);
    return w;
  }

  function hook(name, owner, spec) {
    const n = realName(String(name));
    if (!hookable(n) && !originals.has(n)) throw new Error(`no hookable function called «${name}»`);
    if (!spec || !(spec.before || spec.after || spec.replace)) throw new Error('hook needs before, after or replace');
    if (!originals.has(n)) {
      originals.set(n, window[n]);
      const w = makeWrapper(n);
      wrappers.set(n, w);
      window[n] = w;
    }
    const h = { owner, before: spec.before, after: spec.after, replace: spec.replace };
    hooks.set(n, [...(hooks.get(n) || []), h]);
    return () => remove(n, h);
  }
  function remove(n, h) {
    const left = (hooks.get(n) || []).filter(x => x !== h);
    if (left.length) { hooks.set(n, left); return; }
    hooks.delete(n);
    if (window[n] === wrappers.get(n)) window[n] = originals.get(n);   // nobody else replaced it meanwhile
    originals.delete(n); wrappers.delete(n);
  }
  function unhookAll(owner) {
    for (const [n, list] of [...hooks]) for (const h of list) if (h.owner === owner) remove(n, h);
  }
  function list() {
    const names = Object.getOwnPropertyNames(window).filter(hookable);
    return { aliases: { ...ALIASES }, functions: [...new Set([...names, ...originals.keys()])].sort() };
  }
  /** Who hooks what (shown in the plugin manager's details). */
  function usage() {
    const out = {};
    for (const [n, l] of hooks) for (const h of l) (out[h.owner] = out[h.owner] || []).push(n);
    return out;
  }

  window.LIBRE = window.LIBRE || {};
  window.LIBRE.registry = Object.freeze({ hook, unhookAll, list, usage, aliases: ALIASES, setErrorHandler: f => { onError = f; } });
})();
