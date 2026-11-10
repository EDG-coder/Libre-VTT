// ---------- Server dedicato: LIBRE VTT senza schermo, solo per collegare gli altri ----------
// Per una macchina sempre accesa e senza schermo (una schedina ARM o RISC-V, un vecchio portatile, un
// server): tiene la campagna, il server di gioco e il collegamento a distanza, e nient'altro. Nessuno gioca da
// qui: il master e i giocatori entrano dal loro LIBRE VTT con «Mi unisco» e il codice della partita.
//
// Il master entra come gli altri, ma il server lo deve autorizzare: la prima volta scrive, sotto il codice, la
// «chiave del master» che questo programma stampa all'avvio (e tiene in <campagna>/data/master.chiave). Dopo il
// server lo riconosce dalla sua identità firmata, e dal pannello può dare il ruolo di master anche ad altri.
//
//   node server/server-dedicato.js [avvia]        accende tutto (Ctrl+C per spegnere)
//   node server/server-dedicato.js codice         il codice della partita, da mandare a chi gioca
//   node server/server-dedicato.js chiave         la chiave del master
//   node server/server-dedicato.js nuova-chiave   una chiave del master nuova (quella vecchia non vale più)
//   node server/server-dedicato.js giocatori      chi c'è nel registro della campagna, con il ruolo
//   node server/server-dedicato.js master <nome>  dà il ruolo di master a quella persona
//   node server/server-dedicato.js giocatore <nome>  le toglie il ruolo di master
//
// Opzioni (anche come variabili d'ambiente):
//   --campagna <cartella>   LIBRE_SERVER_CAMPAGNA   dove sta la campagna (predefinita: ~/libre-vtt-server)
//   --nome <nome>           LIBRE_SERVER_NOME       il nome della campagna, la prima volta
//   --porta <n>             LIBRE_SERVER_PORTA      la porta del server di gioco su 127.0.0.1 (4000)
//   --porta-link <n>        LIBRE_SERVER_PORTA_LINK la porta tra server di gioco e collegamento (4010)
//   --collegamento <file>   LIBRE_LINK              il programma uffa-link da usare
//
// Una campagna già giocata su un computer si porta qui copiandone la cartella (Documenti › LIBRE VTT ›
// Campagne › <nome>): il server riparte da quello che il master aveva mostrato l'ultima volta.

