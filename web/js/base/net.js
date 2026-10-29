// ---------- Collegamento al server di gioco ----------
// Se il server c'è, comanda lui: il browser chiede, il server decide e dice com'è andata.
// Se non c'è, il VTT funziona come sempre, da solo su questo computer.

const NET = {
  on: false, ws: null, me: null, players: [],
  world: null,                 // l'ultimo mondo ricevuto
  photosById: new Map(),       // id del segnalino -> com'era sul server
  applying: false,             // stiamo ridisegnando: non rimandare indietro niente
  tries: 0, port: 4000,
  views: {}                    // id della scena -> la MIA vista {x, y, s} (non viaggia mai)
};
// L'avviatore dice al tavolo dove sono gli altri pezzi (?gs=porta del server di gioco, 0 = da
// soli; ?ui=porta dell'avviatore): se le porte di sempre erano occupate da altri programmi ne ha
// scelte altre. Ce le si segna e si toglie la richiesta dall'indirizzo.
try {
  const q = new URLSearchParams(location.search);
  if (q.has('gs')) localStorage.setItem('uffa-gs-port', String(Math.max(0, Math.min(65535, +q.get('gs') || 0))));
  if (q.has('ui')) localStorage.setItem('uffa-ui-port', String(+q.get('ui') || 4100));
  if (q.has('gs') || q.has('ui')) history.replaceState(null, '', location.pathname + location.hash);
} catch {}
try {
  const g = localStorage.getItem('uffa-gs-port');
  NET.port = g == null ? 0 : Math.max(0, +g || 0);               // 0: da soli, nessun server da cercare (senza indirizzo non si prova a indovinarlo)
  NET.uiPort = +(localStorage.getItem('uffa-ui-port') || 4100) || 4100;
} catch { NET.uiPort = 4100; }
try { NET.views = JSON.parse(localStorage.getItem('uffa-views') || '{}') || {}; } catch { NET.views = {}; }

let netFromServer = false;

const netToken = () => {
  let t = '';
  try { t = localStorage.getItem('uffa-token') || ''; } catch {}
  if (!/^[a-f0-9]{24}$/.test(t)) {
    t = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('uffa-token', t); } catch {}
  }
  return t;
};
const netName = () => { try { return localStorage.getItem('uffa-name') || ''; } catch { return ''; } };

// Finché non si sa niente, vale la regola di prima: sei solo, quindi comandi tu.
// Se però la sessione è solo caduta e ci si sta ricollegando, valgono ancora i tuoi permessi:
// un giocatore non diventa master perché il filo si è staccato per un attimo.
const netAs = () => NET.on || (NET.retrying && !!NET.me);
function isMaster() { return !netAs() || (NET.me && NET.me.role === 'master'); }
function can(p) { return !netAs() || !NET.me ? true : !!(NET.me.perms && NET.me.perms[p]); }

const netSend = o => { try { NET.ws && NET.ws.readyState === 1 && NET.ws.send(JSON.stringify(o)); } catch {} };
// ---------- La coda: quello che si fa senza collegamento non si perde ----------
// Ogni intento ha un numero (q) e resta in coda finché il server non risponde «ok» (fatto, o rifiutato).
// Se il collegamento cade, quello che c'è in coda si rimanda al ritorno, in ordine; il server riconosce i
// doppioni dal numero e li fa una volta sola. I movimenti dello stesso segnalino si fondono in uno (vale
// l'ultimo), e così i salvataggi della stessa scheda. Il ping, la prova del percorso durante il trascinamento
// e i pezzi delle immagini non aspettano: senza collegamento non partono (le immagini hanno la loro attesa).
NET.coda = []; NET.n = 0;
NET.sessione = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
const NET_SUBITO = new Set(['percorso.prova', 'ping', 'asset.put', 'asset.have', 'asset.get']);
function netChiave(op, x) {
  switch (op) {
    case 'token.move': return 'mv:' + x.scene + ':' + x.id;
    case 'scatta': return 'sc:' + x.scene + ':' + x.id;
    case 'sheet.save': return 'sh:' + x.id;
    case 'board': return 'board';
    case 'music': return 'music';
    case 'notes.save': return 'notes';
    case 'fog.set': return 'fog:' + x.scene;
    default: return null;
  }
}
const netAperto = () => !!(NET.on && NET.ws && NET.ws.readyState === 1);
function intent(op, extra) {
  if (NET_SUBITO.has(op)) { if (NET.on) netSend({ t: 'intent', op, ...extra }); return; }
  if (!netAs()) return;                                       // da soli: non c'è nessun server
  const x = extra || {}, k = netChiave(op, x);
  if (k) NET.coda = NET.coda.filter(e => e.k !== k);
  const e = { n: ++NET.n, q: NET.sessione + '.' + NET.n, op, x, k };
  NET.coda.push(e);
  if (NET.coda.length > 500) NET.coda.splice(0, NET.coda.length - 500);
  if (netAperto() && !NET.hostDown) { netSend({ t: 'intent', op, q: e.q, ...x }); e.via = true; }
  else {
    if (netAperto()) { netSend({ t: 'intent', op, q: e.q, ...x }); e.via = true; }   // il ponte la tiene da parte
    netAvvisaCoda();
  }
}
const netInAttesa = () => NET.coda.length;
/** Mentre si è scollegati: quante cose aspettano di partire. */
function netAvvisaCoda() {
  if (NET.on && !NET.hostDown) return;
  netSay(tr('Sei scollegato: {n} cose in attesa, partono appena torna il collegamento.', { n: netInAttesa() }), 'retry', { label: tr('Smetti'), fn: netDisconnect });
}
/** Rientrati: si rimanda tutto quello che non ha ancora avuto risposta, in ordine. */
function netRimanda() {
  const n = NET.coda.length;
  for (const e of NET.coda) { netSend({ t: 'intent', op: e.op, q: e.q, ...e.x }); e.via = true; }
  return n;
}
/** Uno spostamento di questo segnalino aspetta ancora la risposta del server: la posizione giusta è quella di qui. */
const netMossaInAttesa = id => NET.coda.some(e => e.op === 'token.move' && e.x.id === id);

// ---------- Avviso in alto ----------
const netBar = mk('div', '', '<span class="nbDot"></span><span class="nbTxt"></span><button type="button" class="nbX" aria-label="Chiudi">×</button>');
netBar.id = 'netBar'; netBar.hidden = true;
document.body.appendChild(netBar);
netBar.querySelector('.nbX').addEventListener('click', () => { netBar.hidden = true; });
let netBarTimer = 0;
const netBarAct = mk('button', 'nbAct', '');
netBarAct.type = 'button'; netBarAct.hidden = true;
netBar.insertBefore(netBarAct, netBar.querySelector('.nbX'));
netBarAct.addEventListener('click', () => { const f = netBarAct._fn; if (f) f(); });
/** kind: '' | 'warn' | 'live' (resta) | 'retry' (resta, puntino che pulsa). act: { label, fn } */
function netSay(text, kind = '', act = null) {
  netBar.className = kind;
  netBar.querySelector('.nbTxt').textContent = text;
  netBarAct.hidden = !act;
  if (act) { netBarAct.textContent = act.label; netBarAct._fn = act.fn; }
  netBar.hidden = false;
  clearTimeout(netBarTimer);
  if (kind !== 'live' && kind !== 'retry' && !act) netBarTimer = setTimeout(() => { netBar.hidden = true; }, 5000);
}
function netSayHide() { clearTimeout(netBarTimer); netBar.hidden = true; }

