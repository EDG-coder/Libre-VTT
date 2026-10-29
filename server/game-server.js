// ---------- Server di gioco: l'unica fonte vera dei dati ----------
// Senza dipendenze, come il server dei file. Si avvia in due modi:
//
//   node server/game-server.js host          il master: tiene lo stato, decide, tira i dadi
//   node server/game-server.js join          un giocatore: fa solo da ponte verso uffa-link
//
// Porte (tutte e due i modi):
//   4000  pannello di controllo (http) e collegamento del browser (ws://127.0.0.1:4000/ws)
//   4010  porta di servizio per uffa-link (solo in «host»: ci arrivano i giocatori da iroh)
//
// Il browser parla sempre con 127.0.0.1:4000, sia che tu sia il master sia che tu sia
// un giocatore. Chi comanda è deciso qui, non dal browser.

'use strict';
const http = require('http'), net = require('net'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const LUCE = require('../condiviso/luce-calcolo.js');
const VERS = require('../condiviso/versioni.js');

const MODE = (process.argv[2] || 'host').toLowerCase();
const PORT = +(process.env.PORT || 4000);
const LINK_PORT = +(process.env.LINK_PORT || 4010);
const ROOT = path.join(__dirname, '..');           // la cartella del programma
const WEB = path.join(ROOT, 'web');                // le pagine (qui: il pannello e le traduzioni)
// DATA_DIR serve a tenere separati i dati quando sulla stessa macchina girano host e giocatore.
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
// uffa-link scrive qui l'ID della sessione (nella sua cartella di lavoro): il pannello lo legge.
const LINK_ID_FILE = process.env.LINK_ID_FILE || path.join(ROOT, 'uffa-link.id');
fs.mkdirSync(DATA, { recursive: true });

// ---------- Deposito dei file, indirizzati per contenuto ----------
// Una mappa caricata dal master finisce qui una volta sola, con il nome dato dal suo hash.
// Il mondo la cita con «gs:<hash>», e il ponte del giocatore se la fa mandare dall'host.
const ASSETS = path.join(DATA, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });
const MIME_EXT = { 'application/json': '.json', 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
const MAX_ASSET = 12 * 1024 * 1024;
const isHash = h => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h);

let assetIndex = {};
try { assetIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'assets.json'), 'utf8')) || {}; } catch {}
const saveAssetIndex = () => { try { fs.writeFileSync(path.join(DATA, 'assets.json'), JSON.stringify(assetIndex)); } catch {} };
const assetFile = h => assetIndex[h] ? path.join(ASSETS, h + assetIndex[h].ext) : null;
const haveAsset = h => { const f = assetFile(h); return !!(f && fs.existsSync(f)); };
function storeAsset(buf, mime, name) {
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const ext = MIME_EXT[mime] || '.bin';
  if (!haveAsset(hash)) {
    try { fs.writeFileSync(path.join(ASSETS, hash + ext), buf); } catch (e) { console.error('asset', e.message); return null; }
    assetIndex[hash] = { ext, mime: mime || 'application/octet-stream', name: String(name || '').slice(0, 80), bytes: buf.length, t: Date.now() };
    saveAssetIndex();
  }
  return hash;
}

// ======================= Permessi =======================
// Ogni permesso è una variabile con un nome, non un numero: si legge e si cambia a vista.
const PERMS = Object.freeze([
  'chat',             // scrivere in chat
  'roll',             // tirare i dadi
  'ping',             // segnare un punto sulla mappa
  'draw',             // disegnare con la penna
  'moveOwnTokens',    // spostare i segnalini dei propri personaggi
  'moveAnyToken',     // spostare qualsiasi segnalino
  'createTokens',     // creare segnalini (per sé)
  'uploadTokenImage', // caricare una foto, ma solo come segnalino
  'uploadAssets',     // caricare immagini negli assets condivisi
  'seeHiddenLayer',   // vedere il livello nascosto
  'seeAllScenes',     // vedere le scene che non sono quella in vista
  'revealFog',        // scoprire la nebbia
  'editScene',        // cambiare scena, sfondo, griglia
  'editAnySheet',     // aprire e modificare le schede degli altri
  'controlMusic'      // scegliere la musica per tutti
]);
const ALL = v => Object.fromEntries(PERMS.map(p => [p, v]));

const ROLE_DEFAULTS = Object.freeze({
  master: Object.freeze(ALL(true)),
  // Un giocatore fa le cose normali di un giocatore, e niente che tocchi gli altri.
  player: Object.freeze({ ...ALL(false), chat: true, roll: true, ping: true, moveOwnTokens: true, createTokens: true, uploadTokenImage: true }),
  // Chi guarda e basta.
  spectator: Object.freeze({ ...ALL(false), chat: true })
});

/** I permessi effettivi: quelli del ruolo, più le eccezioni decise dal master. */
function permsOf(rec) {
  const base = ROLE_DEFAULTS[rec.role] || ROLE_DEFAULTS.player;
  const out = { ...base };
  for (const [k, v] of Object.entries(rec.overrides || {})) if (PERMS.includes(k)) out[k] = !!v;
  if (rec.role === 'master') return Object.freeze(ALL(true));     // il master può sempre tutto
  return Object.freeze(out);
}

// ======================= Stato salvato =======================
const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return dflt; } };
function writeJson(f, v) {
  const p = path.join(DATA, f);
  try { fs.writeFileSync(p + '.tmp', JSON.stringify(v)); fs.renameSync(p + '.tmp', p); } catch (e) { console.error('salvataggio', f, e.message); }
}

// Il documento del mondo: è quello che il master manda e che tutti ricevono (filtrato).
let world = readJson('world.json', null) || {};
world = Object.assign({ v: 1, active: null, publicScene: null, scenes: [], sheets: [], chat: [], music: null, fog: {} }, world);
const newId = pre => pre + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
// Chi gioca: gettone -> { name, role, overrides, sheets:{id:'r'|'rw'}, lastSeen }
let roster = readJson('players.json', null) || {};
// Le regole d'ingresso e la pausa generale: le decide chi conduce, dal pannello.
let session = Object.assign({ locked: false, approval: false, maxPlayers: 0, paused: false }, readJson('session.json', null) || {});

// Le cose che cambiano il mondo: chi è congelato o in pausa non le può fare.
const MUTATING = new Set(['board', 'token.move', 'scatta', 'token.add', 'token.del', 'fog.set', 'luce.dimentica', 'luce.porta', 'scene.show',
  'sheet.add', 'sheet.save', 'sheet.del', 'music', 'asset.put', 'notes.save', 'notes.edit']);

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { writeJson('world.json', world); writeJson('players.json', roster); writeJson('session.json', session); }, 500);
}

// ======================= Clienti collegati =======================
let nextId = 1;
const actionLog = [];                    // le ultime cose chieste al server
function logAction(c, op, ok, note) {
  actionLog.push({ ts: Date.now(), who: c ? c.name : '-', token: c ? c.token : '', op, ok: !!ok, note: note || '' });
  if (actionLog.length > 300) actionLog.shift();
  panelPush({ t: 'log', entry: actionLog[actionLog.length - 1] });
}
const clients = new Set();      // { id, token, name, role, send(), kind:'ws'|'link', alive }

const recOf = token => (roster[token] ||= { name: '', role: 'player', overrides: {}, sheets: {}, firstSeen: Date.now() });

/** Un nome valido e non già preso. Restituisce null se non va bene com'è. */
function uniqueName(token, raw) {
  const n = String(raw == null ? '' : raw).replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (n.length < 2) return null;
  const taken = new Set(Object.entries(roster)
    .filter(([t]) => t !== token)
    .map(([, r]) => String(r.name || '').toLowerCase()));
  if (!taken.has(n.toLowerCase())) return n;
  for (let i = 2; i < 99; i++) { const c = `${n} ${i}`; if (!taken.has(c.toLowerCase())) return c; }
  return null;
}
const permsFor = c => permsOf(recOf(c.token));
const can = (c, p) => !!permsFor(c)[p];

function playerList() {
  const now = Date.now();
  return [...clients].filter(c => c.token).map(c => {   // un tubo senza saluto non è ancora una persona
    const rec = recOf(c.token);
    return {
      id: c.id, token: c.token, name: c.name, role: c.role, kind: c.kind,
      perms: permsFor(c), sheets: rec.sheets || {},
      muted: !!rec.muted, frozen: !!rec.frozen, banned: !!rec.banned, pending: !!c.pending,
      client: c.client || '?', peer: c.peer || null,
      since: c.since || now, onFor: Math.round((now - (c.since || now)) / 1000),
      rtt: c.rtt == null ? null : c.rtt,
      lastOp: c.lastOp || null, lastAt: c.lastAt || null, ops: c.ops || 0,
      viewScene: c.viewScene || null, viewRect: c.viewRect || null
    };
  });
}
function broadcast(msg, filter) {
  for (const c of clients) if (!filter || filter(c)) c.send(msg);
}
function sendPlayers() {
  const list = playerList();
  broadcast({ t: 'players', list });
  panelPush({ t: 'players', list });
}

// ======================= Che cosa vede ciascuno =======================
// La parte più importante: al giocatore non si manda quello che non deve vedere.
// Non glielo si nasconde con la grafica: non gli arriva proprio.

function fogOf(sceneId) { return world.fog[sceneId] || null; }

/** true se quel punto della mappa è ancora coperto dalla nebbia */
function hiddenByFog(sc, p) {
  const f = fogOf(sc.id);
  if (!f || !f.on || !f.cells) return false;
  const cx = Math.floor((p.l + p.w / 2 - f.x) / f.cell), cy = Math.floor((p.t + p.h / 2 - f.y) / f.cell);
  if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) return true;
  return f.cells[cy * f.cols + cx] !== '1';
}

