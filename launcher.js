// ---------- Avviatore: tutto da una finestra, senza terminale ----------
// Apre una finestra senza barra del browser, chiede che cosa vuoi fare, e accende da solo
// le cose che servono. Se manca qualcosa per giocare a distanza lo prepara lui, dopo avertelo
// chiesto. Quando chiudi la finestra, spegne tutto.
//
//   node launcher.js            (ma di solito lo lanciano «LIBRE VTT.app», «LIBRE VTT.vbs», «LIBRE VTT.desktop»)

'use strict';
const http = require('http'), https = require('https'), fs = require('fs'), os = require('os');
const path = require('path'), crypto = require('crypto'), { spawn, execFile } = require('child_process');

const ROOT = __dirname;                                       // i file del programma
// Porte preferite. Se sul computer sono già occupate da altri programmi (3000 e 4000 sono
// classiche per tanti strumenti) se ne scelgono altre libere e ce le si ricorda: quella del
// tavolo deve restare la stessa da una volta all'altra, perché il browser tiene l'identità del
// giocatore (gettone, nome) legata all'indirizzo.
const PREF = { ui: 4100, web: 3000, game: 4000, link: 4010 };
let UI_PORT = PREF.ui;
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const EXE = WIN ? '.exe' : '';

// Dentro un'app per Mac (il .dmg) il programma sta in sola lettura: lì non si scrive mai.
// Tutto quello che va scritto finisce in una cartella dell'utente, oppure nella campagna.
const IN_APP = /\.app[\/\\]Contents[\/\\]/.test(ROOT);
const scrivibile = d => {
  if (IN_APP && path.resolve(d).startsWith(ROOT)) return false;
  try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; }
};
const USERDIR = process.env.MYVTT_USERDIR || (WIN
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'LIBRE VTT')
  : MAC ? path.join(os.homedir(), 'Library', 'Application Support', 'LIBRE VTT')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'libre-vtt'));
// Il programma prima si chiamava «MY VTT»: la sua cartella (campagne recenti, Rust e Zig già
// scaricati) passa alla nuova, una volta sola, invece di ricominciare da zero.
if (!process.env.MYVTT_USERDIR && !fs.existsSync(USERDIR)) {
  const vecchia = path.join(path.dirname(USERDIR), WIN || MAC ? 'MY VTT' : 'my-vtt');
  try { if (fs.existsSync(vecchia)) fs.renameSync(vecchia, USERDIR); } catch {}
}
fs.mkdirSync(USERDIR, { recursive: true });
const CONF_FILE = path.join(USERDIR, 'launcher.json');       // campagne recenti
const LINK_ID_FILE = path.join(USERDIR, 'uffa-link.id');     // l'ID della sessione, scritto da uffa-link
const GUEST_DIR = path.join(USERDIR, 'ospite');               // da giocatore: solo una copia locale delle immagini

// uffa-link: già pronto dentro l'app, oppure compilato nella cartella del gioco (come prima),
// oppure compilato da noi nella cartella dell'utente quando quella del gioco non è scrivibile.
const LINK_SRC = path.join(ROOT, 'uffa-link');
const LINK_BUILD = scrivibile(LINK_SRC) ? LINK_SRC : path.join(USERDIR, 'uffa-link');
// La cartella del gioco usata prima, con la versione «cartella» dell'app per Mac (che se la
// segnava qui): da lì si recuperano la campagna di prima e il collegamento già compilato.
const VECCHIA = (() => {
  try {
    const p = fs.readFileSync(path.join(USERDIR, 'cartella.txt'), 'utf8').trim();
    return p && path.resolve(p) !== ROOT && fs.existsSync(path.join(p, 'launcher.js')) ? path.resolve(p) : null;
  } catch { return null; }
})();
const LINK_SCARICATO = path.join(USERDIR, 'bin', 'uffa-link' + EXE);   // scaricato già pronto o costruito qui
const LINK_CANDIDATES = [
  path.join(ROOT, 'bin', 'uffa-link' + EXE),
  LINK_SCARICATO,
  path.join(LINK_SRC, 'target', 'release', 'uffa-link' + EXE),
  path.join(USERDIR, 'uffa-link', 'target', 'release', 'uffa-link' + EXE),
  ...(VECCHIA ? [path.join(VECCHIA, 'uffa-link', 'target', 'release', 'uffa-link' + EXE)] : [])
];
const linkBin = () => LINK_CANDIDATES.find(p => fs.existsSync(p)) || null;
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const PIATTAFORMA = WIN ? 'windows-x64' : MAC ? 'macos-universal' : `linux-${ARCH}`;   // Windows ARM usa quello x64
const LINK_ASSET = `uffa-link-${PIATTAFORMA}${EXE}`;                                       // il nome nelle uscite su GitHub
const PROFILE = path.join(os.tmpdir(), 'myvtt-finestra');

const state = {
  mode: null,            // null | 'solo' | 'host' | 'join'
  busy: null,            // testo di quello che sta succedendo
  sessionId: null,
  error: null,
  procs: {},
  log: []
};

// ---------- registro, mostrato nella finestra ----------
const listeners = new Set();
function say(line, kind) {
  const e = { t: Date.now(), line: String(line).replace(/\s+$/, ''), kind: kind || '' };
  if (!e.line) return;
  state.log.push(e);
  if (state.log.length > 400) state.log.shift();
  for (const r of listeners) { try { r.write('data: ' + JSON.stringify({ t: 'log', e }) + '\n\n'); } catch {} }
}
function push() {
  const snap = JSON.stringify({ t: 'stato', s: stato() });
  for (const r of listeners) { try { r.write('data: ' + snap + '\n\n'); } catch {} }
}

// ---------- che cosa c'è su questa macchina ----------
function which(cmd) {
  return new Promise(res => {
    execFile(WIN ? 'where' : 'which', [cmd], (e, out) => res(e ? null : String(out).split(/\r?\n/)[0].trim() || null));
  });
}
// Rust e gli altri strumenti per costruire il collegamento a distanza stanno in una cartella
// tutta di LIBRE VTT (USERDIR/strumenti): non si usa e non si tocca niente di installato nel
// sistema, non serve essere amministratori, e si cancella insieme a LIBRE VTT.
const TOOLS = path.join(USERDIR, 'strumenti');
const RUSTUP_HOME = path.join(TOOLS, 'rust', 'rustup'), CARGO_HOME = path.join(TOOLS, 'rust', 'cargo');
const cargoPath = () => { const c = path.join(CARGO_HOME, 'bin', 'cargo' + EXE); return fs.existsSync(c) ? c : null; };
async function hasCargo() { return cargoPath(); }