// ---------- Collegamento ----------
// Se la sessione cade mentre l'app è aperta, ci si ricollega da soli e si continua a provare
// finché non torna: non c'è un numero massimo di tentativi. Si smette solo se ti sei
// scollegato tu, oppure se il master ti ha allontanato (quella è una decisione, non un guasto).
NET.manual = false;     // scollegato a mano: non insistere
NET.stopped = false;    // allontanato, bandito, o ricollegato da un'altra finestra
NET.retrying = false;   // la sessione è caduta e ci stiamo ricollegando
NET.hostDown = false;   // (giocatore) il proprio server c'è, ma il tubo verso l'host no
let netTimer = 0;

function netConnect() {
  clearTimeout(netTimer); netTimer = 0;
  if (!NET.port) return;                                     // si gioca da soli
  if (NET.ws && NET.ws.readyState <= 1) return;            // ce n'è già uno aperto o in apertura
  let ws;
  try { ws = new WebSocket('ws://127.0.0.1:' + NET.port + '/ws'); } catch { return netRetry(); }
  NET.ws = ws;
  ws.onopen = () => {
    // delta: sappiamo ricevere solo i pezzi cambiati; ver e chatDa: dove eravamo rimasti (per rientrare senza ricaricare tutto)
    ws.send(JSON.stringify({ t: 'hello', token: netToken(), name: netName(), client: 'LIBRE VTT 2', delta: 1, ver: NET.ver || 0, chatDa: NET.chatUltimo || '' }));
  };
  ws.onmessage = e => {
    if (NET.ws !== ws) return;
    NET.ultimo = Date.now();
    let m; try { m = JSON.parse(e.data); } catch { return; }
    netHandle(m);
  };
  ws.onclose = () => netCaduto(ws);
  ws.onerror = () => {};
}
/** Il collegamento locale è caduto (o lo diamo per morto noi): ci si ricollega. */
function netCaduto(ws) {
  if (NET.ws !== ws) return;                                  // uno vecchio, già sostituito
  NET.ws = null;
  clearTimeout(NET._eco); NET._eco = 0;
  try { ws.close(); } catch {}
  const was = NET.on;
  NET.on = false;
  if (NET.everOn && !NET.manual && !NET.stopped) NET.retrying = true;
  if (was) applyRole();
  netRetry();
}
// ---------- Accorgersi prima ----------
// Quando la rete torna o l'app torna in primo piano (il telefono tirato fuori dalla tasca) non si aspetta il
// prossimo tentativo: se il collegamento è giù ci si ricollega subito; se sembra su si chiede «ci sei?» e, se in
// 3 secondi nessuno risponde, lo si dà per morto. Il server del giocatore, ricevuto il «ci sei?», controlla a
// sua volta il tubo verso l'host. Lo stesso controllo si fa da soli se da 20 secondi non arriva niente.
NET.ultimo = Date.now();
function netControlla() {
  if (NET.manual || NET.stopped || !NET.port || !NET.everOn) return;
  const ws = NET.ws;
  if (!ws || ws.readyState > 1) { NET.tries = 0; netConnect(); return; }
  if (ws.readyState !== 1 || NET._eco) return;
  NET._eco = setTimeout(() => { NET._eco = 0; netCaduto(ws); }, 3000);
  netSend({ t: 'eco' });
}
addEventListener('online', netControlla);
addEventListener('pageshow', netControlla);
document.addEventListener('visibilitychange', () => { if (!document.hidden) netControlla(); });
setInterval(() => { if (NET.on && !document.hidden && Date.now() - NET.ultimo > 20000) netControlla(); }, 5000);
function netRetry() {
  if (NET.manual || NET.stopped) { if (NET.retrying) { NET.retrying = false; applyRole(); } return; }
  NET.tries++;
  // Se non c'è mai stato un server, dopo pochi tentativi si smette: si sta giocando da soli
  // e non ha senso riempire la console di errori. Se invece la sessione è caduta, si insiste
  // senza limite, ogni pochi secondi.
  if (!NET.everOn && NET.tries > 4) {
    if (netBar.className === 'retry') netSay('Nessun server di gioco su questa porta: stai giocando da solo.', 'warn');
    return;
  }
  const wait = NET.everOn ? Math.min(5000, 500 * NET.tries) : Math.min(8000, 700 * NET.tries);
  if (NET.retrying) {
    netSay(netInAttesa() ? tr('Collegamento perso: mi ricollego da solo… (tentativo {n}, {k} cose in attesa)', { n: NET.tries, k: netInAttesa() })
      : `Collegamento perso: mi ricollego da solo… (tentativo ${NET.tries})`, 'retry',
      { label: 'Smetti', fn: netDisconnect });
  }
  clearTimeout(netTimer);
  netTimer = setTimeout(netConnect, wait);
}
/** Scollegarsi a mano: si esce dalla sessione e non si riprova finché non lo chiedi tu. */
function netDisconnect() {
  NET.manual = true; NET.retrying = false; NET.hostDown = false;
  clearTimeout(netTimer); netTimer = 0;
  const ws = NET.ws;
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch {} }
  NET.ws = null;
  if (ws) setTimeout(() => { try { ws.close(); } catch {} }, 150);   // il tempo di far partire il saluto
  const was = NET.on;
  NET.on = false;
  if (was || NET.me) applyRole();
  netSay('Ti sei scollegato dalla sessione.', '', { label: 'Ricollegati', fn: netReconnectNow });
  if (typeof netSyncForm === 'function') netSyncForm();
}
/** Ricollegarsi adesso (pulsante): azzera tutto e riparte subito. */
function netReconnectNow() {
  NET.manual = false; NET.stopped = false; NET.tries = 0;
  const ws = NET.ws;
  NET.ws = null;
  if (ws) { try { ws.close(); } catch {} }
  netSay('Mi collego…', 'retry');
  netConnect();
}