'use strict';
const http = require('http'), https = require('https'), fs = require('fs'), os = require('os'), path = require('path');
const crypto = require('crypto'), { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const EXE = WIN ? '.exe' : '';
const VERSIONE = (() => { try { return require('../package.json').version; } catch { return ''; } })();

// ---------- argomenti ----------
const argv = process.argv.slice(2);
const opz = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help' || a === '--aiuto') { pos.unshift('aiuto'); continue; }
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { opz[k] = true; } else { opz[k] = v; i++; } }
  else pos.push(a);
}
const COMANDO = (pos[0] || 'avvia').toLowerCase();
const CAMP = path.resolve(String(opz.campagna || process.env.LIBRE_SERVER_CAMPAGNA || path.join(os.homedir(), 'libre-vtt-server')));
const DATA = path.join(CAMP, 'data');
const CONF_FILE = path.join(DATA, 'server.json');
const conf = (() => { try { return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')) || {}; } catch { return {}; } })();
const porta = (v, d) => { const n = parseInt(v, 10); return n > 0 && n < 65536 ? n : d; };
const PORTA = porta(opz.porta || process.env.LIBRE_SERVER_PORTA, conf.porta || 4000);
const PORTA_LINK = porta(opz['porta-link'] || process.env.LIBRE_SERVER_PORTA_LINK, conf.portaLink || 4010);
// il collegamento scrive l'ID e legge la chiave nella sua cartella di lavoro: una tutta sua, nella campagna
const LINK_DIR = path.join(DATA, 'collegamento');
const LINK_ID_FILE = path.join(LINK_DIR, 'uffa-link.id');
const MASTER_FILE = path.join(DATA, 'master.chiave');
const INVITO_FILE = path.join(DATA, 'invito.chiave');

const ora = () => new Date().toLocaleTimeString('it-IT', { hour12: false });
const say = (t, ...r) => console.log(`[${ora()}] ${t}`, ...r);
const leggiJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
function scriviSegreto(f, testo) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, testo, { mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch {}
}

// ---------- la campagna ----------
function preparaCampagna() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(path.join(CAMP, 'assets'), { recursive: true });
  fs.mkdirSync(LINK_DIR, { recursive: true });
  const meta = path.join(CAMP, 'campagna.json');
  if (!fs.existsSync(meta)) {
    const nome = String(opz.nome || process.env.LIBRE_SERVER_NOME || path.basename(CAMP)).slice(0, 60);
    fs.writeFileSync(meta, JSON.stringify({ nome, creata: new Date().toISOString(), programma: 'LIBRE VTT', server: true }, null, 2));
  }
}
const nomeCampagna = () => { const m = leggiJson(path.join(CAMP, 'campagna.json')); return String((m && m.nome) || path.basename(CAMP)).slice(0, 80); };

// ---------- il codice della partita (come nell'avviatore: l'ID di uffa-link, che nasce dalla chiave) ----------
function idDaChiave(hex) {
  const k = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'pkcs8' });
  return Buffer.from(crypto.createPublicKey(k).export({ format: 'jwk' }).x, 'base64url').toString('hex');
}
const PAROLA_FILE = path.join(DATA, 'invito.segreto');
const parolaInvito = () => { try { const t = fs.readFileSync(PAROLA_FILE, 'utf8').trim(); return /^[a-f0-9]{32}$/.test(t) ? t : ''; } catch { return ''; } };
function invito(nuovo) {
  let chiave = null;
  if (!nuovo) try { const t = fs.readFileSync(INVITO_FILE, 'utf8').trim(); if (/^[a-f0-9]{64}$/.test(t)) chiave = t; } catch {}
  if (!chiave) { chiave = crypto.randomBytes(32).toString('hex'); scriviSegreto(INVITO_FILE, chiave); }
  scriviSegreto(path.join(LINK_DIR, 'uffa-link.chiave'), chiave);
  // la parola d'invito: la seconda metà del codice (vedi game-server.js), cambia insieme alla chiave
  if (nuovo || !parolaInvito()) scriviSegreto(PAROLA_FILE, crypto.randomBytes(16).toString('hex'));
  const codice = idDaChiave(chiave);
  try {
    const mf = path.join(CAMP, 'campagna.json'), meta = leggiJson(mf);
    if (meta && (!meta.invito || meta.invito.codice !== codice)) { meta.invito = { codice, creato: new Date().toISOString() }; fs.writeFileSync(mf, JSON.stringify(meta, null, 2)); }
  } catch {}
  return codice + parolaInvito();
}
const codiceAttuale = () => { try { const t = fs.readFileSync(INVITO_FILE, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(t) ? idDaChiave(t) + parolaInvito() : null; } catch { return null; } };

// ---------- la chiave del master ----------
function chiaveMaster(nuova) {
  if (!nuova) try { const t = fs.readFileSync(MASTER_FILE, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(t)) return t; } catch {}
  const k = crypto.randomBytes(16).toString('hex');
  scriviSegreto(MASTER_FILE, k);
  return k;
}
// a gruppi di quattro, per leggerla e ricopiarla senza sbagliare (il server accetta anche senza trattini)
const leggibile = k => k.match(/.{4}/g).join('-');

// ---------- il collegamento a distanza (uffa-link) ----------
function piattaforma() {
  const a = process.arch === 'arm64' ? 'arm64' : process.arch === 'riscv64' ? 'riscv64' : process.arch === 'x64' ? 'x64' : null;
  if (WIN) return a === 'arm64' ? ['windows-arm64.exe', 'windows-x64.exe'] : ['windows-x64.exe'];
  if (MAC) return ['macos-universal'];
  return a ? ['linux-' + a] : [];
}
// installato con «Installa-LIBRE-VTT-Linux.sh --server»: il programma sta in app/, il collegamento in utente/bin
const UTENTE_BIN = path.join(ROOT, '..', 'utente', 'bin');
const BIN_SCARICATO = fs.existsSync(path.dirname(UTENTE_BIN)) ? UTENTE_BIN
  : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'libre-vtt-server', 'bin');
function trovaCollegamento() {
  const c = [opz.collegamento, process.env.LIBRE_LINK, path.join(UTENTE_BIN, 'uffa-link' + EXE), path.join(ROOT, 'bin', 'uffa-link' + EXE),
    path.join(BIN_SCARICATO, 'uffa-link' + EXE), path.join(ROOT, 'pacchetti', 'uffa-link', 'target', 'release', 'uffa-link' + EXE)];
  return c.filter(Boolean).map(x => path.resolve(String(x))).find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}