let cache = { cargo: null, at: 0 };
async function check() {
  if (Date.now() - cache.at < 3000) return cache;
  cache = { cargo: await hasCargo(), at: Date.now() };
  return cache;
}
function stato() {
  return {
    mode: state.mode, busy: state.busy, error: state.error, sessionId: state.sessionId,
    link: !!linkBin(), cargo: !!cache.cargo, pronto: !!rilascio(), campagna: state.campagna || null,
    porte: { ui: UI_PORT, ...(state.porte || {}) },
    piattaforma: WIN ? 'Windows' : MAC ? 'macOS' : 'Linux',
    node: process.versions.node
  };
}

// ---------- un ambiente pulito ----------
// Quello che altri programmi installati possono aver lasciato nelle variabili d'ambiente
// (NODE_OPTIONS, un Rust di sistema configurato in modo strano, CC, PORT…) non deve arrivare
// ai nostri pezzi: si parte sempre da un ambiente ripulito.
const ENV_VIA = new Set(['NODE_OPTIONS', 'NODE_PATH', 'PORT', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_TARGET_DIR',
  'CARGO_BUILD_TARGET', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'RUSTC', 'RUSTC_WRAPPER', 'RUSTDOC',
  'CC', 'CXX', 'AR', 'LD', 'CFLAGS', 'CXXFLAGS', 'LDFLAGS', 'CPPFLAGS', 'LIBRARY_PATH', 'LD_LIBRARY_PATH',
  'DATA_DIR', 'CAMPAIGN_DIR', 'LINK_PORT', 'LINK_ID_FILE']);
function envPulito(extra) {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) {
    const K = k.toUpperCase();
    if (ENV_VIA.has(K) || /^CARGO_TARGET_.+_(LINKER|RUNNER|RUSTFLAGS)$/.test(K) || /^(CC|CXX|AR|CFLAGS)_/.test(K) || /^NPM_/.test(K)) continue;
    e[k] = v;
  }
  return Object.assign(e, extra || {});
}

/** Una porta libera su 127.0.0.1, a partire da quella preferita. */
function portaProva(port) {
  return new Promise(res => {
    const t = require('net').createServer();
    t.once('error', () => res(false));
    t.listen(port, '127.0.0.1', () => t.close(() => res(true)));
  });
}
async function portaLibera(pref, evita = []) {
  for (let p = pref; p < pref + 60; p++) if (!evita.includes(p) && p < 65536 && await portaProva(p)) return p;
  return new Promise(res => { const t = require('net').createServer(); t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => res(p)); }); });
}

// ---------- accendere e spegnere i pezzi ----------
// opts.keep: se si ferma da solo mentre si gioca, lo si riaccende (con un po' d'attesa che
// cresce se continua a cadere). Si spegne davvero solo con «ferma» o chiudendo la finestra.
let gen = 0;                                                   // cambia a ogni avvio/spegnimento
const restarts = {};
function run(key, cmd, args, opts = {}) {
  const myGen = gen, born = Date.now();
  const p = spawn(cmd, args, { cwd: opts.cwd || ROOT, env: envPulito(opts.env), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  state.procs[key] = p;
  const pipe = (s, kind) => s.on('data', d => String(d).split(/\r?\n/).forEach(l => {
    if (!l.trim()) return;
    say(`[${key}] ${l}`, kind);
    const m = l.match(/^\s{6}([a-z0-9]{40,})\s*$/i);          // l'ID stampato da uffa-link
    if (m) {
      if (state.sessionId && state.sessionId !== m[1]) say('Il codice della sessione è cambiato: rimandalo ai giocatori.', 'warn');
      state.sessionId = m[1]; push();
    }
  }));
  pipe(p.stdout, ''); pipe(p.stderr, 'warn');
  p.on('exit', code => {
    say(`[${key}] chiuso (${code})`, code ? 'warn' : '');
    if (state.procs[key] === p) delete state.procs[key];
    if (!opts.keep || myGen !== gen || !state.mode) return;   // spento apposta
    if (Date.now() - born > 60000) restarts[key] = 0;          // era stato su a lungo: si riparte da capo
    const n = restarts[key] = (restarts[key] || 0) + 1;
    const wait = Math.min(15000, 1000 * n);
    say(`[${key}] si è fermato da solo: lo riaccendo tra ${Math.round(wait / 1000)} s.`, 'warn');
    setTimeout(() => {
      if (myGen !== gen || !state.mode || state.procs[key]) return;
      run(key, cmd, args, opts);
    }, wait);
  });
  p.on('error', e => say(`[${key}] non parte: ${e.message}`, 'bad'));
  return p;
}
function stopAll() {
  gen++;
  for (const k of Object.keys(restarts)) delete restarts[k];
  for (const [k, p] of Object.entries(state.procs)) { try { p.kill(); } catch {} delete state.procs[k]; }
  try { fs.unlinkSync(LINK_ID_FILE); } catch {}
  state.mode = null; state.sessionId = null; state.campagna = null; state.porte = null;
  push();
}

const attesa = ms => new Promise(r => setTimeout(r, ms));
function portaViva(port) {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 800 }, r => { r.resume(); res(true); });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}
async function aspettaPorta(port, secondi = 15) {
  for (let i = 0; i < secondi * 4; i++) { if (await portaViva(port)) return true; await attesa(250); }
  return false;
}