// ---------- Messaggi dal server ----------
function netHandle(m) {
  switch (m.t) {
    case 'beat': netSend({ t: 'pong' }); return;
    case 'eco': clearTimeout(NET._eco); NET._eco = 0; return;   // c'è
    case 'ok': NET.coda = NET.coda.filter(e => e.q !== m.q); return;   // fatto (o rifiutato): esce dalla coda
    case 'leggera':                              // il server ha visto che il collegamento è debole (o di nuovo buono)
      NET.leggera = !!m.on;
      document.body.classList.toggle('net-leggera', NET.leggera);
      netSay(NET.leggera ? 'Collegamento debole: modalità leggera. Chat, dadi e segnalini arrivano subito; immagini e musica dopo.' : 'Il collegamento è tornato buono.', NET.leggera ? 'warn' : '');
      return;
    case 'welcome': {
      const back = NET.retrying || NET.hostDown;
      NET.on = true; NET.everOn = true; NET.me = m.you;
      NET.retrying = false; NET.hostDown = false; NET.tries = 0; NET.pending = false;
      try { localStorage.setItem('uffa-token', m.you.token); } catch {}
      const rimandate = netRimanda();
      if (back && rimandate) netSay(tr('Ricollegato: ho mandato le {n} cose fatte mentre eri scollegato.', { n: rimandate }), 'live');
      else if (back) netSay('Ricollegato: sei di nuovo nella sessione.', 'live');
      else netSay(m.you.role === 'master'
        ? 'Sei collegato come master: la sessione è tua.'
        : 'Sei collegato come giocatore (' + m.you.name + ').', 'live');
      if (back) setTimeout(() => { if (netBar.className === 'live') netSayHide(); }, 4000);
      applyRole();
      if (m.world) netMondoPieno(m.world, m.ver);
      else if (m.riprendi) netRiprendi(m);       // rientrato dopo una caduta: solo quello che ci si è persi
      if (isMaster()) netPushBoard();            // da adesso il server ha il mondo del master
      if (m.needName) askName('Scegli il nome con cui ti vedranno gli altri.');
      return;
    }
    case 'link':                                 // (giocatore) com'è il tubo verso l'host
      if (m.up) return;                          // quando torna su arriva il «welcome»: lì si avvisa
      if (!NET.everOn || NET.manual || NET.stopped) return;
      NET.hostDown = true;
      netSay('Il collegamento con chi conduce si è interrotto: mi ricollego da solo…', 'retry',
        { label: 'Smetti', fn: netDisconnect });
      return;
    case 'you': {
      const before = NET.me;
      NET.me = m.you;
      try { localStorage.setItem('uffa-name', m.you.name); } catch {}
      applyRole();
      if (before && before.name !== m.you.name) netSay('Adesso ti chiami «' + m.you.name + '».');
      else netSay('I tuoi permessi sono cambiati.', 'warn');
      if (typeof netSyncForm === 'function') netSyncForm();
      return;
    }
    case 'rename': askName(m.reason || 'Il master ti chiede di cambiare nome.'); return;
    case 'notice': netSay(m.text || '', m.kind || 'warn'); return;
    case 'world': netMondoPieno(m.world, m.ver); return;
    case 'delta': netDelta(m); return;
    case 'players': NET.players = m.list || []; return;
    case 'chat': netChat(m.msg); return;
    case 'chat.del': netFromServer = true; try { deleteChat(m.id); } finally { netFromServer = false; } return;
    case 'ping': {
      const x = m.x * view.s + view.x, y = m.y * view.s + view.y;
      netFromServer = true;
      try { startPing(x, y); } finally { netFromServer = false; }
      return;
    }
    case 'notes':
      if (typeof noteDalServer === 'function' && m.notes) noteDalServer(m.notes, m.from === (NET.me && NET.me.id));
      return;
    case 'music':
      if (m.state) NET.musicaServer = JSON.stringify(m.state);
      if (typeof musicApply === 'function' && m.state) musicApply(m.state);
      return;
    case 'denied':
      if (m.q) NET.coda = NET.coda.filter(e => e.q !== m.q);
      netSay(tr('Non si può:') + ' ' + tr(m.reason || 'il master non te l\'ha permesso.'), 'warn');
      // un movimento rifiutato (un muro, troppo lontano): il segnalino torna indietro piano
      if (m.op === 'token.move' && NET.ultimoMosso && NET.ultimoMosso.isConnected) {
        const el = NET.ultimoMosso; el.classList.add('torna'); setTimeout(() => el.classList.remove('torna'), 600);
      }
      if (NET.world) applyWorld(NET.world);      // rimetti le cose come stanno davvero
      return;
    case 'percorso':                             // risposta alla prova durante il trascinamento
      if (typeof percorsoRisposta === 'function') percorsoRisposta(m);
      return;
    case 'asset.ok': {
      const res = NET.assetWait.get(m.id);
      if (res) { NET.assetWait.delete(m.id); res(m.hash || true); }
      if (m.hash) NET.assetKnown.add(m.hash);
      return;
    }
    case 'asset.need':
      for (const h of m.hashes || []) NET.assetKnown.delete(h);
      return;
    case 'pending':
      NET.pending = true;
      netSay('Sei in sala d\'attesa: il master deve farti entrare.', 'live');
      return;
    case 'session':
      NET.session = m.session || {};
      if (NET.session.paused && !isMaster()) netSay('Il master ha messo la sessione in pausa.', 'warn');
      return;
    case 'bye': {
      // Non insistere: è stata una decisione (o ti sei ricollegato da un'altra finestra), non un guasto.
      NET.stopped = true; NET.retrying = false; NET.hostDown = false;
      clearTimeout(netTimer);
      const ws = NET.ws;
      NET.ws = null; NET.on = false;
      applyRole();
      try { ws && ws.close(); } catch {}
      netSay(m.reason || 'Il master ti ha scollegato.', 'warn',
        m.replaced ? { label: 'Usa questa finestra', fn: netReconnectNow } : null);
      return;
    }
  }
}

// ---------- I file (mappe, segnalini) ----------
// Il master carica l'immagine una volta sola; il mondo poi la cita con il suo hash.
// Chi gioca la scarica dal proprio server locale, che se la fa mandare dall'host.
NET.assetHash = new Map();      // indirizzo locale -> hash
NET.assetKnown = new Set();     // hash che il server ha già
NET.assetWait = new Map();      // id del caricamento -> promessa

// Da soli non c'è il server di gioco: le immagini del deposito della campagna le dà il tavolo stesso.
const netAssetUrl = hash => NET.port ? 'http://127.0.0.1:' + NET.port + '/asset/' + hash : 'asset/' + hash;

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
function b64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** Carica il file a pezzi e aspetta la conferma del server. */
function netPutAsset(hash, bytes, mime, name) {
  const id = hash.slice(0, 12) + '-' + Date.now().toString(36);
  const STEP = 48 * 1024;
  const done = new Promise(res => NET.assetWait.set(id, res));
  for (let off = 0; off < bytes.length || off === 0; off += STEP) {
    const part = bytes.subarray(off, off + STEP);
    const last = off + STEP >= bytes.length;
    netSend({ t: 'intent', op: 'asset.put', id, mime, name, data: b64(part), last });
    if (last) break;
  }
  return Promise.race([done, new Promise(r => setTimeout(() => r(null), 60000))]);
}

/** Si assicura che il server abbia quest'immagine, e ne restituisce l'hash. */
async function netEnsureAsset(url, name) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('gs:')) return url.slice(3);
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;   // le prime le gestisce il server
  if (NET.assetHash.has(url)) return NET.assetHash.get(url);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 12 * 1024 * 1024) { netSay('«' + (name || 'immagine') + '» supera i 12 MB: i giocatori non la vedranno.', 'warn'); return null; }
    const hash = toHex(await crypto.subtle.digest('SHA-256', buf));
    NET.assetHash.set(url, hash);
    if (!NET.assetKnown.has(hash)) {
      const ok = await netPutAsset(hash, new Uint8Array(buf), r.headers.get('content-type') || 'image/webp', name || url.split('/').pop());
      if (ok) NET.assetKnown.add(hash);
    }
    return hash;
  } catch { return null; }
}

/** Prima di mandare il mondo: tutte le immagini citate devono essere già dall'altra parte. */
async function netEnsureWorldAssets(scenes2, sheets2) {
  const jobs = [];
  const mark = (o, name) => {
    if (!o || !o.url || o.gid) return;
    jobs.push(netEnsureAsset(o.url, name).then(h => { if (h) o.gid = h; }));
  };
  for (const sc of scenes2 || []) {
    mark(sc.bg, sc.name);
    for (const ph of sc.photos || []) if (!ph.shape) mark(ph, ph.name || 'segnalino');
  }
  for (const sh of sheets2 || []) if (sh.icon) mark(sh.icon, sh.name);
  if (jobs.length) await Promise.all(jobs);
}