// ======================= Illuminazione dinamica (luce-calcolo.js) =======================
// La visuale del party la calcola qui il server: ai giocatori arrivano solo i poligoni di quello che
// vedono (e il «già visto»), mai i muri e le luci della scena. Dove la luce non arriva, i segnalini
// degli altri non vengono nemmeno mandati.
const luceDi = sc => sc && sc.luce && sc.luce.on ? LUCE.pulisci(sc.luce) : null;
/** Una casella della nebbia è «zona di luce dinamica»? Se il master non ne ha segnata nessuna, vale tutta la mappa. */
function inZona(sc, x, y) {
  const f = fogOf(sc.id);
  if (!f || !f.zona || f.zona.indexOf('1') < 0) return true;
  const cx = Math.floor((x - f.x) / f.cell), cy = Math.floor((y - f.y) / f.cell);
  if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) return false;
  return f.zona[cy * f.cols + cx] === '1';
}
const centro = ph => [ph.l + ph.w / 2, ph.t + ph.h / 2];
const schedaDi = ph => ph.sheet && (world.sheets || []).find(s => s.id === ph.sheet);
/** I segnalini del party: quelli dei giocatori (o con la scheda affidata a un giocatore), o segnati a mano dal master. */
function delParty(sc, ph) {
  if ((ph.layer || 'tokens') !== 'tokens' || ph.shape) return false;
  if (ph.party === true) return true;
  if (ph.party === false) return false;
  if (tokenOwner(sc, ph)) return true;
  const sh = schedaDi(ph);
  return !!(sh && Object.values(roster).some(r => r.role !== 'master' && r.sheets && r.sheets[sh.id] === 'rw'));
}
const viste = new Map();                // scena → { chiave, vista }
const visti = new Map();                // scena → griglia del «già visto» (Uint8Array dentro)
function grigliaVisto(sc, board, cella) {
  let g = visti.get(sc.id);
  const ok = g && g.x === board.x && g.y === board.y && g.cols === Math.ceil(board.w / g.q) && g.rows === Math.ceil(board.h / g.q) && g.q === Math.max(4, cella / 4);
  if (ok) return g;
  g = LUCE.griglia(board, cella);
  const salvato = world.visto && world.visto[sc.id];
  if (salvato && salvato.x === g.x && salvato.y === g.y && salvato.cols === g.cols && salvato.rows === g.rows) g.d = LUCE.espandi(salvato.rle, g.d.length);
  visti.set(sc.id, g);
  return g;
}
/** La vista del party nella scena (ricalcolata solo se è cambiato qualcosa che conta). Con la visione
 *  non condivisa ognuno ha la sua: solo i suoi segnalini (c = chi guarda). */
function vistaDi(sc, c) {
  const luce = luceDi(sc);
  if (!luce) return null;
  const board = sc.board || { x: 0, y: 0, w: 1000, h: 1000 };
  const cella = (sc.grid && +sc.grid.size) || 50;
  const occhi = [], luciT = [];
  for (const ph of sc.photos || []) {
    if ((ph.layer || 'tokens') !== 'tokens' || ph.shape) continue;
    const [x, y] = centro(ph);
    if (ph.luce && (ph.luce.r > 0 || ph.luce.rf > 0)) luciT.push({ x, y, r: Math.min(200, +ph.luce.r || 0), rf: Math.min(200, +ph.luce.rf || 0), col: /^#[0-9a-f]{6}$/i.test(ph.luce.col || '') ? ph.luce.col : '#ffd27a' });
    if (delParty(sc, ph) && (luce.condivisa || !c || isTheirs(c, sc, ph))) occhi.push({ x, y, scuro: ph.scuro != null ? Math.max(0, Math.min(200, +ph.scuro || 0)) : LUCE.scurovisione(schedaDi(ph) && schedaDi(ph).f, world.unita) });
  }
  const chi = luce.condivisa || !c ? sc.id : sc.id + '|' + (c.token || c.id);   // di chi è il «già visto»
  const chiave = JSON.stringify([luce, board, cella, occhi, luciT]);
  const v = viste.get(chi);
  if (v && v.chiave === chiave) return v.vista;
  const vista = LUCE.vista(luce, board, cella, occhi, luciT);
  vista.ricordo = luce.ricordo; vista.chi = chi;
  viste.set(chi, { chiave, vista });
  // il «già visto» cresce con quello che il party vede adesso
  const g = grigliaVisto({ id: chi }, board, cella);
  if (LUCE.segnaVisto(g, vista)) {
    world.visto = world.visto || {};
    world.visto[chi] = { x: g.x, y: g.y, q: g.q, cols: g.cols, rows: g.rows, rle: LUCE.comprimi(g.d) };
    scheduleSave();
  }
  return vista;
}
/** Le porte che questo giocatore vede (fuori dalla nebbia e nella sua visuale): solo quelle gli arrivano, e solo quelle può aprire. */
function porteVisibili(c, sc) {
  const luce = sc.luce && (sc.luce.on || sc.luce.solidi) ? LUCE.pulisci(sc.luce) : null;
  if (!luce) return [];
  const v = luce.on ? vistaDi(sc, c) : null;
  return luce.muri.filter(w => {
    if (!w.porta) return false;
    const x = (w.x1 + w.x2) / 2, y = (w.y1 + w.y2) / 2;
    if (permsFor(c).revealFog) return true;
    if (v && inZona(sc, x, y)) {
      // la porta si vede se uno dei suoi punti (centro o un po' dentro dai due estremi) è visibile
      const pts = [[x, y], [w.x1 + (x - w.x1) * 0.6, w.y1 + (y - w.y1) * 0.6], [w.x2 + (x - w.x2) * 0.6, w.y2 + (y - w.y2) * 0.6]];
      const nx = -(w.y2 - w.y1), ny = w.x2 - w.x1, L = Math.hypot(nx, ny) || 1, e = 3;
      return pts.some(([px, py]) => LUCE.visibile(v, px + nx / L * e, py + ny / L * e) || LUCE.visibile(v, px - nx / L * e, py - ny / L * e));
    }
    return !hiddenByFog(sc, { l: x, t: y, w: 0, h: 0 });
  }).map(w => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, aperta: w.aperta }));
}
/** Per chi non vede tutto: il segnalino è nascosto (sotto la nebbia, o al buio dove c'è la luce dinamica)? */
function nascostoA(c, sc, ph) {
  if (permsFor(c).revealFog || isTheirs(c, sc, ph)) return false;
  const v = vistaDi(sc, c);
  if (v && (ph.layer || 'tokens') === 'tokens') {
    const [x, y] = centro(ph);
    if (inZona(sc, x, y)) return !LUCE.visibile(v, x, y);
  }
  return hiddenByFog(sc, ph);
}
/** Quello che il giocatore riceve della luce: i poligoni e le porte che vede, mai i muri. */
function lucePerGiocatore(c, sc) {
  const porte = porteVisibili(c, sc);
  const v = vistaDi(sc, c);
  if (!v) return { luce: sc.luce ? { on: false, porte } : undefined, vista: undefined };
  const out = { amb: v.amb, ricordo: v.ricordo, occhi: v.occhi.map(o => ({ x: o.x, y: o.y, scuro: o.scuro, poly: o.poly })), luci: v.luci };
  if (v.ricordo === 'scuro') { const g = visti.get(v.chi); if (g) out.visto = { x: g.x, y: g.y, q: g.q, cols: g.cols, rows: g.rows, rle: LUCE.comprimi(g.d) }; }
  return { luce: { on: true, ambiente: v.amb, ricordo: v.ricordo, porte }, vista: out };
}

// ======================= Movimento dei giocatori: muri e velocità =======================
// Al rilascio (il browser manda solo la posizione finale) il server guarda se ci si arriva: con i muri «non
// attraversabili» cerca un percorso sulla griglia che li giri (le porte aperte si passano). Nelle scene di
// battaglia (tipo «mappa», non cinematiche) un segnalino collegato a una scheda con la Velocità non va oltre
// quella (il doppio con «Scatta»). Con l'ordine dei turni acceso e il segnalino in fila, i passi si sommano
// nel suo turno. Il master non ha limiti.
function turnoDi(sc, ph) {
  const t = world.turni;
  if (!t || !t.on || !Array.isArray(t.righe) || !t.righe.some(r => r.pid === ph.id)) return null;
  return (t.round || 1) + ':' + (t.cur || 0);
}
function velocitaCaselle(ph) {
  const sh = schedaDi(ph);
  if (!sh || !sh.f || !String(sh.f.speed || '').trim()) return null;
  const r = LUCE.leggiDistanza(sh.f.speed, world.unita);
  return r.ok && r.caselle > 0 ? r.caselle : null;
}
function controllaMovimento(sc, ph, pos) {
  const [ax, ay] = centro(ph);
  const bx = (+pos.l || 0) + (pos.w > 0 ? +pos.w : ph.w) / 2, by = (+pos.t || 0) + (pos.h > 0 ? +pos.h : ph.h) / 2;
  if (Math.hypot(bx - ax, by - ay) < 1) return { ok: true, caselle: 0 };
  const muri = sc.luce && sc.luce.solidi ? LUCE.pulisci(sc.luce) : null;
  const battaglia = (sc.type || 'map') !== 'cinematic' && !(sc.luce && sc.luce.velocita === false);
  const vel = battaglia ? velocitaCaselle(ph) : null;
  const turno = vel ? turnoDi(sc, ph) : null;
  if (!muri && !vel) return { ok: true, caselle: 0 };
  const usate = turno && ph.mossoTurno === turno ? +ph.mosso || 0 : 0;
  // «Scatta» vale per il turno in cui l'hai chiesto (senza turni, per un movimento)
  const scatto = ph.scatta === true || (!!turno && ph.scatta === turno);
  const totale = vel ? vel * (scatto ? 2 : 1) : Infinity, resto = Math.max(0, totale - usate);
  const cella = (sc.grid && +sc.grid.size) || 50;
  const strada = LUCE.percorso(muri || { muri: [] }, sc.board, cella, ax, ay, bx, by, resto + 0.01);
  if (!strada) {
    // non trovato: o c'è un muro di mezzo, o è troppo lontano
    const senzaLimite = muri ? LUCE.percorso(muri, sc.board, cella, ax, ay, bx, by) : { caselle: Infinity };
    if (!senzaLimite) return { ok: false, perche: 'di là non ci arrivi: c\'è un muro' };
    return { ok: false, perche: `troppo lontano: ti restano ${+resto.toFixed(1)} caselle` };
  }
  return { ok: true, caselle: strada.caselle, turno };
}

/** Il percorso locale del master non vale per gli altri: fuori va «gs:<hash>». */
const outUrl = o => (o && o.gid) ? { ...o, url: 'gs:' + o.gid, aid: undefined } : o;

