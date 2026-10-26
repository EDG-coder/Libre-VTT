// Server locale senza dipendenze: serve il sito e gestisce le foto in assets/ (con cartelle).
// Avvio: node server/server.js   (poi apri http://localhost:3000)
const http = require('http'), fs = require('fs'), path = require('path');

// ROOT: la cartella del programma (si legge soltanto): le pagine stanno in web/, i sistemi di
// gioco in sistemi/, il codice comune a server e browser in condiviso/. CAMP: la campagna, cioè
// le immagini (assets/) e lo stato (data/). Senza CAMPAIGN_DIR la campagna è la cartella del
// gioco stessa, come è sempre stato.
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const CAMP = process.env.CAMPAIGN_DIR ? path.resolve(process.env.CAMPAIGN_DIR) : ROOT;
const ASSETS = path.join(CAMP, 'assets');
const PORT = process.env.PORT || 3000;
const MAP_FILE = 'foto.webp';            // la mappa di base: non compare tra gli assets e non si tocca
const MAX_BYTES = 30 * 1024 * 1024;
const IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);
const TYPE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/bmp': '.bmp' };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp'
};

const DATA = path.join(CAMP, 'data');           // chat e stato della mappa (restano anche se spegni il server)
const STATE_KEYS = new Set(['board', 'chat', 'sheets', 'chats', 'notes']);
const BOOT = Date.now();               // cambia a ogni avvio del server (serve per mostrare la guida una volta)

fs.mkdirSync(ASSETS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), MIME['.json']);
const enc = encodeURIComponent;
const urlOf = (folder, name) => 'assets/' + (folder ? enc(folder) + '/' : '') + enc(name);

// Nomi sicuri: niente percorsi, niente punti iniziali, solo lettere/numeri/._-
// Le lettere di qualsiasi lingua restano. Il Node dentro le app per telefono (nodejs-mobile) non ha
// le tabelle Unicode e non capisce \p{L}: lì si tengono le lettere latine, greche e cirilliche.
const NON_NOME = (() => {
  try { return new RegExp('[^\\p{L}\\p{N}._-]+', 'gu'); }
  catch { return /[^A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF._-]+/g; }
})();
const clean = s => path.basename(String(s || '')).replace(NON_NOME, '_').replace(/^[._]+/, '').slice(0, 60);
const isMap = (folder, name) => !folder && name.toLowerCase() === MAP_FILE;
const okFile = n => n && n === path.basename(n) && !n.startsWith('.') && IMG.has(path.extname(n).toLowerCase());

// '' = assets/, altrimenti una sottocartella già esistente (già "pulita")
function folderDir(f) {
  if (!f) return ASSETS;
  if (f !== clean(f)) return null;
  const d = path.join(ASSETS, f);
  return fs.existsSync(d) && fs.statSync(d).isDirectory() ? d : null;
}

function safeName(raw, contentType) {
  let base = clean(raw) || 'foto';
  if (!IMG.has(path.extname(base).toLowerCase())) {
    const ext = TYPE_EXT[contentType];
    if (!ext) return null;
    base = path.basename(base, path.extname(base)) + ext;
  }
  return base;
}

// Nome libero nella cartella di destinazione: foto.webp, foto-1.webp, ...
function freeName(dir, folder, name) {
  const ext = path.extname(name), stem = path.basename(name, ext);
  for (let i = 0; ; i++) {
    const n = i ? `${stem}-${i}${ext}` : name;
    if (!isMap(folder, n) && !fs.existsSync(path.join(dir, n))) return n;
  }
}

function listAll() {
  const folders = [], items = [];
  const scan = (dir, folder) => {
    for (const n of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, n));
      if (st.isDirectory() && !folder && !n.startsWith('.')) { folders.push({ name: n, count: 0 }); scan(path.join(dir, n), n); }
      else if (st.isFile() && okFile(n) && !isMap(folder, n)) items.push({ name: n, folder, url: urlOf(folder, n), t: st.mtimeMs });
    }
  };
  scan(ASSETS, '');
  items.sort((a, b) => b.t - a.t);
  for (const f of folders) f.count = items.filter(i => i.folder === f.name).length;
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return { folders, items: items.map(({ t, ...i }) => i) };
}