// ---------- Il mondo che arriva dal server: intero o a pezzi (condiviso/versioni.js) ----------
NET.ver = 0;          // la versione del mondo che abbiamo (0: nessuna, o un server che manda sempre tutto)
NET.parti = null;     // il mondo a pezzi, come lo tiene il server
NET.chatUltimo = '';  // l'ultimo messaggio di chat arrivato dal server
/** Il mondo fatto dai pezzi. Scene e schede sono copie: chi le tocca qui non sporca i pezzi. */
function netMondoDaiPezzi() {
  const w = VERSIONI.ricomponi(NET.parti);
  w.scenes = structuredClone(w.scenes); w.sheets = structuredClone(w.sheets);
  return w;
}
function netMondoPieno(w, ver) {
  if (Array.isArray(w.chat) && w.chat.length) NET.chatUltimo = w.chat[w.chat.length - 1].id || NET.chatUltimo;
  if (!ver || typeof VERSIONI === 'undefined') { NET.ver = 0; NET.parti = null; return applyWorld(w); }
  NET.ver = ver;
  NET.parti = VERSIONI.pezzi(w);
  const pronto = netMondoDaiPezzi();
  pronto.chat = w.chat;
  return applyWorld(pronto);
}
function netDelta(m) {
  // non siamo alla versione da cui parte la differenza (un pezzo perso per strada): ci si fa mandare tutto
  if (!NET.parti || m.da !== NET.ver) { netSend({ t: 'sync' }); return; }
  const toccati = VERSIONI.applica(NET.parti, m);
  NET.ver = m.a;
  return applyWorld(netMondoDaiPezzi(), toccati);
}
/** Rientrati con il mondo già giusto: si aggiunge la chat persa e si tolgono i messaggi cancellati nel frattempo. */
function netRiprendi(m) {
  for (const msg of m.chatDopo || []) if (msg && !chat.some(x => x.id === msg.id)) netChat(msg);
  for (const id of m.chatVia || []) if (chat.some(x => x.id === id)) { netFromServer = true; try { deleteChat(id); } finally { netFromServer = false; } }
}

function normScene(s) {
  return {
    id: s.id, name: s.name || 'Scena', type: s.type === 'cinematic' ? 'cinematic' : 'map',
    bg: s.bg || null, grid: { ...DEFAULT_GRID, ...s.grid }, photos: s.photos || [],
    view: s.view || null, draw: s.draw || null, board: s.board || { ...DEFAULT_RECT },
    fog: s.fog || null, luce: s.luce || null, vista: s.vista || null
  };
}

/** toccati: i campi del mondo cambiati (da una differenza); senza, si ripassa tutto. */
async function applyWorld(w, toccati) {
  const t = k => !toccati || toccati.has(k);
  NET.world = w;
  NET.applying = true;
  try {
    if (t('sheets') || t('schedeTolte')) mergeSheets(w.sheets, w.schedeTolte);
    if (w.notes && t('notes') && typeof noteDalServer === 'function') noteDalServer(w.notes, false);
    if (w.sistema && t('sistema') && typeof sistemaDalMaster === 'function') sistemaDalMaster(w.sistema);
    if (w.compendio && t('compendio') && typeof compendioDalMaster === 'function') compendioDalMaster(w.compendio);
    if (Array.isArray(w.chat)) {
      chat = w.chat;
      if (typeof renderChat === 'function') renderChat();
    }
    settings.publicScene = w.publicScene || null;
    if (!isMaster()) settings.fogColor = w.fogColor || 'auto';     // il colore della nebbia lo decide chi conduce
    if (!isMaster() && t('turni') && typeof turniDaMondo === 'function') turniDaMondo(w.turni);
    // la musica cambiata mentre eri scollegato (o con la linea debole): arriva con il mondo
    // (all'ingresso no, come prima: parte quando il master la cambia)
    if (!isMaster() && t('music')) {
      const j = JSON.stringify(w.music || null);
      if (w.music && NET.musicaServer !== undefined && j !== NET.musicaServer && typeof musicApply === 'function') musicApply(w.music);
      NET.musicaServer = j;
    }

    if (!t('scenes') && !t('active')) { /* le scene non sono cambiate */ }
    else if (isMaster()) {
      // Il mondo del master è il suo: dal server prende solo quello che hanno fatto gli altri.
      mergeIntoCurrent(w);
    } else if (Array.isArray(w.scenes) && w.scenes.length) {
      const keepId = cur && cur.id;
      scenes = w.scenes.map(normScene);
      // La vista (dove guardi e quanto zoom) è di ciascuno: quella salvata dal master non conta.
      // La prima volta che vedi una scena si adatta allo schermo, poi resta dove l'hai portata tu.
      for (const s of scenes) s.view = NET.views[s.id] || null;
      const want = scenes.find(s => s.id === w.active) || scenes.find(s => s.id === keepId) || scenes[0];
      if (cur && want.id === keepId && world.isConnected) aggiornaSulPosto(want);   // stessa scena: si cambia solo quello che è cambiato
      else { cur = null; await showScene(want); }  // scena nuova: si ridisegna da zero
    }
    rememberPhotos();
    if (typeof fogApply === 'function') fogApply();
    if (typeof luceRidisegna === 'function') luceRidisegna();
  } finally {
    NET.applying = false;
  }
}

/**
 * Per il giocatore, quando arriva il mondo e la scena è la stessa: si aggiornano solo i segnalini cambiati
 * (posizione, nome, effetti, immagine), si aggiungono quelli nuovi e si tolgono quelli spariti. Così la
 * selezione resta e un trascinamento in corso non si interrompe (prima si ridisegnava tutto).
 */
function aggiornaSulPosto(sc) {
  const prima = cur;
  cur = sc; grid = sc.grid;
  const uguale = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  if (!uguale(prima.board, sc.board)) setBoard(sc.board);
  if (!uguale(prima.grid, sc.grid)) paintGrid();
  if (!uguale(prima.bg, sc.bg)) {
    const url = resolveUrl(sc.bg);
    setBgBox(url ? { ...sc.bg, url, gid: sc.bg.gid || (String(sc.bg.url).startsWith('gs:') ? sc.bg.url.slice(3) : undefined) } : null);
    if (typeof updatePageColor === 'function') updatePageColor();
  }
  if (!uguale(prima.draw, sc.draw) && typeof drawLoad === 'function') drawLoad(sc.draw);
  const tutti = [...world.querySelectorAll('.photo')].filter(e => e.dataset.pid);
  const qui = new Map(tutti.filter(e => e.dataset.pid !== 'pending').map(e => [e.dataset.pid, e]));
  const vecchi = new Map((prima.photos || []).map(p => [p.id, p]));
  const visti = new Set();
  for (const p of sc.photos.slice().sort((a, b) => a.z - b.z)) {
    if (!p.id) continue;
    visti.add(p.id);
    let el = qui.get(p.id);
    const v = vecchi.get(p.id);
    // un disegno cambiato, un'immagine diversa o un altro livello: si rifà quel segnalino solo
    if (el && (p.shape ? !uguale(el._shape, p.shape) : (v && (v.url !== p.url || v.gid !== p.gid))) || (el && (el.dataset.layer || 'tokens') !== (p.layer || 'tokens'))) {
      const eraSel = selection.includes(el);
      el.remove(); el = null;
      const nuovo = creaDaDati(p);
      if (nuovo && eraSel) setSelection(selection.filter(x => x.isConnected).concat(nuovo));
      continue;
    }
    if (!el) { creaDaDati(p); continue; }
    // lo sta spostando chi guarda, o lo ha appena spostato e il server non ha ancora risposto: si lascia stare
    const muove = (el === activeEl && mode) || netMossaInAttesa(p.id);
    if (!muove) Object.assign(el.style, { left: p.l + 'px', top: p.t + 'px', width: p.w + 'px', height: p.h + 'px' });
    if (p.z && el.dataset.layer !== 'map') el.style.zIndex = p.z;
    if (!p.shape) datiSuSegnalino(el, p);
  }
  let tolti = false;
  for (const el of tutti) if (!visti.has(el.dataset.pid) && el !== activeEl) {
    const id = el.dataset.pid;
    // uno appena creato qui, che il server non aveva ancora confermato: al suo posto c'è quello vero
    if (id === 'pending' && selection.includes(el)) {
      const nuovo = [...world.querySelectorAll('.photo')].find(x => x.dataset.pid && !vecchi.has(x.dataset.pid) && x.dataset.owner === (NET.me && NET.me.token));
      if (nuovo) setSelection(selection.filter(x => x !== el).concat(nuovo));
    }
    el.remove(); tolti = true;
  }
  if (tolti) setSelection(selection.filter(x => x.isConnected));
  zTop = Math.max(zTop, ...sc.photos.map(p => +p.z || 0));
  if (typeof updateTokenBars === 'function') updateTokenBars();
  if (typeof hudDisegna === 'function') hudDisegna();
}