function sceneFor(c, sc) {
  const p = permsFor(c);
  const out = { ...sc };
  out.bg = outUrl(sc.bg);
  out.photos = (sc.photos || []).filter(ph => {
    if ((ph.layer || 'tokens') === 'hidden' && !p.seeHiddenLayer) return false;
    // il proprio personaggio si vede sempre, anche se è entrato nella nebbia o è al buio
    if (nascostoA(c, sc, ph)) return false;
    return true;
  }).map(outUrl);
  // la nebbia va mandata comunque: al giocatore serve per dipingere il nero
  out.fog = fogOf(sc.id);
  if (!p.revealFog) Object.assign(out, lucePerGiocatore(c, sc));
  return out;
}

function sheetVisible(c, s) {
  const p = permsFor(c);
  if (p.editAnySheet) return 'rw';
  const rec = recOf(c.token);
  if (s.owner && s.owner === c.token) return 'rw';
  return rec.sheets && rec.sheets[s.id] ? rec.sheets[s.id] : null;
}

// Un disegno arrivato da un giocatore: solo i campi che servono, con valori controllati
// (finisce dentro un SVG sugli schermi di tutti).
function formaPulita(x) {
  if (!x || typeof x !== 'object' || !['rect', 'ellipse', 'tri', 'line', 'path', 'text'].includes(x.t)) return null;
  const n = (v, max) => { const k = +v; return Number.isFinite(k) ? Math.max(0, Math.min(max, k)) : 0; };
  const c = /^#[0-9a-f]{3,8}$/i.test(String(x.c)) ? String(x.c) : '#ff4d4d';
  const sh = { t: x.t, c, sw: n(x.sw, 100), vw: n(x.vw, 20000), vh: n(x.vh, 20000) };
  if (x.t === 'text') { sh.fs = n(x.fs, 400) || 24; sh.txt = String(x.txt || '').slice(0, 2000); }
  else if (x.t === 'path') { const d = String(x.d || ''); if (d.length > 200000 || !/^[MLl0-9.\s-]+$/.test(d)) return null; sh.d = d; }
  else { sh.fill = !!x.fill; sh.fx = !!x.fx; sh.fy = !!x.fy; }
  return sh;
}

// L'ordine dei turni: lo decide il master. Ai giocatori non arrivano i nomi dei segnalini nascosti.
function turniPuliti(t) {
  if (!t || !Array.isArray(t.righe)) return null;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  return {
    on: !!t.on, round: Math.max(1, Math.min(9999, Math.round(+t.round) || 1)), cur: Math.max(0, Math.round(+t.cur) || 0), iniziato: !!t.iniziato,
    righe: t.righe.slice(0, 100).map(r => ({ id: s(r.id, 40), nome: s(r.nome, 60), ini: Number.isFinite(+r.ini) && r.ini !== null && r.ini !== '' ? Math.round(+r.ini) : null,
      sheet: r.sheet ? s(r.sheet, 60) : undefined, pid: r.pid ? s(r.pid, 60) : undefined }))
  };
}
function turniPerChi(c) {
  const t = world.turni;
  if (!t) return null;
  if (permsFor(c).seeHiddenLayer) return t;
  const nascosti = new Set();
  for (const sc of world.scenes || []) for (const ph of sc.photos || []) if ((ph.layer || 'tokens') === 'hidden' || nascostoA(c, sc, ph)) nascosti.add(ph.id);
  const righe = t.righe.filter(r => !(r.pid && nascosti.has(r.pid)));
  // il turno corrente per id: se tocca a un segnalino che il giocatore non vede, nessuna riga è «ora»
  // (prima saltava alla prima riga, come se toccasse a un altro)
  const ora = t.righe[t.cur];
  return { ...t, righe, cur: righe.indexOf(ora), curId: ora ? ora.id : null };
}

function viewFor(c) {
  const p = permsFor(c);
  const pubId = world.publicScene || world.active;
  const scenes = p.seeAllScenes ? (world.scenes || []) : (world.scenes || []).filter(s => s.id === pubId);
  const sheets = (world.sheets || []).map(s => {
    const acc = sheetVisible(c, s);
    return acc ? { ...s, icon: outUrl(s.icon), _access: acc } : null;
  }).filter(Boolean);
  return {
    v: world.v, active: p.seeAllScenes ? world.active : pubId, publicScene: world.publicScene, fogColor: world.fogColor || 'auto',
    scenes: scenes.map(s => sceneFor(c, s)),
    sheets, chat: (world.chat || []).slice(-250).map(m => chatFor(c, m)).filter(Boolean), music: world.music,
    notes: world.notes || { text: '', editable: false },
    sistema: world.sistema || null,
    schedeTolte: p.editAnySheet ? (world.schedeTolte || []).slice(-200) : undefined,
    compendio: world.compendio || null,
    turni: turniPerChi(c)
  };
}
// ======================= Versioni e differenze =======================
// Ogni giocatore ha il suo mondo filtrato. Il server si ricorda, per gettone, l'ultimo mondo che gli ha
// mandato (a pezzi: condiviso/versioni.js) e il suo numero; poi gli manda solo i pezzi cambiati
// («delta», dalla versione N alla N+1), o niente se per lui non è cambiato niente. Il sistema di gioco, il
// compendio e la chat vecchia viaggiano così solo al primo ingresso o quando cambiano davvero.
// Il mondo intero si manda: al primo ingresso, se il browser non è alla versione che crediamo (glielo
// chiede lui con «sync»), e quando cambiano i permessi (cambia anche la chat che può vedere).
// Un browser vecchio, che non conosce le differenze, riceve il mondo intero come prima.
const ultime = new Map();          // gettone → { ver, testi: Map(chiave → JSON) }
function testoDi(v) {
  if (v && (v === world.sistema || v === world.compendio)) {             // i due pezzi grossi: si contano una volta
    if (!testoDi.cache.has(v)) testoDi.cache.set(v, JSON.stringify(v));
    return testoDi.cache.get(v);
  }
  return JSON.stringify(v === undefined ? null : v);
}
testoDi.cache = new WeakMap();
function pushWorld(c, piena) {
  if (!c.token || c.pending) return;                                      // chi non è (ancora) entrato non riceve il mondo
  const v = viewFor(c);
  if (!c.delta) { c.send({ t: 'world', world: v }); return; }
  const P = VERS.pezzi(v), testi = new Map();
  for (const [k, x] of P) testi.set(k, testoDi(x));
  const prec = ultime.get(c.token);
  if (piena || !prec) {
    const ver = (prec ? prec.ver : 0) + 1;
    ultime.set(c.token, { ver, testi });
    c.send({ t: 'world', world: v, ver });
    return;
  }
  const set = {}, via = [];
  let n = 0;
  for (const [k, t] of testi) if (prec.testi.get(k) !== t) { set[k] = P.get(k); n++; }
  for (const k of prec.testi.keys()) if (!testi.has(k)) via.push(k);
  if (!n && !via.length) return;                                          // nessuna novità per lui
  const ver = prec.ver + 1;
  ultime.set(c.token, { ver, testi });
  c.send({ t: 'delta', da: prec.ver, a: ver, set, via });
}
function pushWorldAll() { for (const c of clients) pushWorld(c); }

let pushTimer = 0;
const schedulePush = () => { clearTimeout(pushTimer); pushTimer = setTimeout(pushWorldAll, 60); };
/** Una modifica: il mondo filtrato torna a tutti, master compreso (lui lo fonde col suo). */
function changed() { scheduleSave(); schedulePush(); }

// ======================= Dadi (li tira il server, non il browser) =======================
function rnd(n) {
  if (!(n >= 2 && n <= 1000)) return 1;
  return crypto.randomInt(1, n + 1);
}
// Espressioni: "1d20+5", "2d6+1d4-1", e con «tieni»: "2d20kh1" (vantaggio: tieni il più alto),
// "2d20kl1" (svantaggio: tieni il più basso), "4d6kh3" (caratteristiche).
// rolls: tutti i dadi tirati; drop: le posizioni di quelli scartati (non contano nel totale).
const TERM = '(?:\\d*d\\d+(?:k[hl]\\d+)?|\\d+)';
const EXPR_RE = new RegExp('^[+-]?' + TERM + '(?:[+-]' + TERM + ')*$');
function parseExpr(str) {
  const s = String(str || '').replace(/\s+/g, '').toLowerCase();
  if (s.length > 80 || !EXPR_RE.test(s)) return null;
  const rolls = [], drop = []; let mod = 0, sides = 0, mixed = false, count = 0, adv = '';
  for (const tkn of s.match(new RegExp('[+-]?' + TERM, 'g'))) {
    const neg = tkn[0] === '-', body = tkn.replace(/^[+-]/, '');
    const dm = body.match(/^(\d*)d(\d+)(?:k([hl])(\d+))?$/);
    if (dm) {
      const cnt = parseInt(dm[1] || '1', 10), faces = parseInt(dm[2], 10);
      if (!(cnt >= 1 && cnt <= 100) || !(faces >= 2 && faces <= 1000)) return null;
      if ((count += cnt) > 200) return null;
      if (sides && sides !== faces) mixed = true;
      sides = faces;
      const start = rolls.length, vals = [];
      for (let i = 0; i < cnt; i++) { const v = rnd(faces); vals.push(v); rolls.push((neg ? -1 : 1) * v); }
      if (dm[3]) {
        const k = parseInt(dm[4], 10);
        if (!(k >= 1 && k <= cnt)) return null;
        const hi = dm[3] === 'h';
        const order = vals.map((_, i) => i).sort((a, b) => (hi ? vals[b] - vals[a] : vals[a] - vals[b]) || a - b);
        for (const i of order.slice(k)) drop.push(start + i);
        if (faces === 20 && cnt === 2 && k === 1 && !adv) adv = hi ? 'adv' : 'dis';
      }
    } else {
      const v = parseInt(body, 10);
      if (!(v >= 0 && v <= 10000)) return null;
      mod += (neg ? -1 : 1) * v;
    }
  }
  if (!rolls.length || Math.abs(mod) > 10000) return null;
  const total = rolls.reduce((a, b, i) => drop.includes(i) ? a : a + b, 0) + mod;
  const out = { rolls, mod, sides: mixed ? 0 : sides, total };
  if (drop.length) out.drop = drop.sort((a, b) => a - b);
  if (adv) out.adv = adv;
  return out;
}

