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
// le immagini degli assets, e i video in loop degli sfondi animati (mp4, webm)
const IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg', '.mp4', '.webm']);
const TYPE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/bmp': '.bmp', 'image/svg+xml': '.svg',
  'video/mp4': '.mp4', 'video/webm': '.webm' };
const eVideo = f => /\.(mp4|webm)$/i.test(f);
const SVG = require('../condiviso/svg-pulito.js');
const { intestazioniPagina, segretoOk } = require('./csp.js');
// ---------- Musica dal computer: le canzoni stanno nella cartella musica/ della campagna ----------
const MUSICA = path.join(CAMP, 'musica');
const MAX_MUSICA = 40 * 1024 * 1024;
const AUDIO = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.weba': 'audio/webm' };
const AUDIO_TYPE_EXT = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/webm': '.weba' };
const ASSET_MIME = new Set([...Object.keys(TYPE_EXT), 'application/json', ...new Set(Object.values(AUDIO))]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm'
};

const DATA = path.join(CAMP, 'data');           // chat e stato della mappa (restano anche se spegni il server)
const STATE_KEYS = new Set(['board', 'chat', 'sheets', 'chats', 'notes']);
// I plugin (Documenti › LIBRE VTT › Plugins): quali applicare lo decide la rotellina della home (vedi server/plugins.js)
const PLUGINS = process.env.LIBRE_PLUGINS_DIR && process.env.LIBRE_PLUGINS_STATE
  ? require('./plugins.js').createPlugins({ dir: path.resolve(process.env.LIBRE_PLUGINS_DIR), stateFile: path.resolve(process.env.LIBRE_PLUGINS_STATE),
    appVersion: String((() => { try { return require('../package.json').version; } catch { return ''; } })()) })
  : null;
const { cleanCss, hashFiles, MAX_SHARE } = require('./plugins.js');
// I plugin con accesso completo che il master di una partita ha condiviso e che chi gioca ha accettato: il tavolo
// li riceve dal collegamento e li lascia qui, SOLO IN MEMORIA (spegnendo LIBRE VTT spariscono), perché il browser
// possa importarli come un modulo con i loro file accanto. Si tengono solo se i file danno proprio l'impronta
// annunciata: è a quella che il giocatore ha dato il consenso. Nell'app per telefoni non ci sono (regole degli store).
const RICEVUTI_PIENI = process.env.LIBRE_RICEVUTI_PIENI === '1';
const ricevuti = new Map();          // `${id}@${hash}` -> Map(percorso -> Buffer)
function salvaRicevuto(req, res) {
  if (!RICEVUTI_PIENI) return send(res, 403, 'Qui i plugin con accesso completo del master non si possono usare.');
  if (!/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, 'Serve JSON');
  const parti = []; let n = 0, troppo = false;
  req.on('data', d => { n += d.length; if (n > MAX_SHARE * 1.4 + 65536) { troppo = true; send(res, 413, 'Troppo grande'); req.destroy(); } else parti.push(d); });
  req.on('end', () => {
    if (troppo) return;
    let j; try { j = JSON.parse(Buffer.concat(parti).toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    const id = String(j && j.id || ''), hash = String(j && j.hash || '');
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash) || !Array.isArray(j.files)) return send(res, 400, 'Plugin non valido');
    const files = [];
    for (const x of j.files) {
      const f = Array.isArray(x) ? String(x[0] || '') : '';
      if (!f || f.split('/').some(seg => !seg || seg === '..' || seg.startsWith('.')) || f.includes('\\')) return send(res, 400, 'Percorso non valido');
      files.push([f, Buffer.from(String(x[1] || ''), 'base64')]);
    }
    if (hashFiles(files) !== hash) return send(res, 409, 'I file non corrispondono all\'impronta del plugin');
    for (const k of [...ricevuti.keys()]) if (k.startsWith(id + '@')) ricevuti.delete(k);    // la versione vecchia via
    while (ricevuti.size >= 20) ricevuti.delete(ricevuti.keys().next().value);
    ricevuti.set(id + '@' + hash, new Map(files));
    json(res, 200, { ok: true });
  });
}
const BOOT = Date.now();               // cambia a ogni avvio del server (serve per mostrare la guida una volta)

fs.mkdirSync(ASSETS, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

// un SVG aperto da solo non deve poter eseguire niente (anche se è già stato ripulito)
const CSP_SVG = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': CSP_SVG } : {}),
    ...(type.startsWith('text/html') ? intestazioniPagina(body, { youtube: true }) : {}) });
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