function saveUpload(req, res, q) {
  const dir = folderDir(q.get('folder') || '');
  const name = safeName(q.get('name'), req.headers['content-type']);
  if (!dir) return send(res, 404, 'Cartella non trovata');
  if (!name) return send(res, 415, 'Formato non supportato');
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BYTES) { tooBig = true; send(res, 413, 'File troppo grande (max 30 MB)'); req.destroy(); }
    else chunks.push(c);
  });
  req.on('end', () => {
    if (tooBig) return;
    if (!size) return send(res, 400, 'File vuoto');
    const folder = q.get('folder') || '', final = freeName(dir, folder, name);
    try {
      fs.writeFileSync(path.join(dir, final), Buffer.concat(chunks), { flag: 'wx' });   // mai sovrascrivere
      json(res, 201, { name: final, folder, url: urlOf(folder, final) });
    } catch { send(res, 500, 'Errore di salvataggio'); }
  });
}

function deleteAsset(res, q) {
  const folder = q.get('folder') || '', dir = folderDir(folder), name = q.get('name');
  if (!dir || !okFile(name) || isMap(folder, name)) return send(res, 400, 'Richiesta non valida');
  try { fs.unlinkSync(path.join(dir, name)); json(res, 200, { ok: true }); }
  catch { send(res, 404, 'File non trovato'); }
}

function moveAsset(res, q) {
  const fromF = q.get('from') || '', toF = q.get('to') || '', name = q.get('name');
  const from = folderDir(fromF), to = folderDir(toF);
  if (!from || !to || !okFile(name) || isMap(fromF, name)) return send(res, 400, 'Richiesta non valida');
  if (!fs.existsSync(path.join(from, name))) return send(res, 404, 'File non trovato');
  const final = freeName(to, toF, name);
  fs.renameSync(path.join(from, name), path.join(to, final));
  json(res, 200, { name: final, folder: toF, url: urlOf(toF, final) });
}

function getState(res, q) {
  const key = q.get('key');
  if (!STATE_KEYS.has(key)) return send(res, 400, 'Chiave non valida');
  try { send(res, 200, fs.readFileSync(path.join(DATA, key + '.json')), MIME['.json']); }
  catch { json(res, 200, null); }
}

function saveState(req, res, q) {
  const key = q.get('key');
  if (!STATE_KEYS.has(key)) return send(res, 400, 'Chiave non valida');
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => {
    size += c.length;
    if (size > 5 * 1024 * 1024) { tooBig = true; send(res, 413, 'Dati troppo grandi'); req.destroy(); }
    else chunks.push(c);
  });
  req.on('end', () => {
    if (tooBig) return;
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      JSON.parse(body);                                     // deve essere JSON valido
      const file = path.join(DATA, key + '.json');
      fs.writeFileSync(file + '.tmp', body);
      fs.renameSync(file + '.tmp', file);                   // scrittura atomica
      json(res, 200, { ok: true });
    } catch { send(res, 400, 'Dati non validi'); }
  });
}

