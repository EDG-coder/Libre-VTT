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
  NET.port = g == null ? 4000 : Math.max(0, +g || 0);            // 0: da soli, nessun server da cercare
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
const intent = (op, extra) => { if (NET.on) netSend({ t: 'intent', op, ...extra }); };

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
    ws.send(JSON.stringify({ t: 'hello', token: netToken(), name: netName(), client: 'LIBRE VTT 2' }));
  };
  ws.onmessage = e => {
    if (NET.ws !== ws) return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    netHandle(m);
  };
  ws.onclose = () => {
    if (NET.ws !== ws) return;                                // uno vecchio, già sostituito
    NET.ws = null;
    const was = NET.on;
    NET.on = false;
    if (NET.everOn && !NET.manual && !NET.stopped) NET.retrying = true;
    if (was) applyRole();
    netRetry();
  };
  ws.onerror = () => {};
}
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
    netSay(`Collegamento perso: mi ricollego da solo… (tentativo ${NET.tries})`, 'retry',
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
    case 'welcome': {
      const back = NET.retrying || NET.hostDown;
      NET.on = true; NET.everOn = true; NET.me = m.you;
      NET.retrying = false; NET.hostDown = false; NET.tries = 0; NET.pending = false;
      try { localStorage.setItem('uffa-token', m.you.token); } catch {}
      if (back) netSay('Ricollegato: sei di nuovo nella sessione.', 'live');
      else netSay(m.you.role === 'master'
        ? 'Sei collegato come master: la sessione è tua.'
        : 'Sei collegato come giocatore (' + m.you.name + ').', 'live');
      if (back) setTimeout(() => { if (netBar.className === 'live') netSayHide(); }, 4000);
      applyRole();
      if (m.world) applyWorld(m.world);
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
    case 'world': applyWorld(m.world); return;
    case 'players': NET.players = m.list || []; return;
    case 'chat': netChat(m.msg); return;
    case 'ping': {
      const x = m.x * view.s + view.x, y = m.y * view.s + view.y;
      netFromServer = true;
      try { startPing(x, y); } finally { netFromServer = false; }
      return;
    }
    case 'music':
      if (typeof musicApply === 'function' && m.state) musicApply(m.state);
      return;
    case 'denied':
      netSay('Non si può: ' + (m.reason || 'il master non te l\'ha permesso.'), 'warn');
      if (NET.world) applyWorld(NET.world);      // rimetti le cose come stanno davvero
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

const netAssetUrl = hash => 'http://127.0.0.1:' + NET.port + '/asset/' + hash;

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

// ---------- Il mondo che arriva dal server ----------
function normScene(s) {
  return {
    id: s.id, name: s.name || 'Scena', type: s.type === 'cinematic' ? 'cinematic' : 'map',
    bg: s.bg || null, grid: { ...DEFAULT_GRID, ...s.grid }, photos: s.photos || [],
    view: s.view || null, draw: s.draw || null, board: s.board || { ...DEFAULT_RECT },
    fog: s.fog || null
  };
}

async function applyWorld(w) {
  NET.world = w;
  NET.applying = true;
  try {
    mergeSheets(w.sheets);
    if (Array.isArray(w.chat)) {
      chat = w.chat;
      if (typeof renderChat === 'function') renderChat();
    }
    settings.publicScene = w.publicScene || null;
    if (!isMaster()) settings.fogColor = w.fogColor || 'auto';     // il colore della nebbia lo decide chi conduce
    if (!isMaster() && typeof turniDaMondo === 'function') turniDaMondo(w.turni);

    if (isMaster()) {
      // Il mondo del master è il suo: dal server prende solo quello che hanno fatto gli altri.
      mergeIntoCurrent(w);
    } else if (Array.isArray(w.scenes) && w.scenes.length) {
      const keepId = cur && cur.id;
      scenes = w.scenes.map(normScene);
      // La vista (dove guardi e quanto zoom) è di ciascuno: quella salvata dal master non conta.
      // La prima volta che vedi una scena si adatta allo schermo, poi resta dove l'hai portata tu.
      for (const s of scenes) s.view = NET.views[s.id] || null;
      const want = scenes.find(s => s.id === w.active) || scenes.find(s => s.id === keepId) || scenes[0];
      cur = null;                                  // ridisegna da zero con quello che manda il server
      await showScene(want);
    }
    rememberPhotos();
    if (typeof fogApply === 'function') fogApply();
  } finally {
    NET.applying = false;
  }
}

/** Le schede: si aggiornano quelle che ci sono, si aggiungono quelle nuove. */
function mergeSheets(list) {
  if (!Array.isArray(list)) return;
  if (!isMaster()) { sheets = list; if (typeof renderSheetList === 'function') renderSheetList(); return; }
  let touched = false;
  const have = new Map(sheets.map(s => [s.id, s]));
  for (const s of list) {
    const old = have.get(s.id);
    if (!old) { sheets.push(s); touched = true; continue; }
    if (JSON.stringify(old.f) !== JSON.stringify(s.f) || old.name !== s.name) {
      old.f = s.f; old.name = s.name; old.owner = s.owner; touched = true;
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
  if (typeof updateTokenBars === 'function') updateTokenBars();
}

function rememberPhotos() {
  NET.photosById = new Map();
  const sc = NET.world && (NET.world.scenes || []).find(s => s.id === (cur && cur.id));
  for (const p of (sc && sc.photos) || []) NET.photosById.set(p.id, { l: p.l, t: p.t, w: p.w, h: p.h });
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
    intent('board', { board: { active: b.active, publicScene: settings.publicScene, fogColor: settings.fogColor, turni: settings.turni || null, scenes: b.scenes, sheets } });
  } finally { NET.pushing = false; }
}

function netPushPlayerChanges() {
  if (!NET.on || isMaster() || NET.applying || !cur) return;
  const seen = new Set();
  for (const el of world.querySelectorAll('.photo')) {
    const id = el.dataset.pid;
    const box = { l: num(el, 'left'), t: num(el, 'top'), w: num(el, 'width'), h: num(el, 'height') };
    if (id && NET.photosById.has(id)) {
      seen.add(id);
      const was = NET.photosById.get(id);
      if (Math.abs(was.l - box.l) > 0.5 || Math.abs(was.t - box.t) > 0.5 || Math.abs(was.w - box.w) > 0.5) {
        intent('token.move', { scene: cur.id, id, pos: box });
        Object.assign(was, box);
      }
    } else if (!id) {
      const img = el.querySelector('img');
      intent('token.add', { scene: cur.id, token: {
        url: img ? img.getAttribute('src') : undefined, shape: el._shape,
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
  if (!NET.on || NET.applying) return;
  clearTimeout(NET._pushT);
  NET._pushT = setTimeout(() => { isMaster() ? netPushBoard() : netPushPlayerChanges(); }, 160);
})(scheduleBoardSave);

// Chat e tiri: quando c'è il server, li scrive lui.
var addChat = (prev => function (m) {
  if ((NET.retrying || NET.hostDown) && !netFromServer && (m.kind === 'text' || m.kind === 'rule')) {
    netSay('Sei scollegato: il messaggio non è partito. Riprova appena torna il collegamento.', 'warn');
    return;
  }
  if (NET.on && !netFromServer) {
    if (m.kind === 'text') return intent('chat', { text: m.text });
    if (m.kind === 'rule') return intent('rule', { title: m.title, text: m.text });
    if (m.kind === 'roll') return;               // i tiri passano da rollExpr / rollDice
  }
  return prev(m);
})(addChat);
function netChat(msg) {
  netFromServer = true;
  try { addChat(msg); } finally { netFromServer = false; }
  // il proprio tiro, tornato dal server: il risultato anche sotto ai dadi
  if (msg && msg.kind === 'roll' && !msg.hidden && NET.me && msg.byId === NET.me.token) diceShowLast(msg);
}

// In rete i dadi li tira il server: qui si manda solo l'espressione (già con vantaggio o
// svantaggio) e se è segreto. Il server la controlla da capo e decide chi vede il risultato.
var rollExpr = (prev => function (expr, label) {
  if (NET.retrying || NET.hostDown) { netSay('Sei scollegato: il tiro partirà quando torna il collegamento. Riprova tra un attimo.', 'warn'); return true; }
  if (!NET.on) return prev(expr, label);
  if (!can('roll')) { netSay('Non puoi tirare i dadi.', 'warn'); return true; }
  const d = diceApply(expr);
  if (!parseExpr(d.expr)) return false;                     // si vede subito se è scritto male
  intent('roll', { expr: d.expr, label: label || String(expr).replace(/\s+/g, ''), secret: d.secret });
  diceLast.textContent = 'Tiro mandato al server…';
  return true;
})(rollExpr);

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
  if (!NET.on || isMaster() || NET.applying) return;
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
viewport.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !netAs() || isMaster()) return;
  const el = e.target.closest('.photo');
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
function onSheetDeleted(id) {
  if (!NET.on || NET.applying) return;
  intent('sheet.del', { id });
}

// Ogni tanto si dice al server che cosa si sta guardando: serve al master per orientarsi.
setInterval(() => {
  if (!NET.on || !cur) return;
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
          ? 'Non collegato: stai giocando da solo su questo computer.'
          : NET.me.role === 'master'
            ? `Stai conducendo tu. Collegati adesso: ${NET.players.length}.`
            : `Sei un giocatore in questa sessione (${NET.me.name}).`;
  const lv = $('netLeave');
  if (lv) lv.hidden = !(NET.on || NET.retrying || NET.hostDown);
}
// Il collegamento «torna all'avvio» ha senso solo se sei partito dall'app.
if ($('netHome')) {
  $('netHome').hidden = true;
  $('netHome').href = 'http://127.0.0.1:' + NET.uiPort + '/';
  fetch('http://127.0.0.1:' + NET.uiPort + '/api/vivo').then(r => {
    if (!r.ok) return;
    $('netHome').hidden = false;
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
  $('netLeave').addEventListener('click', () => { netDisconnect(); netSyncForm(); });
  setInterval(netSyncForm, 2000);
  netSyncForm();
}