// Un tiro segreto lo vedono solo chi l'ha fatto e chi conduce. Agli altri arriva solo che
// c'è stato un tiro, senza numeri: il risultato non lascia proprio questo computer.
function seesSecret(c, m) {
  if (!c.token) return false;
  return c.token === m.byId || recOf(c.token).role === 'master';
}
// Un sussurro (/w Nome testo) lo vedono solo chi lo scrive, chi lo riceve e chi conduce:
// agli altri non arriva proprio.
function seesWhisper(c, m) {
  if (!c.token) return false;
  return c.token === m.byId || c.token === m.whisper.to || recOf(c.token).role === 'master';
}
function chatFor(c, m) {
  if (m.whisper) return seesWhisper(c, m) ? m : null;
  if (!m.secret || seesSecret(c, m)) return m;
  return { id: m.id, ts: m.ts, kind: 'roll', secret: true, hidden: true, label: 'tiro segreto', by: m.by, byId: m.byId };
}

function addChat(m) {
  m.id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  m.ts = Date.now();
  world.chat = (world.chat || []).concat(m).slice(-500);
  scheduleSave();
  for (const c of clients) { const v = chatFor(c, m); if (v) c.send({ t: 'chat', msg: v }); }
  panelPush({ t: 'chat', msg: m });                      // il pannello è di chi conduce
}

// ======================= Le intenzioni dei clienti =======================
function deny(c, op, why) {
  c.send({ t: 'denied', op, reason: why });
  logAction(c, op, false, why);
}
const str = (v, n = 200) => String(v == null ? '' : v).slice(0, n);

/** chi possiede questo segnalino: il proprietario della scheda collegata */
function tokenOwner(sc, ph) {
  if (ph.owner) return ph.owner;
  const sh = ph.sheet && (world.sheets || []).find(s => s.id === ph.sheet);
  return sh ? sh.owner || null : null;
}
/** «è roba sua»: o è suo, o il master gli ha affidato la scheda collegata. */
function isTheirs(c, sc, ph) {
  if (!c.token) return false;
  if (tokenOwner(sc, ph) === c.token) return true;
  const sh = ph.sheet && (world.sheets || []).find(s => s.id === ph.sheet);
  return !!(sh && sheetVisible(c, sh) === 'rw');
}
const findScene = id => (world.scenes || []).find(s => s.id === id);