// ---------- il sistema di gioco della campagna ----------
// campagna.json → sistema.id: uno di quelli del programma (sistemi/<id>/) oppure «personalizzato»,
// che sta nella campagna (sistema/) e si può modificare dal tavolo. Il browser lo legge da /sistema/….
const META = path.join(CAMP, 'campagna.json');
const leggiMeta = () => { try { return JSON.parse(fs.readFileSync(META, 'utf8')) || {}; } catch { return {}; } };
function cartellaSistema() {
  const m = leggiMeta(), id = m.sistema && m.sistema.id;
  if (id === 'personalizzato' && fs.existsSync(path.join(CAMP, 'sistema', 'sistema.json'))) return { dir: path.join(CAMP, 'sistema'), id, mio: true };
  const nome = /^[\w.-]+$/.test(id || '') && fs.existsSync(path.join(ROOT, 'sistemi', id, 'sistema.json')) ? id : 'dnd5e-2014';
  return { dir: path.join(ROOT, 'sistemi', nome), id: nome, mio: false, scelto: !!id };
}
function infoSistema(res) {
  const c = cartellaSistema();
  let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(c.dir, 'sistema.json'), 'utf8')); } catch {}
  json(res, 200, { id: c.id, nome: j.nome || c.id, personalizzato: c.mio, scelto: c.scelto !== false });
}
// salva un file del sistema personalizzato (solo sistema.json, formule.json e lingue/*.json)
function salvaSistema(req, res, q) {
  const c = cartellaSistema();
  if (!c.mio) return send(res, 409, 'Il sistema della campagna non è personalizzato');
  const nome = String(q.get('file') || '');
  if (!/^(sistema|formule)\.json$|^lingue\/[a-z]{2}\.json$/.test(nome)) return send(res, 400, 'File non valido');
  const parti = []; let n = 0, troppo = false;
  req.on('data', d => { n += d.length; if (n > 2 * 1024 * 1024) { troppo = true; send(res, 413, 'Troppo grande'); req.destroy(); } else parti.push(d); });
  req.on('end', () => {
    if (troppo) return;
    let j; try { j = JSON.parse(Buffer.concat(parti).toString('utf8')); } catch { return send(res, 400, 'Non è JSON valido'); }
    if (nome === 'sistema.json') { if (j.formato !== 'libre-vtt-sistema') return send(res, 400, 'Manca «formato»'); j.id = 'personalizzato'; }
    if (nome === 'formule.json' && j.formato !== 'libre-vtt-formule') return send(res, 400, 'Manca «formato»');
    const f = path.join(c.dir, nome);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 2)); fs.renameSync(f + '.tmp', f);
    if (nome === 'sistema.json') { const m = leggiMeta(); m.sistema = { id: 'personalizzato', nome: String(j.nome || 'Sistema personalizzato').slice(0, 60) }; fs.writeFileSync(META, JSON.stringify(m, null, 2)); }
    json(res, 200, { ok: true });
  });
}
// «rendilo personalizzato»: copia il sistema del programma dentro la campagna, per poterlo cambiare
function personalizzaSistema(res) {
  const c = cartellaSistema();
  if (c.mio) return json(res, 200, { ok: true });
  const dest = path.join(CAMP, 'sistema');
  if (fs.existsSync(dest)) fs.renameSync(dest, path.join(CAMP, 'sistema-precedente-' + Date.now().toString(36)));
  fs.cpSync(c.dir, dest, { recursive: true });
  const j = JSON.parse(fs.readFileSync(path.join(dest, 'sistema.json'), 'utf8'));
  j.id = 'personalizzato'; j.nome = j.nome + ' (personalizzato)';
  fs.writeFileSync(path.join(dest, 'sistema.json'), JSON.stringify(j, null, 2));
  const m = leggiMeta(); m.sistema = { id: 'personalizzato', nome: j.nome }; fs.writeFileSync(META, JSON.stringify(m, null, 2));
  json(res, 200, { ok: true });
}
// esporta il sistema come .libresistema (uno zip della sua cartella)
function esportaSistema(res) {
  const c = cartellaSistema();
  const { creaZip } = require('./zip');
  const tmp = path.join(require('os').tmpdir(), 'libre-sistema-' + Date.now().toString(36) + '.zip');
  try {
    creaZip(c.dir, tmp, { radice: '' });
    const b = fs.readFileSync(tmp);
    let nome = 'sistema'; try { nome = JSON.parse(fs.readFileSync(path.join(c.dir, 'sistema.json'), 'utf8')).nome || nome; } catch {}
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.libresistema')}`, 'Cache-Control': 'no-store' });
    res.end(b);
  } catch (e) { send(res, 500, 'Non riesco a esportarlo: ' + e.message); }
  finally { fs.rm(tmp, { force: true }, () => {}); }
}