// ---------- le campagne ----------
// Una campagna è una cartella qualsiasi con dentro:
//   data/      lo stato: mappe e scene, schede, chat, e (per il server di gioco) mondo, giocatori, immagini viste in rete
//   assets/    la libreria delle immagini caricate
//   campagna.json   il nome (facoltativo)
// Si può copiare, mettere su una chiavetta, mandare a un amico: chi la apre la conduce lui.
// La vecchia cartella del gioco (data/ e assets/ accanto ai programmi) è anch'essa una campagna.
function cartellaDocumenti() {
  const home = os.homedir();
  try {
    if (WIN) {   // può essere stata spostata (OneDrive): la si chiede al registro
      const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Personal'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
      const m = out.match(/Personal\s+REG_\w+\s+(.+)/);
      if (m) { const d = m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] || ''); if (fs.existsSync(d)) return d; }
    } else if (!MAC) {
      const d = require('child_process').execFileSync('xdg-user-dir', ['DOCUMENTS'], { encoding: 'utf8', timeout: 2000 }).trim();
      if (d && d !== home && fs.existsSync(d)) return d;
    }
  } catch {}
  for (const n of ['Documents', 'Documenti']) { const d = path.join(home, n); if (fs.existsSync(d)) return d; }
  return home;
}
const CAMP_HOME = path.join(cartellaDocumenti(), 'LIBRE VTT', 'Campagne');
const CAMP_VECCHIE = path.join(cartellaDocumenti(), 'MY VTT', 'Campagne');   // di quando si chiamava «MY VTT»

let conf = { recenti: [] };
try { conf = { recenti: [], ...JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')) }; } catch {}
const salvaConf = () => { try { fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2)); } catch (e) { say('Non riesco a salvare le preferenze: ' + e.message, 'warn'); } };
function ricorda(dir) {
  conf.recenti = [path.resolve(dir), ...conf.recenti.filter(d => path.resolve(d) !== path.resolve(dir))].slice(0, 12);
  salvaConf();
}
function dimentica(dir) { conf.recenti = conf.recenti.filter(d => path.resolve(d) !== path.resolve(dir)); salvaConf(); }

const pulisciNome = s => String(s || '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60);
const leggiJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Che cosa c'è in quella cartella: serve per l'elenco e per capire se è una campagna. */
function infoCampagna(dir) {
  dir = path.resolve(String(dir || ''));
  const out = { path: dir, nome: path.basename(dir) || dir, esiste: false, campagna: false, vuota: false,
    scrivibile: false, scene: 0, schede: 0, immagini: 0, modificata: 0, vecchia: false };
  let st; try { st = fs.statSync(dir); } catch { return out; }
  if (!st.isDirectory()) return out;
  out.esiste = true;
  out.scrivibile = scrivibile(dir);
  let nomi = []; try { nomi = fs.readdirSync(dir).filter(n => !n.startsWith('.')); } catch {}
  out.vuota = nomi.length === 0;
  const meta = leggiJson(path.join(dir, 'campagna.json'));
  if (meta) { out.campagna = true; if (meta.nome) out.nome = String(meta.nome).slice(0, 60); }
  const D = path.join(dir, 'data');
  const b = leggiJson(path.join(D, 'board.json')), sh = leggiJson(path.join(D, 'sheets.json')), w = leggiJson(path.join(D, 'world.json'));
  if (b || sh || w) out.campagna = true;
  out.scene = (b && Array.isArray(b.scenes) && b.scenes.length) || (w && Array.isArray(w.scenes) && w.scenes.length) || 0;
  out.schede = (Array.isArray(sh) && sh.length) || (w && Array.isArray(w.sheets) && w.sheets.length) || 0;
  try {
    for (const f of fs.readdirSync(D)) if (f.endsWith('.json')) out.modificata = Math.max(out.modificata, fs.statSync(path.join(D, f)).mtimeMs);
  } catch {}
  const conta = (d, prof) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory() && prof < 3) n += conta(path.join(d, e.name), prof + 1);
    else if (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(e.name)) n++;
  } } catch {} return n; };
  out.immagini = conta(path.join(dir, 'assets'), 0);
  out.vecchia = (!IN_APP && dir === path.resolve(ROOT)) || (!!VECCHIA && dir === VECCHIA);
  if (out.vecchia) out.nome = 'La campagna di prima';
  return out;
}

/** Mette in una cartella quello che serve a una campagna, senza toccare quello che c'è già. */
function preparaCartella(dir, nome) {
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  // lo sfondo di benvenuto che viene col programma, solo per una campagna appena nata
  // (in una campagna già fatta, magari di un amico, non si aggiunge niente)
  const base = path.join(ROOT, 'assets', 'Sfondi', 'main.webp'), dest = path.join(dir, 'assets', 'Sfondi', 'main.webp');
  const nuova = !fs.existsSync(path.join(dir, 'data', 'board.json')) && !fs.existsSync(path.join(dir, 'data', 'world.json'));
  if (nuova && fs.existsSync(base) && !fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(base, dest); }
  const meta = path.join(dir, 'campagna.json');
  if (!fs.existsSync(meta) && path.resolve(dir) !== path.resolve(ROOT)) {
    fs.writeFileSync(meta, JSON.stringify({ nome: nome || path.basename(dir), creata: new Date().toISOString(), programma: 'LIBRE VTT' }, null, 2));
  }
}
function nuovaCampagna(nomeGrezzo) {
  const nome = pulisciNome(nomeGrezzo) || 'Nuova campagna';
  fs.mkdirSync(CAMP_HOME, { recursive: true });
  let dir = path.join(CAMP_HOME, nome), i = 2;
  while (fs.existsSync(dir)) dir = path.join(CAMP_HOME, `${nome} ${i++}`);
  preparaCartella(dir, nome);
  say(`Nuova campagna «${nome}» in ${dir}`, 'ok');
  return dir;
}
function elencoCampagne() {
  const visti = new Set(), lista = [];
  for (const d of conf.recenti) { const k = path.resolve(d); if (visti.has(k)) continue; visti.add(k); lista.push(infoCampagna(d)); }
  // chi usava le prime versioni ha la sua campagna dentro la cartella del gioco: non deve sparire
  for (const d of [IN_APP ? null : path.resolve(ROOT), VECCHIA]) {
    if (!d || visti.has(d)) continue;
    visti.add(d);
    const v = infoCampagna(d);
    if (v.scrivibile && (v.scene || v.schede || fs.existsSync(path.join(d, 'data', 'world.json')))) lista.push(v);
  }
  // le campagne create quando il programma si chiamava «MY VTT» restano dove sono, e si vedono
  let vecchie = []; try { vecchie = fs.readdirSync(CAMP_VECCHIE, { withFileTypes: true }).filter(e => e.isDirectory()); } catch {}
  for (const e of vecchie) {
    const d = path.join(CAMP_VECCHIE, e.name);
    if (visti.has(d)) continue;
    visti.add(d);
    const v = infoCampagna(d);
    if (v.campagna) lista.push(v);
  }
  return { home: CAMP_HOME, ultima: conf.recenti[0] || null, lista };
}