function handleIntent(c, m) {
  const p = permsFor(c);
  switch (m.op) {

    // --- il master manda il mondo intero: da qui in poi è questo lo stato vero ---
    case 'board': {
      if (c.role !== 'master') return deny(c, m.op, 'solo il master');
      const b = m.board || {};
      const owners = new Map(), shOwners = new Map();
      for (const sc of world.scenes || []) for (const ph of sc.photos || []) if (ph.id && ph.owner) owners.set(ph.id, ph.owner);
      for (const sh of world.sheets || []) if (sh.owner) shOwners.set(sh.id, sh.owner);
      if (Array.isArray(b.scenes)) {
        world.scenes = b.scenes;
        // indirizzi calcolati (http://127.0.0.1:<porta>/asset/<hash>) salvati per sbaglio: tornano «gs:<hash>»
        const fissa = o => { const m = o && /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/asset\/([a-f0-9]{64})/.exec(String(o.url || '')); if (m) { o.url = 'gs:' + m[1]; o.gid = m[1]; } return o; };
        for (const sc of world.scenes) fissa(sc.bg);
        for (const sc of world.scenes) sc.photos = (sc.photos || []).map(ph => {
          fissa(ph);
          if (!ph.id) ph.id = newId('tk');
          if (!ph.owner && owners.has(ph.id)) ph.owner = owners.get(ph.id);
          return ph;
        });
      }
      // il compendio che vedono i giocatori: l'elenco dei pacchetti (e per quelli della campagna l'hash del file)
      // (si sostituisce solo se è cambiato davvero: così il server se ne accorge al volo e non lo rimanda)
      if (b.compendio && typeof b.compendio === 'object' && Array.isArray(b.compendio.pacchetti)) {
        const t = JSON.stringify(b.compendio);
        if (t.length < 2000000 && t !== testoDi(world.compendio)) world.compendio = JSON.parse(t);
      }
      // il sistema di gioco della campagna (regole e formule): lo usano anche i giocatori
      if (b.sistema && typeof b.sistema === 'object' && b.sistema.dati) {
        const t = JSON.stringify(b.sistema);
        if (t.length < 400000 && t !== testoDi(world.sistema)) world.sistema = JSON.parse(t);
      }
      if (Array.isArray(b.sheets)) {
        // Il master aggiorna e aggiunge, ma non cancella: le schede si tolgono solo con sheet.del,
        // altrimenti basterebbe un salvataggio partito prima per far sparire quella di un giocatore.
        const incoming = new Map(b.sheets.map(x => [x.id, x]));
        const out = [];
        for (const sh of world.sheets || []) {
          const nw = incoming.get(sh.id);
          if (nw) { nw.owner = nw.owner || sh.owner; out.push(nw); incoming.delete(sh.id); }
          else out.push(sh);
        }
        const tolte = new Set(world.schedeTolte || []);
        for (const nw of incoming.values()) {
          if (tolte.has(nw.id)) continue;                 // cancellata da un giocatore: il master non la rimette
          if (!nw.owner && shOwners.has(nw.id)) nw.owner = shOwners.get(nw.id);
          out.push(nw);
        }
        world.sheets = out;
      }
      if ('active' in b) world.active = b.active;
      if ('publicScene' in b) world.publicScene = b.publicScene;
      if ('turni' in b) world.turni = turniPuliti(b.turni);
      if (b.unita === 'm' || b.unita === 'ft') world.unita = b.unita;   // piedi o metri: per leggere «60» nella scurovisione
      if ('fogColor' in b) world.fogColor = /^#[0-9a-f]{6}$/i.test(String(b.fogColor || '')) ? String(b.fogColor) : 'auto';
      scheduleSave(); schedulePush();
      return;
    }

    // --- segnalini ---
    case 'token.move': {
      const sc = findScene(m.scene) || findScene(world.active);
      if (!sc) return deny(c, m.op, 'scena sconosciuta');
      const ph = (sc.photos || []).find(x => x.id === m.id);
      if (!ph) return deny(c, m.op, 'segnalino sconosciuto');
      const mine = isTheirs(c, sc, ph);
      if (!(p.moveAnyToken || (p.moveOwnTokens && mine))) return deny(c, m.op, 'non è un tuo segnalino');
      if ((ph.layer || 'tokens') === 'hidden' && !p.seeHiddenLayer) return deny(c, m.op, 'non puoi');
      const pos = m.pos || {};
      // il movimento di un giocatore: muri non attraversabili e, nelle scene di battaglia, la velocità
      const mov = p.moveAnyToken ? { ok: true } : controllaMovimento(sc, ph, pos);
      if (!mov.ok) { schedulePush(); return deny(c, m.op, mov.perche); }
      if (mov.turno) { ph.mosso = (ph.mossoTurno === mov.turno ? +ph.mosso || 0 : 0) + mov.caselle; ph.mossoTurno = mov.turno; }
      else if (mov.caselle > 0 && ph.scatta === true) delete ph.scatta;                 // senza turni lo scatto vale per un movimento
      ph.l = +pos.l || 0; ph.t = +pos.t || 0;
      if (pos.w > 0) ph.w = +pos.w;
      if (pos.h > 0) ph.h = +pos.h;
      changed();
      return;
    }
    // «Scatta»: velocità doppia per questo turno (o per il prossimo movimento, se i turni sono spenti)
    case 'scatta': {
      const sc = findScene(m.scene) || findScene(world.active);
      const ph = sc && (sc.photos || []).find(x => x.id === m.id);
      if (!ph) return deny(c, m.op, 'segnalino sconosciuto');
      if (!(p.moveAnyToken || (p.moveOwnTokens && isTheirs(c, sc, ph)))) return deny(c, m.op, 'non è un tuo segnalino');
      if (m.on === false) delete ph.scatta; else ph.scatta = turnoDi(sc, ph) || true;
      changed();
      return;
    }
    // durante il trascinamento: ci si arriva? (solo sì/no e le caselle: i muri restano segreti)
    case 'percorso.prova': {
      const sc = findScene(m.scene) || findScene(world.active);
      const ph = sc && (sc.photos || []).find(x => x.id === m.id);
      if (!ph || !(p.moveAnyToken || (p.moveOwnTokens && isTheirs(c, sc, ph)))) return;
      const r = p.moveAnyToken ? { ok: true } : controllaMovimento(sc, ph, m.pos || {});
      c.send({ t: 'percorso', id: ph.id, ok: !!r.ok, perche: r.ok ? '' : r.perche, n: m.n });
      return;
    }
    case 'token.add': {
      // un disegno (penna, forme, testo) non è un segnalino: basta il permesso di disegnare
      if (m.token && m.token.shape) {
        if (!p.draw) return deny(c, m.op, 'non puoi disegnare');
        const sc = findScene(m.scene) || findScene(world.active);
        if (!sc) return deny(c, m.op, 'scena sconosciuta');
        const sh = formaPulita(m.token.shape);
        if (!sh) return deny(c, m.op, 'disegno non valido');
        const n = v => Number.isFinite(+v) ? +v : 0;
        const tk = { id: newId('tk'), shape: sh, layer: c.role === 'master' && ['map', 'hidden'].includes(m.token.layer) ? m.token.layer : 'tokens',
          l: n(m.token.l), t: n(m.token.t), w: Math.max(1, n(m.token.w)), h: Math.max(1, n(m.token.h)), owner: c.role === 'master' ? null : c.token };
        sc.photos = (sc.photos || []).concat(tk);
        changed();
        return;
      }
      if (!p.createTokens) return deny(c, m.op, 'non puoi creare segnalini');
      const sc = findScene(m.scene) || findScene(world.active);
      if (!sc) return deny(c, m.op, 'scena sconosciuta');
      const tk = m.token || {};
      if (typeof tk.url === 'string' && tk.url.length > 320000) return deny(c, m.op, 'immagine del segnalino troppo pesante');
      // un giocatore può mettere in campo solo un personaggio suo
      if (c.role !== 'master') {
        if (tk.url && tk.url.startsWith('data:') && !p.uploadTokenImage) return deny(c, m.op, 'non puoi usare foto tue');
        const sh = tk.sheet && (world.sheets || []).find(s => s.id === tk.sheet);
        if (!sh || sheetVisible(c, sh) !== 'rw') return deny(c, m.op, 'puoi mettere in campo solo i tuoi personaggi');
        tk.layer = 'tokens';
      }
      tk.id = newId('tk');
      tk.owner = c.role === 'master' ? (tk.owner || null) : c.token;
      if (typeof tk.url === 'string' && tk.url.startsWith('data:')) {
        const mm = tk.url.match(/^data:([\w/+.-]+);base64,(.*)$/);
        if (mm) {
          const h = storeAsset(Buffer.from(mm[2], 'base64'), mm[1], tk.name || 'segnalino');
          if (h) { tk.gid = h; tk.url = 'gs:' + h; }
        }
      }
      sc.photos = (sc.photos || []).concat(tk);
      changed();
      return;
    }
    case 'token.del': {
      const sc = findScene(m.scene) || findScene(world.active);
      if (!sc) return deny(c, m.op, 'scena sconosciuta');
      const ph = (sc.photos || []).find(x => x.id === m.id);
      if (!ph) return;
      if (!(p.moveAnyToken || isTheirs(c, sc, ph))) return deny(c, m.op, 'non è un tuo segnalino');
      sc.photos = sc.photos.filter(x => x !== ph);
      changed();
      return;
    }

    // --- luce dinamica: il master fa dimenticare al party quello che aveva già visto ---
    case 'luce.dimentica': {
      if (!p.revealFog) return deny(c, m.op, 'solo chi conduce');
      const id = str(m.scene, 60);
      for (const k of Object.keys(world.visto || {})) if (k === id || k.startsWith(id + '|')) delete world.visto[k];
      for (const mp of [visti, viste]) for (const k of [...mp.keys()]) if (k === id || k.startsWith(id + '|')) mp.delete(k);
      scheduleSave(); schedulePush();
      return;
    }

    // --- una porta: la apre (o chiude) chi la vede ---
    case 'luce.porta': {
      const sc = findScene(m.scene);
      if (!sc || !sc.luce || !Array.isArray(sc.luce.muri)) return deny(c, m.op, 'scena sconosciuta');
      const id = str(m.id, 40);
      if (!porteVisibili(c, sc).some(w => w.id === id)) return deny(c, m.op, 'quella porta non la vedi');
      const w = sc.luce.muri.find(x => x.id === id && x.porta);
      if (!w) return deny(c, m.op, 'porta sconosciuta');
      w.aperta = typeof m.aperta === 'boolean' ? m.aperta : !w.aperta;
      changed();
      return;
    }

    // --- nebbia ---
    case 'fog.set': {
      if (!p.revealFog) return deny(c, m.op, 'solo chi conduce può toccare la nebbia');
      const id = str(m.scene, 60);
      if (!findScene(id)) return deny(c, m.op, 'scena sconosciuta');
      world.fog[id] = m.fog || null;
      scheduleSave(); schedulePush();
      return;
    }

    // --- scena mostrata ---
    case 'scene.show': {
      if (!p.editScene) return deny(c, m.op, 'solo chi conduce');
      world.publicScene = m.id || null;
      scheduleSave(); schedulePush();
      panelPush({ t: 'scene', id: world.publicScene });
      return;
    }

    // --- dadi: il risultato lo decide il server ---
    case 'roll': {
      if (!p.roll) return deny(c, m.op, 'non puoi tirare');
      let r;
      if (Array.isArray(m.parti) && m.parti.length > 1) {
        // danni di più tipi («2d6+3 tagliente + 1d6 fuoco»): una formula per tipo, un messaggio solo
        const tiri = m.parti.slice(0, 6).map(x => ({ tipo: str(x && x.tipo, 30), r: parseExpr(x && x.expr) }));
        if (tiri.some(t => !t.r)) return deny(c, m.op, 'tiro non valido');
        const rolls = [], drop = []; let mod = 0, total = 0, sides = null;
        for (const t of tiri) {
          const base = rolls.length;
          rolls.push(...t.r.rolls); for (const i of t.r.drop || []) drop.push(base + i);
          mod += t.r.mod || 0; total += t.r.total;
          sides = sides === null ? t.r.sides : sides === t.r.sides ? sides : 0;
        }
        r = { rolls, mod, total, sides: sides || 0, parti: tiri.map(t => ({ tipo: t.tipo, total: t.r.total })) };
        if (drop.length) r.drop = drop;
      } else r = parseExpr(m.expr);
      if (!r) return deny(c, m.op, 'tiro non valido');
      const msg = { kind: 'roll', label: str(m.label || m.expr, 80), by: c.name, byId: c.token, ...r };
      if (m.secret) msg.secret = true;
      if (m.doppio && r.rolls && r.rolls.length === 2) msg.doppio = true;   // due tiri mostrati alla pari (scheda in vantaggio/svantaggio)
      const cr = Math.round(+m.crit);
      if (cr >= 15 && cr <= 19) msg.crit = cr;                                 // «Critico da» della scheda: il d20 da quel numero in su è un critico
      // da quale scheda e attacco viene (per i pulsanti «Danni» nel messaggio di chi ha tirato)
      if (m.rif && typeof m.rif === 'object' && Number.isInteger(+m.rif.at) && +m.rif.at >= 0 && +m.rif.at < 60) msg.rif = { sh: str(m.rif.sh, 60), at: +m.rif.at };
      addChat(msg);
      return;
    }

    // --- chat ---
    case 'chat': {
      if (!p.chat) return deny(c, m.op, 'non puoi scrivere');
      const text = str(m.text, 2000).trim();
      if (!text) return;
      if (m.to) {                                          // sussurro
        const a = str(m.to, 60).trim().toLowerCase();
        const alMaster = ['master', 'gm', 'dm'].includes(a);
        const voci = Object.entries(roster).filter(([, r]) => !r.banned && (alMaster ? r.role === 'master' : String(r.name || '').trim().toLowerCase() === a));
        if (!voci.length) return deny(c, m.op, `nessuno si chiama «${str(m.to, 60)}»`);
        if (voci.length > 1 && !alMaster) return deny(c, m.op, `ci sono più persone che si chiamano «${str(m.to, 60)}»`);
        const [tok, rec] = voci[0];
        addChat({ kind: 'text', text, by: c.name, byId: c.token, whisper: { to: tok, toName: rec.name || 'master' } });
        return;
      }
      addChat({ kind: 'text', text, by: c.name, byId: c.token });
      return;
    }
    case 'chat.del': {
      const msg = (world.chat || []).find(x => x.id === m.id);
      if (!msg) return;
      if (c.role !== 'master' && msg.byId !== c.token) return deny(c, m.op, 'puoi cancellare solo i tuoi messaggi');
      world.chat = world.chat.filter(x => x !== msg);
      chatTolti.push(msg.id); if (chatTolti.length > 50) chatTolti.shift();
      scheduleSave();
      for (const k of clients) k.send({ t: 'chat.del', id: msg.id });
      panelPush({ t: 'chat.del', id: msg.id });
      return;
    }
    case 'rule': {
      if (!p.chat) return deny(c, m.op, 'non puoi scrivere');
      addChat({ kind: 'rule', title: str(m.title, 120), text: str(m.text, 4000), by: c.name, byId: c.token });
      return;
    }

    // --- ping ---
    case 'ping': {
      if (!p.ping) return deny(c, m.op, 'non puoi fare ping');
      broadcast({ t: 'ping', x: +m.x || 0, y: +m.y || 0, color: str(m.color, 24), by: c.name });
      return;
    }

    // --- schede ---
    case 'sheet.add': {
      const s = m.sheet || {};
      s.id = str(s.id, 60) || ('sh' + Date.now().toString(36));
      if ((world.sheets || []).some(x => x.id === s.id)) return;
      s.owner = c.role === 'master' ? (s.owner || null) : c.token;
      world.sheets = (world.sheets || []).concat(s);
      changed();
      return;
    }
    case 'sheet.save': {
      const s = (world.sheets || []).find(x => x.id === m.id);
      if (!s) return deny(c, m.op, 'scheda sconosciuta');
      if (sheetVisible(c, s) !== 'rw') return deny(c, m.op, 'questa scheda non è tua');
      if (typeof m.name === 'string') s.name = str(m.name, 60);
      if (m.f && typeof m.f === 'object') s.f = m.f;
      if (m.icon !== undefined) {
        s.icon = m.icon;
        // un giocatore che cambia la sua icona cambia anche i suoi segnalini collegati a quella scheda
        const u = m.icon && String(m.icon.url || '');
        if (c.role !== 'master' && /^gs:[a-f0-9]{64}$/.test(u)) {
          for (const sc of world.scenes || []) for (const ph of sc.photos || []) {
            if (ph.sheet === s.id && !ph.shape && isTheirs(c, sc, ph)) { ph.url = u; ph.gid = u.slice(3); delete ph.aid; }
          }
        }
      }
      changed();
      return;
    }
    case 'sheet.del': {
      const s = (world.sheets || []).find(x => x.id === m.id);
      if (!s) return;
      if (c.role !== 'master' && s.owner !== c.token) return deny(c, m.op, 'questa scheda non è tua');
      world.sheets = world.sheets.filter(x => x !== s);
      // il master potrebbe averla ancora: se la rimanda col suo salvataggio non deve tornare
      world.schedeTolte = (world.schedeTolte || []).filter(x => x !== s.id).concat(s.id).slice(-500);
      changed();
      return;
    }

    // --- note di gruppo: le scrive chi conduce; i giocatori solo se lui lo permette ---
    case 'notes.save': {
      const n = world.notes || { text: '', editable: false };
      if (c.role !== 'master' && !n.editable) return deny(c, m.op, 'le note di gruppo le scrive solo chi conduce');
      world.notes = { ...n, text: str(m.text, 20000), by: c.name, at: Date.now() };
      scheduleSave();
      broadcast({ t: 'notes', notes: world.notes, from: c.id });
      return;
    }
    case 'notes.edit': {
      if (c.role !== 'master') return deny(c, m.op, 'lo decide chi conduce');
      world.notes = { ...(world.notes || { text: '' }), editable: !!m.editable };
      scheduleSave();
      broadcast({ t: 'notes', notes: world.notes });
      return;
    }

    // --- musica ---
    case 'music': {
      if (!p.controlMusic) return deny(c, m.op, 'la musica la sceglie chi conduce');
      world.music = m.state || null;
      scheduleSave();
      broadcast({ t: 'music', state: world.music });
      return;
    }

    // --- file: caricamento a pezzi, perché passano dentro al tubo ---
    case 'asset.have': {
      const need = (Array.isArray(m.hashes) ? m.hashes : []).filter(h => isHash(h) && !haveAsset(h)).slice(0, 200);
      c.send({ t: 'asset.need', hashes: need });
      return;
    }
    case 'asset.put': {
      if (!c.token) return;
      if (!(p.uploadAssets || p.uploadTokenImage)) return deny(c, m.op, 'non puoi caricare immagini');
      const id = str(m.id, 80);
      if (!id) return;
      const box = (c.up ||= new Map());
      let job = box.get(id);
      if (!job) {
        if (box.size > 4) return deny(c, m.op, 'troppi caricamenti insieme');
        job = { parts: [], got: 0, mime: str(m.mime, 60), name: str(m.name, 80) };
        box.set(id, job);
      }
      const chunk = Buffer.from(String(m.data || ''), 'base64');
      job.got += chunk.length;
      if (job.got > MAX_ASSET) { box.delete(id); return deny(c, m.op, 'immagine troppo grande (max 12 MB)'); }
      job.parts.push(chunk);
      if (!m.last) return;
      box.delete(id);
      const hash = storeAsset(Buffer.concat(job.parts), job.mime, job.name);
      c.send({ t: 'asset.ok', id, hash });
      if (hash) logAction(c, 'asset.put', true, job.name + ' · ' + Math.round(job.got / 1024) + ' kB');
      return;
    }
    case 'asset.get': {
      const h = str(m.hash, 64);
      if (c.kind === 'ws' && !c.token) return;
      if (!isHash(h) || !haveAsset(h)) { c.send({ t: 'asset.miss', hash: h }); return; }
      sendAsset(c, h);
      return;
    }

    // --- il master cambia i permessi anche da dentro il gioco ---
    case 'perm.set': {
      if (c.role !== 'master') return deny(c, m.op, 'solo il master');
      applyPerm(m);
      return;
    }

    default:
      return deny(c, m.op, 'non so cosa sia');
  }
}

