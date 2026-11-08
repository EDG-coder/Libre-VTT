// ---------- Plugins: the folder, the manifests, what is applied ----------
// Shared by the launcher (the ⚙ in the home: list, apply, order, consent) and by the table server
// (it serves the files and tells the table which plugins to apply).
//
// A plugin is a folder with a plugin.json inside, in <Documents>/LIBRE VTT/Plugins. The state (which
// plugins are applied, in which order, and the consent given to full-access ones) lives in a small
// JSON file in the user's LIBRE VTT folder, never inside the plugins folder.
//
// Full-access plugins run with the same powers as LIBRE VTT itself, so they are applied only if the
// consent was given to exactly these files: the consent is tied to the SHA-256 of the whole folder,
// and a new version (or a single changed file) needs a new consent.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const KNOWN_PERMISSIONS = ['chat.read', 'chat.write', 'chat.commands', 'ui.buttons', 'ui.notify'];
const MAX_FILES = 2000, MAX_BYTES = 60 * 1024 * 1024;
const MAX_SHARE = 8 * 1024 * 1024;          // a plugin sent to the players (through the relay too) stays small
const API_VERSION = 1;

// ---------- versions ----------
const parseVer = v => String(v || '').trim().replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function cmpVer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}
/** «>=3.8», «>=1.2 <2», «^1.4», «~1.4.2», «1.0.0», «*». */
function satisfies(version, range) {
  const r = String(range || '*').trim();
  if (!r || r === '*') return true;
  return r.split(/\s+/).every(part => {
    const m = /^(>=|<=|>|<|=|\^|~)?\s*v?([\d.]+)$/.exec(part);
    if (!m) return false;
    const op = m[1] || '=', v = m[2], c = cmpVer(version, v), [maj, min] = parseVer(v);
    if (op === '>=') return c >= 0;
    if (op === '<=') return c <= 0;
    if (op === '>') return c > 0;
    if (op === '<') return c < 0;
    if (op === '^') return c >= 0 && parseVer(version)[0] === maj;
    if (op === '~') return c >= 0 && parseVer(version)[0] === maj && parseVer(version)[1] === min;
    return c === 0;
  });
}