/** La finestra del sistema per scegliere una cartella. Dove non c'è, si usa quella fatta da noi. */
async function scegliCartella(titolo) {
  const prompt = titolo || 'Scegli la cartella della campagna';
  const esegui1 = (cmd, args, opts = {}) => new Promise(res => {
    execFile(cmd, args, { encoding: 'utf8', timeout: 10 * 60 * 1000, windowsHide: true, ...opts }, (e, out) => res({ e, out: String(out || '').trim() }));
  });
  if (MAC) {
    const def = fs.existsSync(CAMP_HOME) ? CAMP_HOME : os.homedir();
    const r = await esegui1('osascript', ['-e', 'activate', '-e',
      `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)} default location (POSIX file ${JSON.stringify(def)}))`]);
    if (r.e) return /-128|cancel/i.test(String(r.e.message)) ? { annullato: true } : { nonSupportato: true };
    return { path: r.out.replace(/\/$/, '') };
  }
  if (WIN) {
    const psq = v => "'" + String(v).replace(/'/g, "''") + "'";      // stringa PowerShell letterale
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      '$f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$d.Description = ${psq(prompt)}`,
      '$d.ShowNewFolderButton = $true',
      `$d.SelectedPath = ${psq(fs.existsSync(CAMP_HOME) ? CAMP_HOME : cartellaDocumenti())}`,
      'if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath } else { Write-Output "::annullato::" }'
    ].join('; ');
    const r = await esegui1('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
    if (r.e) return { nonSupportato: true };
    if (!r.out || r.out.includes('::annullato::')) return { annullato: true };
    return { path: r.out.split(/\r?\n/).pop().trim() };
  }
  // Linux: zenity (GNOME e simili) o kdialog (KDE)
  if (await which('zenity')) {
    const r = await esegui1('zenity', ['--file-selection', '--directory', '--title=' + prompt, '--filename=' + (fs.existsSync(CAMP_HOME) ? CAMP_HOME : os.homedir()) + '/']);
    if (r.e) return r.e.code === 1 ? { annullato: true } : { nonSupportato: true };
    return { path: r.out };
  }
  if (await which('kdialog')) {
    const r = await esegui1('kdialog', ['--getexistingdirectory', fs.existsSync(CAMP_HOME) ? CAMP_HOME : os.homedir(), '--title', prompt]);
    if (r.e) return r.e.code === 1 ? { annullato: true } : { nonSupportato: true };
    return { path: r.out };
  }
  return { nonSupportato: true };
}

/** Per la finestra di scelta fatta da noi: le sottocartelle di una cartella. */
function sfoglia(dir) {
  const radici = [];
  const add = (nome, p) => { if (p && fs.existsSync(p) && !radici.some(r => r.path === p)) radici.push({ nome, path: p }); };
  add('Campagne', CAMP_HOME); add('Documenti', cartellaDocumenti()); add('Scrivania', path.join(os.homedir(), 'Desktop'));
  add('Download', path.join(os.homedir(), 'Downloads')); add('Casa', os.homedir());
  if (WIN) for (const l of 'CDEFGHIJ') add(l + ':', l + ':\\');
  else if (MAC) add('Dischi', '/Volumes'); else add('Dischi', '/media/' + (os.userInfo().username || ''));
  let qui = path.resolve(String(dir || '') || (fs.existsSync(CAMP_HOME) ? CAMP_HOME : os.homedir()));
  let voci = [];
  try {
    voci = fs.readdirSync(qui, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$'))
      .map(e => { const p = path.join(qui, e.name); return { nome: e.name, path: p, campagna: fs.existsSync(path.join(p, 'campagna.json')) || fs.existsSync(path.join(p, 'data', 'board.json')) }; })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
  } catch (e) { return { path: qui, su: path.dirname(qui) !== qui ? path.dirname(qui) : null, voci: [], radici, errore: 'Non riesco a leggere questa cartella.' }; }
  return { path: qui, su: path.dirname(qui) !== qui ? path.dirname(qui) : null, voci, radici, qui: infoCampagna(qui) };
}
function mostraCartella(dir) {
  const cmd = WIN ? 'explorer' : MAC ? 'open' : 'xdg-open';
  try { const p = spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }); p.on('error', () => {}); p.unref(); } catch {}
}