/** Le schede: si aggiornano quelle che ci sono, si aggiungono quelle nuove. Il master toglie quelle che un
 *  giocatore ha cancellato (il server le elenca in «schedeTolte»), altrimenti al salvataggio dopo le rimanderebbe. */
function mergeSheets(list, tolte) {
  if (!Array.isArray(list)) return;
  if (!isMaster()) { sheets = list; if (typeof renderSheetList === 'function') renderSheetList(); return; }
  let touched = false;
  if (Array.isArray(tolte) && tolte.length) {
    const via = new Set(tolte.filter(id => !list.some(s => s.id === id)));
    for (const s of sheets.filter(x => via.has(x.id))) {
      if (typeof wins !== 'undefined' && wins.get(s.id)) closeWin(wins.get(s.id));
      world.querySelectorAll('.photo').forEach(p => { if (p.dataset.sheet === s.id) delete p.dataset.sheet; });
      touched = true;
    }
    if (touched) sheets = sheets.filter(x => !via.has(x.id));
  }
  const have = new Map(sheets.map(s => [s.id, s]));
  for (const s of list) {
    const old = have.get(s.id);
    if (!old) { sheets.push(s); touched = true; continue; }
    if (JSON.stringify(old.f) !== JSON.stringify(s.f) || old.name !== s.name) {
      old.f = s.f; old.name = s.name; old.owner = s.owner; touched = true;
    }
    // l'icona cambiata da un giocatore (solo quelle già nel deposito della partita: le altre sono del master)
    if (s.icon && String(s.icon.url || '').startsWith('gs:') && JSON.stringify(old.icon || null) !== JSON.stringify(s.icon)) {
      old.icon = s.icon; touched = true;
      if (typeof wins !== 'undefined' && wins.get(old.id)) refreshWinIcon(wins.get(old.id));
    }
  }
  if (touched && typeof renderSheetList === 'function') renderSheetList();
}

/** Per il master: dalla scena del server prende i segnalini aggiunti, tolti o spostati dagli altri. */
function mergeIntoCurrent(w) {
  if (!cur) return;
  const sc = (w.scenes || []).find(s => s.id === cur.id);
  if (!sc) return;
  const byId = new Map((sc.photos || []).map(p => [p.id, p]));
  const here = new Set();
  for (const el of [...world.querySelectorAll('.photo')]) {
    const id = el.dataset.pid;
    if (!id || id === 'pending') continue;
    const p = byId.get(id);
    if (!p) { if (NET.photosById.has(id)) el.remove(); continue; }   // tolto da qualcun altro
    here.add(id);
    if (el === activeEl || mode) continue;                           // il master lo sta muovendo adesso
    if (Math.abs(num(el, 'left') - p.l) > 0.5) el.style.left = p.l + 'px';
    if (Math.abs(num(el, 'top') - p.t) > 0.5) el.style.top = p.t + 'px';
    // l'immagine cambiata da un giocatore (la sua icona nuova): la prende anche il master
    const prima = NET.photosById.get(id), img = el.querySelector('img');
    if (img && prima && prima.url !== p.url && String(p.url || '').startsWith('gs:')) {
      const u = resolveUrl(p); if (u) { img.src = u; el.dataset.gid = p.url.slice(3); }
    }
  }
  for (const [id, p] of byId) {
    if (here.has(id)) continue;
    if ([...world.querySelectorAll('.photo')].some(e => e.dataset.pid === id)) continue;
    const url = resolveUrl(p);
    const el = p.shape ? createShape(p.shape, p.w, p.h, p.l, p.t, p.layer, true)
      : url ? createPhoto(url, p.w, p.h, p.l, p.t, p.aid, true, p.layer) : null;
    if (!el) continue;
    el.dataset.pid = id;
    for (const k of ['sheet', 'name', 'round', 'ring']) if (p[k]) el.dataset[k] = p[k];
    if (typeof applyLook === 'function') applyLook(el);
    if (typeof fxDaDati === 'function') fxDaDati(el, p);
  }
  if (sc.fog !== undefined) cur.fog = sc.fog;
  // le porte aperte o chiuse dai giocatori
  if (sc.luce && Array.isArray(sc.luce.muri) && cur.luce && Array.isArray(cur.luce.muri)) {
    const porte = new Map(sc.luce.muri.filter(m => m.porta).map(m => [m.id, !!m.aperta]));
    for (const m of cur.luce.muri) if (m.porta && porte.has(m.id)) m.aperta = porte.get(m.id);
  }
  if (typeof updateTokenBars === 'function') updateTokenBars();
}

function rememberPhotos() {
  NET.photosById = new Map();
  const sc = NET.world && (NET.world.scenes || []).find(s => s.id === (cur && cur.id));
  for (const p of (sc && sc.photos) || []) NET.photosById.set(p.id, { l: p.l, t: p.t, w: p.w, h: p.h, url: p.url });
}

// ---------- Quello che manda il browser ----------
// Il master manda tutto il mondo; il giocatore manda solo quello che ha cambiato.
async function netPushBoard() {
  if (!NET.on || !isMaster() || NET.applying || NET.pushing) return;
  NET.pushing = true;
  try {
    const b = boardState();
    await netEnsureWorldAssets(b.scenes, sheets);
    // l'hash torna anche sugli oggetti vivi, così non si ricarica la stessa immagine ogni volta
    for (const sc of b.scenes) {
      const live = scenes.find(x => x.id === sc.id);
      if (live && sc.bg && sc.bg.gid) { live.bg = live.bg || {}; live.bg.gid = sc.bg.gid; if (cur && cur.id === sc.id) bgBox.dataset.gid = sc.bg.gid; }
      for (const ph of sc.photos || []) if (ph.gid) {
        const el = [...world.querySelectorAll('.photo')].find(e => e.dataset.pid === ph.id);
        if (el) el.dataset.gid = ph.gid;
      }
    }
    const compendio = typeof COMPENDIO !== 'undefined' && COMPENDIO.perRete ? await COMPENDIO.perRete().catch(() => null) : null;
    intent('board', { board: { compendio, active: b.active, publicScene: settings.publicScene, fogColor: settings.fogColor, dadiProvvisori: !!settings.dadiProvvisori, unita: settings.unit, turni: settings.turni || null, scenes: b.scenes, sheets, sistema: typeof SISTEMA !== 'undefined' && SISTEMA.perRete ? SISTEMA.perRete() : null } });
  } finally { NET.pushing = false; }
}