// Sfondi animati: 'video' (mp4, webm) o 'img' (GIF, WebP, PNG animati), così il browser non deve riscaricare
// il file per saperlo. Si legge una volta per file (finché non cambia).
const ANIM = require('../condiviso/animazione.js');
const animCache = new Map();
function tipoAnim(file, st) {
  if (eVideo(file)) return 'video';
  if (!/\.(gif|webp|png)$/i.test(file)) return '';
  const chiave = file + '|' + st.mtimeMs + '|' + st.size;
  if (!animCache.has(chiave)) {
    let a = ''; try { a = ANIM.animata(fs.readFileSync(file)) ? 'img' : ''; } catch {}
    if (animCache.size > 2000) animCache.clear();
    animCache.set(chiave, a);
  }
  return animCache.get(chiave);
}

function listAll() {
  const folders = [], items = [];
  const scan = (dir, folder) => {
    for (const n of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, n));
      if (st.isDirectory() && !folder && !n.startsWith('.')) { folders.push({ name: n, count: 0 }); scan(path.join(dir, n), n); }
      else if (st.isFile() && okFile(n) && !isMap(folder, n)) {
        const it = { name: n, folder, url: urlOf(folder, n), t: st.mtimeMs }, anim = tipoAnim(path.join(dir, n), st);
        if (anim) it.anim = anim;
        items.push(it);
      }
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
    let dati = Buffer.concat(chunks);
    if (path.extname(final).toLowerCase() === '.svg') {          // si tiene solo la parte che disegna
      const p = SVG.pulisci(dati.toString('utf8'));
      if (p.errore) return send(res, 415, p.errore);
      dati = Buffer.from(p.svg, 'utf8');
    }
    try {
      fs.writeFileSync(path.join(dir, final), dati, { flag: 'wx' });   // mai sovrascrivere
      json(res, 201, { name: final, folder, url: urlOf(folder, final) });
    } catch { send(res, 500, 'Errore di salvataggio'); }
  });
}