// ---------- i tre modi ----------
async function avvia(mode, id, campagna) {
  if (state.mode) stopAll();
  state.error = null;
  state.busy = 'Accendo…'; push();
  const fallisci = msg => { state.error = msg; state.busy = null; push(); };

  // Da soli o conducendo si gioca dentro una campagna; da giocatore solo con una copia delle immagini.
  let CAMP;
  if (mode === 'join') {
    CAMP = GUEST_DIR; fs.mkdirSync(path.join(CAMP, 'data'), { recursive: true }); fs.mkdirSync(path.join(CAMP, 'assets'), { recursive: true });
  } else {
    const info = infoCampagna(campagna);
    if (!campagna || !info.esiste) return fallisci('Non trovo la cartella della campagna: scegline un\'altra.');
    if (!info.scrivibile) return fallisci('In quella cartella non si può scrivere (è in sola lettura): copiala da un\'altra parte e riaprila da lì.');
    try { preparaCartella(info.path, info.nome); } catch (e) { return fallisci('Non riesco a preparare la cartella: ' + e.message); }
    CAMP = info.path;
    ricorda(CAMP);
    state.campagna = { path: CAMP, nome: infoCampagna(CAMP).nome };
    say(`Campagna: «${state.campagna.nome}» (${CAMP})`);
  }

  // le porte: quelle di sempre se sono libere, altrimenti altre (e ce le si ricorda)
  conf.porte = conf.porte || {};
  const WEB_PORT = await portaLibera(conf.porte.web || PREF.web, [UI_PORT]);
  const GAME_PORT = mode === 'solo' ? 0 : await portaLibera(conf.porte.game || PREF.game, [UI_PORT, WEB_PORT]);
  const LINK_PORT = mode === 'solo' ? 0 : await portaLibera(PREF.link, [UI_PORT, WEB_PORT, GAME_PORT]);
  if (WEB_PORT !== (conf.porte.web || PREF.web)) say(`La porta ${conf.porte.web || PREF.web} è usata da un altro programma: il tavolo va sulla ${WEB_PORT}.`, 'warn');
  if (GAME_PORT && GAME_PORT !== (conf.porte.game || PREF.game)) say(`La porta ${conf.porte.game || PREF.game} è usata da un altro programma: il server di gioco va sulla ${GAME_PORT}.`, 'warn');
  conf.porte.web = WEB_PORT; if (GAME_PORT) conf.porte.game = GAME_PORT;
  salvaConf();
  state.porte = { web: WEB_PORT, game: GAME_PORT };

  run('tavolo', process.execPath, ['server.js'], { env: { PORT: String(WEB_PORT), CAMPAIGN_DIR: CAMP }, keep: true });
  if (!await aspettaPorta(WEB_PORT)) return fallisci('Il tavolo non si è acceso.');

  if (mode !== 'solo') {
    run('regole', process.execPath, ['game-server.js', mode === 'host' ? 'host' : 'join'],
      { env: { PORT: String(GAME_PORT), LINK_PORT: String(LINK_PORT), DATA_DIR: path.join(CAMP, 'data'), LINK_ID_FILE }, keep: true });
    if (!await aspettaPorta(GAME_PORT)) return fallisci('Il server di gioco non si è acceso.');

    const bin = linkBin();
    if (!bin) return fallisci('Manca il collegamento a distanza: premi «Prepara» e riprova.');
    // uffa-link scrive l'ID nella sua cartella di lavoro: la nostra, dove si può scrivere
    if (mode === 'host') run('sessione', bin, ['host', '--port', String(LINK_PORT)], { keep: true, cwd: USERDIR });
    else run('sessione', bin, ['join', id, '--port', String(LINK_PORT)], { keep: true, cwd: USERDIR });
  }

  state.mode = mode; state.busy = null; push();
  say('Pronto.', 'ok');
}