function prendi(url, salti = 0) {
  return new Promise((res, rej) => {
    const r = https.get(url, { headers: { 'User-Agent': 'libre-vtt-server/' + VERSIONE } }, x => {
      if ([301, 302, 303, 307, 308].includes(x.statusCode) && x.headers.location && salti < 6) { x.resume(); return res(prendi(new URL(x.headers.location, url).href, salti + 1)); }
      if (x.statusCode !== 200) { x.resume(); return rej(new Error('HTTP ' + x.statusCode)); }
      const pezzi = []; let n = 0;
      x.on('data', d => { n += d.length; if (n > 64 * 1024 * 1024) { r.destroy(); rej(new Error('troppo grande')); } else pezzi.push(d); });
      x.on('end', () => res(Buffer.concat(pezzi)));
      x.on('error', rej);
    });
    r.on('error', rej);
    r.setTimeout(60000, () => r.destroy(new Error('tempo scaduto')));
  });
}
async function scaricaCollegamento() {
  const repo = /^[\w.-]+\/[\w.-]+$/.test(process.env.LIBRE_REPO || '') ? process.env.LIBRE_REPO : 'EDG-coder/Libre-VTT';
  const base = (process.env.LIBRE_RILASCIO_BASE || `https://github.com/${repo}/releases/latest/download`).replace(/\/$/, '');
  for (const p of piattaforma()) {
    const nome = 'uffa-link-' + p;
    let atteso;
    try { atteso = (/\b([a-f0-9]{64})\b/i.exec((await prendi(`${base}/${nome}.sha256`)).toString('utf8')) || [])[1]; } catch { continue; }
    if (!atteso) continue;
    say(`Scarico il collegamento a distanza (${nome})…`);
    const buf = await prendi(`${base}/${nome}`);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== atteso.toLowerCase()) throw new Error('il file scaricato non corrisponde all\'impronta pubblicata');
    fs.mkdirSync(BIN_SCARICATO, { recursive: true });
    const f = path.join(BIN_SCARICATO, 'uffa-link' + EXE);
    fs.writeFileSync(f + '.part', buf); fs.renameSync(f + '.part', f);
    if (!WIN) fs.chmodSync(f, 0o755);
    say('Collegamento scaricato e controllato: ' + f);
    return f;
  }
  return null;
}

// ---------- parlare con il server di gioco acceso (per i comandi) ----------
function api(metodo, p, corpo) {
  return new Promise((res, rej) => {
    const dati = corpo ? JSON.stringify(corpo) : null;
    const r = http.request({ host: '127.0.0.1', port: PORTA, path: p, method: metodo,
      headers: { Host: '127.0.0.1:' + PORTA, ...(dati ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dati) } : {}) } }, x => {
      let t = ''; x.on('data', d => { t += d; }); x.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} res({ codice: x.statusCode, j, t }); });
    });
    r.on('error', rej);
    r.setTimeout(5000, () => r.destroy(new Error('tempo scaduto')));
    if (dati) r.write(dati);
    r.end();
  });
}
/** Il registro dei partecipanti: dal server acceso, oppure dal file se è spento. */
async function registro() {
  try { const r = await api('GET', '/api/state'); if (r.j && Array.isArray(r.j.roster)) return { acceso: true, lista: r.j.roster }; } catch {}
  const p = leggiJson(path.join(DATA, 'players.json')) || {};
  return { acceso: false, lista: Object.entries(p).map(([token, r]) => ({ token, ...r })) };
}
async function cambiaRuolo(nome, ruolo) {
  if (!nome) { console.error(`Scrivi anche il nome: node server/server-dedicato.js ${ruolo === 'master' ? 'master' : 'giocatore'} <nome>`); process.exit(2); }
  const { acceso, lista } = await registro();
  const chi = lista.filter(r => String(r.name || '').toLowerCase() === nome.toLowerCase());
  if (chi.length !== 1) { console.error(chi.length ? `Ci sono più persone che si chiamano «${nome}»: cambia prima il nome a una dal pannello.` : `Nel registro non c'è nessuno che si chiama «${nome}» (deve essere entrato almeno una volta).`); process.exit(1); }
  if (acceso) {
    const r = await api('POST', '/api/perm', { token: chi[0].token, role: ruolo });
    if (r.codice !== 200) { console.error('Il server ha detto di no: ' + (r.t || r.codice)); process.exit(1); }
  } else {
    const f = path.join(DATA, 'players.json'), p = leggiJson(f) || {};
    p[chi[0].token].role = ruolo;
    fs.writeFileSync(f, JSON.stringify(p));
  }
  console.log(ruolo === 'master' ? `«${chi[0].name}» adesso è master.` : `«${chi[0].name}» adesso è un giocatore.`);
}