// Le canzoni: elenco, caricamento (mai sovrascrivere), eliminazione, e il file a pezzi (Range) per il lettore.
const okBrano = n => n && n === path.basename(n) && !n.startsWith('.') && !!AUDIO[path.extname(n).toLowerCase()];
function elencoMusica(res) {
  let brani = [];
  try {
    brani = fs.readdirSync(MUSICA, { withFileTypes: true }).filter(d => d.isFile() && okBrano(d.name))
      .map(d => ({ name: d.name, bytes: fs.statSync(path.join(MUSICA, d.name)).size })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {}
  json(res, 200, { brani });
}
function salvaBrano(req, res, q) {
  let base = clean(q.get('name')) || 'canzone';
  if (!AUDIO[path.extname(base).toLowerCase()]) {
    const ext = AUDIO_TYPE_EXT[String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim()];
    if (!ext) return send(res, 415, 'Formato non supportato (mp3, ogg, wav, m4a, aac, flac)');
    base = path.basename(base, path.extname(base)) + ext;
  }
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_MUSICA) { tooBig = true; send(res, 413, 'Canzone troppo grande (max 40 MB)'); req.destroy(); }
    else chunks.push(c);
  });
  req.on('end', () => {
    if (tooBig) return;
    if (!size) return send(res, 400, 'File vuoto');
    try { fs.mkdirSync(MUSICA, { recursive: true }); } catch {}
    const dati = Buffer.concat(chunks);
    // la stessa canzone caricata di nuovo non si copia due volte
    const ext = path.extname(base), stem = path.basename(base, ext);
    for (let i = 0; ; i++) {
      const n = i ? `${stem}-${i}${ext}` : base, f = path.join(MUSICA, n);
      if (fs.existsSync(f)) {
        try { if (fs.statSync(f).size === dati.length && fs.readFileSync(f).equals(dati)) return json(res, 200, { name: n, bytes: dati.length }); } catch {}
        continue;
      }
      try { fs.writeFileSync(f, dati, { flag: 'wx' }); return json(res, 201, { name: n, bytes: dati.length }); }
      catch { return send(res, 500, 'Errore di salvataggio'); }
    }
  });
}
function eliminaBrano(res, q) {
  const n = q.get('name');
  if (!okBrano(n)) return send(res, 400, 'Richiesta non valida');
  try { fs.unlinkSync(path.join(MUSICA, n)); json(res, 200, { ok: true }); } catch { send(res, 404, 'File non trovato'); }
}
/** Un file audio o video, intero o il pezzo chiesto con Range (Safari e iPhone senza non lo suonano). */
function mandaAudio(req, res, file, tipo, testa = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Non trovato');
    const base = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', ...testa };
    const r = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (r && (r[1] || r[2])) {
      const da = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), a = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
      if (da >= st.size || da > a) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${da}-${a}/${st.size}`, 'Content-Length': a - da + 1 });
      return fs.createReadStream(file, { start: da, end: a }).pipe(res);
    }
    res.writeHead(200, { ...base, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
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
// I manuali importati (letti da un PDF che l'utente possiede) non stanno nella campagna ma in un catalogo
// privato dell'utente: vedi manuali-privati.js. Non si esportano e non vanno mai in rete.
const MANUALI_P = require('./manuali-privati.js');
const MANUALI = MANUALI_P.cartellaManuali();
const ID_PACK = /^[\w.-]{1,60}$/;
// dove sta il pacchetto <id>: nel catalogo privato o nella campagna (null se non c'è)
const dirPacchetto = id => !ID_PACK.test(id) ? null
  : fs.existsSync(path.join(MANUALI, id, 'pacchetto.json')) ? path.join(MANUALI, id)
    : fs.existsSync(path.join(COMP, id, 'pacchetto.json')) ? path.join(COMP, id) : null;
const pacchettoPrivato = dir => !!dir && (path.dirname(dir) === MANUALI || MANUALI_P.èManuale({ ...leggiJsonF(path.join(dir, 'pacchetto.json'), {}), id: path.basename(dir) }));
function leggiJsonF(f, d = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function elencoCompendio(res) {
  const out = [];
  const visti = new Set();
  const giro = (dir, base, dove, privati) => {
    let nomi = []; try { nomi = fs.readdirSync(dir); } catch {}
    for (const n of nomi) {
      if (!ID_PACK.test(n) || n.startsWith('.') || visti.has(n)) continue;
      const j = leggiJsonF(path.join(dir, n, 'pacchetto.json'));
      if (!j || j.formato !== 'libre-vtt-pacchetto') continue;
      let tipi = []; try { tipi = fs.readdirSync(path.join(dir, n, 'voci')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch {}
      const p = { ...j, id: n, base, url: dove + n + '/', tipi };
      // un manuale importato (nel catalogo privato, o nella campagna con le versioni di prima): resta qui
      if (privati || (!base && MANUALI_P.èManuale(p))) p.privato = true; else delete p.privato;
      visti.add(n); out.push(p);
    }
  };
  giro(MANUALI, false, 'manuali/', true);
  giro(path.join(cartellaSistema().dir, 'compendio'), true, 'sistema/compendio/');
  giro(COMP, false, 'compendio/');
  if (PLUGINS) for (const p of PLUGINS.active()) if (p.compendium) {
    const d = PLUGINS.runningFile(p.id, 'data/compendium');
    if (d) giro(d, true, 'plugins/' + p.id + '/data/compendium/');
  }
  json(res, 200, { pacchetti: out, visibilita: leggiJsonF(path.join(COMP, 'visibilita.json'), { pacchetti: {}, voci: {} }) });
}
const corpoBin = (req, res, max, fn) => {
  const parti = []; let n = 0, troppo = false;
  req.on('data', d => { n += d.length; if (n > max) { troppo = true; send(res, 413, 'Troppo grande'); req.destroy(); } else parti.push(d); });
  req.on('end', () => { if (!troppo) fn(Buffer.concat(parti)); });
};
const idLibero = base => { let id = String(base || 'pacchetto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'pacchetto', i = 2, x = id; while (fs.existsSync(path.join(COMP, x)) || fs.existsSync(path.join(MANUALI, x))) x = id + '-' + i++; return x; };
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
      // un pacchetto fatto da un manuale (anche arrivato come file) finisce nel catalogo privato, mai nella campagna
      const dove = MANUALI_P.èManuale(j) ? MANUALI : COMP;
      fs.mkdirSync(dove, { recursive: true });
      const id = idLibero(j.id || j.nome);
      sposta(radice, path.join(dove, id));
      j.id = id; delete j.base;
      if (dove === MANUALI) j.privato = true;
      fs.writeFileSync(path.join(dove, id, 'pacchetto.json'), JSON.stringify(j, null, 2));
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
    const esiste = m.unisci ? dirPacchetto(String(m.unisci)) : null;
    // le voci di un manuale vanno nel catalogo privato dell'utente, mai nella cartella della campagna
    const privato = esiste ? path.dirname(esiste) === MANUALI : MANUALI_P.èManuale(p);
    const id = esiste ? path.basename(esiste) : idLibero(p.id || p.nome);
    const dir = esiste || path.join(privato ? MANUALI : COMP, id);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.mkdirSync(path.join(dir, 'voci'), { recursive: true });
    const vecchio = leggiJsonF(path.join(dir, 'pacchetto.json'), {});
    const pk = { ...vecchio, ...p, formato: 'libre-vtt-pacchetto', versione: 1, id };
    delete pk.base;
    if (privato) pk.privato = true;
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
  const dir = dirPacchetto(id);
  if (!dir) return send(res, 404, 'Pacchetto sconosciuto');
  const via = path.join(path.dirname(dir), '.eliminati'); fs.mkdirSync(via, { recursive: true });
  sposta(dir, path.join(via, id + '-' + Date.now().toString(36)));     // si può recuperare a mano
  json(res, 200, { ok: true });
}
// rename, o copia e cancella se le due cartelle sono su dischi diversi
function sposta(da, a) {
  try { fs.renameSync(da, a); }
  catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(da, a, { recursive: true }); fs.rmSync(da, { recursive: true, force: true }); }
}
function esportaPacchetto(res, q) {
  const id = String(q.get('id') || '');
  if (!ID_PACK.test(id)) return send(res, 400, 'no');
  let dir = dirPacchetto(id);
  // un manuale importato non esce da qui: chi lo vuole su un altro dispositivo lo importa di nuovo dal suo PDF
  if (dir && pacchettoPrivato(dir)) return send(res, 403, 'Le voci importate da un manuale restano solo su questo dispositivo: non si esportano.');
  if (!dir) dir = path.join(cartellaSistema().dir, 'compendio', id);
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

// ---------- Impostazioni a due livelli ----------
// Le predefinite per le campagne nuove stanno nella cartella utente (LIBRE_PREDEFINITE, la passa
// l'avviatore); una campagna appena creata ne riceve una copia in data/predefinite.json, che il tavolo
// usa la prima volta. «Applica a:» copia le impostazioni del tavolo nelle altre campagne della
// cartella delle campagne (LIBRE_CAMP_HOME): solo le impostazioni, mai scene, schede o chat.
// (con i nomi di prima, MYVTT_*, per un avviatore più vecchio)
const PREDEF_ENV = process.env.LIBRE_PREDEFINITE || process.env.MYVTT_PREDEFINITE, CAMP_HOME_ENV = process.env.LIBRE_CAMP_HOME || process.env.MYVTT_CAMP_HOME;
const PREDEF = PREDEF_ENV ? path.resolve(PREDEF_ENV) : null;
const CAMP_HOME = CAMP_HOME_ENV ? path.resolve(CAMP_HOME_ENV) : null;
const CHIAVI_COMUNI = ['theme', 'autoBg', 'resToken', 'resBg', 'gridDefault', 'border', 'ping', 'unit', 'sheetClose', 'rulerCenter', 'diag5', 'misuraTrascina', 'fogColor', 'fogVeil',
  'caratLibere', 'spareggioDes', 'follia', 'dadiProvvisori', 'boxLabels', 'sheetStyle', 'pen', 'hiddenLayer', 'chatTabs', 'modelliScheda'];
const soloComuni = s => Object.fromEntries(CHIAVI_COMUNI.filter(k => s && s[k] !== undefined).map(k => [k, s[k]]));
function leggiPredefinite(res, q) {
  const f = q.get('campagna') ? path.join(DATA, 'predefinite.json') : PREDEF;
  if (!f) return json(res, 200, { settings: null, disponibile: false });
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return json(res, 200, { settings: j.settings || null, quando: j.quando || null, disponibile: true }); }
  catch { return json(res, 200, { settings: null, disponibile: !!PREDEF }); }
}
function salvaPredefinite(req, res) {
  if (!PREDEF) return send(res, 409, 'Le predefinite si salvano solo aprendo LIBRE VTT dall\'app');
  corpoBin(req, res, 2 * 1024 * 1024, b => {
    let j; try { j = JSON.parse(b.toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    fs.mkdirSync(path.dirname(PREDEF), { recursive: true });
    fs.writeFileSync(PREDEF, JSON.stringify({ quando: Date.now(), settings: soloComuni(j.settings || {}) }, null, 1));
    json(res, 200, { ok: true });
  });
}
function togliPredefinite(res) { if (PREDEF) { try { fs.unlinkSync(PREDEF); } catch {} } json(res, 200, { ok: true }); }
function campagneVicine() {
  if (!CAMP_HOME) return [];
  let d = []; try { d = fs.readdirSync(CAMP_HOME, { withFileTypes: true }); } catch { return []; }
  return d.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => path.join(CAMP_HOME, e.name))
    .filter(p => path.resolve(p) !== path.resolve(CAMP) && (fs.existsSync(path.join(p, 'campagna.json')) || fs.existsSync(path.join(p, 'data'))))
    .map(p => { let nome = path.basename(p); try { nome = JSON.parse(fs.readFileSync(path.join(p, 'campagna.json'), 'utf8')).nome || nome; } catch {} return { id: path.basename(p), nome }; });
}
function applicaAltre(req, res) {
  if (!CAMP_HOME) return send(res, 409, 'Non trovo la cartella delle campagne');
  corpoBin(req, res, 2 * 1024 * 1024, b => {
    let j; try { j = JSON.parse(b.toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    const nuove = soloComuni(j.settings || {}), fatte = [];
    for (const id of Array.isArray(j.campagne) ? j.campagne : []) {
      const dir = path.join(CAMP_HOME, path.basename(String(id)));
      if (!dir.startsWith(CAMP_HOME + path.sep) || path.resolve(dir) === path.resolve(CAMP) || !fs.existsSync(dir)) continue;
      const dd = path.join(dir, 'data'); fs.mkdirSync(dd, { recursive: true });
      let toccata = false;
      {
        const f = path.join(dd, 'board.json');
        let st = null; try { st = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
        if (st && typeof st === 'object' && Array.isArray(st.scenes)) {
          st.settings = { ...(st.settings || {}), ...nuove };
          fs.writeFileSync(f, JSON.stringify(st)); toccata = true;
        }
      }
      // mai aperta: le userà la prima volta
      if (!toccata) fs.writeFileSync(path.join(dd, 'predefinite.json'), JSON.stringify({ quando: Date.now(), settings: nuove }, null, 1));
      fatte.push(path.basename(dir));
    }
    json(res, 200, { ok: true, campagne: fatte });
  });
}

// Il file di traduzione del compendio: { "<id della voce>": { nome, testo } }, scritto da chi conduce
function salvaTraduzioni(req, res) {
  corpoBin(req, res, 40 * 1024 * 1024, b => {
    let j; try { j = JSON.parse(b.toString('utf8')); } catch { return send(res, 400, 'JSON non valido'); }
    const voci = j && typeof j === 'object' ? (j.voci && typeof j.voci === 'object' ? j.voci : j) : null;
    if (!voci || Array.isArray(voci)) return send(res, 400, 'Il file deve essere { "id della voce": { "nome": …, "testo": … } }');
    const out = {};
    for (const [id, t] of Object.entries(voci)) {
      if (!t || typeof t !== 'object' || id.length > 200) continue;
      const r = {};
      if (typeof t.nome === 'string' && t.nome.trim()) r.nome = t.nome.trim().slice(0, 200);
      if (typeof t.testo === 'string' && t.testo.trim()) r.testo = t.testo.slice(0, 200000);
      if (Object.keys(r).length) out[id] = r;
    }
    fs.mkdirSync(COMP, { recursive: true });
    fs.writeFileSync(path.join(COMP, 'traduzioni-it.json'), JSON.stringify({ formato: 'libre-vtt-traduzioni', lingua: 'it', voci: out }, null, 1));
    json(res, 200, { ok: true, voci: Object.keys(out).length });
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

// Miniature delle scene: data/miniature/<id scena>.webp (le fa il browser quando lasci una scena).
// Safari non sa fare webp e manda un png: si tiene nello stesso file e si serve col tipo giusto.
const tipoMini = b => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
  : b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a ? 'image/png' : null;
const MINI = path.join(DATA, 'miniature');
const miniFile = q => { const id = String(q.get('id') || ''); return /^[\w-]{1,80}$/.test(id) ? path.join(MINI, id + '.webp') : null; };
function getMini(res, q) {
  const f = miniFile(q); if (!f) return send(res, 400, 'Scena non valida');
  fs.readFile(f, (e, d) => e ? send(res, 404, 'Non c\'è') : (res.writeHead(200, { 'Content-Type': tipoMini(d) || 'image/webp', 'Cache-Control': 'no-cache' }), res.end(d)));
}
function saveMini(req, res, q) {
  const f = miniFile(q); if (!f) return send(res, 400, 'Scena non valida');
  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => { size += c.length; if (size > 400 * 1024) { tooBig = true; send(res, 413, 'Troppo grande'); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (tooBig) return;
    const b = Buffer.concat(chunks);
    if (!tipoMini(b)) return send(res, 400, 'Non è un\'immagine webp o png');
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
  if (!segretoOk(req)) return send(res, 403, 'Questa finestra non è quella di LIBRE VTT.');
  const url = new URL(req.url, 'http://localhost'), q = url.searchParams, p = url.pathname;
  if (p.startsWith('/api/')) {
    const origin = req.headers.origin;
    // le richieste che cambiano qualcosa vengono solo dalle nostre pagine, servite da questa stessa porta
    if (req.method !== 'GET' && origin && !new RegExp('^http://(localhost|127\\.0\\.0\\.1|\\[::1\\]):' + PORT + '$').test(origin)) return send(res, 403, 'Origine non consentita');
    const route = `${req.method} ${p}`;
    if (route === 'GET /api/assets') return json(res, 200, listAll());
    if (route === 'POST /api/assets') return saveUpload(req, res, q);
    if (route === 'DELETE /api/assets') return deleteAsset(res, q);
    if (route === 'POST /api/move') return moveAsset(res, q);
    if (route === 'GET /api/musica') return elencoMusica(res);
    if (route === 'POST /api/musica') return salvaBrano(req, res, q);
    if (route === 'DELETE /api/musica') return eliminaBrano(res, q);
    if (route === 'POST /api/folders') return createFolder(res, q);
    if (route === 'DELETE /api/folders') return deleteFolder(res, q);
    if (route === 'GET /api/boot') return json(res, 200, { boot: BOOT });
    if (route === 'GET /api/state') return getState(res, q);
    if (route === 'PUT /api/state') return saveState(req, res, q);
    if (route === 'GET /api/miniatura') return getMini(res, q);
    if (route === 'GET /api/sistema') return infoSistema(res);
    if (route === 'GET /api/plugins') return json(res, 200, { plugins: PLUGINS ? PLUGINS.active() : [], disponibili: !!PLUGINS, ricevutiPieni: RICEVUTI_PIENI });
    if (route === 'POST /api/plugins/ricevuti') return salvaRicevuto(req, res);
    if (route === 'GET /api/compendio') return elencoCompendio(res);
    if (route === 'GET /api/open5e') return open5e(res, q);
    if (route === 'POST /api/compendio/importa') return importaPacchetto(req, res);
    if (route === 'POST /api/compendio/pacchetto') return salvaPacchetto(req, res);
    if (route === 'DELETE /api/compendio') return eliminaPacchetto(res, q);
    if (route === 'GET /api/compendio/esporta') return esportaPacchetto(res, q);
    if (route === 'PUT /api/compendio/visibilita') return salvaVisibilita(req, res);
    if (route === 'PUT /api/compendio/traduzioni') return salvaTraduzioni(req, res);
    if (route === 'GET /api/predefinite') return leggiPredefinite(res, q);
    if (route === 'PUT /api/predefinite') return salvaPredefinite(req, res);
    if (route === 'DELETE /api/predefinite') return togliPredefinite(res);
    if (route === 'GET /api/campagne-vicine') return json(res, 200, { campagne: campagneVicine(), disponibile: !!CAMP_HOME });
    if (route === 'POST /api/applica-impostazioni') return applicaAltre(req, res);
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
    const tipoDep = String(info.mime || '').toLowerCase();
    if (/^(audio|video)\//.test(tipoDep) && ASSET_MIME.has(tipoDep)) return mandaAudio(req, res, path.join(DATA, 'assets', dep[1] + (info.ext || '')), tipoDep, { 'Content-Security-Policy': CSP_SVG });
    return fs.readFile(path.join(DATA, 'assets', dep[1] + (info.ext || '')), (err, d) => err ? send(res, 404, 'Non trovato')
      : (res.writeHead(200, {
        // solo i tipi di immagine (e il JSON del compendio): qualsiasi altro tipo si dà come byte qualsiasi
        'Content-Type': ASSET_MIME.has(String(info.mime || '').toLowerCase()) ? String(info.mime).toLowerCase() : 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP_SVG
      }), res.end(d)));
  }
  // le canzoni della campagna (musica/): solo file audio, a pezzi se il lettore li chiede così
  if (rel.startsWith('/musica/')) {
    const n = rel.slice(8);
    if (!okBrano(n)) return send(res, 404, 'Non trovato');
    return mandaAudio(req, res, path.join(MUSICA, n), AUDIO[path.extname(n).toLowerCase()]);
  }
  // i file dei plugin applicati (solo quelli che la home ha acceso, e solo tipi innocui o il loro codice)
  if (rel.startsWith('/plugins/')) {
    const m = /^\/plugins\/([a-z0-9][a-z0-9._-]{0,63})\/(.+)$/.exec(rel);
    const file = m && PLUGINS ? PLUGINS.runningFile(m[1], m[2]) : null;
    const ext = file ? path.extname(file).toLowerCase() : '';
    const type = ext === '.html' ? null : MIME[ext];
    if (!file || !type) return send(res, 404, 'Non trovato');
    return fs.readFile(file, (err, d) => {
      if (err) return send(res, 404, 'Non trovato');
      if (ext === '.css') d = cleanCss(d.toString('utf8'));
      send(res, 200, d, type);
    });
  }
  // i file dei plugin con accesso completo arrivati dal master (in memoria, vedi salvaRicevuto)
  if (rel.startsWith('/plugins-ricevuti/')) {
    const m = /^\/plugins-ricevuti\/([a-z0-9][a-z0-9._-]{0,63})\/([a-f0-9]{64})\/(.+)$/.exec(rel);
    const files = m && ricevuti.get(m[1] + '@' + m[2]);
    const ext = m ? path.extname(m[3]).toLowerCase() : '';
    const type = ext === '.html' ? null : MIME[ext];
    let d = files && type && files.get(m[3]);
    if (!d) return send(res, 404, 'Non trovato');
    if (ext === '.css') d = cleanCss(d.toString('utf8'));
    return send(res, 200, d, type);
  }
  // la pagina dove gira il codice dei plugin in sandbox: senza origine, senza rete, solo il suo script
  if (rel === '/plugin-sandbox.html') {
    return fs.readFile(path.join(WEB, 'plugin-sandbox.html'), (err, d) => {
      if (err) return send(res, 404, 'Non trovato');
      const hash = [...d.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => `'sha256-${require('crypto').createHash('sha256').update(x[1], 'utf8').digest('base64')}'`).join(' ');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; script-src ${hash} blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts` });
      res.end(d);
    });
  }
  // i manuali importati, dal catalogo privato (solo per questa finestra: il server ascolta solo su 127.0.0.1)
  if (rel.startsWith('/manuali/')) {
    const file = path.join(MANUALI, rel.slice(9));
    if (!file.startsWith(MANUALI + path.sep) || path.extname(file).toLowerCase() !== '.json' || rel.includes('/.')) return send(res, 404, 'Non trovato');
    return fs.readFile(file, (err, d) => err ? send(res, 404, 'Non trovato') : send(res, 200, d, 'application/json'));
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
  // (e i sistemi di gioco già pronti da sistemi/)
  const dalProgramma = /^\/(condiviso|sistemi)\//.exec(rel);
  const base = rel.startsWith('/assets/') ? CAMP : dalProgramma ? path.join(ROOT, dalProgramma[1]) : WEB;
  const file = path.join(base, rel === '/' ? 'index.html' : dalProgramma ? rel.slice(dalProgramma[0].length) : rel);
  const type = MIME[path.extname(file).toLowerCase()];
  if (!file.startsWith(base + path.sep) || !type) return send(res, 404, 'Non trovato');
  // dalla cartella delle immagini della campagna escono solo immagini (una campagna arrivata da fuori
  // potrebbe avere dentro una pagina .html o uno script)
  if (base === CAMP && !IMG.has(path.extname(file).toLowerCase())) return send(res, 404, 'Non trovato');
  if (base === CAMP && eVideo(file)) return mandaAudio(req, res, file, type, { 'Content-Security-Policy': CSP_SVG });
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