function netPushPlayerChanges() {
  if (!netAs() || isMaster() || NET.applying || !cur) return;
  const seen = new Set();
  for (const el of world.querySelectorAll('.photo')) {
    const id = el.dataset.pid;
    const box = { l: num(el, 'left'), t: num(el, 'top'), w: num(el, 'width'), h: num(el, 'height') };
    if (id && NET.photosById.has(id)) {
      seen.add(id);
      const was = NET.photosById.get(id);
      if (Math.abs(was.l - box.l) > 0.5 || Math.abs(was.t - box.t) > 0.5 || Math.abs(was.w - box.w) > 0.5) {
        intent('token.move', { scene: cur.id, id, pos: box });
        NET.ultimoMosso = el;
        Object.assign(was, box);
      }
    } else if (!id) {
      const img = el.querySelector('img');
      intent('token.add', { scene: cur.id, token: {
        url: img ? rifImmagine(img.getAttribute('src'), el.dataset.gid) : undefined, shape: el._shape,
        layer: 'tokens', ...box, sheet: el.dataset.sheet, name: el.dataset.name,
        round: el.dataset.round, ring: el.dataset.ring
      } });
      el.dataset.pid = 'pending';                 // non rimandarlo finché il server non risponde
    }
  }
  for (const id of NET.photosById.keys()) if (!seen.has(id)) intent('token.del', { scene: cur.id, id });
}

// ---------- Aggancio alle funzioni che c'erano già ----------
// Ogni volta che la vista cambia (tasto destro, rotella, pulsanti di zoom) ce la teniamo per noi.
var applyView = (prev => function () {
  prev();
  if (!NET.on || !cur || isMaster()) return;
  NET.views[cur.id] = { x: view.x, y: view.y, s: view.s };
  clearTimeout(NET._viewT);
  NET._viewT = setTimeout(() => { try { localStorage.setItem('uffa-views', JSON.stringify(NET.views)); } catch {} }, 400);
})(applyView);

// Salvataggio della mappa: per il master è anche l'invio al server.
var scheduleBoardSave = (prev => function () {
  prev();
  if (!netAs() || NET.applying) return;                    // anche scollegati per un momento: va in coda
  clearTimeout(NET._pushT);
  NET._pushT = setTimeout(() => { isMaster() ? netPushBoard() : netPushPlayerChanges(); }, 160);
})(scheduleBoardSave);

// Chat e tiri: quando c'è il server, li scrive lui.
var addChat = (prev => function (m) {
  if (netAs() && !netFromServer && (m.kind === 'text' || m.kind === 'rule')) {
    const op = m.kind === 'text' ? 'chat' : 'rule';
    const x = m.kind === 'text' ? (m.to ? { text: m.text, to: m.to } : { text: m.text }) : { title: m.title, text: m.text };
    const via = NET.on && !NET.hostDown;
    intent(op, x);
    if (via) return;
    // scollegati: il messaggio aspetta in coda; intanto lo si vede, in grigio, finché non torna dal server
    const id = 'attesa-' + NET.n;
    prev({ ...m, id, by: NET.me && NET.me.name, byId: NET.me && NET.me.token, inAttesa: true });
    chatLog.querySelectorAll('.msg').forEach(el => { if (el.dataset.id === id) el.classList.add('inAttesa'); });
    return;
  }
  if (NET.on && !netFromServer && m.kind === 'roll') return;   // i tiri passano da rollExpr / rollDice
  return prev(m);
})(addChat);
function netChat(msg) {
  if (msg && msg.id) NET.chatUltimo = msg.id;
  // il proprio tiro provvisorio è arrivato al server: via la copia grigia
  if (msg && msg.provvisorio && NET.me && msg.byId === NET.me.token) {
    const grigio = chat.find(x => x.inAttesa && x.provvisorio && x.label === msg.label && x.total === msg.total);
    if (grigio) { netFromServer = true; try { deleteChat(grigio.id); } finally { netFromServer = false; } }
  }
  // il proprio messaggio scritto da scollegati è arrivato davvero: via la copia grigia
  if (msg && NET.me && msg.byId === NET.me.token && (msg.kind === 'text' || msg.kind === 'rule')) {
    const grigio = chat.find(x => x.inAttesa && x.text === msg.text && x.kind === msg.kind);
    if (grigio) { netFromServer = true; try { deleteChat(grigio.id); } finally { netFromServer = false; } }
  }
  netFromServer = true;
  try { addChat(msg); } finally { netFromServer = false; }
  // il proprio tiro, tornato dal server: il risultato anche sotto ai dadi
  if (msg && msg.kind === 'roll' && !msg.hidden && NET.me && msg.byId === NET.me.token) diceShowLast(msg);
}

// In rete i dadi li tira il server: qui si manda solo l'espressione (già con vantaggio o
// svantaggio) e se è segreto. Il server la controlla da capo e decide chi vede il risultato.
var rollExpr = (prev => function (expr, label) {
  if (NET.retrying || NET.hostDown) {
    // scollegati: se il master lo permette si tira qui, «in provvisorio»; il tiro parte al ritorno, segnato come non verificato
    if (NET.world && NET.world.dadiProvvisori && can('roll')) return netTiroProvvisorio(expr, label);
    netSay('Sei scollegato: il tiro partirà quando torna il collegamento. Riprova tra un attimo.', 'warn'); return true;
  }
  if (!NET.on) return prev(expr, label);
  if (!can('roll')) { netSay('Non puoi tirare i dadi.', 'warn'); return true; }
  const d = diceApply(expr);
  if (!parseExpr(d.expr)) return false;                     // si vede subito se è scritto male
  intent('roll', { expr: d.expr, label: label || String(expr).replace(/\s+/g, ''), secret: d.secret, doppio: !!window.tiroDoppio, crit: window.tiroCritico || undefined, rif: window.tiroRif || undefined });
  diceLast.textContent = 'Tiro mandato al server…';
  return true;
})(rollExpr);

/** Un tiro fatto da scollegati: i dadi li tira questo dispositivo; si vede subito (in grigio) e parte al ritorno.
 *  Il server controlla che i dadi tornino con la formula e lo mette in chat con «⚠ non verificato». */
function netTiroProvvisorio(expr, label) {
  const d = diceApply(expr);
  const r = parseExpr(d.expr);
  if (!r) return false;
  const lab = label || String(expr).replace(/\s+/g, '');
  intent('roll.prov', { expr: d.expr, label: lab, dadi: r.rolls.map(Math.abs), secret: d.secret, quando: Date.now() });
  const id = 'attesa-' + NET.n;
  netFromServer = true;
  try { addChat({ kind: 'roll', label: lab, ...r, secret: d.secret || undefined, provvisorio: true, inAttesa: true, id, by: NET.me && NET.me.name, byId: NET.me && NET.me.token }); } finally { netFromServer = false; }
  chatLog.querySelectorAll('.msg').forEach(el => { if (el.dataset.id === id) el.classList.add('inAttesa'); });
  if (typeof diceLast !== 'undefined') diceLast.textContent = tr('Tiro provvisorio: {n} (parte quando torna il collegamento)', { n: r.total });
  return true;
}

// Ping: lo vedono tutti.
var startPing = (prev => function (x, y) {
  if (NET.on) {
    if (!can('ping')) { netSay('Non puoi fare ping.', 'warn'); return; }
    if (!netFromServer) intent('ping', { x: (x - view.x) / view.s, y: (y - view.y) / view.s, color: settings.ping.color });
  }
  return prev(x, y);
})(startPing);