// ---------- CSS: no loading things from the internet ----------
/** Removes @import and url() that point outside the plugin folder (http:, https:, //, javascript:). */
function cleanCss(text) {
  return String(text)
    .replace(/@import[^;]*;?/gi, '/* @import removed */')
    .replace(/url\(\s*(['"]?)\s*((?:https?:|\/\/|javascript:|file:)[^)'"]*)\1\s*\)/gi, 'url("")')
    .replace(/expression\s*\(/gi, 'removed(');
}

/** The text of a field that can be a string or one string per language: {"it": "…", "en": "…"}. */
const text = v => typeof v === 'string' ? v.slice(0, 300)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k, s]) => /^[a-z]{2}$/.test(k) && typeof s === 'string').map(([k, s]) => [k, s.slice(0, 300)]))
  : '';

function createPlugins({ dir, stateFile, appVersion }) {
  const safeJoin = (base, rel) => {
    const f = path.resolve(base, rel);
    return f === base || f.startsWith(base + path.sep) ? f : null;
  };

  // ---------- state ----------
  function readState() {
    let s = {}; try { s = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}; } catch {}
    return {
      order: Array.isArray(s.order) ? s.order.filter(x => ID_RE.test(x)) : [],
      applied: Array.isArray(s.applied) ? s.applied.filter(x => ID_RE.test(x)) : [],
      consent: s.consent && typeof s.consent === 'object' ? s.consent : {},
      // shared with the players (only the master's, when they host): id -> { required }
      shared: s.shared && typeof s.shared === 'object' ? Object.fromEntries(Object.entries(s.shared).filter(([k]) => ID_RE.test(k)).map(([k, v]) => [k, { required: !!(v && v.required) }])) : {},
      t: +s.t || 0
    };
  }
  function writeState(s) {
    s.t = Date.now();
    cache = { at: 0, v: null };
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, stateFile);
    return s;
  }

  // ---------- one folder ----------
  function filesOf(root) {
    const out = [];
    let bytes = 0;
    const walk = rel => {
      let items = []; try { items = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
      for (const e of items) {
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(r);
        else if (e.isFile()) {
          if (out.length >= MAX_FILES) throw new Error('too many files');
          bytes += fs.statSync(path.join(root, r)).size;
          if (bytes > MAX_BYTES) throw new Error('too big');
          out.push(r);
        }
      }
    };
    walk('');
    return out.sort();
  }
  function hashOf(root, files) {
    const h = crypto.createHash('sha256');
    for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
    return h.digest('hex');
  }

  function readPlugin(folder) {
    const root = path.join(dir, folder);
    const p = { folder, errors: [], warnings: [] };
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')); }
    catch (e) { p.id = folder; p.errors.push(fs.existsSync(path.join(root, 'plugin.json')) ? 'plugin.json non è un JSON valido' : 'manca plugin.json'); return p; }
    p.id = typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : folder;
    if (!ID_RE.test(String(m.id || ''))) p.errors.push('«id» deve essere minuscolo, senza spazi (es. tema-pergamena)');
    p.name = text(m.name) || p.id;
    p.description = text(m.description);
    p.version = typeof m.version === 'string' ? m.version.slice(0, 40) : '0.0.0';
    p.author = typeof m.author === 'string' ? m.author.slice(0, 120) : '';
    p.license = typeof m.license === 'string' ? m.license.slice(0, 60) : '';
    p.homepage = typeof m.homepage === 'string' && /^https:\/\//.test(m.homepage) ? m.homepage.slice(0, 300) : '';
    p.libreVtt = typeof m.libreVtt === 'string' ? m.libreVtt : '*';
    p.api = Number.isInteger(m.api) ? m.api : API_VERSION;
    p.requires = m.requires && typeof m.requires === 'object' ? Object.fromEntries(Object.entries(m.requires).filter(([k]) => ID_RE.test(k)).map(([k, v]) => [k, String(v)])) : {};
    p.after = Array.isArray(m.after) ? m.after.filter(x => ID_RE.test(x)) : [];
    p.conflicts = Array.isArray(m.conflicts) ? m.conflicts.filter(x => ID_RE.test(x)) : [];
    p.scope = m.scope === 'network' ? 'network' : 'client';
    let files = [];
    try { files = filesOf(root); } catch (e) { p.errors.push(e.message === 'too big' ? 'la cartella supera 60 MB' : 'la cartella ha troppi file'); return p; }
    const has = f => files.includes(f);
    p.style = typeof m.style === 'string' ? m.style : has('style.css') ? 'style.css' : null;
    p.client = typeof m.client === 'string' ? m.client : has('client.js') ? 'client.js' : null;
    if (p.style && !has(p.style)) { p.errors.push(`manca il file ${p.style}`); p.style = null; }
    if (p.client && !has(p.client)) { p.errors.push(`manca il file ${p.client}`); p.client = null; }
    p.access = !p.client ? 'none' : m.access === 'full' ? 'full' : 'sandbox';
    p.permissions = Array.isArray(m.permissions) ? m.permissions.filter(x => typeof x === 'string').slice(0, 40) : [];
    for (const x of p.permissions) if (!KNOWN_PERMISSIONS.includes(x)) p.warnings.push(`permesso sconosciuto: ${x}`);
    p.locales = files.filter(f => /^locales\/[a-z]{2}\.json$/.test(f)).map(f => f.slice(8, 10));
    p.compendium = files.some(f => /^data\/compendium\/[^/]+\/pacchetto\.json$/.test(f));
    p.settings = Array.isArray(m.settings) ? m.settings.slice(0, 30) : [];
    p.kinds = [p.style && 'theme', p.compendium && 'data', p.client && 'code'].filter(Boolean);
    if (!p.kinds.length) p.warnings.push('non contiene niente da applicare (style.css, client.js o data/compendium)');
    if (p.api > API_VERSION) p.errors.push(`usa l'API dei plugin ${p.api}: questa versione di LIBRE VTT conosce la ${API_VERSION}`);
    if (appVersion && !satisfies(appVersion, p.libreVtt)) p.errors.push(`serve LIBRE VTT ${p.libreVtt}`);
    p.hash = hashOf(root, files);
    p.files = files.length;
    p.bytes = files.reduce((n, f) => { try { return n + fs.statSync(path.join(root, f)).size; } catch { return n; } }, 0);
    return p;
  }

  /** Every plugin in the folder, with its state and why it is (or is not) running (cached for a moment:
   *  the table asks for every file it loads). */
  let cache = { at: 0, v: null };
  function list() {
    if (cache.v && Date.now() - cache.at < 1500) return cache.v;
    const v = scan();
    cache = { at: Date.now(), v };
    return v;
  }
  function scan() {
    let folders = [];
    try { folders = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name); } catch {}
    const all = folders.map(readPlugin);
    const seen = new Map();
    for (const p of all) {
      if (seen.has(p.id)) p.errors.push(`stesso id di «${seen.get(p.id).folder}»`);
      else seen.set(p.id, p);
    }
    const st = readState();
    const pos = id => { const i = st.order.indexOf(id); return i < 0 ? 1e6 : i; };
    all.sort((a, b) => pos(a.id) - pos(b.id) || a.folder.localeCompare(b.folder));
    for (const p of all) {
      p.applied = st.applied.includes(p.id);
      p.consented = p.access !== 'full' || (!!p.hash && st.consent[p.id] === p.hash);
      p.consentOld = p.access === 'full' && !!st.consent[p.id] && st.consent[p.id] !== p.hash;
      p.shared = !!st.shared[p.id];
      p.sharedRequired = !!(st.shared[p.id] && st.shared[p.id].required);
    }
    resolve(all);
    return all;
  }

  // dependencies, conflicts, order: who actually runs, and why not
  function resolve(all) {
    const byId = new Map(all.filter(p => !p.errors.length).map(p => [p.id, p]));
    let changed = true;
    for (const p of all) {
      p.blocked = p.errors.length ? p.errors[0] : !p.applied ? '' : !p.consented ? (p.consentOld ? 'i file sono cambiati: serve un nuovo consenso' : 'serve il consenso per l\'accesso completo') : '';
    }
    while (changed) {                                   // a plugin that needs a blocked one is blocked too
      changed = false;
      for (const p of all) {
        if (!p.applied || p.blocked) continue;
        for (const [dep, range] of Object.entries(p.requires || {})) {
          const d = byId.get(dep);
          const why = !d ? `serve il plugin «${dep}»` : !satisfies(d.version, range) ? `serve «${dep}» ${range}` : !d.applied ? `serve il plugin «${dep}» applicato` : d.blocked ? `«${dep}» non è attivo` : '';
          if (why) { p.blocked = why; changed = true; break; }
        }
      }
    }
    const running = all.filter(p => p.applied && !p.blocked);
    for (const p of running) {                          // conflicts: the one further down the list loses
      if (p.blocked) continue;
      for (const q of running) {
        if (q === p || q.blocked || all.indexOf(q) > all.indexOf(p)) continue;
        if ((p.conflicts || []).includes(q.id) || (q.conflicts || []).includes(p.id)) { p.blocked = `in conflitto con «${q.id}»`; break; }
      }
    }
    // final order: the user's order, but dependencies and «after» first
    const ok = all.filter(p => p.applied && !p.blocked), out = [], doing = new Set(), done = new Set();
    const okIds = new Map(ok.map(p => [p.id, p]));
    const visit = p => {
      if (done.has(p.id)) return;
      if (doing.has(p.id)) { p.warnings.push('giro di dipendenze: ordine spezzato'); return; }
      doing.add(p.id);
      for (const d of [...Object.keys(p.requires || {}), ...(p.after || [])]) if (okIds.has(d)) visit(okIds.get(d));
      doing.delete(p.id); done.add(p.id); out.push(p);
    };
    ok.forEach(visit);
    out.forEach((p, i) => { p.running = true; p.loadIndex = i; });
    return out;
  }

  /** What the table applies, in order. */
  function active() {
    return list().filter(p => p.running).sort((a, b) => a.loadIndex - b.loadIndex).map(p => ({
      id: p.id, name: p.name, version: p.version, hash: p.hash, access: p.access, permissions: p.permissions,
      style: p.style, client: p.client, locales: p.locales, compendium: p.compendium, scope: p.scope, settings: p.settings
    }));
  }
  function folderOf(id) {
    if (!ID_RE.test(String(id))) return null;
    const p = list().find(x => x.id === id && !x.errors.length);
    return p ? path.join(dir, p.folder) : null;
  }
  /** The file of an applied, running plugin (null otherwise). */
  function runningFile(id, rel) {
    if (!ID_RE.test(String(id)) || !rel || rel.split('/').some(s => !s || s.startsWith('.'))) return null;
    const p = list().find(x => x.id === id && x.running);
    return p ? safeJoin(path.join(dir, p.folder), rel) : null;
  }

  // ---------- changes from the launcher ----------
  function setApplied(id, on) {
    const s = readState();
    s.applied = s.applied.filter(x => x !== id);
    if (on) s.applied.push(id);
    if (!s.order.includes(id)) s.order.push(id);
    return writeState(s);
  }
  function setOrder(ids) {
    const s = readState();
    const clean = ids.filter(x => ID_RE.test(x));
    s.order = [...new Set([...clean, ...s.order])];
    return writeState(s);
  }
  function giveConsent(id, hash, typed) {
    const p = list().find(x => x.id === id);
    if (!p || p.access !== 'full') throw new Error('plugin non trovato');
    if (p.hash !== hash) throw new Error('i file del plugin sono cambiati mentre lo guardavi: riprova');
    const names = [p.id, ...(typeof p.name === 'string' ? [p.name] : Object.values(p.name || {}))].map(x => String(x).trim().toLowerCase());
    if (!names.includes(String(typed || '').trim().toLowerCase())) throw new Error('il nome scritto non corrisponde');
    const s = readState();
    s.consent[id] = hash;
    if (!s.applied.includes(id)) s.applied.push(id);
    if (!s.order.includes(id)) s.order.push(id);
    return writeState(s);
  }
  function revokeConsent(id) {
    const s = readState();
    delete s.consent[id];
    s.applied = s.applied.filter(x => x !== id);
    return writeState(s);
  }

  // ---------- sharing with the players (the master hosts) ----------
  /** Share (or stop sharing) a plugin with the players; `required`: nobody enters without it. */
  function setShared(id, on, required) {
    if (!ID_RE.test(String(id))) throw new Error('plugin non trovato');
    const s = readState();
    if (on) s.shared[id] = { required: !!required };
    else delete s.shared[id];
    return writeState(s);
  }
  /** What the players are offered: the shared plugins that are running here, in the table's order. */
  function sharedList() {
    return list().filter(p => p.running && p.shared).sort((a, b) => a.loadIndex - b.loadIndex).map(p => ({
      id: p.id, name: p.name, description: p.description, version: p.version, author: p.author, license: p.license,
      hash: p.hash, access: p.access, permissions: p.permissions, style: p.style, client: p.client, locales: p.locales,
      kinds: p.kinds.filter(k => k !== 'data'), bytes: p.bytes, required: p.sharedRequired, tooBig: p.bytes > MAX_SHARE
    }));
  }
  /** Every file of a shared plugin, read now, with the fingerprint of exactly these bytes (the player checks
   *  it, and its consent is tied to it). null if it is not shared, not running, changed, or too big. */
  function sharedPack(id, hash) {
    const p = list().find(x => x.id === id && x.running && x.shared);
    if (!p || p.hash !== hash || p.bytes > MAX_SHARE) return null;
    const root = path.join(dir, p.folder);
    let files; try { files = filesOf(root); } catch { return null; }
    const h = crypto.createHash('sha256'), out = [];
    for (const f of files) {
      const b = fs.readFileSync(path.join(root, f));
      h.update(f + '\0'); h.update(b); h.update('\0');
      out.push([f, b]);
    }
    return h.digest('hex') === hash ? out : null;
  }

  /** A new plugin from a template folder (examples/plugins/<template>), with a free id. */
  function createFrom(templateDir, wantedId) {
    fs.mkdirSync(dir, { recursive: true });
    let base = String(wantedId || path.basename(templateDir)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'plugin';
    let id = base, i = 2;
    const taken = new Set(list().map(p => p.id));
    while (taken.has(id) || fs.existsSync(path.join(dir, id))) id = base + '-' + i++;
    fs.cpSync(templateDir, path.join(dir, id), { recursive: true });
    cache = { at: 0, v: null };
    const mf = path.join(dir, id, 'plugin.json');
    try { const m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.id = id; fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n'); } catch {}
    return id;
  }
  /** Copies a folder already extracted (from a .zip) into the plugins folder: plugin.json can be at its top or one level down. */
  function installFolder(extracted) {
    let root = extracted;
    if (!fs.existsSync(path.join(root, 'plugin.json'))) {
      const subs = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('__MACOSX'));
      const one = subs.find(e => fs.existsSync(path.join(root, e.name, 'plugin.json')));
      if (!one) throw new Error('nello zip non c\'è un plugin.json');
      root = path.join(root, one.name);
    }
    let m; try { m = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')); } catch { throw new Error('plugin.json non è un JSON valido'); }
    if (!ID_RE.test(String(m.id || ''))) throw new Error('«id» del plugin non valido');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, m.id);
    const old = list().find(p => p.id === m.id);
    if (old) {                                          // an update: the old folder goes to the bin
      const bin = path.join(dir, '.cestino');
      fs.mkdirSync(bin, { recursive: true });
      fs.renameSync(path.join(dir, old.folder), path.join(bin, old.folder + '-' + Date.now().toString(36)));
    }
    fs.cpSync(root, dest, { recursive: true });
    cache = { at: 0, v: null };
    return m.id;
  }

  /** Takes a plugin off the list: its folder goes to the bin (the system Trash when the launcher passes
   *  `toBin`, otherwise Plugins/.cestino) and it is forgotten in the state (applied, order, consent).
   *  By folder, so a broken plugin, or one of two with the same id, can be removed on its own. */
  async function remove(folder, toBin) {
    const p = list().find(x => x.folder === folder);
    const from = p && safeJoin(dir, p.folder);
    if (!from || from === dir) throw new Error('plugin non trovato');
    if (toBin) await toBin(from);
    else {
      const bin = path.join(dir, '.cestino');
      fs.mkdirSync(bin, { recursive: true });
      fs.renameSync(from, path.join(bin, p.folder + '-' + Date.now().toString(36)));
    }
    cache = { at: 0, v: null };
    if (!list().some(x => x.id === p.id)) {             // another folder with the same id keeps its state
      const s = readState();
      s.applied = s.applied.filter(x => x !== p.id);
      s.order = s.order.filter(x => x !== p.id);
      delete s.consent[p.id];
      writeState(s);
    }
    return p.id;
  }

  return { dir, list, active, folderOf, runningFile, readState, setApplied, setOrder, giveConsent, revokeConsent, setShared, sharedList, sharedPack, createFrom, installFolder, remove };
}

/** The fingerprint of a plugin from its files ([[path, Buffer]], sorted by path): the same as the folder's. */
function hashFiles(files) {
  const h = crypto.createHash('sha256');
  for (const [f, b] of files) { h.update(f + '\0'); h.update(b); h.update('\0'); }
  return h.digest('hex');
}

module.exports = { createPlugins, cleanCss, satisfies, hashFiles, KNOWN_PERMISSIONS, API_VERSION, ID_RE, MAX_SHARE };