// ---------- preparazione del collegamento a distanza ----------
// Tre tentativi, in quest'ordine:
//   1. c'è già (dentro l'app, scaricato o compilato una volta precedente);
//   2. lo si scarica già pronto dalle uscite su GitHub del progetto (rilascio.json dice quale),
//      controllando l'impronta SHA-256;
//   3. lo si costruisce qui: Rust e Zig (che fa da compilatore C e da linker, così non servono
//      Visual Studio né build-essential) finiscono nella cartella privata di LIBRE VTT.
function esegui(key, cmd, args, opts) {
  return new Promise(resolve => {
    const p = run(key, cmd, args, opts);
    p.on('exit', code => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}
/** Scarica seguendo i rimandi; se c'è un'etichetta mostra la percentuale nella finestra. */
function scarica(url, dest, etichetta) {
  return new Promise(resolve => {
    let finito = false;
    const fine = v => { if (!finito) { finito = true; resolve(v); } };
    const req = (url.startsWith('http:') ? http : https).get(url, { headers: { 'User-Agent': 'LIBRE-VTT' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return fine(scarica(new URL(r.headers.location, url).href, dest, etichetta));
      }
      if (r.statusCode !== 200) { r.resume(); return fine(false); }
      const tot = +r.headers['content-length'] || 0;
      let got = 0, last = 0;
      const f = fs.createWriteStream(dest);
      r.on('data', d => {
        got += d.length;
        if (etichetta && tot && Date.now() - last > 1000) { last = Date.now(); state.busy = `${etichetta}: ${Math.round(got / tot * 100)}% di ${Math.max(1, Math.round(tot / 1048576))} MB`; push(); }
      });
      r.on('error', () => fine(false));
      f.on('error', () => fine(false));
      f.on('finish', () => f.close(() => fine(true)));
      r.pipe(f);
    });
    req.on('error', () => fine(false));
    req.setTimeout(60000, () => req.destroy());
  });
}
const sha256File = f => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});
async function scaricaTesto(url) {
  const t = path.join(os.tmpdir(), `myvtt-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try { return await scarica(url, t) ? fs.readFileSync(t, 'utf8') : null; } finally { try { fs.unlinkSync(t); } catch {} }
}
const primaImpronta = t => { const m = String(t || '').match(/\b[a-f0-9]{64}\b/i); return m ? m[0].toLowerCase() : null; };
class Ferma extends Error {}
const ferma = msg => { throw new Ferma(msg); };

// --- 2. già pronto da GitHub ---
function rilascio() {
  const r = leggiJson(path.join(ROOT, 'rilascio.json')) || {};
  const repo = String(process.env.MYVTT_REPO || r.repo || '').trim();
  const base = process.env.MYVTT_RILASCIO_BASE || r.base;
  if (base) return String(base).replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://github.com/${repo}/releases/${r.tag ? 'download/' + r.tag : 'latest/download'}`;
}
async function scaricaPronto() {
  const base = rilascio();
  if (!base) return false;
  say(`Cerco il collegamento già pronto per questo computer (${PIATTAFORMA})…`);
  state.busy = 'Cerco il collegamento già pronto…'; push();
  const atteso = primaImpronta(await scaricaTesto(`${base}/${LINK_ASSET}.sha256`));
  if (!atteso) { say('Non c\'è una versione già pronta per questo computer: la costruisco io.', 'warn'); return false; }
  fs.mkdirSync(path.dirname(LINK_SCARICATO), { recursive: true });
  const tmp = LINK_SCARICATO + '.part';
  if (!await scarica(`${base}/${LINK_ASSET}`, tmp, 'Scarico il collegamento')) { say('Scaricamento interrotto: provo a costruirlo.', 'warn'); return false; }
  if (await sha256File(tmp) !== atteso) {
    try { fs.unlinkSync(tmp); } catch {}
    say('Il file scaricato non corrisponde all\'impronta pubblicata: non lo uso.', 'bad');
    return false;
  }
  fs.renameSync(tmp, LINK_SCARICATO);
  if (!WIN) fs.chmodSync(LINK_SCARICATO, 0o755);
  say('Collegamento già pronto: scaricato e controllato.', 'ok');
  return true;
}

// --- 3. costruito qui, con strumenti privati ---
const ARCH_CPU = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
async function rustPrivato() {
  if (cargoPath()) return cargoPath();
  // il programma di installazione di Rust (su Windows sempre quello x64: gira anche sui PC ARM)
  const triple = WIN ? 'x86_64-pc-windows-msvc' : MAC ? `${ARCH_CPU}-apple-darwin` : `${ARCH_CPU}-unknown-linux-gnu`;
  const url = `${process.env.MYVTT_RUST_DIST || 'https://static.rust-lang.org/rustup/dist'}/${triple}/rustup-init${EXE}`;
  fs.mkdirSync(TOOLS, { recursive: true });
  const exe = path.join(TOOLS, 'rustup-init' + EXE);
  say('Scarico Rust nella cartella di LIBRE VTT (non tocca il resto del computer)…');
  if (!await scarica(url, exe, 'Scarico Rust')) ferma('Non riesco a scaricare Rust: controlla la connessione e riprova.');
  const atteso = primaImpronta(await scaricaTesto(url + '.sha256'));
  if (!atteso || atteso !== await sha256File(exe)) { try { fs.unlinkSync(exe); } catch {} ferma('Il file di Rust scaricato non è integro: riprova.'); }
  if (!WIN) fs.chmodSync(exe, 0o755);
  state.busy = 'Installo Rust nella cartella di LIBRE VTT…'; push();
  const args = ['-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'stable'];
  if (WIN) args.push('--default-host', 'x86_64-pc-windows-gnu');   // niente Visual Studio
  const ok = await esegui('rust', exe, args, { env: { RUSTUP_HOME, CARGO_HOME, RUSTUP_INIT_SKIP_PATH_CHECK: 'yes' } });
  try { fs.unlinkSync(exe); } catch {}
  if (!ok || !cargoPath()) ferma('Rust non si è installato: il registro qui sotto dice perché.');
  say('Rust pronto (solo per LIBRE VTT).', 'ok');
  return cargoPath();
}
const ZIG_PREFERITO = '0.13.0';
async function zigPrivato() {
  const dir = path.join(TOOLS, 'zig');
  const trova = () => { try { for (const d of fs.readdirSync(dir)) { const z = path.join(dir, d, 'zig' + EXE); if (fs.existsSync(z)) return z; } } catch {} return null; };
  if (trova()) return trova();
  say('Scarico Zig, che fa da compilatore C (al posto di Visual Studio o build-essential)…');
  let idx = null; try { idx = JSON.parse(await scaricaTesto(process.env.MYVTT_ZIG_INDEX || 'https://ziglang.org/download/index.json') || 'null'); } catch {}
  const chiave = `${ARCH_CPU}-${WIN ? 'windows' : MAC ? 'macos' : 'linux'}`;
  const ver = idx && (idx[ZIG_PREFERITO] && idx[ZIG_PREFERITO][chiave] ? ZIG_PREFERITO : Object.keys(idx).find(k => /^\d+\.\d+\.\d+$/.test(k) && idx[k][chiave]));
  const voce = ver && idx[ver][chiave];
  if (!voce || !voce.tarball) ferma('Non riesco a trovare Zig per questo computer: controlla la connessione e riprova.');
  const file = path.join(TOOLS, path.basename(new URL(voce.tarball).pathname));
  if (!await scarica(voce.tarball, file, 'Scarico il compilatore')) ferma('Non riesco a scaricare Zig: controlla la connessione e riprova.');
  if (voce.shasum && await sha256File(file) !== String(voce.shasum).toLowerCase()) { try { fs.unlinkSync(file); } catch {} ferma('Il file di Zig scaricato non è integro: riprova.'); }
  fs.mkdirSync(dir, { recursive: true });
  state.busy = 'Preparo il compilatore…'; push();
  // su Windows il tar di sistema (non quello di altri programmi installati, che potrebbe non saper aprire gli zip)
  const tarExe = WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const ok = await esegui('estraggo', tarExe, [WIN ? '-xf' : '-xJf', file, '-C', dir]);
  try { fs.unlinkSync(file); } catch {}
  if (!ok || !trova()) ferma(WIN ? 'Non riesco a estrarre Zig.' : 'Non riesco a estrarre Zig (serve «xz», che quasi tutte le distribuzioni hanno già).');
  return trova();
}
/** Piccoli programmi che fanno passare zig per un normale «cc». */
function wrapperZig(zig) {
  const W = path.join(TOOLS, 'wrap');
  fs.mkdirSync(W, { recursive: true });
  const js = path.join(ROOT, 'zigwrap.js');
  const target = WIN ? 'x86_64-windows-gnu' : `${ARCH_CPU}-linux-gnu.2.17`;
  const fai = (nome, modo) => {
    if (WIN) {
      const f = path.join(W, nome + '.cmd');
      fs.writeFileSync(f, `@"${process.execPath}" "${js}" "${zig}" ${modo} ${target} %*\r\n`);
      return f;
    }
    const f = path.join(W, nome);
    fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${js}" "${zig}" ${modo} ${target} "$@"\n`, { mode: 0o755 });
    return f;
  };
  return { cc: fai('zigcc', 'cc'), cxx: fai('zigcxx', 'c++'), ar: fai('zigar', 'ar') };
}
/** env con PATH che comincia dai nostri strumenti (su Windows la chiave si chiama «Path»). */
function conPath(env, ...dirs) {
  const k = Object.keys(env).find(x => x.toUpperCase() === 'PATH') || 'PATH';
  env[k] = [...dirs, env[k] || ''].join(path.delimiter);
  return env;
}
async function costruisci() {
  const cargo = await rustPrivato();
  const env = { RUSTUP_HOME, CARGO_HOME, RUSTUP_TOOLCHAIN: 'stable', CARGO_TARGET_DIR: path.join(LINK_BUILD, 'target'),
    ZIG_GLOBAL_CACHE_DIR: path.join(TOOLS, 'zig-cache'), ZIG_LOCAL_CACHE_DIR: path.join(TOOLS, 'zig-cache') };
  if (MAC) {
    // sul Mac servono gli strumenti di Apple (zig non ha i framework di macOS): li installa la finestra di Apple
    const clang = await new Promise(r => execFile('xcrun', ['--find', 'clang'], e => r(!e)));
    if (!clang) {
      try { spawn('xcode-select', ['--install'], { stdio: 'ignore', detached: true }).unref(); } catch {}
      ferma('Si è aperta una finestra di Apple: premi «Installa» per gli strumenti per sviluppatori, aspetta che finisca e poi premi di nuovo «Prepara».');
    }
  } else {
    const w = wrapperZig(await zigPrivato());
    if (WIN) {
      // Rust per Windows «gnu» si porta dietro il suo linker: a zig chiediamo solo di compilare il C
      Object.assign(env, { CC_x86_64_pc_windows_gnu: w.cc, CXX_x86_64_pc_windows_gnu: w.cxx, AR_x86_64_pc_windows_gnu: w.ar });
    } else {
      const T = `${ARCH_CPU.toUpperCase()}_UNKNOWN_LINUX_GNU`;
      Object.assign(env, { CC: w.cc, CXX: w.cxx, AR: w.ar, [`CARGO_TARGET_${T}_LINKER`]: w.cc });
    }
  }
  if (LINK_BUILD !== LINK_SRC) {
    // il programma è in sola lettura: si costruisce una copia nella cartella dell'utente
    fs.mkdirSync(path.join(LINK_BUILD, 'src'), { recursive: true });
    for (const f of ['Cargo.toml', 'Cargo.lock']) if (fs.existsSync(path.join(LINK_SRC, f))) fs.copyFileSync(path.join(LINK_SRC, f), path.join(LINK_BUILD, f));
    for (const f of fs.readdirSync(path.join(LINK_SRC, 'src'))) fs.copyFileSync(path.join(LINK_SRC, 'src', f), path.join(LINK_BUILD, 'src', f));
  }
  state.busy = 'Costruisco il collegamento (5-15 minuti, solo questa volta)…'; push();
  const fullEnv = conPath(envPulito(env), path.join(CARGO_HOME, 'bin'));
  const ok = await new Promise(resolve => {
    const p = spawn(cargo, ['build', '--release'], { cwd: LINK_BUILD, env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    state.procs.compilo = p;
    const pipe = st => st.on('data', d => String(d).split(/\r?\n/).forEach(l => {
      if (!l.trim()) return;
      say('[compilo] ' + l, /^\s*error/.test(l) ? 'bad' : '');
      const m = l.match(/^\s*Compiling (\S+)/); if (m) { state.busy = `Costruisco il collegamento: ${m[1]}…`; push(); }
    }));
    pipe(p.stdout); pipe(p.stderr);
    p.on('exit', c => { delete state.procs.compilo; resolve(c === 0); });
    p.on('error', () => resolve(false));
  });
  const fatto = path.join(LINK_BUILD, 'target', 'release', 'uffa-link' + EXE);
  if (!ok || !fs.existsSync(fatto)) ferma('La costruzione non è andata a buon fine: il registro qui sotto dice perché.');
  // si tiene solo il risultato: i file intermedi occupano più di un giga
  fs.mkdirSync(path.dirname(LINK_SCARICATO), { recursive: true });
  fs.copyFileSync(fatto, LINK_SCARICATO);
  if (!WIN) fs.chmodSync(LINK_SCARICATO, 0o755);
  try { fs.rmSync(path.join(LINK_BUILD, 'target'), { recursive: true, force: true }); } catch {}
  say('Collegamento costruito.', 'ok');
}

async function prepara() {
  state.busy = 'Preparo il collegamento a distanza…'; state.error = null; push();
  try {
    if (linkBin()) say('Il collegamento a distanza è già pronto.', 'ok');
    else if (!await scaricaPronto()) await costruisci();
    if (linkBin()) say('Tutto pronto per giocare a distanza.', 'ok');
  } catch (e) {
    state.error = e instanceof Ferma ? e.message : 'Qualcosa è andato storto: ' + e.message;
    say(state.error, 'bad');
  }
  state.busy = null; cache.at = 0; push();
}
// ---------- la finestra ----------
function trovaBrowser() {
  const prove = WIN ? [
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
  ] : MAC ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/snap/bin/chromium'
  ];
  return prove.find(p => p && fs.existsSync(p)) || null;
}
function apriFinestra(url) {
  const b = trovaBrowser();
  if (!b) {                                   // niente Chrome: si apre il browser normale
    const cmd = WIN ? 'cmd' : MAC ? 'open' : 'xdg-open';
    const args = WIN ? ['/c', 'start', '', url] : [url];
    try {
      const q = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      q.on('error', e => say('Non riesco ad aprire il browser: ' + e.message, 'warn'));
      q.unref();
    } catch (e) { say('Non riesco ad aprire il browser: ' + e.message, 'warn'); }
    say('Chrome non trovato: ho aperto il browser normale.', 'warn');
    sorvegliaSenzaFinestra();
    return null;
  }
  const p = spawn(b, [
    '--app=' + url,
    '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900'
  ], { detached: false, stdio: 'ignore' });
  // Chiusa la finestra, si spegne tutto.
  p.on('exit', () => { say('Finestra chiusa: spengo.'); stopAll(); setTimeout(() => process.exit(0), 300); });
  return p;
}

// Nel browser normale non si sa quando la scheda viene chiusa: le pagine di LIBRE VTT dicono
// «ci sono» ogni 20 secondi. Se per qualche minuto non c'è più nessuno, si spegne tutto
// (altrimenti i server resterebbero accesi per sempre, di nascosto).
let ultimoSegno = Date.now();
function sorvegliaSenzaFinestra() {
  setInterval(() => {
    if (listeners.size) ultimoSegno = Date.now();
    if (Date.now() - ultimoSegno > +(process.env.MYVTT_ATTESA_MS || 180000)) {
      console.log('Nessuna pagina di LIBRE VTT aperta da qualche minuto: spengo.');
      stopAll(); setTimeout(() => process.exit(0), 300);
    }
  }, 5000).unref();
}

// ---------- il piccolo server della finestra ----------
const invia = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '')) return invia(res, 403, 'no');

  if (u.pathname === '/' || u.pathname === '/index.html') {
    return fs.readFile(path.join(ROOT, 'launcher.html'), (e, d) =>
      e ? invia(res, 500, 'launcher.html non trovato') : invia(res, 200, d, 'text/html; charset=utf-8'));
  }
  if (u.pathname === '/api/vivo') { ultimoSegno = Date.now(); res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  if (u.pathname === '/api/stato') { ultimoSegno = Date.now(); }
  if (u.pathname === '/api/stato') { await check(); return invia(res, 200, JSON.stringify({ ...stato(), log: state.log.slice(-200) }), 'application/json'); }
  if (u.pathname === '/api/eventi') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': ciao\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }
  // Le richieste che cambiano qualcosa arrivano solo da questa finestra: un altro sito aperto nel
  // browser non deve poter creare cartelle o accendere partite al posto tuo.
  if (req.method === 'POST') {
    const o = req.headers.origin;
    if (o && o !== `http://127.0.0.1:${UI_PORT}` && o !== `http://localhost:${UI_PORT}`) return invia(res, 403, 'no');
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return invia(res, 415, 'no');
  }
  const corpo = fn => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 8000) req.destroy(); });
    req.on('end', async () => {
      let m; try { m = JSON.parse(body); } catch { return invia(res, 400, 'no'); }
      try { await fn(m); } catch (e) { if (!res.headersSent) invia(res, 500, JSON.stringify({ errore: e.message }), 'application/json'); }
    });
  };
  const ok = obj => invia(res, 200, JSON.stringify(obj), 'application/json');

  if (u.pathname === '/api/azione' && req.method === 'POST') {
    return corpo(m => {
      ok({ ok: true });
      if (m.what === 'solo' || m.what === 'host') avvia(m.what, null, String(m.campagna || ''));
      else if (m.what === 'join') avvia('join', String(m.id || '').trim());
      else if (m.what === 'prepara') prepara();
      else if (m.what === 'ferma') stopAll();
    });
  }
  // --- campagne ---
  if (u.pathname === '/api/campagne') return ok(elencoCampagne());
  if (u.pathname === '/api/sfoglia') return ok(sfoglia(u.searchParams.get('path') || ''));
  if (u.pathname === '/api/campagna/info') return ok(infoCampagna(u.searchParams.get('path') || ''));
  if (u.pathname === '/api/campagna/nuova' && req.method === 'POST') {
    return corpo(m => ok({ path: nuovaCampagna(m.nome), ...elencoCampagne() }));
  }
  if (u.pathname === '/api/campagna/scegli' && req.method === 'POST') {
    return corpo(async m => ok(await scegliCartella(m.titolo)));
  }
  if (u.pathname === '/api/campagna/usa' && req.method === 'POST') {
    // una cartella scelta a mano: se è vuota o non è ancora una campagna, la si prepara (dopo averlo chiesto)
    return corpo(m => {
      const info = infoCampagna(m.path);
      if (!info.esiste) return ok({ errore: 'Quella cartella non esiste.' });
      if (!info.scrivibile) return ok({ errore: 'In quella cartella non si può scrivere: copiala da un\'altra parte e riaprila da lì.' });
      if (!info.campagna && !info.vuota && !m.confermo) return ok({ chiedi: true, info });
      preparaCartella(info.path, info.nome);
      ricorda(info.path);
      ok({ path: info.path, info: infoCampagna(info.path) });
    });
  }
  if (u.pathname === '/api/campagna/dimentica' && req.method === 'POST') {
    return corpo(m => { dimentica(String(m.path || '')); ok(elencoCampagne()); });
  }
  if (u.pathname === '/api/campagna/mostra' && req.method === 'POST') {
    return corpo(m => { const i = infoCampagna(m.path); if (i.esiste) mostraCartella(i.path); ok({ ok: i.esiste }); });
  }
  invia(res, 404, 'no');
});