// ---------- accendere e tenere acceso ----------
const figli = {};
let spegnendo = false;
const CANALE = crypto.randomBytes(16).toString('hex');           // le righe del server di gioco per noi hanno questa parola
function lancia(nome, cmd, args, env, cwd) {
  if (spegnendo) return;
  const avvio = Date.now();
  const p = spawn(cmd, args, { cwd: cwd || ROOT, env: { ...pulito(), ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  figli[nome] = p;
  let buf = '';
  const riga = l => {
    if (!l.trim()) return;
    if (l.startsWith('@@LIBRE ')) return dalServerDiGioco(l);
    // il collegamento stampa l'ID su una riga da sola: lo ristampiamo noi come codice, più chiaro
    if (nome === 'collegamento' && /^\s{6}[a-z0-9]{40,}\s*$/i.test(l)) return;
    console.log(`[${ora()}] ${nome}: ${l}`);
  };
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { riga(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  p.stderr.on('data', d => String(d).split('\n').forEach(l => l.trim() && console.error(`[${ora()}] ${nome}: ${l}`)));
  p.on('error', e => say(`${nome}: non parte (${e.message})`));
  p.on('exit', (c, s) => {
    if (figli[nome] === p) delete figli[nome];
    if (spegnendo || p.voluto) return;
    // si è fermato da solo: lo si riaccende (più si ferma presto, più si aspetta, fino a mezzo minuto)
    const attesa = Date.now() - avvio < 10000 ? Math.min(30000, (lancia.attese[nome] = (lancia.attese[nome] || 1000) * 2)) : (lancia.attese[nome] = 1000);
    say(`${nome} si è fermato (${s || c}): lo riaccendo tra ${Math.round(attesa / 1000)} s.`);
    setTimeout(() => (nome === 'collegamento' ? accendiCollegamento : accendiServerDiGioco)(), attesa);
  });
  return p;
}
lancia.attese = {};
function pulito() {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(NODE_OPTIONS|NODE_PATH|PORT|DATA_DIR|CAMPAIGN_DIR|LINK_PORT|LINK_ID_FILE|LIBRE_CANALE|LIBRE_SEGRETO|CHIAVE_MASTER|IDENTITA)$/i.test(k)) e[k] = v;
  return e;
}
let LINK = null;
function accendiServerDiGioco() {
  lancia('server', process.execPath, [path.join(ROOT, 'server', 'game-server.js'), 'host'], {
    PORT: String(PORTA), LINK_PORT: String(PORTA_LINK), DATA_DIR: DATA, CAMPAIGN_DIR: CAMP, LINK_ID_FILE,
    LIBRE_CANALE: CANALE, LIBRE_DEDICATO: '1', CAMPAGNA_NOME: nomeCampagna()
  });
}
function accendiCollegamento() {
  lancia('collegamento', LINK, ['host', '--port', String(PORTA_LINK)], {}, LINK_DIR);
}
function ferma(nome) { const p = figli[nome]; if (p) { p.voluto = true; try { p.kill(); } catch {} delete figli[nome]; } }

/** Le richieste del server di gioco (le stesse che fa all'avviatore). */
let cambiando = false;
async function dalServerDiGioco(l) {
  const m = /^@@LIBRE ([a-f0-9]{32}) ([\w-]+) (.*)$/.exec(l);
  if (!m || m[1] !== CANALE) return;
  if (m[2] !== 'cambia-codice' || cambiando) return;
  // «Cambia codice» dal pannello di un master: chiave nuova, il codice nuovo a chi è dentro, poi si riapre
  cambiando = true;
  try {
    const codice = invito(true);
    try { await api('POST', '/api/invito', { codice: codice.slice(0, 64) }); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    ferma('collegamento');
    try { fs.unlinkSync(LINK_ID_FILE); } catch {}
    accendiCollegamento();
    say('Codice della partita cambiato. Il nuovo è:');
    console.log('\n    ' + codice + '\n');
  } finally { cambiando = false; }
}

function spegni() {
  if (spegnendo) return;
  spegnendo = true;
  say('Spengo…');
  for (const n of Object.keys(figli)) { try { figli[n].kill(); } catch {} }
  setTimeout(() => process.exit(0), 1500).unref();
}

async function avvia() {
  preparaCampagna();
  LINK = trovaCollegamento();
  if (!LINK) {
    try { LINK = await scaricaCollegamento(); } catch (e) { say('Non riesco a scaricare il collegamento: ' + e.message); }
  }
  if (!LINK) {
    console.error(`
Manca il collegamento a distanza (uffa-link) per questa macchina (${process.platform} ${process.arch}).
Si può:
  - scaricarlo dalla pagina delle release (uffa-link-${(piattaforma()[0] || 'linux-<arch>').replace(/\.exe$/, '')}) e passarlo con --collegamento <file>
  - oppure compilarlo:  cd pacchetti/uffa-link && cargo build --release
`);
    process.exit(1);
  }
  fs.writeFileSync(CONF_FILE, JSON.stringify({ porta: PORTA, portaLink: PORTA_LINK, versione: VERSIONE }, null, 2));
  const codice = invito(false);
  const chiave = chiaveMaster(false);
  try { fs.unlinkSync(LINK_ID_FILE); } catch {}

  console.log(`
  LIBRE VTT ${VERSIONE} · server dedicato
  Campagna: «${nomeCampagna()}»  (${CAMP})

  Il codice della partita (da mandare a tutti, master compreso):

      ${codice}

  La chiave del master (solo per chi conduce, la prima volta che entra):

      ${leggibile(chiave)}

  Chi conduce: apre LIBRE VTT › «Mi unisco», incolla il codice e, sotto, in «Conduco io su un
  server dedicato», scrive la chiave. Dopo la prima volta il server lo riconosce da solo.
  Il pannello della sessione (permessi, provvedimenti, ruoli) lo apre il master dal suo tavolo.
`);
  process.on('SIGINT', spegni); process.on('SIGTERM', spegni); if (!WIN) process.on('SIGHUP', spegni);
  accendiServerDiGioco();
  // il collegamento dopo il server di gioco: chi entra subito trova già qualcuno che risponde
  const t0 = Date.now();
  const prova = () => api('GET', '/api/state').then(() => true, () => false);
  while (!(await prova()) && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 300));
  accendiCollegamento();
  say('Pronto. Ctrl+C per spegnere.');
}

// ---------- comandi ----------
(async () => {
  switch (COMANDO) {
    case 'avvia': case 'start': return avvia();
    case 'codice': { const c = codiceAttuale(); console.log(c || 'Il server non è ancora stato acceso: il codice nasce la prima volta.'); return; }
    case 'chiave': {
      try { const t = fs.readFileSync(MASTER_FILE, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(t)) { console.log(leggibile(t)); return; } } catch {}
      console.log('Non c\'è ancora una chiave del master: nasce la prima volta che accendi il server.'); return;
    }
    case 'nuova-chiave': {
      preparaCampagna();
      console.log(leggibile(chiaveMaster(true)));
      console.log('La chiave vecchia non vale più (chi è già master lo resta).');
      return;
    }
    case 'giocatori': {
      const { acceso, lista } = await registro();
      if (!lista.length) { console.log('Nel registro non c\'è ancora nessuno.'); return; }
      for (const r of lista) console.log(`${r.role === 'master' ? '👑' : r.role === 'spectator' ? '👁 ' : '🎲'} ${String(r.name || '(senza nome)').padEnd(24)} ${r.role || 'player'}${r.banned ? ' · bandito' : ''}${acceso && r.online ? ' · collegato' : ''}`);
      return;
    }
    case 'master': return cambiaRuolo(pos.slice(1).join(' ').trim(), 'master');
    case 'giocatore': return cambiaRuolo(pos.slice(1).join(' ').trim(), 'player');
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 30).map(l => l.slice(3)).join('\n'));
  }
})().catch(e => { console.error(e && e.message || e); process.exit(1); });