/** Manda un file a chi lo ha chiesto, a pezzi da 48 kB. */
function sendAsset(c, hash) {
  const f = assetFile(hash);
  let buf;
  try { buf = fs.readFileSync(f); } catch { c.send({ t: 'asset.miss', hash }); return; }
  const info = assetIndex[hash] || {};
  const STEP = 48 * 1024;
  for (let off = 0; off < buf.length || off === 0; off += STEP) {
    const part = buf.slice(off, off + STEP);
    c.send({
      t: 'asset.data', hash, mime: info.mime, name: info.name,
      data: part.toString('base64'), last: off + STEP >= buf.length
    });
    if (off + STEP >= buf.length) break;
  }
}

function applyPerm(m) {
  const rec = roster[m.token];
  if (!rec) return false;
  if (m.role && ['master', 'player', 'spectator'].includes(m.role)) rec.role = m.role;
  if (m.perm && PERMS.includes(m.perm)) {
    rec.overrides = rec.overrides || {};
    if (m.value === null) delete rec.overrides[m.perm]; else rec.overrides[m.perm] = !!m.value;
  }
  if (m.sheet) {
    rec.sheets = rec.sheets || {};
    if (!m.access) delete rec.sheets[m.sheet]; else rec.sheets[m.sheet] = m.access === 'rw' ? 'rw' : 'r';
  }
  if (typeof m.name === 'string') rec.name = str(m.name, 40);
  for (const c of clients) if (c.token === m.token) {
    c.role = rec.role;
    c.name = rec.name || c.name;
    c.send({ t: 'you', you: { id: c.id, token: c.token, name: c.name, role: c.role, perms: permsFor(c) } });
  }
  // a lui il mondo intero: con i permessi cambia anche la chat che può vedere
  scheduleSave(); sendPlayers(); for (const c of clients) pushWorld(c, c.token === m.token);
  return true;
}

// ======================= Un cliente collegato =======================
function attach(c) {
  clients.add(c);
  c.alive = true;
  console.log(`+ ${c.kind} #${c.id} collegato (${clients.size} in tutto)`);
}
function detach(c) {
  if (!clients.delete(c)) return;
  console.log(`- ${c.kind} #${c.id} se n'è andato`);
  sendPlayers();
}

function onMessage(c, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;

  if (m.t === 'peer') { c.peer = str(m.id, 80); return; }        // riga scritta da uffa-link
  if (m.t === 'pong') { c.alive = true; if (c.beatAt) c.rtt = Date.now() - c.beatAt; return; }

  if (m.t === 'hello') {
    // Il gettone è l'identità: il browser se lo tiene e lo rimanda. Se non ce l'ha, gliene do uno.
    let token = str(m.token, 64);
    if (!/^[a-f0-9]{24}$/.test(token)) token = crypto.randomBytes(12).toString('hex');
    // Rientra qualcuno che risulta ancora collegato: è la stessa persona che si è ricollegata
    // (wifi caduto, tubo riaperto…). Il collegamento vecchio è un fantasma: si chiude quello.
    for (const old of [...clients]) {
      if (old === c || old.token !== token) continue;
      old.send({ t: 'bye', reason: 'Ti sei ricollegato da un\'altra parte.', replaced: true });
      old.close(); detach(old);
      logAction(old, 'ingresso', true, 'ricollegato');
    }
    c.token = token;
    const rec = recOf(token);
    // Il master è chi sta davanti alla macchina che ospita: arriva dal browser locale.
    if (c.kind === 'ws' && MODE === 'host' && !hasMaster()) rec.role = 'master';
    else if (rec.role === 'master' && c.kind === 'link') rec.role = 'player';   // da fuori non si entra da master
    const want = uniqueName(token, m.name || rec.name);
    rec.name = want || (rec.role === 'master' ? 'Master' : 'Giocatore ' + c.id);
    rec.lastSeen = Date.now();
    c.name = rec.name; c.role = rec.role;
    c.client = str(m.client, 40) || '?';
    // il browser sa ricevere le differenze? a che versione del mondo è rimasto? qual è l'ultimo messaggio di chat che ha?
    c.delta = m.delta === 1;
    c.verCliente = Number.isInteger(m.ver) ? m.ver : 0;
    c.chatDa = str(m.chatDa, 40);
    c.since = Date.now();
    c.needName = !want;

    // --- chi può entrare ---
    if (rec.banned) return shutOut(c, 'Non sei più ammesso a questa sessione.');
    if (c.role !== 'master') {
      const newcomer = !rec.firstSeenDone;
      if (session.locked && newcomer) return shutOut(c, 'La sessione è chiusa: il master non fa entrare altri.');
      const online = [...clients].filter(x => x !== c && x.token && x.role !== 'master' && !x.pending).length;
      if (session.maxPlayers > 0 && online >= session.maxPlayers && newcomer) return shutOut(c, 'Il tavolo è al completo.');
      if (session.approval && !rec.approved) {
        c.pending = true;
        c.send({ t: 'pending', name: c.name });
        logAction(c, 'ingresso', false, 'in attesa del master');
        scheduleSave(); sendPlayers();
        return;
      }
    }
    rec.firstSeenDone = true;
    sendWelcome(c);
    return;
  }

  // Le richieste di file arrivano dal ponte del giocatore, non da una persona: non aspettano il saluto.
  if (m.t === 'intent' && (m.op === 'asset.get' || m.op === 'asset.have')) {
    try { handleIntent(c, m); } catch (e) { console.error('intento', m.op, e.message); }
    return;
  }
  if (!c.token) return;                                           // niente prima del saluto

  if (m.t === 'leave') {                                          // si è scollegato a mano
    logAction(c, 'uscita', true, 'scollegato da sé');
    c.token = ''; c.name = ''; c.pending = false;
    sendPlayers();
    return;
  }

  if (m.t === 'sync') { pushWorld(c, true); return; }             // il browser ha perso il filo: tutto da capo

  if (m.t === 'telemetry') {                                      // che cosa sta guardando
    c.viewScene = str(m.scene, 60) || null;
    c.viewRect = m.view && Number.isFinite(+m.view.x) ? { x: Math.round(+m.view.x), y: Math.round(+m.view.y), s: +(+m.view.s).toFixed(2) } : null;
    return;
  }
  if (m.t === 'intent') {
    const rec = recOf(c.token);
    c.ops = (c.ops || 0) + 1; c.lastOp = str(m.op, 40); c.lastAt = Date.now();
    if (rec.frozen && MUTATING.has(m.op)) { deny(c, m.op, 'sei congelato: puoi guardare, non toccare'); logAction(c, m.op, false, 'congelato'); return; }
    if (session.paused && c.role !== 'master' && MUTATING.has(m.op)) { deny(c, m.op, 'la sessione è in pausa'); logAction(c, m.op, false, 'in pausa'); return; }
    if (rec.muted && (m.op === 'chat' || m.op === 'rule')) { deny(c, m.op, 'sei stato silenziato'); logAction(c, m.op, false, 'silenziato'); return; }
    try { handleIntent(c, m); } catch (e) { console.error('intento', m.op, e.message); }
    return;
  }
  if (m.t === 'name') {
    const rec = recOf(c.token);
    const want = uniqueName(c.token, m.name);
    if (!want) { c.send({ t: 'rename', reason: 'Serve un nome di almeno due lettere, e che non abbia già qualcun altro.' }); return; }
    rec.name = c.name = want;
    c.send({ t: 'you', you: { id: c.id, token: c.token, name: c.name, role: c.role, perms: permsFor(c) } });
    scheduleSave(); sendPlayers();
  }
}
const hasMaster = () => [...clients].some(c => c.role === 'master');

