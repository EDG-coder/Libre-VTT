'use strict';
// ---------- Il giocatore, col master spento ----------
// Il ponte del giocatore (game-server.js in «join») tiene una copia dell'ultimo mondo che ha visto, per
// campagna, e un registro delle modifiche fatte mentre il master non c'è. Quando il master torna il registro
// gli arriva e lui decide che cosa applicare (vedi «Il master non c'è» in game-server.js).
//
// Si può fare solo quello che il master ha ammesso (welcome.off): chat, schede proprie, dadi (provvisori),
// spostare i propri segnalini, note di gruppo. Il resto riceve «denied» come qualunque altra cosa vietata.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const VERS = require('../condiviso/versioni.js');

const STANDARD = Object.freeze({ chat: true, schede: true, dadi: false, segnalini: false, note: false });
const MAX_CAMBI = 500, MAX_BYTE = 1.5 * 1024 * 1024;
const NIENTE = new Set(['ping', 'righello', 'area', 'percorso.prova', 'asset.put', 'asset.have', 'asset.get', 'asset.preso']);   // senza il master non servono

module.exports = function creaOffline({ dir, id }) {
  const fSnap = path.join(dir, id + '.snap.json'), fLog = path.join(dir, id + '.log.json');
  const leggi = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const scrivi = (f, v) => {
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); }
    catch (e) { console.error('offline', e.message); }
  };
  const nuovoId = () => crypto.randomBytes(6).toString('hex');

  let you = null, cfg = { ...STANDARD }, P = null, ver = 0, chat = [], caricato = false, sporco = false, timer = 0;
  let inCorso = false;                                  // si sta lavorando senza il master
  let log = leggi(fLog);
  if (!log || !Array.isArray(log.cambi) || !/^[a-f0-9]{12}$/.test(String(log.id))) log = { id: nuovoId(), cambi: [] };
  const salvaLog = () => { if (log.cambi.length) scrivi(fLog, log); else { try { fs.unlinkSync(fLog); } catch {} log = { id: nuovoId(), cambi: [] }; } };

  function carica() {
    if (P) return true;
    if (caricato) return false;
    caricato = true;
    const s = leggi(fSnap);
    if (s && s.world && s.you && s.you.token) {
      you = s.you; cfg = { ...STANDARD, ...(s.cfg || {}) };
      P = VERS.pezzi(s.world); ver = 0;
      chat = Array.isArray(s.world.chat) ? s.world.chat : [];
    }
    return !!P;
  }
  const mondo = () => { const w = VERS.ricomponi(P); w.chat = chat; return w; };
  function salvaSnap() {
    clearTimeout(timer); timer = 0;
    if (!sporco || !P || !you || you.role === 'master') return;
    sporco = false;
    scrivi(fSnap, { v: 1, t: Date.now(), you, cfg, world: mondo() });
  }
  const sporca = () => { sporco = true; if (!timer) { timer = setTimeout(salvaSnap, 10000); if (timer.unref) timer.unref(); } };

  const cercaScheda = sid => { for (const [k, v] of P) if (k.startsWith('sh:') && v && v.id === sid) return v; return null; };
  const mia = s => !!s && (s.owner === you.token || s._access === 'rw');

  /** Quello che il ponte vede passare dall'host verso il browser: tiene la copia al passo. */
  function segui(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        if (msg.offline) return;
        if (msg.you && msg.you.token) you = { token: msg.you.token, firma: msg.you.firma || null, name: msg.you.name, role: msg.you.role, perms: msg.you.perms, campagna: msg.you.campagna };
        if (msg.off) cfg = { ...STANDARD, ...msg.off };
        if (msg.world) mondo_(msg.world, msg.ver);
        else if (P) {
          for (const x of msg.chatDopo || []) chatAgg(x);
          for (const x of msg.chatSvelati || []) chatAgg(x);
          for (const i of msg.chatVia || []) chat = chat.filter(x => x.id !== i);
        }
        sporca(); return;
      case 'world': mondo_(msg.world, msg.ver); sporca(); return;
      case 'delta': if (P && msg.da === ver) { VERS.applica(P, msg); ver = msg.a; sporca(); } return;
      case 'you': if (msg.you && you) { you = { ...you, name: msg.you.name || you.name, role: msg.you.role || you.role, perms: msg.you.perms || you.perms }; sporca(); } return;
      case 'offline.cfg': if (msg.cfg) { cfg = { ...STANDARD, ...msg.cfg }; sporca(); } return;
      case 'chat': chatAgg(msg.msg); sporca(); return;
      case 'chat.upd': if (msg.msg && msg.msg.id) { const i = chat.findIndex(x => x.id === msg.msg.id); if (i >= 0) chat[i] = msg.msg; sporca(); } return;
      case 'chat.del': chat = chat.filter(x => x.id !== msg.id); sporca(); return;
    }
  }
  function mondo_(w, v) {
    if (!w || typeof w !== 'object') return;
    caricato = true;                                  // da qui vale il mondo vero, non la copia su disco
    chat = Array.isArray(w.chat) ? w.chat.slice(-250) : [];
    P = VERS.pezzi(w); ver = v || 0;
  }
  function chatAgg(m) {
    if (!m || !m.id || chat.some(x => x.id === m.id)) return;
    chat.push(m); if (chat.length > 250) chat.shift();
  }

  function permessi() {
    const p = { ...(you.perms || {}) };
    p.chat = !!(p.chat && cfg.chat);
    p.roll = !!(p.roll && cfg.dadi);
    p.moveOwnTokens = !!(p.moveOwnTokens && cfg.segnalini);
    for (const k of ['moveAnyToken', 'createTokens', 'uploadTokenImage', 'uploadAssets', 'revealFog', 'editScene', 'editAnySheet', 'controlMusic']) p[k] = false;
    return p;
  }

  /** Il «welcome» finto: la copia che avevamo, con i soli permessi ammessi senza il master. */
  function benvenuto(c) {
    if (!carica() || !you || you.role === 'master') return null;
    const w = mondo();
    w.dadiProvvisori = !!cfg.dadi;
    if (w.notes) w.notes = { ...w.notes, editable: !!(w.notes.editable && cfg.note) };
    if (!cfg.schede) w.sheets = (w.sheets || []).map(s => ({ ...s, _access: s._access ? 'ro' : s._access }));
    inCorso = true;
    return { t: 'welcome', needName: false, offline: true, nOff: log.cambi.length, off: cfg, sa: ['ok'], ora: Date.now(),
      you: { ...you, id: c.id, perms: permessi() }, world: w };
  }

  function aggiungi(c) {
    // un cambio per volta: se il registro è troppo grosso si dice di no
    if (log.cambi.length >= MAX_CAMBI || JSON.stringify(log.cambi).length > MAX_BYTE) return false;
    return true;
  }

  /** Un intento del browser, col master spento. */
  function intento(c, m) {
    const q = typeof m.q === 'string' ? m.q : undefined;
    const ok = () => { if (q) c.send({ t: 'ok', q }); };
    const no = why => c.send({ t: 'denied', op: m.op, reason: why, q });
    if (NIENTE.has(m.op)) return;
    if (!P || !you) return no('il master non c\'è');
    const quando = Date.now();
    switch (m.op) {
      case 'chat': {
        if (!permessi().chat) return no('il master non ammette la chat quando non c\'è');
        if (m.to) return no('i sussurri funzionano solo quando c\'è il master');
        const text = String(m.text == null ? '' : m.text).slice(0, 2000).trim();
        if (!text) return ok();
        if (!aggiungi(c)) return no('troppe cose in attesa: aspetta che torni il master');
        const msg = { id: 'off-' + crypto.randomBytes(4).toString('hex'), ts: quando, kind: 'text', text, by: you.name, byId: you.token, offline: true };
        chatAgg(msg); sporca();
        log.cambi.push({ op: 'chat', text, ts: quando }); salvaLog();
        c.send({ t: 'chat', msg }); return ok();
      }
      case 'roll.prov': {
        if (!permessi().roll) return no('il master non ammette i dadi quando non c\'è');
        if (m.cieco || !Array.isArray(m.dadi) || m.dadi.length > 200 || !aggiungi(c)) return no('tiro non valido');
        log.cambi.push({ op: 'roll.prov', expr: String(m.expr || '').slice(0, 200), label: String(m.label || '').slice(0, 80), dadi: m.dadi.map(Number), secret: !!m.secret, ts: +m.quando > 0 ? +m.quando : quando });
        salvaLog(); return ok();
      }
      case 'sheet.save': {
        if (!cfg.schede) return no('il master non ammette le modifiche alle schede quando non c\'è');
        const s = cercaScheda(String(m.id || ''));
        if (!s || !mia(s)) return no('questa scheda non è tua');
        const cambiati = {}, base = {}, vecchi = s.f || {};
        if (m.f && typeof m.f === 'object' && !Array.isArray(m.f)) {
          for (const k of Object.keys(m.f)) if (JSON.stringify(m.f[k]) !== JSON.stringify(vecchi[k])) { cambiati[k] = m.f[k]; base[k] = vecchi[k] === undefined ? null : vecchi[k]; }
        }
        const nome = typeof m.name === 'string' && m.name.slice(0, 60) !== s.name ? m.name.slice(0, 60) : undefined;
        if (!Object.keys(cambiati).length && nome === undefined) return ok();
        let e = log.cambi.find(x => x.op === 'sheet.save' && x.id === s.id);
        if (!e) { if (!aggiungi(c)) return no('troppe cose in attesa: aspetta che torni il master'); e = { op: 'sheet.save', id: s.id, f: {}, base: {}, ts: quando }; log.cambi.push(e); }
        for (const k of Object.keys(cambiati)) { e.f[k] = cambiati[k]; if (!(k in e.base)) e.base[k] = base[k]; }
        if (nome !== undefined) e.name = nome;
        e.ts = quando;
        s.f = { ...vecchi, ...cambiati }; if (nome !== undefined) s.name = nome;
        sporca(); salvaLog(); return ok();
      }
      case 'sheet.add': {
        if (!cfg.schede) return no('il master non ammette le schede nuove quando non c\'è');
        const d = m.sheet && typeof m.sheet === 'object' ? m.sheet : null;
        if (!d || !d.id || cercaScheda(String(d.id)) || !aggiungi(c)) return ok();
        const f = d.f && typeof d.f === 'object' && !Array.isArray(d.f) ? JSON.parse(JSON.stringify(d.f)) : {};
        const nuova = { id: String(d.id).slice(0, 60), name: String(d.name || '').slice(0, 60), tpl: d.tpl != null ? String(d.tpl).slice(0, 60) : undefined, f };
        P.set('sh:' + nuova.id, { ...nuova, owner: you.token, _access: 'rw' });
        P.set('sho', (P.get('sho') || []).concat(nuova.id));
        log.cambi.push({ op: 'sheet.add', sheet: nuova, ts: quando });
        sporca(); salvaLog(); return ok();
      }
      case 'token.move': {
        if (!permessi().moveOwnTokens) return no('il master non ammette gli spostamenti quando non c\'è');
        const sc = String(m.scene || P.get('k:active') || '');
        const ph = P.get('ph:' + sc + ':' + String(m.id || ''));
        const sh = ph && ph.sheet ? cercaScheda(ph.sheet) : null;
        if (!ph || !(ph.owner === you.token || mia(sh))) return no('non è un tuo segnalino');
        const pos = m.pos && typeof m.pos === 'object' ? m.pos : {};
        ph.l = +pos.l || 0; ph.t = +pos.t || 0;
        let e = log.cambi.find(x => x.op === 'token.move' && x.scene === sc && x.id === ph.id);
        if (!e) { if (!aggiungi(c)) return no('troppe cose in attesa: aspetta che torni il master'); e = { op: 'token.move', scene: sc, id: ph.id, ts: quando }; log.cambi.push(e); }
        e.pos = { l: ph.l, t: ph.t, w: +pos.w > 0 ? +pos.w : undefined, h: +pos.h > 0 ? +pos.h : undefined, rot: typeof pos.rot === 'number' ? pos.rot : undefined };
        e.ts = quando; sporca(); salvaLog(); return ok();
      }
      case 'notes.save': {
        const n = P.get('k:notes');
        if (!cfg.note || !n || !n.editable) return no('le note di gruppo non si scrivono quando il master non c\'è');
        const text = String(m.text == null ? '' : m.text).slice(0, 20000);
        let e = log.cambi.find(x => x.op === 'notes.save');
        if (!e) { if (!aggiungi(c)) return no('troppe cose in attesa: aspetta che torni il master'); e = { op: 'notes.save' }; log.cambi.push(e); }
        e.text = text; e.ts = quando;
        P.set('k:notes', { ...n, text }); sporca(); salvaLog(); return ok();
      }
      default: return no('non si può fare finché il master non c\'è');
    }
  }

  /** Quello che aspetta di essere mandato: { id, cambi } (l'id dice fin dove, per sapere cosa togliere dopo). */
  function pacco() {
    if (!log.cambi.length) return null;
    return { id: log.id + '.' + log.cambi.length, cambi: log.cambi.slice() };
  }
  /** L'host ha confermato: via quello che aveva ricevuto. Quanti ne ha tolti. */
  function ricevuto(idp) {
    const m = /^([a-f0-9]{12})\.(\d{1,4})$/.exec(String(idp || ''));
    if (!m || m[1] !== log.id) return 0;
    const n = Math.min(+m[2], log.cambi.length);
    log.cambi.splice(0, n);
    if (log.cambi.length) log.id = nuovoId();          // quello che resta è un registro nuovo (l'host conta per prefisso)
    salvaLog();
    return n;
  }

  return {
    segui, benvenuto, intento, pacco, ricevuto,
    disponibile: () => carica(),
    /** Il mondo vero lo abbiamo in memoria, aggiornato a una versione nota? (altrimenti va chiesto intero) */
    haMondo: () => !!P && caricato && ver > 0,
    get inCorso() { return inCorso; },
    fine() { inCorso = false; },
    salvaOra() { salvaSnap(); },
    inAttesa: () => log.cambi.length
  };
};