process.on('uncaughtException', e => say('errore: ' + e.message, 'bad'));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopAll(); process.exit(0); });

// ---------- accensione ----------
/** Su quella porta c'è già LIBRE VTT? (e non un altro programma) */
function èMyVtt(port) {
  return new Promise(res => {
    const r = http.get({ host: '127.0.0.1', port, path: '/api/stato', timeout: 1500 }, x => {
      let b = ''; x.on('data', d => { b += d; }); x.on('end', () => res(x.statusCode === 200 && b.includes('"piattaforma"')));
    });
    r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); });
  });
}
function mostraFinestraEsistente(port) {
  // Già aperto (doppio clic due volte sull'app): non si accende una seconda copia, si mostra la finestra.
  console.log('LIBRE VTT è già aperto: mostro la sua finestra.');
  const b = trovaBrowser(), url = `http://127.0.0.1:${port}/`;
  try {
    const p = b ? spawn(b, ['--app=' + url, '--user-data-dir=' + PROFILE], { detached: true, stdio: 'ignore' })
      : spawn(WIN ? 'cmd' : MAC ? 'open' : 'xdg-open', WIN ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', () => {}); p.unref();
  } catch {}
  setTimeout(() => process.exit(0), 500);
}
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `La porta ${UI_PORT} si è appena occupata: riapri LIBRE VTT.` : e.message);
  process.exit(1);
});
(async () => {
  conf.porte = conf.porte || {};
  const pref = +(process.env.UI_PORT || conf.porte.ui || PREF.ui);
  if (await èMyVtt(pref)) return mostraFinestraEsistente(pref);
  UI_PORT = await portaLibera(pref);
  if (UI_PORT !== pref) console.log(`La porta ${pref} è usata da un altro programma: uso la ${UI_PORT}.`);
  if (!process.env.UI_PORT && conf.porte.ui !== UI_PORT) { conf.porte.ui = UI_PORT; salvaConf(); }
  server.listen(UI_PORT, '127.0.0.1', async () => {
    await check();
    console.log('LIBRE VTT: finestra su http://127.0.0.1:' + UI_PORT);
    apriFinestra('http://127.0.0.1:' + UI_PORT + '/');
  });
})();