function shutOut(c, reason) {
  logAction(c, 'ingresso', false, reason);
  c.send({ t: 'bye', reason });
  setTimeout(() => { try { c.close(); } catch {} }, 150);
}
// I messaggi di chat cancellati di recente: chi rientra senza ricaricare il mondo li toglie anche da sé.
const chatTolti = [];
function sendWelcome(c) {
  c.pending = false;
  const rec = recOf(c.token);
  rec.firstSeenDone = true;
  const you = { id: c.id, token: c.token, name: c.name, role: c.role, perms: permsFor(c) };
  // Rientra dopo una caduta con il mondo che gli avevamo mandato: niente mondo intero, solo quello che è
  // cambiato nel frattempo (e la chat che si è perso).
  const prec = ultime.get(c.token);
  const chatV = world.chat || [], i = c.chatDa ? chatV.findIndex(x => x.id === c.chatDa) : -1;
  // (senza un messaggio da cui ripartire vuol dire che non ne aveva nessuno: gli si mandano tutti)
  if (c.delta && prec && c.verCliente === prec.ver && (i >= 0 || !c.chatDa)) {
    c.send({ t: 'welcome', needName: !!c.needName, you, riprendi: true,
      chatDopo: chatV.slice(i + 1).slice(-250).map(m => chatFor(c, m)).filter(Boolean), chatVia: chatTolti.slice() });
    pushWorld(c);
  } else {
    const w = viewFor(c);
    let ver;
    if (c.delta) {
      const P = VERS.pezzi(w), testi = new Map();
      for (const [k, x] of P) testi.set(k, testoDi(x));
      ver = (prec ? prec.ver : 0) + 1;
      ultime.set(c.token, { ver, testi });
    }
    c.send({ t: 'welcome', needName: !!c.needName, you, world: w, ver });
  }
  logAction(c, 'ingresso', true, c.role);
  scheduleSave(); sendPlayers();
}

// ======================= WebSocket, scritto a mano =======================
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}
function wsFrame(data, opcode = 1) {
  const buf = Buffer.from(data);
  const n = buf.length;
  let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, buf]);
}
/** Estrae i messaggi completi da quello che è arrivato finora. */
function wsParse(state) {
  const out = [];
  for (;;) {
    const b = state.buf;
    if (b.length < 2) break;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) {
      if (b.length < 10) break;
      const big = b.readBigUInt64BE(2);
      if (big > 8n * 1024n * 1024n) { out.push({ op: 8 }); state.buf = Buffer.alloc(0); return out; }
      len = Number(big); off = 10;
    }
    if (masked) { if (b.length < off + 4) break; }
    const maskKey = masked ? b.slice(off, off + 4) : null;
    if (masked) off += 4;
    if (b.length < off + len) break;
    let payload = b.slice(off, off + len);
    if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3]; }
    state.buf = b.slice(off + len);

    if (op === 8) { out.push({ op: 8 }); return out; }
    if (op === 9) { out.push({ op: 9, payload }); continue; }
    if (op === 10) { out.push({ op: 10 }); continue; }
    if (op === 0) state.frag = Buffer.concat([state.frag || Buffer.alloc(0), payload]);
    else state.frag = payload;
    if (fin) { out.push({ op: 1, text: (state.frag || Buffer.alloc(0)).toString('utf8') }); state.frag = null; }
  }
  return out;
}

function onUpgrade(req, sock, head) {
  if (!hostLocale(req, PORT)) { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const url = new URL(req.url, 'http://localhost');
  const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(sock.remoteAddress || '');
  const org = req.headers.origin || '';
  const okOrigin = !org || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(org);
  if (!key || url.pathname !== '/ws' || !local || !okOrigin) { sock.destroy(); return; }

  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
  sock.setNoDelay(true);

  const state = { buf: head && head.length ? Buffer.from(head) : Buffer.alloc(0), frag: null };
  const c = {
    id: nextId++, kind: 'ws', token: '', name: '', role: 'player', peer: null,
    send(msg) { try { sock.write(wsFrame(JSON.stringify(msg))); } catch {} },
    close() { try { sock.end(); } catch {} }
  };
  attach(c);

  sock.on('data', d => {
    state.buf = Buffer.concat([state.buf, d]);
    for (const f of wsParse(state)) {
      if (f.op === 8) { sock.end(); return; }
      if (f.op === 9) { try { sock.write(wsFrame(f.payload, 10)); } catch {} continue; }
      if (f.op === 10) { c.alive = true; continue; }
      if (f.op === 1) onMessage(c, f.text);
    }
  });
  sock.on('close', () => detach(c));
  sock.on('error', () => detach(c));
}

// ======================= I giocatori che arrivano da iroh (solo modo host) =======================
function startLinkServer() {
  net.createServer(sock => {
    sock.setNoDelay(true);
    let buf = '';
    const c = {
      id: nextId++, kind: 'link', token: '', name: '', role: 'player', peer: null,
      send(msg) { try { sock.write(JSON.stringify(msg) + '\n'); } catch {} },
      close() { try { sock.end(); } catch {} }
    };
    attach(c);
    sock.on('data', d => {
      buf += d.toString('utf8');
      if (buf.length > 4 * 1024 * 1024) { sock.destroy(); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.trim()) onMessage(c, line);
      }
    });
    sock.on('close', () => detach(c));
    sock.on('error', () => detach(c));
  }).listen(LINK_PORT, '127.0.0.1', () => console.log(`In ascolto per uffa-link su 127.0.0.1:${LINK_PORT}`));
}

// ======================= Modo «join»: solo un ponte =======================
// Il browser parla con noi; noi parliamo con uffa-link, che parla con l'host.
let bridge = null, bridgeBuf = '', bridgeQueue = [];
// Il saluto dell'ultimo browser: se il tubo cade e si riapre, l'host vede una connessione
// nuova e non sa chi sia. Glielo ripresentiamo noi, così il giocatore rientra da solo,
// con lo stesso gettone (quindi stesso nome, stessi permessi, stesse schede).
let lastHello = null;
let hostUp = false, lastFromHost = 0, bridgeTries = 0;
const linkState = up => {
  if (hostUp === up) return;
  hostUp = up;
  panelPush({ t: 'link', up });
  for (const c of clients) c.send({ t: 'link', up });   // il browser mostra «mi sto ricollegando…»
};
function bridgeConnect() {
  const sock = net.connect(LINK_PORT, '127.0.0.1');
  bridge = sock;
  sock.setNoDelay(true);
  sock.on('connect', () => {
    bridgeBuf = '';                                      // via i pezzi di riga del collegamento vecchio
    lastFromHost = Date.now();
    console.log('Ponte aperto verso uffa-link.');
    if (lastHello) sock.write(JSON.stringify(lastHello) + '\n');
    // Quello che si era accumulato mentre eravamo giù: via i saluti e le risposte ai battiti vecchi.
    for (const line of bridgeQueue.splice(0)) {
      if (/^\{"t":"(hello|pong)"/.test(line)) continue;
      sock.write(line);
    }
  });
  sock.on('data', d => {
    lastFromHost = Date.now();
    bridgeTries = 0;
    linkState(true);                                     // l'host ha risposto: il tubo è davvero aperto
    bridgeBuf += d.toString('utf8');
    let i;
    while ((i = bridgeBuf.indexOf('\n')) >= 0) {
      const line = bridgeBuf.slice(0, i); bridgeBuf = bridgeBuf.slice(i + 1);
      if (!line.trim()) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.t === 'asset.data' || msg.t === 'asset.miss') { bridgeAsset(msg); continue; }   // roba nostra
      if (msg.t === 'beat') { bridgeSend({ t: 'pong' }); continue; }   // il ponte è vivo anche senza browser
      if (msg.t === 'bye') lastHello = null;                // allontanato: non lo si ripresenta da soli
      // dove è arrivato il browser (versione del mondo, ultimo messaggio di chat): se il tubo si riapre
      // lo ripresentiamo da lì, e l'host gli manda solo quello che si è perso
      else if (lastHello) {
        if ((msg.t === 'world' || msg.t === 'welcome') && msg.ver) lastHello.ver = msg.ver;
        if (msg.t === 'delta') lastHello.ver = msg.a;
        const ch = msg.t === 'chat' ? [msg.msg] : msg.world && msg.world.chat || msg.chatDopo || [];
        if (ch.length && ch[ch.length - 1] && ch[ch.length - 1].id) lastHello.chatDa = ch[ch.length - 1].id;
      }
      for (const c of clients) c.send(msg);                 // tutto il resto va al browser
    }
  });
  let gone = false;
  const retry = () => {
    if (gone) return;
    gone = true;
    if (bridge === sock) bridge = null;
    linkState(false);
    bridgeTries++;
    setTimeout(bridgeConnect, Math.min(1500 * bridgeTries, 6000));
  };
  sock.on('close', retry);
  sock.on('error', () => {});
}
// L'host manda un battito ogni 8 secondi. Se per 30 secondi non arriva niente il tubo è
// morto anche se nessuno ce l'ha detto (wifi caduto, portatile chiuso…): lo chiudiamo noi
// e ne apriamo uno nuovo.
function bridgeWatchdog() {
  setInterval(() => {
    if (bridge && !bridge.connecting && Date.now() - lastFromHost > 30000) {
      console.log('L\'host non risponde da 30 secondi: riapro il collegamento.');
      bridge.destroy();
    }
  }, 5000);
}
// ---------- Richieste di file all'host (solo in modo «join») ----------
// Il browser chiede un'immagine al suo server locale; se qui non c'è, se la fa mandare
// dall'host attraverso il tubo e la scrive nella cartella, così la volta dopo è già pronta.
const waiting = new Map();               // hash -> { parts, bytes, mime, name, res:[], timer }

function wantAsset(hash) {
  let w = waiting.get(hash);
  if (w) return w.promise;
  w = { parts: [], bytes: 0, mime: '', name: '' };
  w.promise = new Promise(resolve => { w.done = resolve; });
  w.timer = setTimeout(() => { waiting.delete(hash); w.done(null); }, 25000);
  waiting.set(hash, w);
  bridgeSend({ t: 'intent', op: 'asset.get', hash });
  return w.promise;
}
function bridgeAsset(msg) {
  const w = waiting.get(msg.hash);
  if (!w) return;
  if (msg.t === 'asset.miss') { clearTimeout(w.timer); waiting.delete(msg.hash); w.done(null); return; }
  const part = Buffer.from(String(msg.data || ''), 'base64');
  w.parts.push(part); w.bytes += part.length;
  w.mime = w.mime || msg.mime; w.name = w.name || msg.name;
  if (w.bytes > MAX_ASSET) { clearTimeout(w.timer); waiting.delete(msg.hash); w.done(null); return; }
  if (!msg.last) return;
  clearTimeout(w.timer); waiting.delete(msg.hash);
  const buf = Buffer.concat(w.parts);
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== msg.hash) { console.error('file arrivato rovinato:', msg.hash.slice(0, 8)); w.done(null); return; }
  storeAsset(buf, w.mime, w.name);
  console.log(`↓ ricevuta immagine ${(w.name || msg.hash.slice(0, 8))} (${Math.round(buf.length / 1024)} kB)`);
  w.done(buf);
}

