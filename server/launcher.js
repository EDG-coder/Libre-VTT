// ---------- Avviatore: tutto da una finestra, senza terminale ----------
// Apre una finestra senza barra del browser, chiede che cosa vuoi fare, e accende da solo
// le cose che servono. Se manca qualcosa per giocare a distanza lo prepara lui, dopo avertelo
// chiesto. Quando chiudi la finestra, spegne tutto.
//
//   node server/launcher.js     (ma di solito lo lanciano «LIBRE VTT.app», «LIBRE VTT.vbs», «LIBRE VTT.desktop»)

'use strict';
const http = require('http'), https = require('https'), fs = require('fs'), os = require('os'), net = require('net');
const path = require('path'), crypto = require('crypto'), { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events'), { PassThrough } = require('stream');
const { creaZip, estraiZip } = require('./zip');
const MODULO = require('./modulo.js');
const { intestazioniPagina } = require('./csp');

const ROOT = path.join(__dirname, '..');                      // la cartella del programma
const WEB = path.join(ROOT, 'web');                           // le pagine

// Le variabili d'ambiente si chiamano LIBRE_*. Quelle di quando il programma si chiamava «MY VTT» (MYVTT_*)
// valgono ancora: gli script di avvio e le app già installati le usano, e devono continuare a funzionare.
// (Il segreto dell'app per telefono è LIBRE_APP_SEGRETO: LIBRE_SEGRETO è quello che passiamo noi ai server.)
function amb(k) { const v = process.env['LIBRE_' + k]; return v !== undefined && v !== '' ? v : process.env['MYVTT_' + k]; }

// Dentro l'app per Android o per iPhone/iPad (nodejs-mobile) non si possono lanciare altri
// programmi: il tavolo e il server di gioco girano come «worker» in questo stesso Node, e il
// collegamento a distanza vive nell'app, che ce lo fa usare da una porta di controllo.
// L'app ci passa: la cartella dell'utente, quella delle campagne, la porta di controllo del
// collegamento, un segreto (solo la sua finestra può usare le nostre API) e il file dove
// scrivere l'indirizzo quando siamo pronti.
const MOBILE = /^(android|ios)$/.test(amb('MOBILE') || '') ? amb('MOBILE') : null;
const SEGRETO = MOBILE ? String((amb('APP_SEGRETO') || process.env.MYVTT_SEGRETO) || '') : '';
const LINK_CTRL = MOBILE ? +amb('LINK_CONTROLLO') || 0 : 0;
const PRONTO_FILE = amb('PRONTO_FILE') || '';
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
const IN_APP = /\.app[\/\\]Contents[\/\\]/.test(ROOT) || !!MOBILE;
const scrivibile = d => {
  if (IN_APP && path.resolve(d).startsWith(ROOT)) return false;
  try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; }
};
const USERDIR = amb('USERDIR') || (WIN
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'LIBRE VTT')
  : MAC ? path.join(os.homedir(), 'Library', 'Application Support', 'LIBRE VTT')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'libre-vtt'));
// Il programma prima si chiamava «MY VTT»: la sua cartella (campagne recenti, Rust e Zig già
// scaricati) passa alla nuova, una volta sola, invece di ricominciare da zero.
if (!amb('USERDIR') && !fs.existsSync(USERDIR)) {
  const vecchia = path.join(path.dirname(USERDIR), WIN || MAC ? 'MY VTT' : 'my-vtt');
  try { if (fs.existsSync(vecchia)) fs.renameSync(vecchia, USERDIR); } catch {}
}
fs.mkdirSync(USERDIR, { recursive: true });
const CONF_FILE = path.join(USERDIR, 'launcher.json');       // campagne recenti
const LINK_ID_FILE = path.join(USERDIR, 'uffa-link.id');     // l'ID della sessione, scritto da uffa-link
const GUEST_DIR = path.join(USERDIR, 'ospite');               // da giocatore: solo una copia locale delle immagini
// i manuali importati dai PDF dell'utente: un catalogo privato, fuori dalle campagne (vedi manuali-privati.js)
const MANUALI_DIR = path.join(USERDIR, 'manuali-privati');

// uffa-link: già pronto dentro l'app, oppure compilato nella cartella del gioco (come prima),
// oppure compilato da noi nella cartella dell'utente quando quella del gioco non è scrivibile.
const LINK_SRC = path.join(ROOT, 'pacchetti', 'uffa-link');
const LINK_BUILD = scrivibile(LINK_SRC) ? LINK_SRC : path.join(USERDIR, 'uffa-link');
// La cartella del gioco usata prima, con la versione «cartella» dell'app per Mac (che se la
// segnava qui): da lì si recuperano la campagna di prima e il collegamento già compilato.
const VECCHIA = (() => {
  try {
    const p = fs.readFileSync(path.join(USERDIR, 'cartella.txt'), 'utf8').trim();
    return p && path.resolve(p) !== ROOT && (fs.existsSync(path.join(p, 'server', 'launcher.js')) || fs.existsSync(path.join(p, 'launcher.js'))) ? path.resolve(p) : null;
  } catch { return null; }
})();
const LINK_SCARICATO = path.join(USERDIR, 'bin', 'uffa-link' + EXE);   // scaricato già pronto o costruito qui
const LINK_CANDIDATES = [
  path.join(ROOT, 'bin', 'uffa-link' + EXE),
  LINK_SCARICATO,
  path.join(LINK_SRC, 'target', 'release', 'uffa-link' + EXE),
  path.join(ROOT, 'uffa-link', 'target', 'release', 'uffa-link' + EXE),     // compilato prima del riordino delle cartelle
  path.join(USERDIR, 'uffa-link', 'target', 'release', 'uffa-link' + EXE),
  ...(VECCHIA ? [path.join(VECCHIA, 'pacchetti', 'uffa-link', 'target', 'release', 'uffa-link' + EXE), path.join(VECCHIA, 'uffa-link', 'target', 'release', 'uffa-link' + EXE)] : [])
];
const linkBin = () => LINK_CANDIDATES.find(p => fs.existsSync(p)) || null;
const ARCH = process.arch === 'arm64' ? 'arm64' : process.arch === 'riscv64' ? 'riscv64' : 'x64';
const PIATTAFORMA = WIN ? `windows-${ARCH === 'arm64' ? 'arm64' : 'x64'}` : MAC ? 'macos-universal' : `linux-${ARCH}`;
// i nomi nelle uscite su GitHub, il primo è quello giusto; Windows ARM, se la release non ha ancora il
// suo (quelle prima della 3.7.9), usa quello x64, che Windows 11 fa girare emulato
const LINK_ASSETS = [`uffa-link-${PIATTAFORMA}${EXE}`, ...(WIN && ARCH === 'arm64' ? [`uffa-link-windows-x64${EXE}`] : [])];
// il profilo della finestra (lingua della pagina, permessi, cache) sta con le preferenze: la cartella temporanea macOS la svuota
const PROFILE = path.join(USERDIR, 'finestra');

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
let finestraVista = false;                // una pagina di LIBRE VTT si è collegata almeno una volta
function say(line, kind) {
  const e = { t: Date.now(), line: String(line).replace(/\s+$/, ''), kind: kind || '' };
  if (!e.line) return;
  if (MOBILE) console.log(e.line);   // sul telefono finisce nel registro di sistema (logcat / console di Xcode)
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
    invito: state.sessionId ? state.sessionId + (state.mode === 'host' && state.parola || '') : null,      // il codice intero da mandare: ID + parola d'invito
    link: MOBILE ? !!LINK_CTRL : !!linkBin(), cargo: !!cache.cargo, pronto: !!rilascio(), campagna: state.campagna || null,
    porte: { ui: UI_PORT, ...(state.porte || {}) },
    piattaforma: MOBILE === 'android' ? 'Android' : MOBILE === 'ios' ? 'iPhone e iPad' : WIN ? 'Windows' : MAC ? 'macOS' : 'Linux',
    mobile: MOBILE, campHome: CAMP_HOME, versione: VERSIONE, arch: process.arch, repo: repoGitHub(),
    relay: state.relay || null, pubblica: relayConf(), sito: SITO_WEB, viaRelay: state.viaRelay || null,
    node: process.versions.node, pref: prefCorrenti(), finestraScala, idUtente: idUtente(),
    // la prima volta l'ID si propone da solo: l'ultimo nome usato in una campagna a cui ti sei unito
    idSuggerito: idUtente() ? null : idDaProporre()
  };
}
// ---------- l'ID di chi usa questo LIBRE VTT ----------
// Si sceglie al primo avvio e si cambia dalla rotellina della home. È lo stesso in tutte le campagne (il master
// lo vede ma non lo può cambiare); il nome al tavolo invece è di ogni campagna.
// Il Node dentro le app per telefono (nodejs-mobile) non ha le tabelle Unicode: lì \p{L} nella regex è un
// errore di sintassi che ferma tutto (l'app si chiudeva all'avvio). Si costruisce la regex a parte e, se non
// riesce, si tengono le lettere latine, greche e cirilliche (come in server.js).
const LETTERE_ID = (() => { try { new RegExp('\\p{L}', 'u'); return '\\p{L}\\p{N}'; } catch { return 'A-Za-z0-9\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF'; } })();
const ID_VALIDO = new RegExp('^[' + LETTERE_ID + '_.-]{3,24}$', 'u');
const NON_ID = new RegExp('[^' + LETTERE_ID + '_.-]', 'gu');
const idUtenteValido = s => { const v = String(s == null ? '' : s).trim(); return ID_VALIDO.test(v) ? v : null; };
const idUtente = () => idUtenteValido(conf.idUtente);
function idDaProporre() {
  const u = Object.values(unite()).filter(e => e && e.nomeGiocatore).sort((a, b) => (b.ultimoAccesso || 0) - (a.ultimoAccesso || 0));
  const n = u.length ? String(u[0].nomeGiocatore).normalize('NFC').replace(/\s+/g, '_').replace(NON_ID, '').slice(0, 24) : '';
  return idUtenteValido(n);
}
function salvaIdUtente(m) {
  const v = idUtenteValido(m && m.id);
  if (!v) return { errore: 'L\'ID va da 3 a 24 caratteri: lettere, numeri, «_», «-» e «.» (niente spazi).' };
  conf.idUtente = v; salvaConf();
  return { ok: true, idUtente: v };
}
// Preferenze della home (rotellina): lingua, dimensione dell'interfaccia, tema, regole facoltative.
// t = quando sono cambiate l'ultima volta: il tavolo le prende solo se sono più nuove delle sue.
let finestraScala = null;                // il fattore con cui è stata aperta la finestra (sul computer)
function prefCorrenti() { return { lingua: /^(it|en)$/.test(amb('LINGUA') || '') ? amb('LINGUA') : null, scala: 100, tema: 'dark', caratLibere: false, spareggioDes: true, follia: false, dpr: null, t: 0, ...(conf.pref || {}) }; }
function salvaPref(m) {
  const p = prefCorrenti(), prima = JSON.stringify(p);
  if (m.lingua === 'it' || m.lingua === 'en') p.lingua = m.lingua;
  if (Number.isFinite(+m.scala) && +m.scala >= 70 && +m.scala <= 160) p.scala = Math.round(+m.scala / 5) * 5;
  if (['dark', 'light', 'system'].includes(m.tema)) p.tema = m.tema;
  if (typeof m.caratLibere === 'boolean') p.caratLibere = m.caratLibere;
  if (typeof m.spareggioDes === 'boolean') p.spareggioDes = m.spareggioDes;
  if (typeof m.follia === 'boolean') p.follia = m.follia;
  if (Number.isFinite(+m.dpr) && +m.dpr >= 0.5 && +m.dpr <= 5) p.dpr = +m.dpr;
  // la voce (voce.js): schermo, chat o no, con il momento della scelta (il tavolo la prende se è più nuova della sua)
  if (['schermo', 'chat', 'no'].includes(m.voce) && Number.isFinite(+m.voceT)) { p.voce = m.voce; p.voceT = +m.voceT; }
  const { t, dpr, voce, voceT, ...resto } = p, { t: t0, dpr: d0, voce: v0, voceT: vt0, ...resto0 } = JSON.parse(prima);
  if (JSON.stringify(resto) !== JSON.stringify(resto0)) p.t = Date.now();
  conf.pref = p; salvaConf();
  return p;
}
// Sul computer la dimensione dell'interfaccia la decide Chrome all'apertura della finestra
// (come lo zoom del browser: mappa e trascinamenti restano giusti).
function argScala() {
  const p = prefCorrenti();
  if (!p.dpr || p.scala === 100) return [];
  finestraScala = +(p.dpr * p.scala / 100).toFixed(3);
  return ['--force-device-scale-factor=' + finestraScala];
}

// ---------- un ambiente pulito ----------
// Quello che altri programmi installati possono aver lasciato nelle variabili d'ambiente
// (NODE_OPTIONS, un Rust di sistema configurato in modo strano, CC, PORT…) non deve arrivare
// ai nostri pezzi: si parte sempre da un ambiente ripulito.
const ENV_VIA = new Set(['NODE_OPTIONS', 'NODE_PATH', 'PORT', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_TARGET_DIR',
  'CARGO_BUILD_TARGET', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'RUSTC', 'RUSTC_WRAPPER', 'RUSTDOC',
  'CC', 'CXX', 'AR', 'LD', 'CFLAGS', 'CXXFLAGS', 'LDFLAGS', 'CPPFLAGS', 'LIBRARY_PATH', 'LD_LIBRARY_PATH',
  'DATA_DIR', 'CAMPAIGN_DIR', 'LINK_PORT', 'LINK_ID_FILE', 'LIBRE_DEDICATO', 'CHIAVE_MASTER', 'LIBRE_RELAY', 'LIBRE_RELAY_CHIAVE', 'LIBRE_JOIN_RELAY', 'LIBRE_JOIN_VIA', 'LIBRE_JOIN_CODICE', 'LIBRE_JOIN_PAROLA']);
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
// I pezzi del programma: NODE = uno dei nostri script (sul computer un processo Node a parte,
// sul telefono un worker), LINK = il collegamento a distanza (sul computer il programma
// uffa-link, sul telefono la libreria dentro l'app, raggiunta dalla porta di controllo).
// Dall'esterno si comportano tutti come un processo: stdout, stderr, «exit», kill().
const NODE = Symbol('node'), LINK = Symbol('link');

/** Uno script nostro in un worker: stesso Node, stessi argomenti e variabili di un processo. */
class ProcWorker extends EventEmitter {
  constructor(script, args, env) {
    super();
    const { Worker } = require('worker_threads');
    this.w = new Worker(path.join(ROOT, script), { argv: args, env, stdout: true, stderr: true });
    this.stdout = this.w.stdout; this.stderr = this.w.stderr;
    this.w.on('error', e => this.emit('error', e));
    this.w.on('exit', c => this.emit('exit', c));
  }
  kill() { this.w.terminate().catch(() => {}); }
}

/**
 * Una sessione del collegamento dentro l'app. La connessione alla porta di controllo dura
 * quanto la sessione: chiuderla la ferma. Le righe «L»/«E» sono quelle che il programma
 * scriverebbe sullo schermo (ci si trova l'ID nello stesso modo); «F <n>» = finita da sola.
 */