// ---------- il compendio ----------
// I pacchetti di base vengono col sistema (sistema/compendio/<id>/); quelli importati o fatti a mano
// stanno nella campagna (compendio/<id>/). Ogni pacchetto: pacchetto.json + voci/<tipo>.json (+ immagini/).
// compendio/visibilita.json: { pacchetti: { id: 'tutti'|'master' }, voci: { 'pacchetto|voce': 'master'|'tutti' }, giocatoriImportano: bool }
const COMP = path.join(CAMP, 'compendio');
const ID_PACK = /^[\w.-]{1,60}$/;
function leggiJsonF(f, d = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function elencoCompendio(res) {
  const out = [];
  const giro = (dir, base, dove) => {
    let nomi = []; try { nomi = fs.readdirSync(dir); } catch {}
    for (const n of nomi) {
      if (!ID_PACK.test(n) || n.startsWith('.')) continue;
      const j = leggiJsonF(path.join(dir, n, 'pacchetto.json'));
      if (!j || j.formato !== 'libre-vtt-pacchetto') continue;
      let tipi = []; try { tipi = fs.readdirSync(path.join(dir, n, 'voci')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch {}
      out.push({ ...j, id: n, base, url: dove + n + '/', tipi });
    }
  };
  giro(path.join(cartellaSistema().dir, 'compendio'), true, 'sistema/compendio/');
  giro(COMP, false, 'compendio/');
  json(res, 200, { pacchetti: out, visibilita: leggiJsonF(path.join(COMP, 'visibilita.json'), { pacchetti: {}, voci: {} }) });
}
const corpoBin = (req, res, max, fn) => {
  const parti = []; let n = 0, troppo = false;
  req.on('data', d => { n += d.length; if (n > max) { troppo = true; send(res, 413, 'Troppo grande'); req.destroy(); } else parti.push(d); });
  req.on('end', () => { if (!troppo) fn(Buffer.concat(parti)); });
};
const idLibero = base => { let id = String(base || 'pacchetto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'pacchetto', i = 2, x = id; while (fs.existsSync(path.join(COMP, x))) x = id + '-' + i++; return x; };
// un .librepack (zip) da importare
function importaPacchetto(req, res) {
  corpoBin(req, res, 80 * 1024 * 1024, b => {
    if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) return send(res, 400, 'Non è un file .librepack (zip)');
    const { estraiZip } = require('./zip');
    const tmpZ = path.join(require('os').tmpdir(), 'libre-pack-' + Date.now().toString(36) + '.zip'), tmp = tmpZ + '.d';
    try {
      fs.writeFileSync(tmpZ, b);
      estraiZip(tmpZ, tmp, { maxByte: 300 * 1024 * 1024, maxVoci: 20000 });
      let radice = tmp;
      if (!fs.existsSync(path.join(tmp, 'pacchetto.json'))) { const d = fs.readdirSync(tmp).filter(n => !n.startsWith('.')); if (d.length === 1 && fs.existsSync(path.join(tmp, d[0], 'pacchetto.json'))) radice = path.join(tmp, d[0]); }
      const j = leggiJsonF(path.join(radice, 'pacchetto.json'));
      if (!j || j.formato !== 'libre-vtt-pacchetto') return send(res, 400, 'Manca pacchetto.json: non è un pacchetto di LIBRE VTT');
      fs.mkdirSync(COMP, { recursive: true });
      const id = idLibero(j.id || j.nome);
      fs.renameSync(radice, path.join(COMP, id));
      j.id = id; delete j.base;
      fs.writeFileSync(path.join(COMP, id, 'pacchetto.json'), JSON.stringify(j, null, 2));
      json(res, 200, { ok: true, id, nome: j.nome });
    } catch (e) { send(res, 400, 'Non riesco a importarlo: ' + e.message); }
    finally { fs.rm(tmpZ, { force: true }, () => {}); fs.rm(tmp, { recursive: true, force: true }, () => {}); }
  });
}
// un pacchetto (o delle voci da aggiungere) in JSON: { pacchetto: {...}, voci: { tipo: [voce…] }, unisci: id? }
function salvaPacchetto(req, res) {
  corpoBin(req, res, 60 * 1024 * 1024, b => {
    let m; try { m = JSON.parse(b.toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    const p = m.pacchetto || {};
    fs.mkdirSync(COMP, { recursive: true });
    const id = m.unisci && ID_PACK.test(m.unisci) && fs.existsSync(path.join(COMP, m.unisci, 'pacchetto.json')) ? m.unisci : idLibero(p.id || p.nome);
    const dir = path.join(COMP, id);
    fs.mkdirSync(path.join(dir, 'voci'), { recursive: true });
    const vecchio = leggiJsonF(path.join(dir, 'pacchetto.json'), {});
    const pk = { ...vecchio, ...p, formato: 'libre-vtt-pacchetto', versione: 1, id };
    delete pk.base;
    const conta = { ...(vecchio.voci || {}) };
    for (const [tipo, arr] of Object.entries(m.voci || {})) {
      if (!/^[a-z]{2,20}$/.test(tipo) || !Array.isArray(arr)) continue;
      const f = path.join(dir, 'voci', tipo + '.json');
      const prima = new Map((leggiJsonF(f, []) || []).map(v => [v.id, v]));
      for (const v of arr) { if (!v || !v.nome) continue; v.tipo = tipo; v.id = v.id || tipo + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); if (v._via) prima.delete(v.id); else prima.set(v.id, v); }
      const tutte = [...prima.values()].filter(v => !v._via).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
      fs.writeFileSync(f, JSON.stringify(tutte));
      conta[tipo] = tutte.length;
    }
    pk.voci = conta;
    fs.writeFileSync(path.join(dir, 'pacchetto.json'), JSON.stringify(pk, null, 2));
    json(res, 200, { ok: true, id });
  });
}
function eliminaPacchetto(res, q) {
  const id = String(q.get('id') || '');
  if (!ID_PACK.test(id) || !fs.existsSync(path.join(COMP, id))) return send(res, 404, 'Pacchetto sconosciuto');
  const via = path.join(COMP, '.eliminati'); fs.mkdirSync(via, { recursive: true });
  fs.renameSync(path.join(COMP, id), path.join(via, id + '-' + Date.now().toString(36)));     // si può recuperare a mano
  json(res, 200, { ok: true });
}
function esportaPacchetto(res, q) {
  const id = String(q.get('id') || '');
  let dir = path.join(COMP, id);
  if (!ID_PACK.test(id)) return send(res, 400, 'no');
  if (!fs.existsSync(dir)) dir = path.join(cartellaSistema().dir, 'compendio', id);
  if (!fs.existsSync(path.join(dir, 'pacchetto.json'))) return send(res, 404, 'Pacchetto sconosciuto');
  const { creaZip } = require('./zip');
  const tmp = path.join(require('os').tmpdir(), 'libre-pack-' + Date.now().toString(36) + '.zip');
  try {
    creaZip(dir, tmp, { radice: '' });
    const j = leggiJsonF(path.join(dir, 'pacchetto.json'), {});
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(String(j.nome || id).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.librepack')}`, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(tmp));
  } catch (e) { send(res, 500, e.message); } finally { fs.rm(tmp, { force: true }, () => {}); }
}
function salvaVisibilita(req, res) {
  corpoBin(req, res, 4 * 1024 * 1024, b => {
    let j; try { j = JSON.parse(b.toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    fs.mkdirSync(COMP, { recursive: true });
    fs.writeFileSync(path.join(COMP, 'visibilita.json'), JSON.stringify({ pacchetti: j.pacchetti || {}, voci: j.voci || {}, giocatoriImportano: !!j.giocatoriImportano }, null, 1));
    json(res, 200, { ok: true });
  });
}

// ---------- Open5e: la sua API (v2) letta passando da qui ----------
// Il tavolo chiede /api/open5e?percorso=creatures/&search=…: solo GET, solo api.open5e.com/v2 e solo
// gli elenchi che servono al compendio. (Dal browser direttamente non sempre si può, e così si
// controlla cosa esce.)
const OPEN5E_OK = new Set(['documents/', 'creatures/', 'spells/', 'items/', 'magicitems/', 'weapons/', 'armor/', 'feats/', 'species/', 'backgrounds/', 'conditions/', 'classes/', 'rules/']);
function open5e(res, q) {
  const percorso = String(q.get('percorso') || '');
  if (!OPEN5E_OK.has(percorso)) return send(res, 400, 'Elenco non permesso');
  const u = new URL('https://api.open5e.com/v2/' + percorso);
  for (const [k, v] of q) if (k !== 'percorso' && /^[\w_]{1,40}$/.test(k)) u.searchParams.set(k, String(v).slice(0, 200));
  u.searchParams.set('format', 'json');
  const r = require('https').get(u, { timeout: 20000, headers: { 'User-Agent': 'LIBRE VTT' } }, x => {
    if (x.statusCode !== 200) { x.resume(); return send(res, 502, 'Open5e ha risposto ' + x.statusCode); }
    const parti = []; let n = 0;
    x.on('data', d => { n += d.length; if (n > 30 * 1024 * 1024) { x.destroy(); } else parti.push(d); });
    x.on('end', () => send(res, 200, Buffer.concat(parti), MIME['.json']));
  });
  r.on('timeout', () => r.destroy(new Error('tempo scaduto')));
  r.on('error', e => { if (!res.headersSent) send(res, 502, 'Open5e non risponde (' + e.message + '): sei collegato a internet?'); });
}

// Miniature delle scene: data/miniature/<id scena>.webp (le fa il browser quando lasci una scena)
const MINI = path.join(DATA, 'miniature');
const miniFile = q => { const id = String(q.get('id') || ''); return /^[\w-]{1,80}$/.test(id) ? path.join(MINI, id + '.webp') : null; };
function getMini(res, q) {
  const f = miniFile(q); if (!f) return send(res, 400, 'Scena non valida');
  fs.readFile(f, (e, d) => e ? send(res, 404, 'Non c\'è') : (res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache' }), res.end(d)));
}
function saveMini(req, res, q) {
  const f = miniFile(q); if (!f) return send(res, 400, 'Scena non valida');
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => { size += c.length; if (size > 400 * 1024) { tooBig = true; send(res, 413, 'Troppo grande'); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (tooBig) return;
    const b = Buffer.concat(chunks);
    if (b.length < 12 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return send(res, 400, 'Non è un\'immagine webp');
    try { fs.mkdirSync(MINI, { recursive: true }); fs.writeFileSync(f + '.tmp', b); fs.renameSync(f + '.tmp', f); json(res, 200, { ok: true }); }
    catch { send(res, 500, 'Non riesco a salvarla'); }
  });
}
function deleteMini(res, q) {
  const f = miniFile(q); if (!f) return send(res, 400, 'Scena non valida');
  fs.rm(f, { force: true }, () => json(res, 200, { ok: true }));
}

function createFolder(res, q) {
  const name = clean(q.get('name'));
  if (!name) return send(res, 400, 'Nome non valido');
  try { fs.mkdirSync(path.join(ASSETS, name)); json(res, 201, { name }); }
  catch (e) { send(res, e.code === 'EEXIST' ? 409 : 500, e.code === 'EEXIST' ? 'Esiste già una cartella con questo nome' : 'Errore'); }
}

function deleteFolder(res, q) {
  const f = q.get('name'), dir = f && folderDir(f);
  if (!dir) return send(res, 404, 'Cartella non trovata');
  try {
    try { fs.unlinkSync(path.join(dir, '.DS_Store')); } catch {}
    fs.rmdirSync(dir);                       // fallisce se non è vuota
    json(res, 200, { ok: true });
  } catch { send(res, 409, 'La cartella non è vuota'); }
}

// Contro il «DNS rebinding»: un sito aperto nel browser potrebbe far puntare il suo nome a
// 127.0.0.1 e leggere le nostre risposte. Il browser però manda il suo nome nell'intestazione Host:
// accettiamo solo 127.0.0.1, localhost o [::1], con la nostra porta.
function hostLocale(req, porta) {
  const h = String(req.headers.host || '').toLowerCase();
  if (!h) return true;
  const m = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/.exec(h);
  return !!m && (!m[2] || +m[2] === +porta);
}
function handle(req, res) {
  if (!hostLocale(req, PORT)) return send(res, 403, 'Host non permesso');
  const url = new URL(req.url, 'http://localhost'), q = url.searchParams, p = url.pathname;
  if (p.startsWith('/api/')) {
    const origin = req.headers.origin;
    if (req.method !== 'GET' && origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, 'Origine non consentita');
    const route = `${req.method} ${p}`;
    if (route === 'GET /api/assets') return json(res, 200, listAll());
    if (route === 'POST /api/assets') return saveUpload(req, res, q);
    if (route === 'DELETE /api/assets') return deleteAsset(res, q);
    if (route === 'POST /api/move') return moveAsset(res, q);
    if (route === 'POST /api/folders') return createFolder(res, q);
    if (route === 'DELETE /api/folders') return deleteFolder(res, q);
    if (route === 'GET /api/boot') return json(res, 200, { boot: BOOT });
    if (route === 'GET /api/state') return getState(res, q);
    if (route === 'PUT /api/state') return saveState(req, res, q);
    if (route === 'GET /api/miniatura') return getMini(res, q);
    if (route === 'GET /api/sistema') return infoSistema(res);
    if (route === 'GET /api/compendio') return elencoCompendio(res);
    if (route === 'GET /api/open5e') return open5e(res, q);
    if (route === 'POST /api/compendio/importa') return importaPacchetto(req, res);
    if (route === 'POST /api/compendio/pacchetto') return salvaPacchetto(req, res);
    if (route === 'DELETE /api/compendio') return eliminaPacchetto(res, q);
    if (route === 'GET /api/compendio/esporta') return esportaPacchetto(res, q);
    if (route === 'PUT /api/compendio/visibilita') return salvaVisibilita(req, res);
    if (route === 'PUT /api/sistema') return salvaSistema(req, res, q);
    if (route === 'POST /api/sistema/personalizza') return personalizzaSistema(res);
    if (route === 'GET /api/sistema/esporta') return esportaSistema(res);
    if (route === 'PUT /api/miniatura') return saveMini(req, res, q);
    if (route === 'DELETE /api/miniatura') return deleteMini(res, q);
    return send(res, 405, 'Richiesta non consentita');
  }
  if (req.method !== 'GET') return send(res, 405, 'Metodo non consentito');
  let rel;
  try { rel = decodeURIComponent(p); } catch { return send(res, 400, 'Richiesta non valida'); }
  if (rel.startsWith('/data/')) return send(res, 404, 'Non trovato');
  // /asset/<hash>: le immagini del deposito della partita (data/assets), per giocare da soli
  // una campagna nata in rete: senza server di gioco nessun altro le darebbe
  const dep = /^\/asset\/([a-f0-9]{64})$/.exec(rel);
  if (dep) {
    let idx = {};
    try { idx = JSON.parse(fs.readFileSync(path.join(DATA, 'assets.json'), 'utf8')) || {}; } catch {}
    const info = idx[dep[1]];
    if (!info) return send(res, 404, 'Non trovato');
    return fs.readFile(path.join(DATA, 'assets', dep[1] + (info.ext || '')), (err, d) => err ? send(res, 404, 'Non trovato')
      : (res.writeHead(200, { 'Content-Type': info.mime || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' }), res.end(d)));
  }
  // i pacchetti del compendio della campagna
  if (rel.startsWith('/compendio/')) {
    const file = path.join(COMP, rel.slice(11)), type = MIME[path.extname(file).toLowerCase()];
    if (!file.startsWith(COMP + path.sep) || !type || rel.includes('/.')) return send(res, 404, 'Non trovato');
    return fs.readFile(file, (err, d) => err ? send(res, 404, 'Non trovato') : send(res, 200, d, type));
  }
  // i file del sistema di gioco della campagna (sistema.json, formule.json, compendio, lingue)
  if (rel.startsWith('/sistema/')) {
    const dir = cartellaSistema().dir, file = path.join(dir, rel.slice(9));
    const type = MIME[path.extname(file).toLowerCase()];
    if (!file.startsWith(dir + path.sep) || !type) return send(res, 404, 'Non trovato');
    return fs.readFile(file, (err, d) => err ? send(res, 404, 'Non trovato') : send(res, 200, d, type));
  }
  // le immagini vengono dalla campagna, il codice comune da condiviso/, tutto il resto dalle pagine (web/)
  const comune = rel.startsWith('/condiviso/');
  const base = rel.startsWith('/assets/') ? CAMP : comune ? path.join(ROOT, 'condiviso') : WEB;
  const file = path.join(base, rel === '/' ? 'index.html' : comune ? rel.slice(10) : rel);
  const type = MIME[path.extname(file).toLowerCase()];
  if (!file.startsWith(base + path.sep) || !type) return send(res, 404, 'Non trovato');
  fs.readFile(file, (err, data) => err ? send(res, 404, 'Non trovato') : send(res, 200, data, type));
}

process.on('uncaughtException', e => console.error(e));
http.createServer((req, res) => {
  try { handle(req, res); }
  catch (e) { console.error(e); if (!res.headersSent) send(res, 500, 'Errore interno'); }
}).on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Porta ${PORT} occupata: usa PORT=3001 node server/server.js` : e.message);
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => console.log(`Apri http://localhost:${PORT}  (Ctrl+C per fermare)`));