function bridgeSend(obj) {
  const line = JSON.stringify(obj) + '\n';
  if (bridge && !bridge.destroyed && bridge.readyState === 'open') bridge.write(line);
  else if (bridgeQueue.length < 200) bridgeQueue.push(line);
}

// ======================= Pannello di controllo =======================
const panels = new Set();
function panelPush(msg) { for (const r of panels) { try { r.write('data: ' + JSON.stringify(msg) + '\n\n'); } catch {} } }

function readBody(req, res, fn) {
  let body = '';
  req.on('data', d => { body += d; if (body.length > 40000) req.destroy(); });
  req.on('end', () => {
    let m; try { m = JSON.parse(body); } catch { return sendHttp(res, 400, 'dati non validi'); }
    try { fn(m); } catch (e) { console.error('api', e.message); if (!res.headersSent) sendHttp(res, 500, 'errore'); }
  });
}
const sendHttp = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
// Contro il «DNS rebinding»: un sito aperto nel browser potrebbe far puntare il suo nome a
// 127.0.0.1 e leggere le nostre risposte. Il browser però manda il suo nome nell'intestazione Host:
// accettiamo solo 127.0.0.1, localhost o [::1], con la nostra porta.
function hostLocale(req, porta) {
  const h = String(req.headers.host || '').toLowerCase();
  if (!h) return true;
  const m = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/.exec(h);
  return !!m && (!m[2] || +m[2] === +porta);
}
function httpHandler(req, res) {
  if (!hostLocale(req, PORT)) { res.writeHead(403); return res.end('Host non permesso'); }
  const url = new URL(req.url, 'http://localhost');
  const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
  if (!local) return sendHttp(res, 403, 'Il pannello si apre solo da questo computer.');

  // Il VTT sta su un'altra porta di questo stesso computer: gli lasciamo chiamare le api.
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(path.join(WEB, 'panel.html'), (e, d) =>
      e ? sendHttp(res, 404, 'panel.html non trovato') : sendHttp(res, 200, d, 'text/html; charset=utf-8'));
  }
  if (url.pathname === '/i18n.js' || /^\/lingua-[a-z]{2}\.js$/.test(url.pathname)) {   // le traduzioni
    return fs.readFile(path.join(WEB, 'js', 'base', url.pathname.slice(1)), (e, d) =>
      e ? sendHttp(res, 404, 'no') : sendHttp(res, 200, d, 'text/javascript; charset=utf-8'));
  }
  // Le immagini del mondo: /asset/<hash>. In «join», se manca, la si chiede all'host.
  if (url.pathname.startsWith('/asset/')) {
    const hash = url.pathname.slice(7);
    if (!isHash(hash)) return sendHttp(res, 400, 'Richiesta non valida');
    const serve = () => {
      fs.readFile(assetFile(hash), (e, d) => {
        if (e) return sendHttp(res, 404, 'Immagine non trovata');
        res.writeHead(200, {
          'Content-Type': (assetIndex[hash] && assetIndex[hash].mime) || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        res.end(d);
      });
    };
    if (haveAsset(hash)) return serve();
    if (MODE !== 'join') return sendHttp(res, 404, 'Immagine non trovata');
    return wantAsset(hash).then(buf => buf ? serve() : sendHttp(res, 504, 'L\'host non ha mandato l\'immagine'));
  }

  if (url.pathname === '/api/state') {
    let sessionId = null;
    try { sessionId = fs.readFileSync(LINK_ID_FILE, 'utf8').trim() || null; } catch {}
    return sendHttp(res, 200, JSON.stringify({
      mode: MODE, sessionId, perms: PERMS, roles: Object.keys(ROLE_DEFAULTS), defaults: ROLE_DEFAULTS,
      session,
      players: playerList(),
      log: actionLog.slice(-120),
      roster: Object.entries(roster).map(([token, r]) => ({
        token, ...r, perms: permsOf(r),
        online: [...clients].some(c => c.token === token),
        live: playerList().find(p => p.token === token) || null
      })),
      sheets: (world.sheets || []).map(s => ({ id: s.id, name: s.name, owner: s.owner || null })),
      scenes: (world.scenes || []).map(s => ({ id: s.id, name: s.name })),
      publicScene: world.publicScene, active: world.active,
      chat: (world.chat || []).slice(-40)
    }), 'application/json');
  }
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': benvenuto\n\n');
    panels.add(res);
    req.on('close', () => panels.delete(res));
    return;
  }
  if (url.pathname === '/api/perm' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendHttp(res, 400, 'dati non validi'); }
      if (MODE !== 'host') return sendHttp(res, 409, 'questo è un giocatore, non l\'host');
      const ok = applyPerm(m);
      sendHttp(res, ok ? 200 : 404, JSON.stringify({ ok }), 'application/json');
    });
    return;
  }
  if (url.pathname === '/api/scene' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 4000) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendHttp(res, 400, 'dati non validi'); }
      world.publicScene = m.id || null;
      scheduleSave(); pushWorldAll(); panelPush({ t: 'scene', id: world.publicScene });
      sendHttp(res, 200, '{"ok":true}', 'application/json');
    });
    return;
  }
  // --- moderazione: una sola porta per tutte le azioni dirette su una persona ---
  if (url.pathname === '/api/mod' && req.method === 'POST') {
    return readBody(req, res, m => {
      if (MODE !== 'host') return sendHttp(res, 409, 'questo è un giocatore, non l\'host');
      const rec = roster[m.token];
      if (!rec) return sendHttp(res, 404, '{"ok":false}', 'application/json');
      const live = () => [...clients].filter(c => c.token === m.token);
      const nome = rec.name || 'questa persona';
      switch (m.action) {
        case 'ban':
          rec.banned = true;
          for (const c of live()) shutOut(c, 'Il master ti ha bandito dalla sessione.');
          break;
        case 'unban': rec.banned = false; break;
        case 'mute': rec.muted = !!m.value; break;
        case 'freeze': rec.frozen = !!m.value; break;
        case 'resetPerms': rec.overrides = {}; break;
        case 'approve':
          rec.approved = true;
          for (const c of live()) if (c.pending) sendWelcome(c);
          break;
        case 'refuse':
          rec.approved = false;
          for (const c of live()) shutOut(c, 'Il master non ti ha fatto entrare.');
          break;
        case 'forceName':
          for (const c of live()) c.send({ t: 'rename', reason: str(m.reason, 200) || 'Il master ti chiede di cambiare nome.' });
          break;
        case 'message':
          for (const c of live()) c.send({ t: 'notice', text: str(m.text, 400), kind: 'warn' });
          break;
        default: return sendHttp(res, 400, '{"ok":false}', 'application/json');
      }
      logAction({ name: 'MASTER', token: '' }, 'mod.' + m.action, true, nome);
      scheduleSave(); sendPlayers(); pushWorldAll();
      sendHttp(res, 200, '{"ok":true}', 'application/json');
    });
  }

  // --- regole della sessione ---
  if (url.pathname === '/api/session' && req.method === 'POST') {
    return readBody(req, res, m => {
      if (MODE !== 'host') return sendHttp(res, 409, 'questo è un giocatore, non l\'host');
      for (const k of ['locked', 'approval', 'paused']) if (k in m) session[k] = !!m[k];
      if ('maxPlayers' in m) session.maxPlayers = Math.max(0, Math.min(40, parseInt(m.maxPlayers, 10) || 0));
      logAction({ name: 'MASTER', token: '' }, 'sessione', true, JSON.stringify(session));
      scheduleSave();
      panelPush({ t: 'session', session });
      broadcast({ t: 'session', session });
      sendHttp(res, 200, JSON.stringify({ ok: true, session }), 'application/json');
    });
  }

  if (url.pathname === '/api/kick' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendHttp(res, 400, 'dati non validi'); }
      for (const c of [...clients]) if (c.token === m.token) { c.send({ t: 'bye', reason: 'allontanato dal master' }); c.close(); }
      if (m.forget) delete roster[m.token];
      scheduleSave(); sendPlayers();
      sendHttp(res, 200, '{"ok":true}', 'application/json');
    });
    return;
  }
  sendHttp(res, 404, 'Non trovato');
}

// ======================= Avvio =======================
if (MODE === 'join') {
  // In «join» il browser manda tutto all'host e riceve tutto dall'host: qui non si decide niente.
  onMessage = function (c, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') lastHello = m;
    if (m.t === 'name' && lastHello) lastHello = { ...lastHello, name: m.name };
    if (m.t === 'leave') lastHello = null;                   // scollegato a mano: non ripresentarlo
    bridgeSend(m);
    if (m.t === 'hello') c.send({ t: 'link', up: hostUp });  // appena arrivato: sappia subito com'è il tubo
  };
  bridgeConnect();
  bridgeWatchdog();
} else {
  startLinkServer();
}

// battito: chi non risponde viene lasciato andare
if (MODE === 'host') {
  let misses = new WeakMap();
  setInterval(() => {
    for (const c of [...clients]) {
      if (c.alive === false) {
        const n = (misses.get(c) || 0) + 1;
        misses.set(c, n);
        if (n >= 3) { c.close(); detach(c); continue; }     // tre battiti a vuoto e si lascia andare
      } else misses.set(c, 0);
      c.alive = false;
      c.beatAt = Date.now();
      c.send({ t: 'beat' });
    }
  }, 8000);
}

process.on('uncaughtException', e => console.error(e));
const server = http.createServer(httpHandler);
server.on('upgrade', onUpgrade);
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `Porta ${PORT} occupata: usa PORT=4001 node server/game-server.js ${MODE}`
    : e.message);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log();
  console.log(`  Server di gioco in modo «${MODE}».`);
  console.log(`  Pannello:  http://localhost:${PORT}`);
  console.log(`  Il VTT si collega a ws://127.0.0.1:${PORT}/ws`);
  console.log(MODE === 'host'
    ? `  Ora avvia anche:  pacchetti/uffa-link/target/release/uffa-link host`
    : `  Ora avvia anche:  pacchetti/uffa-link/target/release/uffa-link join <ID>`);
  console.log();
});