class ProcLink extends EventEmitter {
  constructor(args, env) {
    super();
    this.stdout = new PassThrough(); this.stderr = new PassThrough();
    const porta = args[args.indexOf('--port') + 1];
    // quanto ci si espone (Impostazioni avanzate): al programma per il computer va in una variabile, qui nel comando
    const rete = env && RETI_IROH.includes(env.UFFA_LINK_RETE) && env.UFFA_LINK_RETE !== 'normale' ? `rete=${env.UFFA_LINK_RETE} ` : '';
    const cmd = SEGRETO + ' ' + rete + (args[0] === 'host' ? `host ${porta} ${USERDIR}` : `join ${args[1]} ${porta}`);
    let codice = null, buf = '', finito = false;
    const s = this.sock = net.connect(LINK_CTRL, '127.0.0.1');
    s.setNoDelay(true);
    s.on('connect', () => s.write(cmd + '\n'));
    s.on('data', d => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const riga = buf.slice(0, i); buf = buf.slice(i + 1);
        const testo = riga.slice(2);
        if (riga[0] === 'L') this.stdout.write(testo + '\n');
        else if (riga[0] === 'E') this.stderr.write(testo + '\n');
        else if (riga[0] === 'F') codice = parseInt(testo, 10) || 0;
      }
    });
    s.on('error', e => this.emit('error', new Error('collegamento dell\'app non raggiungibile: ' + e.message)));
    s.on('close', () => {
      if (finito) return;
      finito = true; this.stdout.end(); this.stderr.end();
      this.emit('exit', codice == null ? 1 : codice);
    });
  }
  kill() { try { this.sock.end('stop\n'); } catch {} }
}

function lancia(cmd, args, opts) {
  if (cmd === NODE) {
    if (MOBILE) return new ProcWorker(args[0], args.slice(1), envPulito(opts.env));
    cmd = process.execPath;
  } else if (cmd === LINK) {
    if (MOBILE) return new ProcLink(args, opts.env);
    cmd = linkBin();
  }
  return spawn(cmd, args, { cwd: opts.cwd || ROOT, env: envPulito(opts.env), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

// opts.keep: se si ferma da solo mentre si gioca, lo si riaccende (con un po' d'attesa che
// cresce se continua a cadere). Si spegne davvero solo con «ferma» o chiudendo la finestra.
let gen = 0;                                                   // cambia a ogni avvio/spegnimento
// Le righe «@@LIBRE …» del server di gioco valgono solo con questa parola segreta: un nome o un
// messaggio arrivato dalla rete e scritto nel registro non può fingersi una sua richiesta.
const CANALE_REGOLE = crypto.randomBytes(16).toString('hex');
const restarts = {};
function run(key, cmd, args, opts = {}) {
  const myGen = gen, born = Date.now();
  const p = lancia(cmd, args, opts);
  state.procs[key] = p;
  const pipe = (s, kind) => s.on('data', d => String(d).split(/\r?\n/).forEach(l => {
    if (!l.trim()) return;
    const cmd = key === 'regole' && kind === '' && /^@@LIBRE ([a-f0-9]{32}) ([\w-]+) (.*)$/.exec(l);    // una richiesta del server di gioco (vedi avviatore())
    if (cmd && cmd[1] !== CANALE_REGOLE) return;                // una riga che si finge sua: la si ignora
    if (cmd) { try { dalServerDiGioco(cmd[2], JSON.parse(cmd[3] || '{}')); } catch (e) { say('Richiesta del server di gioco non valida: ' + e.message, 'warn'); } return; }
    const m = l.match(/^\s{6}([a-z0-9]{40,})\s*$/i);          // l'ID stampato da uffa-link
    // nel registro della finestra: niente istruzioni da terminale, e l'ID accorciato (quello intero è nel riquadro «Codice»)
    const daTerminale = /Ctrl\+C|uffa-link\/target|Ora avvia anche|uffa-link (host|join)\b|Il VTT si collega a ws:/.test(l);
    if (!daTerminale) say(`[${key}] ${m ? '      ' + m[1].slice(0, 8) + '…' + m[1].slice(-4) : l}`, kind);
    if (m) {
      if (state.sessionId && state.sessionId !== m[1]) say('Il codice della sessione è cambiato: rimandalo ai giocatori.', 'warn');
      state.sessionId = m[1]; push();
    }
  }));
  pipe(p.stdout, ''); pipe(p.stderr, 'warn');
  p.on('exit', code => {
    say(`[${key}] chiuso (${code})`, code ? 'warn' : '');
    if (state.procs[key] === p) delete state.procs[key];
    if (!opts.keep || myGen !== gen || !state.mode || p.sostituito) return;   // spento apposta
    if (Date.now() - born > 60000) restarts[key] = 0;          // era stato su a lungo: si riparte da capo
    const n = restarts[key] = (restarts[key] || 0) + 1;
    const wait = Math.min(15000, 1000 * n);
    say(`[${key}] si è fermato da solo: lo riaccendo tra ${Math.round(wait / 1000)} s.`, 'warn');
    setTimeout(() => {
      if (myGen !== gen || !state.mode || state.procs[key]) return;
      run(key, cmd, args, opts);
    }, wait);
  });
  p.on('error', e => say(`[${key}] ${e.code === 'ENOENT' ? 'non parte' : 'errore'}: ${e.message}`, 'bad'));
  return p;
}
function stopAll() {
  gen++;
  for (const k of Object.keys(restarts)) delete restarts[k];
  for (const [k, p] of Object.entries(state.procs)) { try { p.kill(); } catch {} delete state.procs[k]; }
  try { fs.unlinkSync(LINK_ID_FILE); } catch {}
  try { fs.unlinkSync(LINK_CHIAVE_FILE); } catch {}
  state.mode = null; state.sessionId = null; state.campagna = null; state.porte = null; state.joinCodice = null; state.parola = null; state.relay = null; state.viaRelay = null;
  push();
}

// ---------- Codice d'invito stabile (punto 24) e campagne a cui ci si è uniti (punto 25) ----------
// Il codice è l'ID di uffa-link, che nasce da una chiave: la chiave sta nella campagna
// (data/invito.chiave), quindi il codice resta lo stesso a ogni apertura finché il master non lo
// cambia. In campagna.json c'è anche, per comodità, invito: { codice, creato }.
const LINK_CHIAVE_FILE = path.join(USERDIR, 'uffa-link.chiave');
/** L'ID (il codice) che uffa-link avrà con questa chiave: la chiave pubblica Ed25519, in esadecimale. */
function idDaChiave(hex) {
  const k = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'pkcs8' });
  return Buffer.from(crypto.createPublicKey(k).export({ format: 'jwk' }).x, 'base64url').toString('hex');
}
function invitoCampagna(dir, nuova) {
  const f = path.join(dir, 'data', 'invito.chiave');
  let chiave = null;
  if (!nuova) try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[a-f0-9]{64}$/.test(t)) chiave = t; } catch {}
  if (!chiave) { chiave = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, chiave, { mode: 0o600 }); }
  try { fs.chmodSync(f, 0o600); } catch {}                // la chiave la legge solo chi usa questo account
  const codice = idDaChiave(chiave);
  // la parola d'invito: la seconda metà del codice da mandare (vedi game-server.js). Cambia insieme alla chiave.
  const fp = path.join(dir, 'data', 'invito.segreto');
  let parola = null;
  if (!nuova) try { const t = fs.readFileSync(fp, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(t)) parola = t; } catch {}
  if (!parola) { parola = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(fp, parola, { mode: 0o600 }); }
  try { fs.chmodSync(fp, 0o600); } catch {}
  try {
    const mf = path.join(dir, 'campagna.json'), meta = leggiJson(mf);
    if (meta && (!meta.invito || meta.invito.codice !== codice)) { meta.invito = { codice, creato: new Date().toISOString() }; fs.writeFileSync(mf, JSON.stringify(meta, null, 2)); }
  } catch {}
  return { chiave, codice, parola };
}
/** «Cambia codice»: chiave nuova; il codice nuovo va subito ai giocatori collegati (lo salvano da
 *  soli), poi la sessione si riapre con la chiave nuova. Il codice vecchio non vale più. */