// Musica: la sceglie chi ne ha il permesso.
if (typeof musicSet === 'function') {
  var musicSet = (prev => function (patch) {
    if (NET.on && !can('controlMusic')) { netSay('La musica la sceglie chi conduce.', 'warn'); return; }
    prev(patch);
    if (NET.on) intent('music', { state: { ...settings.music } });
  })(musicSet);
}

// Schede: quando c'è il server è lui a tenerle. Si manda quella che si sta scrivendo.
addEventListener('input', e => {
  if (!netAs() || isMaster() || NET.applying) return;
  const w = e.target.closest && e.target.closest('.sheetWin');
  if (!w || !w._sheet) return;
  const s = w._sheet;
  // la finestra può tenere la copia di quando la scheda è nata: i permessi si guardano anche su quella del server
  const srv = sheets.find(x => x.id === s.id);
  const mia = o => o && (o._access === 'rw' || (NET.me && o.owner === NET.me.token) || o._mia);
  if (!(mia(s) || mia(srv))) return;
  clearTimeout(NET._shT);
  NET._shT = setTimeout(() => intent('sheet.save', { id: s.id, name: s.name, f: s.f, icon: s.icon }), 400);
}, true);

// ---------- Che cosa può toccare chi non conduce ----------
function applyRole() {
  const b = document.body;
  const on = netAs();                       // collegato, o solo momentaneamente caduto
  b.classList.toggle('net-on', on);
  b.classList.toggle('net-player', on && !isMaster());
  b.classList.toggle('net-retry', !NET.on && on);
  for (const p of ['seeHiddenLayer', 'seeAllScenes', 'editScene', 'uploadAssets', 'draw', 'revealFog', 'controlMusic', 'createTokens', 'ping', 'roll', 'chat']) {
    b.classList.toggle('no-' + p, on && !can(p));
  }
  // se il livello nascosto è vietato e ci sei dentro, torna ai segnalini
  if (on && !can('seeHiddenLayer') && layer === 'hidden') setLayer('tokens');
  if (on && !can('editScene') && layer === 'map') setLayer('tokens');
  if (typeof musicRefresh === 'function') musicRefresh();
  if (typeof fogApply === 'function') fogApply();
}

// Blocca i tasti che non deve poter usare chi non ha il permesso.
addEventListener('pointerdown', e => {
  if (!netAs() || isMaster()) return;
  if (!can('editScene') && e.target.closest('#sceneBtn, #sceneMenu, #sceneNew, [data-layer="map"]')) {
    e.stopPropagation(); e.preventDefault(); netSay('La scena la cambia chi conduce.', 'warn');
  }
  if (!can('seeHiddenLayer') && e.target.closest('[data-layer="hidden"]')) {
    e.stopPropagation(); e.preventDefault(); netSay('Il livello nascosto non è per te.', 'warn');
  }
  if (!can('uploadAssets') && e.target.closest('label[for="upload"], #newFolder')) {
    e.stopPropagation(); e.preventDefault();
    netSay('Puoi usare le foto del tuo computer solo per creare un segnalino (strumento Segnalini → Immagine).', 'warn');
  }
}, true);
addEventListener('click', e => {
  if (!netAs() || isMaster() || can('uploadAssets')) return;
  if (e.target.closest('label[for="upload"], #newFolder')) { e.stopPropagation(); e.preventDefault(); }
}, true);

// Un giocatore non può muovere i segnalini che non sono suoi: glielo si dice subito,
// ma la parola definitiva resta del server.
function netCanMove(el) {
  if (!netAs() || isMaster()) return true;
  if (can('moveAnyToken')) return true;
  if (!can('moveOwnTokens')) return false;
  const id = el.dataset.pid;
  const sc = NET.world && (NET.world.scenes || []).find(s => s.id === (cur && cur.id));
  const p = sc && (sc.photos || []).find(x => x.id === id);
  if (!p) return true;                            // appena creato da lui
  if (p.owner && p.owner === NET.me.token) return true;
  const sh = p.sheet && sheets.find(s => s.id === p.sheet);
  return !!(sh && (sh.owner === NET.me.token || sh._access === 'rw'));
}
// Segnalini impilati: per un giocatore vale il primo, dall'alto, che può muovere; se nessuno è suo,
// quello più in alto (e il messaggio qui sotto). Il master sceglie sempre quello in cima.
fotoDelClic = function (e) {                                                   // eslint-disable-line no-global-assign
  const sopra = e.target.closest('.photo');
  if (!sopra || !netAs() || isMaster() || netCanMove(sopra)) return sopra;
  const sotto = document.elementsFromPoint(e.clientX, e.clientY)
    .map(x => x.closest && x.closest('.photo')).filter(Boolean)
    .find(p => (p.dataset.layer || 'tokens') === 'tokens' && netCanMove(p));
  return sotto || sopra;
};
viewport.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !netAs() || isMaster()) return;
  const el = fotoDelClic(e);
  if (el && !netCanMove(el)) {
    e.stopImmediatePropagation(); e.preventDefault();
    netSay('Questo segnalino non è tuo.', 'warn');
  }
}, true);

// ---------- Nome con cui ti presenti ----------
document.body.insertAdjacentHTML('beforeend', `
<dialog id="nameDialog">
  <form method="dialog" id="nameForm">
    <h3>Come ti chiami al tavolo?</h3>
    <p class="note" id="nameWhy">Il nome compare in chat e serve al master per darti le schede.</p>
    <label class="field">Nome <input id="nameInput" type="text" maxlength="40" autocomplete="off" placeholder="Es. Pino"></label>
    <div class="dialogBtns"><button type="submit" class="btn">Va bene</button></div>
  </form>
</dialog>`);

function askName(why) {
  const dlg = $('nameDialog'), inp = $('nameInput');
  $('nameWhy').textContent = why || 'Il nome compare in chat e serve al master per darti le schede.';
  inp.value = netName() || (NET.me && NET.me.name) || '';
  if (!dlg.open) dlg.showModal();
  setTimeout(() => inp.select(), 0);
}
$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('nameInput').value.trim().slice(0, 40);
  if (n.length < 2) { $('nameWhy').textContent = 'Serve almeno di due lettere.'; return; }
  try { localStorage.setItem('uffa-name', n); } catch {}
  netSend({ t: 'name', name: n });
  $('nameDialog').close();
});
const netAskName = () => askName();

