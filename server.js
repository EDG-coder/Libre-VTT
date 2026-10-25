// Server locale senza dipendenze: serve il sito e gestisce le foto in assets/ (con cartelle).
// Avvio: node server.js   (poi apri http://localhost:3000)
const http = require('http'), fs = require('fs'), path = require('path');

// ROOT: i file del programma (si leggono soltanto). CAMP: la campagna, cioè le immagini
// (assets/) e lo stato (data/). Senza CAMPAIGN_DIR la campagna è la cartella del gioco stessa,
// come è sempre stato.
const ROOT = __dirname;
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
  // le immagini vengono dalla campagna, tutto il resto dal programma
  const base = rel.startsWith('/assets/') ? CAMP : ROOT;
  const file = path.join(base, rel === '/' ? 'index.html' : rel);
  const type = MIME[path.extname(file).toLowerCase()];
  if (!file.startsWith(base + path.sep) || !type) return send(res, 404, 'Non trovato');
  fs.readFile(file, (err, data) => err ? send(res, 404, 'Non trovato') : send(res, 200, data, type));
}

process.on('uncaughtException', e => console.error(e));
http.createServer((req, res) => {
  try { handle(req, res); }
  catch (e) { console.error(e); if (!res.headersSent) send(res, 500, 'Errore interno'); }
}).on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Porta ${PORT} occupata: usa PORT=3001 node server.js` : e.message);
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => console.log(`Apri http://localhost:${PORT}  (Ctrl+C per fermare)`));