let cambiando = false;
async function cambiaCodice() {
  if (state.mode !== 'host' || !state.campagna || cambiando) return { errore: 'Non stai conducendo una partita.' };
  cambiando = true;
  try {
    const inv = invitoCampagna(state.campagna.path, true);
    state.parola = inv.parola;
    say('Codice nuovo: lo mando ai giocatori collegati e riapro la sessione.', 'ok');
    try {
      await new Promise((res, rej) => {
        const r = http.request({ host: '127.0.0.1', port: state.porte.game, path: '/api/invito', method: 'POST', headers: { 'Content-Type': 'application/json', ...(SEGRETO ? { Cookie: 'libre_k=' + encodeURIComponent(SEGRETO) } : {}) }, timeout: 4000 }, x => { x.resume(); x.on('end', res); });
        r.on('error', rej); r.on('timeout', () => r.destroy(new Error('tempo scaduto'))); r.end(JSON.stringify({ codice: inv.codice }));
      });
    } catch (e) { say('Non sono riuscito ad avvisare i giocatori collegati: ' + e.message, 'warn'); }
    await attesa(2500);                                   // il tempo di far arrivare il messaggio
    fs.writeFileSync(LINK_CHIAVE_FILE, inv.chiave, { mode: 0o600 }); try { fs.chmodSync(LINK_CHIAVE_FILE, 0o600); } catch {}
    const p = state.procs.sessione;
    if (p) { try { p.kill(); } catch {} }                 // si riaccende da solo, con la chiave nuova
    return { codice: inv.codice + inv.parola };
  } finally { cambiando = false; }
}
// Da giocatore: le campagne a cui ci si è uniti, nel file di configurazione (conf.unite), con
// l'identità data dall'host, l'ultima scena vista e la sua miniatura (in USERDIR/unite/).
const UNITE_DIR = path.join(USERDIR, 'unite');
const unite = () => (conf.unite && typeof conf.unite === 'object' ? conf.unite : (conf.unite = {}));
function ricordaUnita(codice, dati) {
  if (!/^[a-f0-9]{64}$/.test(String(codice || ''))) return;
  const u = unite(), e = u[codice] = { codice, ...(u[codice] || {}), ...dati, ultimoAccesso: Date.now() };
  if (e.firma === null) delete e.firma;
  salvaConf();
}
// ---------- «Partita pubblica»: i giocatori entrano anche dal sito, attraverso il relay ----------
// Il master sceglie (dalla home, a partita aperta) se aprire la partita anche a chi gioca dal sito, senza
// installare niente. Il server di gioco si collega al relay (server/relay-host.js) e si fa riconoscere con la
// chiave del codice. L'indirizzo del relay lo dice il sito (relay.json), oppure lo scrive il master (un suo relay).
const SITO_WEB = String(amb('SITO') || 'https://libre-vtt.pages.dev').replace(/\/+$/, '');
function relayConf() { const r = conf.relay || {}; return { attiva: !!r.attiva, indirizzo: typeof r.indirizzo === 'string' ? r.indirizzo : '', tipo: ['sito', 'cloudflare', 'proprio', 'terzi'].includes(r.tipo) ? r.tipo : 'sito', appVia: ['iroh', 'auto', 'relay'].includes(r.appVia) ? r.appVia : 'iroh', irohRete: RETI_IROH.includes(r.irohRete) ? r.irohRete : 'normale' }; }
// Quanto si espone il collegamento diretto (uffa-link la legge in UFFA_LINK_RETE): come sempre, senza chiedere porte al router, o solo dai server di passaggio
const RETI_IROH = ['normale', 'senza-upnp', 'solo-relay'];
/** L'indirizzo di un relay scritto dall'utente: https:// diventa wss://; vale wss:// (o ws:// solo per questo computer, per le prove). Vuoto = quello del sito. */
function relayIndirizzoPulito(testo) {
  let x = String(testo == null ? '' : testo).trim().replace(/^https:/i, 'wss:').replace(/^http:\/\/(localhost|127\.0\.0\.1)/i, 'ws://$1').replace(/\/+$/, '').replace(/\/v1(\/stanza)?$/i, '');
  if (!x) return { ok: true, valore: '' };
  if (/^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/i.test(x) || /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w./-]*)?$/i.test(x)) return { ok: true, valore: x };
  return { ok: false, errore: 'L\'indirizzo del relay deve cominciare con wss:// (o https://).' };
}
/** Prova un relay: la pagina di cortesia all'indirizzo (https://…/) dice «Relay di LIBRE VTT (v1)». */
/** Indirizzi interni (rete locale, metadati del cloud) che la prova non deve interrogare, a meno che non sia questo stesso computer. */
function indirizzoInterno(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
  if (/\.(local|internal|lan|localdomain)$/.test(h) || !h.includes('.') && !h.includes(':')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (m) { const a = +m[1], b = +m[2]; return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  return h.includes(':');   // altri indirizzi IPv6 scritti per esteso
}
/** Un indirizzo IP (già risolto) che non sta su Internet: questo computer, la rete di casa, i metadati del cloud. */
function ipInterno(ip) {
  const net = require('net');
  let h = String(ip).toLowerCase();
  const m4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);                // un IPv4 scritto da IPv6
  if (m4) h = m4[1];
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (!net.isIPv6(h)) return true;
  return h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^ff/.test(h) || h.startsWith('::ffff:');
}
async function provaRelay(url) {
  try {
    const u = new URL(url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
    if (u.username || u.password || indirizzoInterno(u.hostname)) return { ok: false, errore: 'Questo indirizzo non è un relay raggiungibile da Internet.' };
    // anche un nome pubblico può puntare a un indirizzo interno (router, altri computer di casa): si guarda dove porta davvero
    const locale = ['localhost', '127.0.0.1', '::1'].includes(u.hostname.toLowerCase().replace(/^\[|\]$/g, ''));
    if (!locale) {
      const dove = await require('dns').promises.lookup(u.hostname, { all: true }).catch(() => []);
      if (!dove.length) return { ok: false, errore: 'Non riesco a collegarmi a questo indirizzo.' };
      if (dove.some(x => ipInterno(x.address))) return { ok: false, errore: 'Questo indirizzo non è un relay raggiungibile da Internet.' };
    }
    u.pathname = u.pathname.replace(/\/+$/, '') + '/'; u.search = ''; u.hash = '';
    const r = await fetch(u.href, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    const t = (await r.text()).slice(0, 300);
    if (/Relay di LIBRE VTT \(v1\)/.test(t)) return { ok: true };
    return { ok: false, errore: r.ok ? 'Risponde, ma non sembra un relay di LIBRE VTT (versione 1).' : 'Il server risponde con un errore (' + r.status + ').' };
  } catch (e) {
    return { ok: false, errore: e && e.name === 'TimeoutError' ? 'Il relay non risponde (10 secondi).' : 'Non riesco a collegarmi a questo indirizzo.' };
  }
}
let relayDalSito = { url: null, t: 0 };
async function indirizzoRelay() {
  const r = relayConf();
  if (r.indirizzo) return r.indirizzo;
  if (amb('RELAY_URL')) return amb('RELAY_URL');
  if (relayDalSito.url && Date.now() - relayDalSito.t < 6 * 3600 * 1000) return relayDalSito.url;
  try {
    const j = JSON.parse(await scaricaTesto(SITO_WEB + '/relay.json') || 'null');
    if (j && /^wss:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/i.test(String(j.relay || ''))) { relayDalSito = { url: j.relay, t: Date.now() }; return j.relay; }
  } catch {}
  return null;
}
/** Accende o spegne il relay nel server di gioco che sta girando. */
async function applicaRelay() {
  if (state.mode !== 'host' || !state.porte || !state.porte.game) return;
  const r = relayConf();
  const url = r.attiva ? await indirizzoRelay() : null;
  if (r.attiva && !url) { state.relay = { attivo: false, errore: 'Non trovo l\'indirizzo del relay: il sito non risponde. Riprova più tardi o scrivi l\'indirizzo del tuo relay.' }; push(); return; }
  await new Promise(res => {
    const q = http.request({ host: '127.0.0.1', port: state.porte.game, path: '/api/relay', method: 'POST', headers: { 'Content-Type': 'application/json', ...(SEGRETO ? { Cookie: 'libre_k=' + encodeURIComponent(SEGRETO) } : {}) }, timeout: 4000 }, x => { x.resume(); x.on('end', res); });
    q.on('error', res); q.on('timeout', () => q.destroy());
    q.end(JSON.stringify({ url }));
  });
}

/** Le righe «@@LIBRE …» del server di gioco. */
function dalServerDiGioco(cosa, d) {
  if (cosa === 'cambia-codice' && state.mode === 'host') return cambiaCodice();
  if (cosa === 'relay') {
    const prima = state.relay;
    state.relay = { attivo: !!d.attivo, collegato: !!d.collegato, errore: d.errore ? String(d.errore).slice(0, 200) : null };
    if (state.relay.collegato && !(prima && prima.collegato)) say('Partita pubblica: i giocatori possono entrare anche dal sito.', 'ok');
    else if (state.relay.errore && (!prima || prima.errore !== state.relay.errore)) say('Relay: ' + state.relay.errore, 'warn');
    push();
    return;
  }
  if (state.mode !== 'join' || !state.joinCodice) return;
  const codice = state.joinCodice;
  if (cosa === 'identita' && /^[a-f0-9]{24}$/.test(String(d.token || ''))) {
    ricordaUnita(codice, { idGiocatore: d.token, firma: d.firma || null, ...(d.campagna ? { nome: String(d.campagna).slice(0, 80) } : {}), ...(d.nome ? { nomeGiocatore: String(d.nome).slice(0, 40) } : {}) });
  } else if (cosa === 'miniatura' && typeof d.file === 'string' && d.file.startsWith(GUEST_DIR + path.sep)) {
    try { fs.mkdirSync(UNITE_DIR, { recursive: true }); fs.copyFileSync(d.file, path.join(UNITE_DIR, codice + '.img')); } catch {}
    ricordaUnita(codice, { ultimaScena: String(d.scena || '').slice(0, 80), miniatura: true });
  } else if (cosa === 'nuovo-codice' && /^[a-f0-9]{64}$/.test(String(d.codice || '')) && d.codice !== codice) {
    // il master ha cambiato codice: la voce passa al codice nuovo e ci si ricollega lì
    const u = unite(), vecchia = u[codice];
    if (vecchia) { u[d.codice] = { ...vecchia, codice: d.codice }; delete u[codice]; }
    try { fs.renameSync(path.join(UNITE_DIR, codice + '.img'), path.join(UNITE_DIR, d.codice + '.img')); } catch {}
    salvaConf();
    say('Il master ha cambiato il codice: mi ricollego con quello nuovo.', 'ok');
    state.joinCodice = d.codice;
    const p = state.procs.sessione;
    if (p) { p.sostituito = true; try { p.kill(); } catch {} delete state.procs.sessione; }
    run('sessione', LINK, ['join', d.codice, '--port', String(state.porte.link)], { keep: true, cwd: USERDIR, env: { UFFA_LINK_RETE: relayConf().irohRete } });
  }
}
/** Il riquadro di una campagna: si chiede all'host com'è (online, quanti dentro, in sessione)
 *  aprendo per un momento un collegamento come quello di «join». Nessuna risposta = offline. */
async function statoUnita(e) {
  if (MOBILE ? !LINK_CTRL : !linkBin()) return { online: false };
  const porta = await portaLibera(PREF.link + 20, [UI_PORT, ...(state.porte ? [state.porte.web, state.porte.game, state.porte.link] : [])]);
  return new Promise(resolve => {
    let finito = false, collegato = false, sock = null, buf = '';
    const p = lancia(LINK, ['join', e.codice, '--port', String(porta)], { cwd: USERDIR });
    const fine = r => {
      if (finito) return; finito = true; clearTimeout(timer);
      try { sock && sock.destroy(); } catch {} try { p.kill(); } catch {}
      // collegato all'host ma senza risposta: un LIBRE VTT di prima della 3.7.2, acceso
      resolve(r || (collegato ? { online: true } : { online: false }));
    };
    const timer = setTimeout(() => fine(null), 15000);
    p.on('error', () => fine(null)); p.on('exit', () => fine(null));
    const leggi = s => s.on('data', d => { if (/collegato!/.test(String(d))) collegato = true; });
    leggi(p.stdout); leggi(p.stderr);
    // la porta è pronta poco dopo: si prova a entrare e a chiedere
    (async () => {
      for (let i = 0; i < 20 && !finito && !sock; i++) {
        await attesa(250);
        await new Promise(ok => {
          const s = net.connect(porta, '127.0.0.1');
          s.on('connect', () => { sock = s; s.write(JSON.stringify({ t: 'stato', token: e.idGiocatore || '', firma: e.firma || undefined }) + '\n'); ok(); });
          s.on('error', () => ok());
          s.on('data', d => {
            buf += d.toString('utf8');
            const i = buf.indexOf('\n'); if (i < 0) return;
            let m = null; try { m = JSON.parse(buf.slice(0, i)); } catch {}
            if (m && m.t === 'stato') fine(m.fuori ? { fuori: true } : { online: true, membriOnline: +m.membriOnline || 0, sessioneDa: m.sessioneDa || null, nomeCampagna: m.nomeCampagna || null });
          });
        });
      }
    })();
  });
}
let statoInCorso = null;
async function statoUnite() {
  if (statoInCorso) return statoInCorso;
  statoInCorso = (async () => {
    const out = {};
    const voci = Object.values(unite());
    // due alla volta: ognuna apre un collegamento per qualche secondo
    for (let i = 0; i < voci.length; i += 2) {
      const pezzo = voci.slice(i, i + 2);
      const r = await Promise.all(pezzo.map(e => state.mode === 'join' && state.joinCodice === e.codice ? { online: true, qui: true } : statoUnita(e)));
      pezzo.forEach((e, k) => {
        out[e.codice] = r[k];
        if (r[k].fuori) { delete unite()[e.codice]; try { fs.unlinkSync(path.join(UNITE_DIR, e.codice + '.img')); } catch {} salvaConf(); }
        else if (r[k].nomeCampagna && r[k].nomeCampagna !== e.nome) { unite()[e.codice].nome = r[k].nomeCampagna; salvaConf(); }
      });
    }
    return out;
  })();
  try { return await statoInCorso; } finally { statoInCorso = null; }
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
let documentiTrovata = null;
function cartellaDocumenti() {
  if (documentiTrovata) return documentiTrovata;
  return (documentiTrovata = trovaDocumenti());
}
function trovaDocumenti() {
  const home = os.homedir();
  if (MOBILE) return home;
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
const CAMP_HOME = amb('CAMPAGNE') ? path.resolve(amb('CAMPAGNE')) : path.join(cartellaDocumenti(), 'LIBRE VTT', 'Campagne');
const PREDEFINITE = path.join(USERDIR, 'predefinite.json');   // le impostazioni per le campagne nuove
const CAMP_VECCHIE = MOBILE ? null : path.join(cartellaDocumenti(), 'MY VTT', 'Campagne');   // di quando si chiamava «MY VTT»

let conf = { recenti: [] };
try { conf = { recenti: [], ...JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')) }; } catch {}
const salvaConf = () => { try { fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2)); } catch (e) { say('Non riesco a salvare le preferenze: ' + e.message, 'warn'); } };
function ricorda(dir) {
  conf.recenti = [path.resolve(dir), ...conf.recenti.filter(d => path.resolve(d) !== path.resolve(dir))].slice(0, 12);
  salvaConf();
}
// ---------- Elimina campagna: nel Cestino, non per sempre ----------
// Computer: il Cestino del sistema. Telefono (dove il Cestino non c'è): una cartella «Cestino» accanto a
// «Campagne», che l'elenco non legge; su iPhone/iPad si vede dall'app File e da lì si recupera.
const prova = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 30000, windowsHide: true }, e => res(!e)));
function nomeLibero(cartella, nome) {
  let n = nome, i = 2;
  while (fs.existsSync(path.join(cartella, n))) n = `${nome} ${i++}`;
  return path.join(cartella, n);
}
async function nelCestino(dir) {
  const nome = path.basename(dir);
  if (MOBILE) {
    const cest = path.join(path.dirname(CAMP_HOME), 'Cestino');
    fs.mkdirSync(cest, { recursive: true });
    fs.renameSync(dir, nomeLibero(cest, nome));
    return;
  }
  if (WIN) {
    const q = s => "'" + String(s).replace(/'/g, "''") + "'";
    if (await prova('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(${q(dir)}, 'OnlyErrorDialogs', 'SendToRecycleBin')`]) && !fs.existsSync(dir)) return;
    throw new Error('il Cestino di Windows non ha accettato la cartella');
  }
  if (MAC) {
    try { fs.renameSync(dir, nomeLibero(path.join(os.homedir(), '.Trash'), nome)); return; } catch {}
    if (await prova('osascript', ['-e', `tell application "Finder" to delete (POSIX file ${JSON.stringify(dir)} as alias)`]) && !fs.existsSync(dir)) return;
    throw new Error('il Cestino del Mac non ha accettato la cartella');
  }
  if (await prova('gio', ['trash', dir]) && !fs.existsSync(dir)) return;
  // Linux senza gio: il Cestino secondo le regole di freedesktop
  const base = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Trash');
  fs.mkdirSync(path.join(base, 'files'), { recursive: true }); fs.mkdirSync(path.join(base, 'info'), { recursive: true });
  const dest = nomeLibero(path.join(base, 'files'), nome);
  fs.writeFileSync(path.join(base, 'info', path.basename(dest) + '.trashinfo'), `[Trash Info]\nPath=${encodeURI(dir)}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
  fs.renameSync(dir, dest);
}
async function eliminaCampagna(dir) {
  const info = infoCampagna(dir);
  if (!dir || !info.esiste || !info.campagna || info.vecchia) throw new Error('non è una cartella di campagna');
  if (state.mode && state.campagna && path.resolve(state.campagna.path) === path.resolve(dir)) throw new Error('la partita è aperta: chiudila prima');
  if (path.resolve(dir) === path.resolve(ROOT) || path.resolve(dir) === path.resolve(CAMP_HOME)) throw new Error('questa cartella non si può eliminare');
  await nelCestino(path.resolve(dir));
  dimentica(dir);
  say(`Campagna «${info.nome}» spostata nel Cestino.`, 'ok');
}
function dimentica(dir) { conf.recenti = conf.recenti.filter(d => path.resolve(d) !== path.resolve(dir)); salvaConf(); }

// niente caratteri vietati nei nomi di cartella, niente spazi o punti all'inizio e alla fine
const pulisciNome = s => String(s || '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+/, '').slice(0, 60).replace(/[\s.]+$/, '');
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
  // Leggere board.json, sheets.json e world.json per intero (possono essere decine di MB) e contare le immagini
  // costa: con tante campagne, o su Documenti sincronizzati con iCloud, l'elenco ci metteva secondi. Si rifà
  // solo se uno di quei file (o la cartella delle immagini) è cambiato: per accorgersene basta guardarne data e peso.
  const D = path.join(dir, 'data');
  const firma = [path.join(dir, 'campagna.json'), ...['board.json', 'sheets.json', 'world.json'].map(f => path.join(D, f)), D, path.join(dir, 'assets')]
    .map(f => { try { const s = fs.statSync(f); return s.mtimeMs + ':' + s.size; } catch { return '-'; } }).join('|');
  const giaVisto = INFO_CACHE.get(dir);
  if (giaVisto && giaVisto.firma === firma) Object.assign(out, giaVisto.dati);
  else {
    calcolaInfo(dir, D, out);
    const { nome, campagna, sistema, scene, schede, immagini, modificata } = out;
    INFO_CACHE.set(dir, { firma, dati: { nome, campagna, sistema, scene, schede, immagini, modificata } });
    if (INFO_CACHE.size > 500) INFO_CACHE.delete(INFO_CACHE.keys().next().value);
    salvaInfoCache();
  }
  out.vecchia = (!IN_APP && dir === path.resolve(ROOT)) || (!!VECCHIA && dir === VECCHIA);
  if (out.vecchia) out.nome = 'La campagna di prima';
  return out;
}
// cartella → { firma, dati } (vedi infoCampagna). Resta anche su disco, così pure la prima apertura dell'elenco è svelta.
const INFO_CACHE_FILE = path.join(USERDIR, 'info-campagne.json');
const INFO_CACHE = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(INFO_CACHE_FILE, 'utf8'));
    if (j && j.v === 1 && Array.isArray(j.voci)) return new Map(j.voci.filter(x => Array.isArray(x) && typeof x[0] === 'string' && x[1] && typeof x[1].firma === 'string' && x[1].dati && typeof x[1].dati === 'object').slice(-500));
  } catch {}
  return new Map();
})();
let infoCacheTimer = 0;
function salvaInfoCache() {
  clearTimeout(infoCacheTimer);
  infoCacheTimer = setTimeout(() => {
    try { fs.mkdirSync(USERDIR, { recursive: true }); fs.writeFileSync(INFO_CACHE_FILE, JSON.stringify({ v: 1, voci: [...INFO_CACHE] })); } catch {}
  }, 1000);
  if (infoCacheTimer.unref) infoCacheTimer.unref();
}
function calcolaInfo(dir, D, out) {
  const meta = leggiJson(path.join(dir, 'campagna.json'));
  if (meta) { out.campagna = true; if (meta.nome) out.nome = String(meta.nome).slice(0, 60); }
  out.sistema = meta && meta.sistema && meta.sistema.id ? { id: String(meta.sistema.id), nome: String(meta.sistema.nome || meta.sistema.id).slice(0, 60) } : null;
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
}

/** Mette in una cartella quello che serve a una campagna, senza toccare quello che c'è già. */
function preparaCartella(dir, nome) {
  // un modulo arrivato da un altro master (importato, o aperto come cartella): file rimessi a posto e chiavi nuove
  try { if (MODULO.completaModulo(dir, { programma: ROOT })) say('Campagna arrivata da un altro master: codice e chiavi nuovi, solo tuoi.', 'ok'); }
  catch (e) { say('Non sono riuscito a finire di importare la campagna: ' + e.message, 'bad'); }
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  // lo sfondo di benvenuto che viene col programma, solo per una campagna appena nata
  // (in una campagna già fatta, magari di un amico, non si aggiunge niente)
  const inglese = prefCorrenti().lingua === 'en' && fs.existsSync(path.join(ROOT, 'assets', 'Sfondi', 'main-en.webp'));
  const base = path.join(ROOT, 'assets', 'Sfondi', inglese ? 'main-en.webp' : 'main.webp'), dest = path.join(dir, 'assets', 'Sfondi', 'main.webp');
  const nuova = !fs.existsSync(path.join(dir, 'data', 'board.json')) && !fs.existsSync(path.join(dir, 'data', 'world.json'));
  if (nuova && fs.existsSync(base) && !fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(base, dest); }
  // lo sfondo vecchio con scritto «MY VTT», mai cambiato: si sostituisce con quello nuovo
  try {
    if (fs.existsSync(base) && fs.statSync(dest).size === 32796 &&
        require('crypto').createHash('sha1').update(fs.readFileSync(dest)).digest('hex') === 'd5bd0bd05d23ec5f31ed4976d9df10c24e29f6b4') fs.copyFileSync(base, dest);
  } catch {}
  const meta = path.join(dir, 'campagna.json');
  if (!fs.existsSync(meta) && path.resolve(dir) !== path.resolve(ROOT)) {
    fs.writeFileSync(meta, JSON.stringify({ nome: nome || path.basename(dir), creata: new Date().toISOString(), programma: 'LIBRE VTT' }, null, 2));
  }
}
// ---------- il sistema di gioco della campagna ----------
// Sta in campagna.json: { sistema: { id, nome } }. I sistemi che vengono col programma sono in
// sistemi/<id>/ (5e 2014 e 5.5 2024); uno personalizzato è una copia dentro la campagna, in
// <campagna>/sistema/, che si può modificare ed esportare. Lo si sceglie una volta, quando la
// campagna nasce (o la prima volta che si apre una campagna di prima).
const SISTEMI = path.join(ROOT, 'sistemi');
function sistemiDisponibili() {
  let nomi = []; try { nomi = fs.readdirSync(SISTEMI); } catch {}
  return nomi.filter(n => n !== 'vuoto').map(n => leggiJson(path.join(SISTEMI, n, 'sistema.json'))).filter(Boolean)
    .map(j => ({ id: j.id, nome: j.nome, edizione: j.edizione || '', licenza: j.licenza || '' }));
}
const SISTEMI_ARRIVATI = path.join(USERDIR, 'sistemi-arrivati');
/** Un sistema caricato da un file (.libresistema o .zip): lo si estrae e si controlla. */
function sistemaDaFile(id) {
  const f = path.join(SISTEMI_ARRIVATI, String(id || '').replace(/[^\w-]/g, '') + '.zip');
  if (!fs.existsSync(f)) throw new Error('Non trovo il file del sistema: caricalo di nuovo.');
  const tmp = path.join(SISTEMI_ARRIVATI, 'x-' + Date.now().toString(36));
  estraiZip(f, tmp);
  let radice = tmp;
  const dentro = fs.readdirSync(tmp).filter(n => !n.startsWith('.'));
  if (!fs.existsSync(path.join(tmp, 'sistema.json')) && dentro.length === 1 && fs.existsSync(path.join(tmp, dentro[0], 'sistema.json'))) radice = path.join(tmp, dentro[0]);
  const j = leggiJson(path.join(radice, 'sistema.json'));
  if (!j || j.formato !== 'libre-vtt-sistema') { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('Questo file non è un sistema di LIBRE VTT (manca sistema.json).'); }
  return { radice, tmp, f };
}
function impostaSistema(dir, scelta, fileId) {
  const metaF = path.join(dir, 'campagna.json'), meta = leggiJson(metaF) || { nome: path.basename(dir), programma: 'LIBRE VTT' };
  scelta = String(scelta || 'dnd5e-2014');
  const dest = path.join(dir, 'sistema');
  const metti = sorgente => {
    if (fs.existsSync(dest)) fs.renameSync(dest, path.join(dir, 'sistema-precedente-' + Date.now().toString(36)));   // mai buttare via un sistema
    fs.cpSync(sorgente, dest, { recursive: true });
    const j = leggiJson(path.join(dest, 'sistema.json')) || {};
    j.id = 'personalizzato';
    fs.writeFileSync(path.join(dest, 'sistema.json'), JSON.stringify(j, null, 2));
    return { id: 'personalizzato', nome: String(j.nome || 'Sistema personalizzato').slice(0, 60) };
  };
  let sis;
  const interno = id => sistemiDisponibili().some(x => x.id === id) || id === 'vuoto';
  if (scelta.startsWith('copia:') && interno(scelta.slice(6))) {
    sis = metti(path.join(SISTEMI, scelta.slice(6)));
    const j = leggiJson(path.join(dest, 'sistema.json')); j.nome = j.nome + ' (personalizzato)'; sis.nome = j.nome;
    fs.writeFileSync(path.join(dest, 'sistema.json'), JSON.stringify(j, null, 2));
  } else if (scelta === 'vuoto') sis = metti(path.join(SISTEMI, 'vuoto'));
  else if (scelta === 'file') {
    const { radice, tmp, f } = sistemaDaFile(fileId);
    try { sis = metti(radice); } finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(f, { force: true }); }
  } else if (interno(scelta)) {
    const j = leggiJson(path.join(SISTEMI, scelta, 'sistema.json'));
    sis = { id: scelta, nome: j.nome };
  } else throw new Error('Sistema sconosciuto: ' + scelta);
  meta.sistema = sis;
  fs.writeFileSync(metaF, JSON.stringify(meta, null, 2));
  say(`Sistema della campagna: ${sis.nome}`, 'ok');
  return sis;
}

function nuovaCampagna(nomeGrezzo) {
  const nome = pulisciNome(nomeGrezzo) || 'Nuova campagna';
  fs.mkdirSync(CAMP_HOME, { recursive: true });
  let dir = path.join(CAMP_HOME, nome), i = 2;
  while (fs.existsSync(dir)) dir = path.join(CAMP_HOME, `${nome} ${i++}`);
  preparaCartella(dir, nome);
  // le impostazioni predefinite per le campagne nuove (salvate dal tavolo): le usa la prima apertura
  try { if (fs.existsSync(PREDEFINITE)) fs.copyFileSync(PREDEFINITE, path.join(dir, 'data', 'predefinite.json')); } catch {}
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
  // tutte quelle nella cartella delle campagne, anche se non sono ancora state aperte (per esempio
  // copiate lì a mano, o con l'app File dell'iPhone); e quelle di quando si chiamava «MY VTT»
  const sotto = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => path.join(d, e.name)); } catch { return []; } };
  for (const d of [...sotto(CAMP_HOME), ...(CAMP_VECCHIE ? sotto(CAMP_VECCHIE) : [])]) {
    if (visti.has(d)) continue;
    visti.add(d);
    const v = infoCampagna(d);
    if (v.campagna) lista.push(v);
  }
  return { home: CAMP_HOME, ultima: conf.recenti[0] || null, lista, icloud: campagneSuICloud() };
}

// ---------- campagne in un file .zip: da dare a un altro master (vedi modulo.js) ----------
// Per una copia di sicurezza di tutto basta copiare (o zippare a mano) la cartella della campagna: l'esportazione
// fa il «modulo», cioè le mappe già pronte per un altro master e il suo gruppo, senza codici, chiavi e giocatori.
/** Mette la campagna in un .zip. Sul computer lo si mostra nella sua cartella, sul telefono lo condivide l'app. */
function esportaCampagna(dir, completa) {
  const info = infoCampagna(dir);
  if (!info.esiste || !info.campagna) return { errore: 'Non trovo questa campagna.' };
  const nome = pulisciNome(info.nome) || 'Campagna';
  const dove = MOBILE ? path.join(USERDIR, 'esportate') : path.join(path.dirname(CAMP_HOME), 'Esportate');
  fs.mkdirSync(dove, { recursive: true });
  // sul telefono le esportazioni vecchie non servono più: le ha già prese chi le doveva prendere
  if (MOBILE) for (const f of fs.readdirSync(dove)) { try { fs.unlinkSync(path.join(dove, f)); } catch {} }
  if (completa) return copiaCompleta(info, nome, dove);
  const file = path.join(dove, nome + '.zip');
  const t0 = Date.now();
  const r = MODULO.esportaModulo(info.path, file, { radice: nome, programma: ROOT });
  const mb = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  const tolti = [];
  if (r.personaggiTolti) tolti.push(`${r.personaggiTolti} personaggi dei giocatori`);
  if (r.segnaliniTolti) tolti.push(`${r.segnaliniTolti} segnalini e disegni dei giocatori`);
  if (r.depositoTolti) tolti.push(`${r.depositoTolti} immagini che non usava più`);
  say(`Campagna «${nome}» esportata per un altro master: ${file} (${mb(r.peso)}, ${r.voci} file, ${((Date.now() - t0) / 1000).toFixed(1)} s)` +
    (tolti.length ? `. Tolti: ${tolti.join(', ')}` : '') + '. Codice, chiavi, giocatori e chat restano qui.', 'ok');
  if (!MOBILE) mostraCartella(dove);
  return { file, nome: path.basename(file), byte: r.peso, personaggiTolti: r.personaggiTolti, segnaliniTolti: r.segnaliniTolti };
}

/** La copia completa (🗂): tutta la cartella così com'è, giocatori, codice e chiavi compresi. È per spostare la
 *  PROPRIA campagna su un altro dispositivo (sul telefono la cartella non la si può zippare a mano); importata,
 *  resta la stessa partita, con lo stesso codice. Solo i manuali importati restano qui. */
function copiaCompleta(info, nome, dove) {
  const file = path.join(dove, nome + ' (copia completa).zip');
  const manuali = require('./manuali-privati.js').manualiNellaCampagna(info.path);
  const salta = rel => rel.split('/').some(p => p.startsWith('.')) || manuali.some(id => rel.startsWith('compendio/' + id + '/'));
  const r = creaZip(info.path, file, { radice: nome, salta, livello: 9 });
  if (manuali.length) say(`Le voci importate dai manuali (${manuali.length} pacchetti) restano su questo dispositivo: non sono nel file.`);
  say(`Copia completa di «${nome}»: ${file} (${r.voci} file). Dentro ci sono anche codice, chiavi e giocatori: non darla ad altri.`, 'ok');
  if (!MOBILE) mostraCartella(dove);
  return { file, nome: path.basename(file), byte: r.peso, completa: true };
}

/**
 * Prende una campagna arrivata da fuori (un .zip o una cartella che l'app ha appena copiato in
 * USERDIR/importa) e la mette tra le campagne, con un nome che non c'è ancora.
 */
function importaCampagna(sorgente, nomeSuggerito) {
  const ARRIVI = path.join(USERDIR, 'importa');
  const src = path.resolve(sorgente || '');
  if (!src.startsWith(ARRIVI + path.sep) || !fs.existsSync(src)) return { errore: 'Non trovo il file da importare.' };
  fs.mkdirSync(CAMP_HOME, { recursive: true });
  const tmp = path.join(CAMP_HOME, '.importo-' + Date.now().toString(36));
  try {
    if (fs.statSync(src).isDirectory()) {
      try { fs.renameSync(src, tmp); } catch { fs.cpSync(src, tmp, { recursive: true }); }   // dischi diversi: si copia
    } else {
      estraiZip(src, tmp);
    }
    // uno zip fatto a mano ha spesso dentro una cartella sola: la campagna è quella
    let radice = tmp;
    const dentro = fs.readdirSync(tmp).filter(n => !n.startsWith('.'));
    if (dentro.length === 1 && fs.statSync(path.join(tmp, dentro[0])).isDirectory() && !infoCampagna(tmp).campagna) radice = path.join(tmp, dentro[0]);
    const info = infoCampagna(radice);
    if (!info.campagna) return { errore: 'Qui dentro non c\'è una campagna di LIBRE VTT (manca la cartella «data»).' };
    const meta = leggiJson(path.join(radice, 'campagna.json')) || {};
    const nome = pulisciNome(meta.nome || (radice !== tmp ? path.basename(radice) : String(nomeSuggerito).replace(/\.zip$/i, ''))) || 'Campagna importata';
    let dest = path.join(CAMP_HOME, nome), i = 2;
    while (fs.existsSync(dest)) dest = path.join(CAMP_HOME, `${nome} ${i++}`);
    fs.renameSync(radice, dest);
    preparaCartella(dest, nome);
    ricorda(dest);
    say(`Campagna «${nome}» importata in ${dest}`, 'ok');
    return { path: dest };
  } catch (e) {
    return { errore: e.message };
  } finally {
    for (const p of [tmp, src]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
  }
}

/** La finestra del sistema per scegliere una cartella. Dove non c'è, si usa quella fatta da noi. */
async function scegliCartella(titolo) {
  if (MOBILE) return { nonSupportato: true };
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
  add('Campagne', CAMP_HOME);
  if (!MOBILE) {
    add('Documenti', cartellaDocumenti()); add('Scrivania', path.join(os.homedir(), 'Desktop'));
    add('Download', path.join(os.homedir(), 'Downloads')); add('Casa', os.homedir());
    if (WIN) for (const l of 'CDEFGHIJ') add(l + ':', l + ':\\');
    else if (MAC) add('Dischi', '/Volumes'); else add('Dischi', '/media/' + (os.userInfo().username || ''));
  }
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
  if (MOBILE) return;                                          // sul telefono si esporta (vedi /api/campagna/esporta)
  const cmd = WIN ? 'explorer' : MAC ? 'open' : 'xdg-open';
  try { const p = spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }); p.on('error', () => {}); p.unref(); } catch {}
}

// ---------- i tre modi ----------
// ---------- iCloud (Mac) ----------
// Con «Ottimizza spazio» macOS può togliere dal Mac i file di Documenti e lasciarli «solo su iCloud»:
// il file c'è, ma vuoto finché non lo si riscarica. Prima di aprire la partita si riscaricano le
// immagini della campagna (leggerle basta a farle scaricare), così non risultano rotte al tavolo.
// Un file tolto dal Mac da iCloud è «senza dati» (c'è ma occupa 0 blocchi) oppure, sui macOS più
// vecchi, è sparito e al suo posto c'è un segnaposto nascosto «.nome.icloud».
const stubICloud = f => path.join(path.dirname(f), '.' + path.basename(f) + '.icloud');
const suICloud = f => {
  if (!MAC) return false;
  try { const st = fs.statSync(f); return st.size > 0 && st.blocks === 0; } catch { return fs.existsSync(stubICloud(f)); }
};
function immaginiCampagna(dir) {
  const out = [];
  const giro = (d, prof) => {
    let voci = []; try { voci = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const v of voci) {
      const f = path.join(d, v.name);
      if (v.isDirectory() && prof < 3) giro(f, prof + 1);
      else if (v.isFile() && /\.(webp|png|jpe?g|gif|svg|bmp|avif|mp4|webm)$/i.test(v.name) || v.isFile() && /^[a-f0-9]{64}\.\w+$/.test(v.name)) out.push(f);
      else if (v.isFile() && /^\..+\.icloud$/.test(v.name)) out.push(path.join(d, v.name.slice(1, -7)));   // segnaposto di iCloud
    }
  };
  giro(path.join(dir, 'assets'), 0); giro(path.join(dir, 'data', 'assets'), 0);
  return out;
}
async function scaricaDaICloud(dir) {
  if (!MAC) return;
  const lontani = immaginiCampagna(dir).filter(suICloud);
  if (!lontani.length) return;
  say(`${lontani.length} immagini della campagna sono solo su iCloud: le riscarico sul Mac (in Finder, clic destro sulla cartella → «Mantieni scaricato» per non farle più togliere).`, 'warn');
  let n = 0;
  for (const f of lontani) {
    state.busy = `Sto scaricando le immagini da iCloud… (${++n} di ${lontani.length})`; push();
    if (fs.existsSync(f)) await new Promise(ok => { const t = setTimeout(ok, 30000); fs.readFile(f, () => { clearTimeout(t); ok(); }); });
    else {                                              // c'è solo il segnaposto: lo si chiede a iCloud e si aspetta
      execFile('brctl', ['download', f], () => {});
      for (let i = 0; i < 60 && !fs.existsSync(f); i++) await new Promise(ok => setTimeout(ok, 500));
    }
  }
  const ancora = lontani.filter(suICloud).length;
  if (ancora) say(`${ancora} immagini non si sono scaricate da iCloud (sei senza internet?): al tavolo risulteranno mancanti.`, 'warn');
  state.busy = 'Accendo…'; push();
}
// la cartella delle campagne è dentro Documenti sincronizzati con iCloud?
function campagneSuICloud() {
  if (!MAC) return false;
  const docICloud = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Documents');
  return CAMP_HOME.includes('Mobile Documents') || (fs.existsSync(docICloud) && CAMP_HOME.startsWith(path.join(os.homedir(), 'Documents')));
}

async function avvia(mode, id, campagna, opz = {}) {
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
    await scaricaDaICloud(CAMP);
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
  state.porte = { web: WEB_PORT, game: GAME_PORT, link: LINK_PORT };

  run('tavolo', NODE, [path.join('server', 'server.js')], { env: { PORT: String(WEB_PORT), CAMPAIGN_DIR: CAMP, LIBRE_PREDEFINITE: PREDEFINITE, LIBRE_CAMP_HOME: CAMP_HOME, LIBRE_SEGRETO: SEGRETO, LIBRE_PLUGINS_DIR: PLUGINS_DIR, LIBRE_PLUGINS_STATE: PLUGINS_STATE, LIBRE_MANUALI: MANUALI_DIR, ...(MOBILE ? {} : { LIBRE_RICEVUTI_PIENI: '1' }) }, keep: true });
  if (!await aspettaPorta(WEB_PORT)) return fallisci('Il tavolo non si è acceso.');

  if (mode !== 'solo') {
    const extra = {};
    if (mode === 'host') {
      // la chiave della campagna: con lei il codice resta lo stesso a ogni apertura
      try { const inv = invitoCampagna(CAMP); state.parola = inv.parola; fs.writeFileSync(LINK_CHIAVE_FILE, inv.chiave, { mode: 0o600 }); try { fs.chmodSync(LINK_CHIAVE_FILE, 0o600); } catch {} } catch (e) { say('Il codice d\'invito non si potrà tenere fisso: ' + e.message, 'warn'); }
      extra.CAMPAGNA_NOME = state.campagna ? state.campagna.nome : '';
      // la partita pubblica (relay): la chiave serve per farsi riconoscere, l'indirizzo solo se è accesa
      extra.LIBRE_RELAY_CHIAVE = LINK_CHIAVE_FILE;
      // i plugin che il master condivide con i giocatori: il server di gioco li offre a chi entra
      extra.LIBRE_PLUGINS_DIR = PLUGINS_DIR; extra.LIBRE_PLUGINS_STATE = PLUGINS_STATE; extra.LIBRE_VERSIONE = VERSIONE;
      if (relayConf().attiva) {
        const url = await indirizzoRelay();
        if (url) extra.LIBRE_RELAY = url;
        else say('Partita pubblica: non trovo l\'indirizzo del relay, i giocatori del sito per ora non possono entrare.', 'warn');
      }
    } else {
      try { fs.unlinkSync(LINK_CHIAVE_FILE); } catch {}
      // il codice intero è ID (64 cifre) + parola d'invito (32): al collegamento va solo l'ID, la parola la presenta
      // il server di gioco all'host. Chi è già entrato una volta non ne ha più bisogno (ma la si tiene, finché serve).
      const intero = /^([a-f0-9]{64})([a-f0-9]{32})?$/.exec(String(id || '').trim().toLowerCase());
      if (intero) id = intero[1];
      state.joinCodice = intero ? id : null;
      if (intero && intero[2]) ricordaUnita(id, { parola: intero[2] });
      const parola = intero && (intero[2] || (unite()[id] || {}).parola);
      if (parola && /^[a-f0-9]{32}$/.test(parola)) extra.LIBRE_JOIN_PAROLA = parola;
      const e = state.joinCodice && unite()[state.joinCodice];
      if (e && e.idGiocatore) extra.IDENTITA = JSON.stringify({ token: e.idGiocatore, firma: e.firma || null });
      // il nome che hai in questa campagna (ognuna ha il suo): ci si presenta con quello
      if (e && e.nomeGiocatore) extra.LIBRE_NOME_CAMPAGNA = String(e.nomeGiocatore).slice(0, 40);
      if (state.joinCodice) ricordaUnita(state.joinCodice, {});
      // la chiave del master di un server dedicato: va al server una volta, entrando (non la si salva)
      const chiave = String(opz.chiaveMaster || '').replace(/[\s-]/g, '').toLowerCase();
      if (/^[a-f0-9]{32}$/.test(chiave)) extra.CHIAVE_MASTER = chiave;
      // il collegamento tra app può passare dal relay (al posto di iroh, o se iroh non riesce): vedi «Impostazioni avanzate»
      const via = relayConf().appVia;
      if (via !== 'iroh' && state.joinCodice) {
        const url = await indirizzoRelay();
        if (url) { extra.LIBRE_JOIN_RELAY = url; extra.LIBRE_JOIN_VIA = via; extra.LIBRE_JOIN_CODICE = state.joinCodice; state.viaRelay = via; }
        else say('Collegamento tramite relay: non trovo l\'indirizzo del relay. Uso il collegamento diretto (iroh).', 'warn');
      }
    }
    if (idUtente()) extra.LIBRE_ID_UTENTE = idUtente();
    run('regole', NODE, [path.join('server', 'game-server.js'), mode === 'host' ? 'host' : 'join'],
      { env: { PORT: String(GAME_PORT), LINK_PORT: String(LINK_PORT), DATA_DIR: path.join(CAMP, 'data'), LINK_ID_FILE, LIBRE_CANALE: CANALE_REGOLE, LIBRE_SEGRETO: SEGRETO, ...extra }, keep: true });
    if (!await aspettaPorta(GAME_PORT)) return fallisci('Il server di gioco non si è acceso.');

    const soloRelay = mode === 'join' && extra.LIBRE_JOIN_VIA === 'relay';     // niente uffa-link: tutto passa dal relay
    if (!soloRelay && (MOBILE ? !LINK_CTRL : !linkBin())) return fallisci(MOBILE ? 'Il collegamento a distanza dell\'app non è partito: chiudi l\'app e riaprila.' : 'Manca il collegamento a distanza: premi «Prepara» e riprova.');
    // uffa-link scrive l'ID nella sua cartella di lavoro: la nostra, dove si può scrivere
    const reteLink = { UFFA_LINK_RETE: relayConf().irohRete };
    if (mode === 'host') run('sessione', LINK, ['host', '--port', String(LINK_PORT)], { keep: true, cwd: USERDIR, env: reteLink });
    else if (!soloRelay) run('sessione', LINK, ['join', id, '--port', String(LINK_PORT)], { keep: true, cwd: USERDIR, env: reteLink });
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
let ultimoErroreRete = '';                 // perché l'ultimo scaricamento non è riuscito (per il registro)
function scarica(url, dest, etichetta) {
  return new Promise(resolve => {
    let finito = false;
    const fine = v => { if (!finito) { finito = true; resolve(v); } };
    const req = (url.startsWith('http:') ? http : https).get(url, { headers: { 'User-Agent': 'LIBRE-VTT' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        const dopo = new URL(r.headers.location, url);
        // da https non si scende mai a http (lì chiunque sulla rete potrebbe cambiare il file)
        if (url.startsWith('https:') && dopo.protocol !== 'https:') { ultimoErroreRete = 'rimando non sicuro verso ' + dopo.protocol; return fine(false); }
        return fine(scarica(dopo.href, dest, etichetta));
      }
      if (r.statusCode !== 200) { ultimoErroreRete = `HTTP ${r.statusCode} da ${new URL(url).host}`; r.resume(); return fine(false); }
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
    req.on('error', e => { ultimoErroreRete = `${e.code || ''} ${e.message || e}`.trim(); fine(false); });
    req.setTimeout(60000, () => req.destroy());
  });
}
const sha256File = f => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});
async function scaricaTesto(url) {
  const t = path.join(os.tmpdir(), `libre-vtt-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try { return await scarica(url, t) ? fs.readFileSync(t, 'utf8') : null; } finally { try { fs.unlinkSync(t); } catch {} }
}
const primaImpronta = t => { const m = String(t || '').match(/\b[a-f0-9]{64}\b/i); return m ? m[0].toLowerCase() : null; };
class Ferma extends Error {}
const ferma = msg => { throw new Ferma(msg); };

// --- 2. già pronto da GitHub ---
function rilascio() {
  const r = leggiJson(path.join(ROOT, 'rilascio.json')) || {};
  const repo = String(amb('REPO') || r.repo || '').trim();
  const base = amb('RILASCIO_BASE') || r.base;
  if (base) return String(base).replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://github.com/${repo}/releases/${r.tag ? 'download/' + r.tag : 'latest/download'}`;
}
async function scaricaPronto() {
  const base = rilascio();
  if (!base) return false;
  say(`Cerco il collegamento già pronto per questo computer (${PIATTAFORMA})…`);
  state.busy = 'Cerco il collegamento già pronto…'; push();
  let LINK_ASSET = null, atteso = null;
  for (const nome of LINK_ASSETS) {
    atteso = primaImpronta(await scaricaTesto(`${base}/${nome}.sha256`));
    if (atteso) { LINK_ASSET = nome; break; }
  }
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

// ---------- aggiornamenti ----------
// All'apertura si guarda su GitHub se c'è una versione più nuova (al massimo ogni 6 ore).
// Sul computer si scarica l'installatore giusto e lo si avvia. Nelle app per telefoni e tablet
// (Android, iPhone, iPad) niente: gli aggiornamenti li dà lo store.
const VERSIONE = String((leggiJson(path.join(ROOT, 'package.json')) || {}).version || '');

// ---------- Plugins (the ⚙ in the home) ----------
// The folder sits next to «Campagne» (Documents › LIBRE VTT › Plugins).
// Phone and tablet apps (store rules: no code downloaded or imported after review) only list the
// plugins shipped inside the app, in plugins-inclusi/ (empty for now): they can be switched on and
// off, but nothing can be imported, created or copied in.
const PLUGINS_DIR = MOBILE ? path.join(ROOT, 'plugins-inclusi') : path.join(path.dirname(CAMP_HOME), 'Plugins');
const PLUGINS_STATE = path.join(USERDIR, 'plugins.json');
const PLUGIN_EXAMPLES = path.join(ROOT, 'examples', 'plugins');
const PLUGINS = require('./plugins').createPlugins({ dir: PLUGINS_DIR, stateFile: PLUGINS_STATE, appVersion: VERSIONE });
function pluginExamples() {
  if (MOBILE) return [];
  try { return fs.readdirSync(PLUGIN_EXAMPLES, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(PLUGIN_EXAMPLES, e.name, 'plugin.json'))).map(e => e.name); } catch { return []; }
}
function pluginsInfo() {
  return { dir: PLUGINS_DIR, mobile: !!MOBILE, plugins: PLUGINS.list(), examples: pluginExamples() };
}
function repoGitHub() {
  const r = leggiJson(path.join(ROOT, 'rilascio.json')) || {};
  const repo = String(amb('REPO') || r.repo || 'EDG-coder/Libre-VTT').trim();
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}
/** >0 se a è più nuova di b ("3.1.0" contro "3.0.9") */
function confrontaVersioni(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/), pb = String(b).replace(/^v/, '').split(/[.-]/);
  for (let i = 0; i < 3; i++) { const d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0); if (d) return d; }
  return 0;
}
/** Il processore vero del computer: un Node per Intel che gira con Rosetta (Mac) o in emulazione
 *  (Windows ARM) dice «x64», ma l'aggiornamento giusto è quello nativo. */
let archVera = null;
function processoreVero() {
  if (archVera) return archVera;
  archVera = process.arch;
  try {
    if (MAC && archVera === 'x64') {
      if (String(require('child_process').execFileSync('sysctl', ['-in', 'sysctl.proc_translated'], { encoding: 'utf8', timeout: 3000 })).trim() === '1') archVera = 'arm64';
    } else if (WIN && archVera === 'x64') {
      if (/ARM64/i.test(process.env.PROCESSOR_ARCHITEW6432 || '') || /ARM/i.test(process.env.PROCESSOR_IDENTIFIER || '')) archVera = 'arm64';
    }
  } catch {}
  return archVera;
}
function fileAggiornamento(assets) {
  // dopo la 3.8.2 c'è anche un file per processore, più leggero; quelli di sempre (con dentro tutti
  // i processori) restano, e servono anche alle versioni di prima per aggiornarsi
  const cpu = MOBILE ? process.arch : processoreVero();
  const nomi = MOBILE === 'android' ? (process.arch === 'arm64' ? ['LIBRE-VTT-Android-arm64.apk', 'LIBRE-VTT-Android.apk'] : ['LIBRE-VTT-Android.apk'])
    : MOBILE === 'ios' ? []
    : WIN ? [cpu === 'arm64' ? 'LIBRE-VTT-Setup-ARM64.exe' : 'LIBRE-VTT-Setup-x64.exe', 'LIBRE-VTT-Setup.exe', 'Installa-LIBRE-VTT-Windows.cmd']
    : MAC ? [cpu === 'arm64' ? 'LIBRE-VTT-Mac-AppleSilicon.dmg' : 'LIBRE-VTT-Mac-Intel.dmg', 'LIBRE-VTT.dmg']
    : [`Installa-LIBRE-VTT-Linux-${cpu}.sh`, 'Installa-LIBRE-VTT-Linux.sh'];
  for (const n of nomi) {
    const a = assets.find(x => x && x.name === n);
    // SHA256SUMS.txt: le impronte di tutti i file della release (dalla 3.7.9): il file scaricato deve tornare
    const somme = assets.find(x => x && x.name === 'SHA256SUMS.txt');
    if (a && a.browser_download_url) return { nome: a.name, url: a.browser_download_url, byte: a.size || 0, somme: somme ? somme.browser_download_url : null };
  }
  return null;
}
/** Le righe «- …» della sezione «## Novità» delle note della release, senza il markdown. */
function novitaDa(testo) {
  const righe = String(testo || '').split(/\r?\n/);
  const da = righe.findIndex(r => /^##\s+Novit/i.test(r));
  if (da < 0) return [];
  const out = [];
  for (const r of righe.slice(da + 1)) {
    if (/^#{2,}\s/.test(r)) break;      // anche «### Dalla 3.7.0»: quelle righe le dà la release della 3.7.0
    const m = r.match(/^\s*[-*]\s+(.*)$/);
    if (m) out.push(m[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim().slice(0, 600));
    if (out.length >= 15) break;
  }
  return out;
}
/** Dalle release di GitHub quelle più nuove di «attuale» (niente bozze né anteprime), dalla più
 *  recente: { ultima: la release da scaricare, versioni: [{ versione, novita }], forseAltre }. */
function versioniNuove(lista, attuale) {
  if (!Array.isArray(lista)) return null;
  const buone = lista.filter(j => j && j.tag_name && !j.draft && !j.prerelease)
    .map(j => ({ j, v: String(j.tag_name).replace(/^v/, '') }))
    .sort((a, b) => confrontaVersioni(b.v, a.v));
  if (!buone.length) return null;
  const nuove = buone.filter(x => confrontaVersioni(x.v, attuale) > 0);
  return {
    ultima: buone[0].j,
    versioni: nuove.map(x => ({ versione: x.v, novita: novitaDa(x.j.body), pagina: x.j.html_url || null })),
    // 30 release lette e tutte più nuove: ce ne possono essere altre più vecchie che non abbiamo visto
    forseAltre: lista.length >= 30 && nuove.length === buone.length
  };
}
let ultimoControllo = null;
async function controllaAggiornamento(forza) {
  // nelle app per telefoni e tablet niente controllo su GitHub: gli aggiornamenti arrivano dallo store
  if (MOBILE || amb('NO_AGGIORNAMENTI')) return { attuale: VERSIONE, nuova: null, mobile: MOBILE };
  // si ricorda per poco «non c'è niente di nuovo» (una versione può uscire mentre l'app è aperta)
  if (!forza && ultimoControllo && Date.now() - ultimoControllo.quando < (ultimoControllo.dati.nuova ? 6 * 3600e3 : 10 * 60e3)) return ultimoControllo.dati;
  const repo = repoGitHub();
  if (!VERSIONE || !repo) return { attuale: VERSIONE, nuova: null };
  // le ultime 30 release, per mostrare le novità di tutte quelle uscite dopo la propria
  let lista = null;
  try { lista = JSON.parse(await scaricaTesto(amb('API_RILASCI') || `https://api.github.com/repos/${repo}/releases?per_page=30`) || 'null'); } catch {}
  if (lista && !Array.isArray(lista)) lista = [lista];
  const nuove = versioniNuove(lista, VERSIONE);
  if (!nuove) {
    const motivo = ultimoErroreRete || 'risposta non valida';
    say(`Controllo degli aggiornamenti: GitHub non risponde (${motivo}).`, 'warn');
    return { attuale: VERSIONE, nuova: null, offline: true, motivo };
  }
  const j = nuove.ultima;
  const dati = {
    attuale: VERSIONE, nuova: nuove.versioni.length ? nuove.versioni[0].versione : null,
    pagina: j ? j.html_url || `https://github.com/${repo}/releases/latest` : `https://github.com/${repo}/releases/latest`,
    tutte: `https://github.com/${repo}/releases`,
    file: j ? fileAggiornamento(Array.isArray(j.assets) ? j.assets : []) : null, mobile: MOBILE,
    novita: j ? novitaDa(j.body) : [],
    versioni: nuove.versioni, forseAltre: nuove.forseAltre
  };
  ultimoControllo = { quando: Date.now(), dati };
  if (dati.nuova) say(`C'è una versione nuova di LIBRE VTT: ${dati.nuova} (questa è la ${VERSIONE}).`, 'ok');
  return dati;
}
/** Dopo un aggiornamento: toglie l'installatore che aveva scaricato l'app (e su Mac smonta il .dmg).
 *  Solo quel file, riconosciuto dal percorso salvato: niente altro in Download. Se la versione in
 *  uso è ancora più vecchia l'aggiornamento non è riuscito, e il file resta. */
function pulisciAggiornamento() {
  const x = conf.aggiornamentoScaricato;
  if (!x || MOBILE) return;
  if (!x.file || typeof x.file !== 'string' || !x.versione) { delete conf.aggiornamentoScaricato; return salvaConf(); }
  if (confrontaVersioni(VERSIONE, x.versione) < 0) {
    say(`L'aggiornamento alla ${x.versione} non sembra riuscito (questa è ancora la ${VERSIONE}): l'installatore è in ${x.file}.`, 'warn');
    state.aggiornamentoFallito = { versione: x.versione, file: x.file };
    return;
  }
  const togli = () => {
    let resta = false;   // l'installatore può essere ancora aperto (Windows): si riprova la volta dopo
    for (const f of [x.file, x.file + '.part']) {
      try { fs.unlinkSync(f); say('Tolto l\'installatore dell\'aggiornamento: ' + f, 'ok'); }
      catch (e) { if (e.code !== 'ENOENT') resta = true; }
    }
    if (!resta) { delete conf.aggiornamentoScaricato; salvaConf(); }
  };
  if (!MAC) return togli();
  // il disco montato da quel .dmg (non quello da cui gira l'app, se è partita dal disco)
  execFile('hdiutil', ['info'], { encoding: 'utf8', timeout: 10000 }, (e, out) => {
    const dischi = [];
    for (const blocco of String(out || '').split(/^=+$/m)) {
      const img = (blocco.match(/^image-path\s*:\s*(.+)$/m) || [])[1];
      const dev = (blocco.match(/^(\/dev\/disk\d+)\b/m) || [])[1];
      const vol = (blocco.match(/\t(\/Volumes\/.+)$/m) || [])[1];
      if (img && dev && path.resolve(img.trim()) === path.resolve(x.file) && !(vol && ROOT.startsWith(vol.trim()))) dischi.push(dev);
    }
    if (!dischi.length) return togli();
    let restano = dischi.length;
    for (const d of dischi) execFile('hdiutil', ['detach', d], { timeout: 20000 }, err => {
      if (err) say('Non riesco a smontare il disco dell\'aggiornamento (' + d + '): ' + err.message, 'warn');
      if (!--restano) togli();
    });
  });
}
let aggiornando = false;
async function installaAggiornamento() {
  if (aggiornando) return { errore: 'Sto già scaricando l\'aggiornamento.' };
  const a = await controllaAggiornamento(true);
  if (a.offline) return { errore: 'Non riesco a raggiungere GitHub: controlla la connessione.' };
  if (!a.nuova) return { errore: 'Hai già l\'ultima versione.' };
  if (MOBILE === 'ios' || !a.file) return { pagina: a.pagina };
  aggiornando = true;
  try {
    const scaricati = path.join(os.homedir(), 'Downloads');
    const dir = MOBILE ? path.join(USERDIR, 'aggiornamenti') : fs.existsSync(scaricati) ? scaricati : os.tmpdir();
    fs.mkdirSync(dir, { recursive: true });
    if (MOBILE) for (const f of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    const dest = path.join(dir, a.file.nome), tmp = dest + '.part';
    say(`Scarico LIBRE VTT ${a.nuova} (${a.file.nome})…`);
    state.busy = `Scarico LIBRE VTT ${a.nuova}…`; push();
    const fatto = await scarica(a.file.url, tmp, `Scarico LIBRE VTT ${a.nuova}`);
    if (!fatto || (a.file.byte && fs.statSync(tmp).size !== a.file.byte)) {
      try { fs.unlinkSync(tmp); } catch {}
      return { errore: 'Lo scaricamento non è andato a buon fine: riprova.' };
    }
    if (a.file.somme) {
      const testo = await scaricaTesto(a.file.somme);
      const riga = String(testo || '').split(/\r?\n/).find(r => r.trim().endsWith(' ' + a.file.nome) || r.trim().endsWith('*' + a.file.nome));
      const atteso = primaImpronta(riga);
      if (!atteso || atteso !== await sha256File(tmp)) {
        try { fs.unlinkSync(tmp); } catch {}
        say('Il file dell\'aggiornamento non corrisponde all\'impronta pubblicata: non lo apro.', 'bad');
        return { errore: 'Il file scaricato non corrisponde a quello pubblicato: riprova più tardi.' };
      }
    }
    try { fs.unlinkSync(dest); } catch {}
    fs.renameSync(tmp, dest);
    say(`Scaricato: ${dest}`, 'ok');
    if (MOBILE === 'android') return { apk: dest };
    // sul computer si avvia l'installatore; LIBRE VTT si chiude, così i suoi file si possono sostituire
    if (!WIN) fs.chmodSync(dest, 0o755);
    // si ricorda che cosa ha scaricato: alla prossima partenza, se l'aggiornamento è andato, lo toglie
    conf.aggiornamentoScaricato = { file: dest, versione: a.nuova }; salvaConf();
    const [cmd, args] = WIN ? (dest.endsWith('.cmd') ? ['cmd', ['/c', 'start', '', dest]] : [dest, []])
      : MAC ? ['open', [dest]] : ['bash', [dest]];
    const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, cwd: dir });
    p.on('error', e => say('Non riesco ad avviare l\'installatore: ' + e.message, 'bad'));
    p.unref();
    say('Installatore avviato: chiudo LIBRE VTT.', 'ok');
    setTimeout(() => { stopAll(); process.exit(0); }, MAC ? 4000 : 2500);
    return { avviato: true, file: dest };
  } finally {
    aggiornando = false;
    state.busy = null; push();
  }
}

// --- 3. costruito qui, con strumenti privati ---
// il processore come lo chiamano Rust e Zig (RISC-V: «riscv64gc» per Rust, «riscv64» per Zig)
const ARCH_CPU = process.arch === 'arm64' ? 'aarch64' : process.arch === 'riscv64' ? 'riscv64gc' : 'x86_64';
const ZIG_CPU = ARCH_CPU === 'riscv64gc' ? 'riscv64' : ARCH_CPU;
async function rustPrivato() {
  if (cargoPath()) return cargoPath();
  // il programma di installazione di Rust (su Windows sempre quello x64: gira anche sui PC ARM)
  const triple = WIN ? 'x86_64-pc-windows-msvc' : MAC ? `${ARCH_CPU}-apple-darwin` : `${ARCH_CPU}-unknown-linux-gnu`;
  const url = `${amb('RUST_DIST') || 'https://static.rust-lang.org/rustup/dist'}/${triple}/rustup-init${EXE}`;
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
  let idx = null; try { idx = JSON.parse(await scaricaTesto(amb('ZIG_INDEX') || 'https://ziglang.org/download/index.json') || 'null'); } catch {}
  const chiave = `${WIN ? 'x86_64' : ZIG_CPU}-${WIN ? 'windows' : MAC ? 'macos' : 'linux'}`;   // su Windows tutto gira come x64 (anche sui PC ARM)
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
  const js = path.join(__dirname, 'zigwrap.js');
  // glibc 2.17 per girare anche su distribuzioni vecchie; RISC-V c'è solo dalla 2.27
  const target = WIN ? 'x86_64-windows-gnu' : ZIG_CPU === 'riscv64' ? 'riscv64-linux-gnu.2.27' : `${ZIG_CPU}-linux-gnu.2.17`;
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
  if (MOBILE) { say('Il collegamento a distanza è già dentro l\'app.', 'ok'); return; }
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
// Su Mac i browser possono stare anche in ~/Applications, o altrove: lì li trova Spotlight (mdfind).
const BROWSER_MAC = [
  ['Google Chrome', 'com.google.Chrome'], ['Microsoft Edge', 'com.microsoft.edgemac'],
  ['Brave Browser', 'com.brave.Browser'], ['Chromium', 'org.chromium.Chromium'],
  ['Vivaldi', 'com.vivaldi.Vivaldi'], ['Google Chrome Canary', 'com.google.Chrome.canary']
];
let browserMacTrovati = null;
function browserMac() {
  if (browserMacTrovati) return browserMacTrovati;
  const out = [];
  for (const [nome, id] of BROWSER_MAC) {
    for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) out.push(path.join(dir, nome + '.app', 'Contents', 'MacOS', nome));
    try {
      const trovate = require('child_process').execFileSync('mdfind', [`kMDItemCFBundleIdentifier == '${id}'`], { encoding: 'utf8', timeout: 3000 })
        .split(/\r?\n/).map(r => r.trim()).filter(r => r.endsWith('.app') && !r.startsWith('/Volumes/'));
      for (const app of trovate) out.push(path.join(app, 'Contents', 'MacOS', nome));
    } catch {}
  }
  return (browserMacTrovati = out);
}
function trovaBrowser() {
  const prove = WIN ? [
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
  ] : MAC ? browserMac() : [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/snap/bin/chromium'
  ];
  return prove.find(p => p && fs.existsSync(p)) || null;
}
// ---------- il browser della finestra non è il browser di tutti i giorni ----------
// La finestra usa un browser con un profilo suo. Se è lo stesso browser che si usa per navigare
// (per esempio Brave), su Mac le due copie hanno la stessa icona: una pagina nuova (⌘N, il Dock, un
// link da un'altra app) poteva finire nella copia di LIBRE VTT, con il profilo vuoto, e ⌘Q lì chiudeva
// anche il tavolo. Due rimedi: una piccola estensione nel nostro profilo manda quelle pagine al browser
// vero (vedi /api/fuori), e su Mac ⌘Q va tenuto premuto, come l'opzione «Avvisa prima di uscire».
const ESTENSIONE = path.join(USERDIR, 'finestra-estensione');
function preparaEstensione() {
  try {
    const src = path.join(__dirname, 'finestra-estensione');
    fs.mkdirSync(ESTENSIONE, { recursive: true });
    fs.copyFileSync(path.join(src, 'manifest.json'), path.join(ESTENSIONE, 'manifest.json'));
    const js = fs.readFileSync(path.join(src, 'sfondo.js'), 'utf8').replace('__PORTA__', String(+UI_PORT));
    fs.writeFileSync(path.join(ESTENSIONE, 'sfondo.js'), js);
    return ['--load-extension=' + ESTENSIONE, '--disable-features=DisableLoadExtensionCommandLineSwitch'];
  } catch (e) { say('Non riesco a preparare l\'estensione della finestra: ' + e.message, 'warn'); return []; }
}
function avvisaPrimaDiUscire() {
  if (!MAC) return;
  const f = path.join(PROFILE, 'Local State');
  try {
    let st = {};
    if (fs.existsSync(f)) st = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!st || typeof st !== 'object') return;
    st.browser = st.browser && typeof st.browser === 'object' ? st.browser : {};
    if (st.browser.confirm_to_quit === true) return;
    st.browser.confirm_to_quit = true;
    fs.mkdirSync(PROFILE, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(st));
  } catch {}                                  // file illeggibile: lo lascio com'è, il browser lo sistema da sé
}
// Il browser predefinito del Mac (quello che apre i link), letto dalle impostazioni di LaunchServices.
function browserPredefinitoMac() {
  try {
    const f = path.join(os.homedir(), 'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist');
    const j = JSON.parse(require('child_process').execFileSync('plutil', ['-convert', 'json', '-o', '-', f], { encoding: 'utf8', timeout: 3000 }));
    const h = (j.LSHandlers || []).find(x => x.LSHandlerURLScheme === 'https') || (j.LSHandlers || []).find(x => x.LSHandlerURLScheme === 'http');
    return h && h.LSHandlerRoleAll ? String(h.LSHandlerRoleAll).toLowerCase() : null;
  } catch { return null; }
}
const idBrowserMac = b => { const r = BROWSER_MAC.find(([nome]) => path.basename(b) === nome); return r ? r[1].toLowerCase() : null; };
// Apre una pagina (o, senza indirizzo, una finestra nuova) nel browser di tutti i giorni.
function apriFuori(url) {
  const b = trovaBrowser();
  const lancia = (cmd, args) => { try { const q = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }); q.on('error', () => {}); q.unref(); } catch {} };
  if (MAC) {
    const pred = browserPredefinitoMac(), nostro = b && idBrowserMac(b);
    // Se il predefinito è un altro browser ci pensa macOS. Se è lo stesso della finestra, «open» potrebbe
    // ridarla alla nostra copia: si avvia il programma senza il nostro profilo, così va al profilo vero
    // (se quel browser è già aperto gli passa la pagina e si chiude da solo).
    if (pred && pred !== nostro) return lancia('open', url ? [url] : ['-b', pred]);
    if (b) return lancia(b, url ? [url] : []);
    if (url) lancia('open', [url]);
    return;
  }
  // su Windows niente «cmd /c start»: per cmd «&», «|» e «^» dentro l'indirizzo sono comandi
  if (url) return WIN ? lancia('rundll32', ['url.dll,FileProtocolHandler', url]) : lancia('xdg-open', [url]);
  if (b) lancia(b, []);
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
    say(`Chrome (o Edge, Brave, Chromium) non trovato: ho aperto ${url} nel browser normale con «${cmd}».`, 'warn');
    sorvegliaSenzaFinestra();
    return null;
  }
  const args = [
    '--app=' + url,
    '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900',
    ...argScala(),
    ...preparaEstensione()
  ];
  avvisaPrimaDiUscire();
  say(`Apro la finestra con ${b} ${args.join(' ')}`);
  const partita = Date.now();
  const p = spawn(b, args, { detached: false, stdio: 'ignore' });
  finestraProc = p;
  p.on('error', e => say('Non riesco ad avviare il browser della finestra: ' + e.message, 'warn'));
  p.on('exit', codice => {
    if (p !== finestraProc) return;           // sostituita da una finestra nuova (vedi /api/mostra)
    // Uscito subito: il browser con quel profilo era già aperto (per esempio un LIBRE VTT di prima,
    // appena aggiornato) e gli ha passato la finestra. Spegnere qui lasciava la finestra vuota:
    // si resta accesi finché la pagina dà segni di vita, come col browser normale.
    if (Date.now() - partita < 8000 && !finestraVista) {
      say(`Il browser è uscito subito (codice ${codice}): la finestra l'ha aperta un'altra sua copia. Resto acceso finché la pagina è aperta.`, 'warn');
      return sorvegliaSenzaFinestra();
    }
    say('Finestra chiusa: spengo.'); stopAll(); setTimeout(() => process.exit(0), 300);
  });
  // se dopo un po' la pagina non si è fatta viva, il registro lo dice (con il browser usato)
  setTimeout(() => { if (!finestraVista) say(`La finestra non ha ancora caricato la pagina (${url}, browser ${path.basename(b)}). Se resta vuota, aprila a mano in un browser.`, 'warn'); }, 20000).unref();
  return p;
}

// Il pannello della sessione in una finestra «da app» (--app: niente schede né barra degli indirizzi), nello
// stesso browser e profilo della finestra di LIBRE VTT. Se è già aperto, il browser ne apre un'altra: poco male.
// Senza Chrome (o sul telefono) lo apre la pagina, come prima.
let ultimoPannello = 0;
function apriPannello(url) {
  if (MOBILE) return { ok: false };
  const b = trovaBrowser();
  if (!b) return { ok: false };
  if (Date.now() - ultimoPannello < 1500) return { ok: true };   // doppio clic: una finestra sola
  ultimoPannello = Date.now();
  try {
    spawn(b, ['--app=' + url, '--user-data-dir=' + PROFILE, '--window-size=1180,860'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    say('Apro il pannello della sessione in una finestra sua.');
    return { ok: true };
  } catch { return { ok: false }; }
}

// Nel browser normale non si sa quando la scheda viene chiusa: le pagine di LIBRE VTT dicono
// «ci sono» ogni 20 secondi. Se per qualche minuto non c'è più nessuno, si spegne tutto
// (altrimenti i server resterebbero accesi per sempre, di nascosto).
let ultimoSegno = Date.now(), sorvegliando = false;
function sorvegliaSenzaFinestra() {
  if (sorvegliando) return;
  sorvegliando = true; ultimoSegno = Date.now();
  setInterval(() => {
    if (listeners.size || presenti.size) ultimoSegno = Date.now();
    if (Date.now() - ultimoSegno > +(amb('ATTESA_MS') || 180000)) {
      console.log('Nessuna pagina di LIBRE VTT aperta da qualche minuto: spengo.');
      stopAll(); setTimeout(() => process.exit(0), 300);
    }
  }, 5000).unref();
}

// ---------- la finestra chiusa: si spegne tutto ----------
// Ogni pagina di LIBRE VTT (il menu e il tavolo) tiene aperto un filo con noi: il menu con /api/eventi,
// il tavolo con /api/presente. Quando la finestra si chiude il filo cade. Su macOS il pallino rosso chiude
// la finestra ma il browser resta acceso nel Dock e non esce mai: aspettare la sua uscita non basta.
// Se per 10 secondi nessuna pagina si ricollega (un ricaricamento o il passaggio menu → tavolo si
// ricollegano subito), chiudiamo il browser con il NOSTRO profilo, spegniamo i server e usciamo.
// Un filo è più sicuro di un avviso «mi sto chiudendo»: un altro sito non può spegnere l'app.
const presenti = new Set();
let finestraProc = null, senzaPagineDa = 0, ultimoGiro = Date.now();
// 3 s bastano per un ricaricamento; il passaggio menu ↔ tavolo (che può metterci di più a caricare)
// avvisa prima con /api/passaggio e ha 20 s.
const ATTESA_CHIUSURA = +(amb('CHIUSURA_MS') || 3000);
let passaggioFino = 0;
// Un browser con il profilo di LIBRE VTT rimasto acceso senza finestre (su macOS resta nel Dock):
// se gli chiediamo una finestra --app ne apre una normale con una scheda nuova. Prima lo si chiude.
function chiudiBrowserRimasto() {
  if (WIN || MOBILE) return Promise.resolve(false);
  return new Promise(ok => {
    let q; try { q = spawn('pkill', ['-f', '--', '--user-data-dir=' + PROFILE], { stdio: 'ignore' }); } catch { return ok(false); }
    q.on('error', () => ok(false));
    q.on('exit', c => c === 0 ? setTimeout(() => ok(true), 1200) : ok(false));   // 0 = ne ha chiuso almeno uno
  });
}
function chiudiBrowserNostro() {
  try { if (finestraProc && finestraProc.exitCode == null) finestraProc.kill(); } catch {}
  if (WIN) return;                            // su Windows il browser esce da solo con l'ultima finestra
  // solo il browser con il profilo di LIBRE VTT: quello normale (altro profilo) non si tocca
  try { spawn('pkill', ['-f', '--', '--user-data-dir=' + PROFILE], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
}
function sorvegliaChiusura() {
  if (MOBILE) return;                         // dentro l'app per telefono la finestra è l'app stessa
  setInterval(() => {
    const ora = Date.now(), salto = ora - ultimoGiro > 3000; ultimoGiro = ora;
    // dopo lo stop del computer (il timer si era fermato) i fili si ricollegano: si aspetta un giro in più
    if (salto || !finestraVista || state.busy || listeners.size || presenti.size || ora < passaggioFino) { senzaPagineDa = 0; return; }
    if (!senzaPagineDa) { senzaPagineDa = ora; return; }
    if (ora - senzaPagineDa < ATTESA_CHIUSURA) return;
    say('Nessuna finestra di LIBRE VTT aperta: chiudo il browser della finestra, spengo i server ed esco.');
    chiudiBrowserNostro(); stopAll(); setTimeout(() => process.exit(0), 500);
  }, 500).unref();
}
const origineLocale = o => !o || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(o);

// ---------- il piccolo server della finestra ----------
const invia = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(type.startsWith('text/html') ? intestazioniPagina(body) : {}) });
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
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (!hostLocale(req, UI_PORT)) return invia(res, 403, 'no');
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '')) return invia(res, 403, 'no');
  // Sul telefono anche le altre app possono parlare con 127.0.0.1: le nostre API le usa solo la
  // finestra di LIBRE VTT, che si presenta la prima volta con il segreto avuto dall'app.
  if (SEGRETO) {
    if ((u.pathname === '/' || u.pathname === '/index.html') && u.searchParams.get('k') === SEGRETO) {
      res.writeHead(302, { 'Set-Cookie': `libre_k=${encodeURIComponent(SEGRETO)}; Path=/; HttpOnly; SameSite=Strict`, Location: '/', 'Cache-Control': 'no-store' });
      return res.end();
    }
    const ck = /(?:^|;\s*)libre_k=([^;]*)/.exec(req.headers.cookie || '');
    let dato = ''; try { dato = ck ? decodeURIComponent(ck[1]) : ''; } catch {}
    if (u.pathname !== '/api/vivo' && u.pathname !== '/api/presente' && u.pathname !== '/api/passaggio' && dato !== SEGRETO) return invia(res, 403, 'Questa finestra non è quella di LIBRE VTT.');
  }

  // il tutorial guidato: gli stessi file del tavolo (js/strumenti/tutorial*.js, css/tutorial.css)
  const TUTORIAL = { '/tutorial.js': 'js/strumenti/tutorial.js', '/tutorial-passi.js': 'js/strumenti/tutorial-passi.js', '/tutorial-en.js': 'js/strumenti/tutorial-en.js', '/tutorial.css': 'css/tutorial.css' };
  if (Object.prototype.hasOwnProperty.call(TUTORIAL, u.pathname)) {
    return fs.readFile(path.join(WEB, TUTORIAL[u.pathname]), (e, d) =>
      e ? invia(res, 404, 'no') : invia(res, 200, d, u.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'));
  }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return fs.readFile(path.join(WEB, 'launcher.html'), (e, d) =>
      e ? invia(res, 500, 'launcher.html non trovato') : invia(res, 200, d, 'text/html; charset=utf-8'));
  }
  if (u.pathname === '/i18n.js' || /^\/lingua-[a-z]{2}\.js$/.test(u.pathname)) {   // le traduzioni
    return fs.readFile(path.join(WEB, 'js', 'base', u.pathname.slice(1)), (e, d) =>
      e ? invia(res, 404, 'no') : invia(res, 200, d, 'text/javascript; charset=utf-8'));
  }
  if (u.pathname === '/nativo.js') {                          // il ponte con le app per telefono (sul computer non fa niente)
    return fs.readFile(path.join(WEB, 'js', 'base', 'nativo.js'), (e, d) =>
      e ? invia(res, 404, 'no') : invia(res, 200, d, 'text/javascript; charset=utf-8'));
  }
  if (u.pathname === '/voce.js') {                            // il lettore dello schermo e della chat
    return fs.readFile(path.join(WEB, 'js', 'base', 'voce.js'), (e, d) =>
      e ? invia(res, 404, 'no') : invia(res, 200, d, 'text/javascript; charset=utf-8'));
  }
  // la pagina sta passando dal menu al tavolo (o al contrario): niente chiusura per 20 s
  if (u.pathname === '/api/passaggio') { passaggioFino = Date.now() + 20000; senzaPagineDa = 0; res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  if (u.pathname === '/api/vivo') { ultimoSegno = Date.now(); res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  if (u.pathname === '/api/stato') { ultimoSegno = Date.now(); }
  if (u.pathname === '/api/stato') { await check(); return invia(res, 200, JSON.stringify({ ...stato(), log: state.log.slice(-200) }), 'application/json'); }
  // Un secondo avvio dell'app (doppio clic sull'icona) chiede a questo di mostrare la finestra. Vuole
  // un'intestazione nostra: un sito aperto nel browser non può mandarla senza il permesso del browser.
  if (u.pathname === '/api/mostra' && req.headers['x-libre-vtt'] === 'mostra') {
    const aperte = listeners.size + presenti.size;
    invia(res, 200, 'ok');
    senzaPagineDa = 0;
    const url = 'http://127.0.0.1:' + UI_PORT + '/';
    if (aperte) {                                            // c'è già una finestra: la si richiama
      const b = trovaBrowser();
      try { if (b) spawn(b, ['--app=' + url, '--user-data-dir=' + PROFILE], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch {}
      return;
    }
    // nessuna finestra (chiusa da poco): si chiude il browser rimasto e se ne apre una nuova vera
    say('Riaperta l\'app: apro una finestra nuova.');
    const vecchio = finestraProc; finestraProc = null;
    try { if (vecchio && vecchio.exitCode == null) vecchio.kill(); } catch {}
    chiudiBrowserRimasto().then(() => apriFinestra(url));
    return;
  }
  // Una pagina aperta per sbaglio nel browser della finestra (lo dice la nostra estensione, vedi
  // preparaEstensione): la si apre nel browser di tutti i giorni. Vuole la nostra intestazione, che un
  // sito non può mandare, e accetta solo indirizzi web.
  if (u.pathname === '/api/fuori' && req.method === 'POST' && req.headers['x-libre-vtt'] === 'fuori') {
    let corpo = '';
    req.on('data', d => { corpo += d; if (corpo.length > 8192) req.destroy(); });
    req.on('end', () => {
      let url = '';
      try { url = String(JSON.parse(corpo || '{}').url || ''); } catch { return invia(res, 400, 'no'); }
      // solo indirizzi web normali, senza caratteri che una riga di comando potrebbe leggere a modo suo
      if (url && (url.length > 4000 || !/^https?:\/\/[^\s"'<>^|&`\\]+$/i.test(url.replace(/&(?=[\w%.~-]+=)/g, '')))) return invia(res, 400, 'no');
      say(url ? `Pagina aperta nella finestra di LIBRE VTT: la mando al browser di tutti i giorni (${url}).` : 'Finestra nuova del browser chiesta a LIBRE VTT: la apro nel browser di tutti i giorni.');
      apriFuori(url);
      invia(res, 200, 'ok');
    });
    return;
  }
  if (u.pathname === '/api/presente') {                     // il filo del tavolo (vedi sorvegliaChiusura)
    const o = req.headers.origin;
    if (!origineLocale(o)) return invia(res, 403, 'no');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...(o ? { 'Access-Control-Allow-Origin': o } : {}) });
    res.write('retry: 2000\n\n');
    presenti.add(res); finestraVista = true; ultimoSegno = Date.now();
    const batti = setInterval(() => { try { res.write(': ci sei\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(batti); presenti.delete(res); });
    return;
  }
  if (u.pathname === '/api/eventi') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': ciao\n\n');
    listeners.add(res); finestraVista = true;
    req.on('close', () => listeners.delete(res));
    return;
  }
  // Il pannello della sessione: sempre in una finestra sua, come un'app (non una scheda del browser). Lo chiedono la
  // home e il tavolo (che sta su un'altra porta: da qui il permesso CORS, solo per le pagine di 127.0.0.1).
  // In una partita da soli non c'è un server di gioco: si apre lo stesso, e dice che la partita è in locale.
  if (u.pathname === '/api/pannello') {
    const o = req.headers.origin;
    if (!origineLocale(o)) return invia(res, 403, 'no');
    const cors = o ? { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin' } : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'X-Libre-VTT, Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (req.method !== 'POST' || req.headers['x-libre-vtt'] !== 'pannello') return invia(res, 403, 'no');
    const lingua = /^(it|en)$/.test(u.searchParams.get('lang') || '') ? u.searchParams.get('lang') : (prefCorrenti().lingua || 'it');
    const online = state.mode && state.mode !== 'solo' && state.porte && state.porte.game;
    const url = online ? `http://127.0.0.1:${state.porte.game}/?lang=${lingua}` : `http://127.0.0.1:${UI_PORT}/pannello-locale?lang=${lingua}`;
    const r = apriPannello(url);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
    return res.end(JSON.stringify({ ...r, locale: !online, url }));
  }
  if (u.pathname === '/pannello-locale') {
    return fs.readFile(path.join(WEB, 'panel.html'), (e, d) =>
      e ? invia(res, 500, 'panel.html non trovato') : invia(res, 200, d, 'text/html; charset=utf-8'));
  }
  // Le richieste che cambiano qualcosa arrivano solo da questa finestra: un altro sito aperto nel
  // browser non deve poter creare cartelle o accendere partite al posto tuo.
  if (req.method === 'POST') {
    const o = req.headers.origin;
    if (o && o !== `http://127.0.0.1:${UI_PORT}` && o !== `http://localhost:${UI_PORT}`) return invia(res, 403, 'no');
    // JSON e basta (un altro sito non può mandarlo senza chiedere il permesso al browser); lo zip di un sistema solo dove serve
    const ct = req.headers['content-type'] || '';
    if (!/^application\/json/.test(ct) && !((u.pathname === '/api/sistema/carica' || u.pathname === '/api/plugins/installa' || u.pathname === '/api/campagna/importa-file') && /^application\/zip/.test(ct))) return invia(res, 415, 'no');
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
      else if (m.what === 'join') avvia('join', String(m.id || '').trim(), null, { chiaveMaster: m.chiaveMaster });
      else if (m.what === 'prepara') prepara();
      else if (m.what === 'ferma') stopAll();
    });
  }
  // --- campagne ---
  if (u.pathname === '/api/campagne') return ok(elencoCampagne());
  if (u.pathname === '/api/unite') {
    return ok({ unite: Object.values(unite()).sort((a, b) => (b.ultimoAccesso || 0) - (a.ultimoAccesso || 0))
      .map(e => ({ codice: e.codice, nome: e.nome || null, ultimaScena: e.ultimaScena || null, ultimoAccesso: e.ultimoAccesso || null, miniatura: !!e.miniatura, nomeGiocatore: e.nomeGiocatore || null })) });
  }
  if (u.pathname === '/api/unite/stato') return ok(await statoUnite());
  if (u.pathname === '/api/unite/miniatura') {
    const c = u.searchParams.get('codice') || '';
    if (!/^[a-f0-9]{64}$/.test(c)) return invia(res, 404, 'no');
    return fs.readFile(path.join(UNITE_DIR, c + '.img'), (e, d) => e ? invia(res, 404, 'no') : invia(res, 200, d, d[0] === 0x89 ? 'image/png' : d[0] === 0xff ? 'image/jpeg' : 'image/webp'));
  }
  if (u.pathname === '/api/unite/dimentica' && req.method === 'POST') {
    return corpo(m => { const c = String((m || {}).codice || ''); delete unite()[c]; try { fs.unlinkSync(path.join(UNITE_DIR, c + '.img')); } catch {} salvaConf(); ok({ ok: true }); });
  }
  if (u.pathname === '/api/invito/cambia' && req.method === 'POST') return corpo(async () => ok(await cambiaCodice()));
  // «Partita pubblica»: { attiva, indirizzo }; vale subito se si sta conducendo, e la volta dopo
  if (u.pathname === '/api/relay' && req.method === 'POST') return corpo(async m => {
    const r = relayConf();
    if (typeof m.attiva === 'boolean') r.attiva = m.attiva;
    if (typeof m.indirizzo === 'string') {
      const x = relayIndirizzoPulito(m.indirizzo);
      if (!x.ok) return ok({ errore: x.errore });
      r.indirizzo = x.valore;
      if (!x.valore) r.tipo = 'sito';
    }
    if (typeof m.appVia === 'string' && ['iroh', 'auto', 'relay'].includes(m.appVia)) r.appVia = m.appVia;   // come si collegano le app tra loro: iroh (diretto), relay, o prima iroh e poi relay
    if (typeof m.irohRete === 'string' && RETI_IROH.includes(m.irohRete)) r.irohRete = m.irohRete;       // vale dalla prossima partita che si apre
    if (typeof m.tipo === 'string' && ['sito', 'cloudflare', 'proprio', 'terzi'].includes(m.tipo)) { r.tipo = m.tipo; if (m.tipo === 'sito') r.indirizzo = ''; }
    conf.relay = r; salvaConf();
    if (!r.attiva) state.relay = null;
    await applicaRelay(); push();
    ok({ ok: true, pubblica: r });
  });
  // Prova di un relay (quello scritto nel campo, o quello in uso): { indirizzo? } → { ok } o { ok: false, errore }
  if (u.pathname === '/api/relay/prova' && req.method === 'POST') return corpo(async m => {
    const x = relayIndirizzoPulito((m || {}).indirizzo);
    if (!x.ok) return ok({ ok: false, errore: x.errore });
    const url = x.valore || await indirizzoRelay();
    if (!url) return ok({ ok: false, errore: 'Non trovo l\'indirizzo del relay del sito.' });
    ok(await provaRelay(url));
  });
  if (u.pathname === '/api/sfoglia') return ok(sfoglia(u.searchParams.get('path') || ''));
  if (u.pathname === '/api/campagna/info') return ok(infoCampagna(u.searchParams.get('path') || ''));
  if (u.pathname === '/api/campagna/nuova' && req.method === 'POST') {
    return corpo(m => {
      // la lingua è una sola: quella delle preferenze, che la finestra mostra; se la finestra ne manda un'altra, vince quella che vedi
      if ((m.lingua === 'it' || m.lingua === 'en') && prefCorrenti().lingua !== m.lingua) salvaPref({ lingua: m.lingua });
      const dir = nuovaCampagna(m.nome);
      try { if (m.sistema) impostaSistema(dir, m.sistema, m.file); }
      catch (e) { return ok({ path: dir, errore: e.message, ...elencoCampagne() }); }
      ok({ path: dir, ...elencoCampagne() });
    });
  }
  if (u.pathname === '/api/sistemi' && req.method === 'GET') return ok({ sistemi: sistemiDisponibili() });
  if (u.pathname === '/api/campagna/sistema' && req.method === 'POST') {
    return corpo(m => {
      const info = infoCampagna(m.path);
      if (!info.esiste || !info.campagna) return ok({ errore: 'Non trovo la campagna.' });
      try { ok({ sistema: impostaSistema(info.path, m.sistema, m.file) }); } catch (e) { ok({ errore: e.message }); }
    });
  }
  // un file di sistema (.libresistema / .zip) che arriva dalla finestra: lo si tiene finché non si sceglie
  // --- plugins ---
  if (u.pathname === '/api/plugins' && req.method === 'GET') return ok(pluginsInfo());
  if (u.pathname.startsWith('/api/plugins/') && req.method === 'POST' && u.pathname !== '/api/plugins/installa') {
    const op = u.pathname.slice(13);
    if (MOBILE && (op === 'crea' || op === 'cartella' || op === 'elimina')) return ok({ errore: 'Nell\'app per telefoni e tablet ci sono solo i plugin inclusi.', ...pluginsInfo() });
    return corpo(m => {
      const id = String(m.id || '');
      try {
        if (op === 'applica') {
          const p = PLUGINS.list().find(x => x.id === id);
          if (!p) return ok({ errore: 'Plugin non trovato' });
          if (m.on && p.access === 'full' && !p.consented) return ok({ serveConsenso: true, ...pluginsInfo() });
          PLUGINS.setApplied(id, !!m.on);
        } else if (op === 'ordine') PLUGINS.setOrder(Array.isArray(m.ids) ? m.ids.map(String) : []);
        else if (op === 'consenso') PLUGINS.giveConsent(id, String(m.hash || ''), String(m.nome || ''));
        else if (op === 'revoca') PLUGINS.revokeConsent(id);
        else if (op === 'condividi') PLUGINS.setShared(id, !!m.on, !!m.necessario);
        else if (op === 'elimina') {
          return PLUGINS.remove(String(m.cartella || ''), nelCestino)
            .then(id => { say(`Plugin «${id}» spostato nel Cestino.`, 'ok'); ok({ eliminato: id, ...pluginsInfo() }); })
            .catch(e => ok({ errore: e.message, ...pluginsInfo() }));
        }
        else if (op === 'cartella') { fs.mkdirSync(PLUGINS_DIR, { recursive: true }); if (!MOBILE) mostraCartella(m.id ? (PLUGINS.folderOf(id) || PLUGINS_DIR) : PLUGINS_DIR); }
        else if (op === 'crea') {
          const nome = String(m.modello || '');
          if (!pluginExamples().includes(nome)) return ok({ errore: 'Modello non trovato' });
          const nuovo = PLUGINS.createFrom(path.join(PLUGIN_EXAMPLES, nome), m.nuovoId ? String(m.nuovoId) : nome);
          if (m.apri && !MOBILE) mostraCartella(path.join(PLUGINS_DIR, nuovo));
          return ok({ creato: nuovo, ...pluginsInfo() });
        } else return invia(res, 404, 'no');
        ok(pluginsInfo());
      } catch (e) { ok({ errore: e.message, ...pluginsInfo() }); }
    });
  }
  if (u.pathname === '/api/plugins/installa' && req.method === 'POST') {
    if (MOBILE) { req.resume(); return ok({ errore: 'Nell\'app per telefoni e tablet non si possono importare plugin: ci sono solo quelli inclusi.', ...pluginsInfo() }); }
    const parti = []; let n = 0, troppo = false;
    req.on('data', d => { n += d.length; if (n > 60 * 1024 * 1024) { troppo = true; req.destroy(); } else parti.push(d); });
    req.on('end', () => {
      if (troppo) return;
      const b = Buffer.concat(parti);
      if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) return ok({ errore: 'Non è un file .zip.' });
      const tmp = path.join(os.tmpdir(), 'libre-plugin-' + Date.now().toString(36));
      try {
        fs.writeFileSync(tmp + '.zip', b);
        estraiZip(tmp + '.zip', tmp, { maxByte: 60 * 1024 * 1024, maxVoci: 2000 });
        const id = PLUGINS.installFolder(tmp);
        ok({ installato: id, ...pluginsInfo() });
      } catch (e) { ok({ errore: e.message, ...pluginsInfo() }); }
      finally { try { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(tmp + '.zip', { force: true }); } catch {} }
    });
    return;
  }
  if (u.pathname === '/api/sistema/carica' && req.method === 'POST') {
    const parti = []; let n = 0, troppo = false;
    req.on('data', d => { n += d.length; if (n > 60 * 1024 * 1024) { troppo = true; req.destroy(); } else parti.push(d); });
    req.on('end', () => {
      if (troppo) return;
      const b = Buffer.concat(parti);
      if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) return ok({ errore: 'Non è un file .zip / .libresistema.' });
      fs.mkdirSync(SISTEMI_ARRIVATI, { recursive: true });
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      fs.writeFileSync(path.join(SISTEMI_ARRIVATI, id + '.zip'), b);
      try { const { tmp, radice } = sistemaDaFile(id); const j = leggiJson(path.join(radice, 'sistema.json')); fs.rmSync(tmp, { recursive: true, force: true }); ok({ file: id, nome: j.nome || 'Sistema' }); }
      catch (e) { ok({ errore: e.message }); }
    });
    return;
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
  if (u.pathname === '/api/campagna/elimina' && req.method === 'POST') {
    return corpo(async m => {
      try { await eliminaCampagna(String(m.path || '')); ok(elencoCampagne()); }
      catch (e) { ok({ ...elencoCampagne(), errore: e.message }); }
    });
  }
  if (u.pathname === '/api/campagna/dimentica' && req.method === 'POST') {
    return corpo(m => { dimentica(String(m.path || '')); ok(elencoCampagne()); });
  }
  if (u.pathname === '/api/campagna/mostra' && req.method === 'POST') {
    return corpo(m => { const i = infoCampagna(m.path); if (i.esiste) mostraCartella(i.path); ok({ ok: i.esiste }); });
  }
  if (u.pathname === '/api/campagna/esporta' && req.method === 'POST') {
    return corpo(m => ok(esportaCampagna(String(m.path || ''), m.completa === true)));
  }
  if (u.pathname === '/api/pref' && req.method === 'POST') return corpo(m => ok(salvaPref(m || {})));
  if (u.pathname === '/api/id' && req.method === 'POST') return corpo(m => ok(salvaIdUtente(m || {})));
  if (u.pathname === '/api/aggiornamento') return ok(await controllaAggiornamento(u.searchParams.has('ora')));
  if (u.pathname === '/api/aggiornamento/installa' && req.method === 'POST') {
    return corpo(async () => ok(await installaAggiornamento()));
  }
  // sul computer: lo .zip scelto nella home (un modulo avuto da un altro master) arriva qui, scritto su disco man mano
  if (u.pathname === '/api/campagna/importa-file' && req.method === 'POST') {
    const ARRIVI = path.join(USERDIR, 'importa');
    fs.mkdirSync(ARRIVI, { recursive: true });
    const f = path.join(ARRIVI, 'arrivo-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.zip');
    const out = fs.createWriteStream(f);
    let n = 0, troppo = false;
    req.on('data', d => { n += d.length; if (n > 3.5 * 1024 * 1024 * 1024) { troppo = true; req.destroy(); out.destroy(); fs.rm(f, { force: true }, () => {}); } });
    req.pipe(out);
    out.on('finish', () => {
      if (troppo) return;
      const r = importaCampagna(f, String(u.searchParams.get('nome') || '').slice(0, 120));
      ok(r.errore ? r : { ...r, ...elencoCampagne() });
    });
    out.on('error', e => { fs.rm(f, { force: true }, () => {}); if (!res.headersSent) ok({ errore: e.message }); });
    return;
  }
  if (u.pathname === '/api/campagna/importa' && req.method === 'POST') {
    return corpo(m => {
      const r = importaCampagna(String(m.sorgente || ''), String(m.nome || ''));
      ok(r.errore ? r : { ...r, ...elencoCampagne() });
    });
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
  // Ci pensa l'altro avvio (sa se la sua finestra è ancora aperta); se è di una versione vecchia, come prima.
  console.log('LIBRE VTT è già aperto: mostro la sua finestra.');
  const r = http.get({ host: '127.0.0.1', port, path: '/api/mostra', headers: { 'X-Libre-VTT': 'mostra' }, timeout: 2000 }, x => {
    x.resume();
    if (x.statusCode === 200) setTimeout(() => process.exit(0), 300); else mostraComePrima(port);
  });
  r.on('error', () => mostraComePrima(port)); r.on('timeout', () => { r.destroy(); });
}
function mostraComePrima(port) {
  const b = trovaBrowser(), url = `http://127.0.0.1:${port}/`;
  try {
    const p = b ? spawn(b, ['--app=' + url, '--user-data-dir=' + PROFILE], { detached: true, stdio: 'ignore' })
      : spawn(WIN ? 'cmd' : MAC ? 'open' : 'xdg-open', WIN ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore', windowsHide: true });
    p.on('error', () => {}); p.unref();
  } catch {}
  setTimeout(() => process.exit(0), 500);
}
server.on('error', e => {
  if (MOBILE) {                                                // dentro l'app non si esce: si prova un'altra porta
    say('La finestra non parte: ' + e.message, 'bad');
    setTimeout(async () => { UI_PORT = await portaLibera(UI_PORT + 1); server.listen(UI_PORT, '127.0.0.1'); }, 300);
    return;
  }
  console.error(e.code === 'EADDRINUSE' ? `La porta ${UI_PORT} si è appena occupata: riapri LIBRE VTT.` : e.message);
  process.exit(1);
});
/** Sul telefono: l'app aspetta questo file per sapere quale indirizzo aprire nella sua finestra. */
function segnalaPronto() {
  const url = `http://127.0.0.1:${UI_PORT}/` + (SEGRETO ? '?k=' + encodeURIComponent(SEGRETO) : '');
  if (PRONTO_FILE) {
    try { fs.writeFileSync(PRONTO_FILE + '.tmp', url); fs.renameSync(PRONTO_FILE + '.tmp', PRONTO_FILE); }
    catch (e) { console.error('Non riesco a scrivere ' + PRONTO_FILE + ': ' + e.message); }
  }
  console.log('LIBRE VTT pronto su http://127.0.0.1:' + UI_PORT + '/');
}
(async () => {
  conf.porte = conf.porte || {};
  try { pulisciAggiornamento(); } catch (e) { say('Pulizia dopo l\'aggiornamento: ' + e.message, 'warn'); }
  const pref = +(process.env.UI_PORT || conf.porte.ui || PREF.ui);
  if (!MOBILE && await èMyVtt(pref)) return mostraFinestraEsistente(pref);
  UI_PORT = await portaLibera(pref);
  if (UI_PORT !== pref) console.log(`La porta ${pref} è usata da un altro programma: uso la ${UI_PORT}.`);
  if (!process.env.UI_PORT && conf.porte.ui !== UI_PORT) { conf.porte.ui = UI_PORT; salvaConf(); }
  server.on('listening', async () => {
    await check();
    if (MOBILE) return segnalaPronto();
    sorvegliaChiusura();
    await chiudiBrowserRimasto();               // un browser di LIBRE VTT rimasto nel Dock da prima
    console.log('LIBRE VTT: finestra su http://127.0.0.1:' + UI_PORT);
    apriFinestra('http://127.0.0.1:' + UI_PORT + '/');
  });
  server.listen(UI_PORT, '127.0.0.1');
})();