// ---------- Le schede: quando nascono e quando spariscono il server lo deve sapere ----------
function onSheetCreated(s) {
  if (!NET.on || NET.applying) return;
  if (isMaster()) { netPushBoard(); return; }
  s._mia = true;                                  // l'ha creata questo giocatore: può scriverci subito
  intent('sheet.add', { sheet: { id: s.id, name: s.name, tpl: s.tpl, icon: s.icon, f: s.f } });
}
// L'icona di una scheda cambiata dal menu: senza questo restava solo su questo computer,
// e chi trascinava la scheda sulla mappa (o ricaricava) vedeva ancora quella di prima.
async function onSheetIcon(s) {
  if (!NET.on || NET.applying) return;
  if (isMaster()) { netPushBoard(); return; }
  // un giocatore: un'immagine del suo computer va prima nel deposito della partita (piccola: 256 px, WebP),
  // così la vedono tutti; poi la scheda (e i suoi segnalini) la usano con «gs:<hash>»
  let u = s.icon && (s.icon.gid ? 'gs:' + s.icon.gid : String(s.icon.url || ''));
  if (u && !/^(gs:|data:image\/)/.test(u)) {
    const hash = await netCaricaIcona(u, s.name);
    if (!hash) { netSay('Non sono riuscito a mandare l\'immagine: gli altri vedranno l\'icona di prima.', 'warn'); return; }
    s.icon = { url: 'gs:' + hash, gid: hash }; u = s.icon.url;
  }
  intent('sheet.save', { id: s.id, name: s.name, f: s.f, icon: u ? { url: u, gid: s.icon.gid } : null });
}
/** Un'immagine (indirizzo o file) → al massimo 256 px, WebP → nel deposito della partita. Restituisce l'hash. */
async function netCaricaIcona(sorgente, nome) {
  if (!can('uploadTokenImage') && !can('uploadAssets')) return null;
  try {
    const blob = sorgente instanceof Blob ? sorgente : await (await fetch(sorgente)).blob();
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, 'image/webp', 0.86));
    const buf = new Uint8Array(await out.arrayBuffer());
    const hash = toHex(await crypto.subtle.digest('SHA-256', buf));
    if (!NET.assetKnown.has(hash) && !await netPutAsset(hash, buf, 'image/webp', (nome || 'segnalino') + '.webp')) return null;
    NET.assetKnown.add(hash);
    return hash;
  } catch (e) { console.warn('icona', e); return null; }
}
/** «Cambia icona…» di una scheda. Un giocatore senza il permesso degli assets sceglie una foto dal suo computer. */
function scegliIconaScheda(s) {
  if (!s) return;
  if (!NET.on || isMaster() || can('uploadAssets')) { pickAsset(a => setSheetIcon(s, a)); return; }
  if (!can('uploadTokenImage')) { netSay('Il master non ti ha dato il permesso di usare una tua immagine.', 'warn'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    netSay('Mando la tua immagine…');
    const hash = await netCaricaIcona(f, s.name);
    if (!hash) { netSay('Non sono riuscito a mandare l\'immagine.', 'warn'); return; }
    setSheetIcon(s, { url: 'gs:' + hash, gid: hash });
  });
  inp.click();
}
// Messaggi cancellati: lo decide il server, che lo dice a tutti.
function chatPuoCancellare(m) { return !NET.on || isMaster() || (!!m.byId && !!NET.me && m.byId === NET.me.token); }
var deleteChat = (prev => function (id) {
  if (NET.on && !netFromServer) { intent('chat.del', { id }); return; }
  prev(id);
})(deleteChat);
/** Una scheda che chi guarda può cancellare: in partita il giocatore solo le sue. */
function schedaMia(s) { return !NET.on || isMaster() || !!s._mia || (!!NET.me && s.owner === NET.me.token); }
function onSheetDeleted(id) {
  if (!NET.on || NET.applying) return;
  intent('sheet.del', { id });
}

// Ogni tanto si dice al server che cosa si sta guardando: serve al master per orientarsi.
NET._tel = 0;
setInterval(() => {
  if (!NET.on || !cur) return;
  if (NET.leggera && (++NET._tel % 5)) return;                // con il collegamento debole, una volta ogni 20 secondi
  netSend({ t: 'telemetry', scene: cur.id, view: { x: view.x, y: view.y, s: view.s } });
}, 4000);

addEventListener('DOMContentLoaded', () => setTimeout(netConnect, 600));

// ---------- Riquadro «Sessione» nelle impostazioni ----------
function netSyncForm() {
  const st = $('netState'), ni = $('netNameIn'), pi = $('netPortIn');
  if (!st) return;
  if (!pi.matches(':focus')) pi.value = NET.port || '';
  pi.placeholder = 'nessuno (da solo)';
  const pn = $('netPanel'); if (pn && NET.port) pn.href = 'http://127.0.0.1:' + NET.port + '/?lang=' + (window.LIBRE_I18N ? LIBRE_I18N.lingua : 'it');
  if (!ni.matches(':focus')) ni.value = netName() || (NET.me && NET.me.name) || '';
  st.textContent = NET.retrying
    ? `Collegamento perso: mi sto ricollegando da solo (tentativo ${NET.tries}).`
    : NET.hostDown
      ? 'Il collegamento con chi conduce si è interrotto: mi sto ricollegando da solo.'
      : NET.manual
        ? 'Ti sei scollegato a mano: non riprovo finché non premi «Collegati adesso».'
        : !NET.on
          ? (document.documentElement.classList.contains('ui-touch') ? 'Non collegato: stai giocando da solo su questo dispositivo.' : 'Non collegato: stai giocando da solo su questo computer.')
          : NET.me.role === 'master'
            ? `Stai conducendo tu. Collegati adesso: ${NET.players.length}.`
            : `Sei un giocatore in questa sessione (${NET.me.name}).`;
  const lv = $('netLeave');
  if (lv) lv.hidden = !(NET.on || NET.retrying || NET.hostDown);
  const dp = $('netDadiProv');
  if (dp) { dp.closest('label').hidden = !(NET.on && isMaster()); dp.checked = !!settings.dadiProvvisori; }
  // per chi conduce: com'è il collegamento di ciascun giocatore (pallino verde, giallo, rosso)
  const ul = $('netGiocatori');
  if (ul) {
    const altri = NET.on && isMaster() ? NET.players.filter(p => p.token !== (NET.me && NET.me.token) && !p.pending) : [];
    ul.hidden = !altri.length;
    const DETTO = { verde: 'Collegamento buono', giallo: 'Collegamento debole', rosso: 'Collegamento pessimo' };
    const html = altri.map(p => `<li><span class="qDot q-${p.qualita || 'verde'}" title="${DETTO[p.qualita || 'verde']}"></span><span class="qNome" data-noi18n></span><span class="qRit">${p.rtt == null ? '' : p.rtt + ' ms'}${p.leggera ? ' · ' + tr('modalità leggera') : ''}</span></li>`).join('');
    if (ul._html !== html) {
      ul._html = html; ul.innerHTML = html;
      ul.querySelectorAll('.qNome').forEach((el, i) => { el.textContent = altri[i].name; });
    }
  }
}
// Il collegamento «torna all'avvio» ha senso solo se sei partito dall'app.
// Sta anche nel menu delle scene, dove si trova subito.
if ($('netHome')) {
  const home = [$('netHome'), $('sceneHome')].filter(Boolean);
  for (const a of home) { a.hidden = true; a.href = 'http://127.0.0.1:' + NET.uiPort + '/'; }
  fetch('http://127.0.0.1:' + NET.uiPort + '/api/vivo').then(r => {
    if (!r.ok) return;
    for (const a of home) a.hidden = false;
    // aperti dall'avviatore: gli si dice ogni tanto che la pagina c'è ancora
    setInterval(() => fetch('http://127.0.0.1:' + NET.uiPort + '/api/vivo').catch(() => {}), 20000);
  }).catch(() => {});
}
if ($('netNameIn')) {
  $('netNameIn').addEventListener('change', e => {
    const n = e.target.value.trim().slice(0, 40);
    try { localStorage.setItem('uffa-name', n); } catch {}
    netSend({ t: 'name', name: n });
  });
  $('netPortIn').addEventListener('change', e => {
    const v = Math.max(0, Math.min(65535, +e.target.value || 0));
    NET.port = v;
    try { localStorage.setItem('uffa-gs-port', v); } catch {}
  });
  $('netReconnect').addEventListener('click', () => { netReconnectNow(); netSyncForm(); });
  if ($('netDadiProv')) $('netDadiProv').addEventListener('input', e => { settings.dadiProvvisori = e.target.checked; scheduleBoardSave(); });
  $('netLeave').addEventListener('click', () => { netDisconnect(); netSyncForm(); });
  setInterval(netSyncForm, 2000);
  netSyncForm();
}
