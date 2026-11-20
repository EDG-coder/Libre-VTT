// ---------- Soundboard: effetti sonori con un clic, per tutti, in parallelo alla musica ----------
// Il master prepara una o più «soundboard»: ogni suono ha un titolo, un'immagine e un file audio (breve: un
// effetto, non una canzone). Tutto resta salvato nella campagna (impostazioni + cartella suoni/).
// In rete i file vanno nel deposito della partita come le canzoni (musicCondividi), e ogni giocatore li scarica
// e li decodifica in anticipo: al clic non viaggia l'audio ma solo «parte il suono N» (op 'sound'), e ognuno lo
// suona subito dalla sua memoria. Il volume è di ciascuno e separato da quello della musica.
// Chi li può far partire lo decide il permesso «playSounds» (di default solo il master): chi non ce l'ha non vede
// lo strumento, ma sente i suoni.

const SND_VOL_KEY = 'libre-sound-vol';
const SND_MAX = 10 * 1024 * 1024;
const SND_TILES = 120;                       // quanti suoni al massimo in tutto
settings.soundboard = settings.soundboard || { boards: [], cur: '' };

const sndS = {
  vol: 80, muted: false,
  ctx: null, gain: null,
  buf: new Map(),                            // chiave (gid o file) -> AudioBuffer già pronto
  carica: new Map(),                         // chiave -> promessa del caricamento in corso
  fonti: new Set(),                          // i suoni che stanno suonando
  remoto: null,                              // la soundboard come arriva dal server (per chi non è master)
  modifica: false, editing: null,            // modo modifica; il suono aperto nel modulo ({ s, nuovo })
  inviata: '', ingresso: 0
};
try {
  const v = JSON.parse(localStorage.getItem(SND_VOL_KEY) || '{}');
  if (Number.isFinite(v.vol)) sndS.vol = Math.max(0, Math.min(100, v.vol));
  sndS.muted = !!v.muted;
} catch {}
const sndSalvaVol = () => { try { localStorage.setItem(SND_VOL_KEY, JSON.stringify({ vol: sndS.vol, muted: sndS.muted })); } catch {} };
const sndMaster = () => typeof isMaster !== 'function' || isMaster();
const sndRid = () => Math.random().toString(36).slice(2, 10);
const sndMime = n => (typeof musicMime === 'function' ? musicMime(n) : 'audio/mpeg');
const sndWarn = t => { const el = $('sbWarn'); if (el) { el.textContent = t || ''; el.hidden = !t; } };

// ---------- Dove stanno i file: cartella suoni/ della campagna (o, senza server, il browser) ----------
function sndIdb(modo, fn) {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('niente IndexedDB'));
    const r = indexedDB.open('libre-suoni', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('suoni', { keyPath: 'name' });
    r.onerror = () => no(r.error);
    r.onsuccess = () => {
      const d = r.result, t = d.transaction('suoni', modo), q = fn(t.objectStore('suoni'));
      let out; if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => { d.close(); ok(out); }; t.onerror = () => { d.close(); no(t.error); };
    };
  });
}
const sndLib = {
  srv: false, nomi: new Set(), blob: new Map(), pronta: null,
  init() {
    return this.pronta ||= (async () => {
      try {
        const r = await fetch('api/suoni');
        if (r.ok) { this.srv = true; this.nomi = new Set(((await r.json()).brani || []).map(b => b.name)); return; }
      } catch {}
      try { for (const x of await sndIdb('readonly', st => st.getAll()) || []) { this.blob.set(x.name, URL.createObjectURL(x.blob)); this.nomi.add(x.name); } } catch {}
    })();
  },
  has(n) { return !!n && this.nomi.has(n); },
  url(n) { return this.srv ? 'suoni/' + encodeURIComponent(n) : this.blob.get(n) || null; },
  async add(file) {
    await this.init();
    if (this.srv) {
      const r = await fetch('api/suoni?' + new URLSearchParams({ name: file.name }), { method: 'POST', headers: { 'Content-Type': file.type || sndMime(file.name) }, body: file });
      if (!r.ok) throw new Error(await r.text());
      const b = await r.json(); this.nomi.add(b.name); return b.name;
    }
    const n = file.name.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 80) || 'suono.mp3';
    await sndIdb('readwrite', st => st.put({ name: n, blob: file }));
    this.blob.set(n, URL.createObjectURL(file)); this.nomi.add(n);
    return n;
  },
  async remove(n) {
    if (this.srv) { const r = await fetch('api/suoni?' + new URLSearchParams({ name: n }), { method: 'DELETE' }); if (!r.ok) throw new Error(await r.text()); }
    else await sndIdb('readwrite', st => st.delete(n));
    this.nomi.delete(n);
  },
  async bytes(n) { const u = this.url(n); if (!u) return null; const r = await fetch(u); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; }
};

// ---------- I dati ----------
const sndDati = () => (sndMaster() ? settings.soundboard : sndS.remoto) || { boards: [], cur: '' };
const sndTutti = () => sndDati().boards.flatMap(b => b.sounds || []);
const sndBoard = () => { const d = sndDati(); return d.boards.find(b => b.id === d.cur) || d.boards[0] || null; };
const sndChiave = s => s.gid || (s.file ? 'f:' + s.file : '');
const sndStato = () => ({ boards: settings.soundboard.boards });
function sndSalva() { scheduleBoardSave(); sndSync(); sndRender(); }

// ---------- Audio ----------
function sndCtx() {
  if (sndS.ctx) return sndS.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { sndS.ctx = new AC(); sndS.gain = sndS.ctx.createGain(); sndS.gain.connect(sndS.ctx.destination); sndVolume(); } catch { sndS.ctx = null; }
  return sndS.ctx;
}
function sndVolume() {
  if (sndS.gain) sndS.gain.gain.value = sndS.muted ? 0 : Math.pow(sndS.vol / 100, 1.5);
  const v = sndS.muted ? 0 : sndS.vol;
  for (const [id, o] of [['sbVol', 'sbVolOut'], ['sndVolSet', 'sndVolSetOut']]) {
    const el = $(id), out = $(o);
    if (el) el.value = v;
    if (out) out.textContent = sndS.muted ? 'muto' : sndS.vol + '%';
  }
  const mb = $('sbMute');
  if (mb) { mb.textContent = sndS.muted ? '🔇' : '🔊'; mb.setAttribute('aria-pressed', sndS.muted); mb.classList.toggle('on', sndS.muted); }
}
function sndImposta(v) {
  if (v > 0) { sndS.vol = v; sndS.muted = false; } else sndS.muted = true;
  sndVolume(); sndSalvaVol();
}
function sndMuta(si = !sndS.muted) {
  sndS.muted = si;
  if (!si && !(sndS.vol > 0)) sndS.vol = 60;
  sndVolume(); sndSalvaVol();
}
// Il browser lascia partire l'audio solo dopo un tocco sulla pagina.
function sndSblocca() { const c = sndCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
addEventListener('pointerdown', sndSblocca, true);
addEventListener('keydown', sndSblocca, true);

function sndUrl(s) {
  if (sndMaster() && sndLib.has(s.file)) return sndLib.url(s.file);
  if (s.gid && typeof netAssetUrl === 'function') return netAssetUrl(s.gid);
  return sndLib.has(s.file) ? sndLib.url(s.file) : null;
}
// Scarica e decodifica un suono (uno alla volta: i file decodificati pesano).
let sndCoda = Promise.resolve();
function sndPrepara(s, tentativi = 0) {
  const k = sndChiave(s);
  if (!k || sndS.buf.has(k)) return Promise.resolve(sndS.buf.get(k) || null);
  if (sndS.carica.has(k)) return sndS.carica.get(k);
  const p = sndCoda = sndCoda.then(async () => {
    const c = sndCtx(), u = sndUrl(s);
    if (!c || !u) throw new Error('non ancora');
    const r = await fetch(u);
    if (!r.ok) throw new Error('non arrivato');
    const b = await c.decodeAudioData(await r.arrayBuffer());
    sndS.buf.set(k, b);
    sndRender();
    return b;
  }).catch(() => {
    // il file può non essere ancora arrivato dal master: si riprova qualche volta
    if (tentativi < 6) setTimeout(() => { sndS.carica.delete(k); sndPrepara(s, tentativi + 1); }, 4000 + tentativi * 3000);
    return null;
  }).finally(() => { if (sndS.buf.has(k) || tentativi >= 6) sndS.carica.delete(k); });
  sndS.carica.set(k, p);
  return p;
}
async function sndSuona(s) {
  if (!s) return;
  sndSblocca();
  const t0 = Date.now(), b = sndS.buf.get(sndChiave(s)) || await sndPrepara(s);
  const c = sndCtx();
  if (!b || !c || Date.now() - t0 > 4000) return;           // se ci ha messo troppo non ha più senso farlo partire
  const src = c.createBufferSource();
  src.buffer = b; src.connect(sndS.gain);
  src.onended = () => { sndS.fonti.delete(src); try { src.disconnect(); } catch {} };
  sndS.fonti.add(src);
  src.start(0);
}
function sndFermaLocale() { for (const x of [...sndS.fonti]) { try { x.stop(); } catch {} } sndS.fonti.clear(); }

// ---------- Rete ----------
// Chi può: parte qui subito e lo dice agli altri (non aspetta la risposta).
function sndPremi(s) {
  if (typeof NET !== 'undefined' && NET.on && typeof can === 'function' && !can('playSounds')) { sndWarn('Non hai il permesso di far partire i suoni.'); return; }
  sndSuona(s);
  if (typeof NET !== 'undefined' && NET.on && typeof intent === 'function') intent('sound', { id: s.id });
}
function sndFermaTutti() {
  sndFermaLocale();
  if (typeof NET !== 'undefined' && NET.on && typeof intent === 'function' && (typeof can !== 'function' || can('playSounds'))) intent('sound', { stop: true });
}
// Dal server: un altro ha fatto partire un suono (o li ha fermati).
function soundDaRete(m) {
  if (!m) return;
  if (m.stop) { sndFermaLocale(); return; }
  const s = sndTutti().find(x => x.id === m.id);
  if (s) sndSuona(s);
}
function sndSync() {
  if (typeof NET === 'undefined' || !NET.on || !sndMaster() || NET.adotta) return;
  const j = JSON.stringify(sndStato());
  if (j === sndS.inviata) return;
  sndS.inviata = j;
  if (typeof intent === 'function') intent('soundboard', { state: sndStato() });
}
// Il mondo dal server: il master lo confronta con la sua soundboard, gli altri la prendono e preparano i suoni.
function soundDalMondo(w) {
  if (sndMaster()) {
    if (typeof NET === 'undefined' || !NET.on) return;
    const mia = settings.soundboard;
    if (!mia.boards.length && w && Array.isArray(w.boards) && w.boards.length) {      // il server ha già una soundboard (server dedicato)
      settings.soundboard = { boards: w.boards, cur: (w.boards[0] || {}).id || '' };
      sndS.inviata = JSON.stringify(sndStato()); sndRender(); sndPreparaTutti(); return;
    }
    if (JSON.stringify({ boards: mia.boards }) !== JSON.stringify(w ? { boards: w.boards } : null)) { sndS.inviata = ''; }
    sndCondividiTutti();
    return;
  }
  sndS.remoto = w && Array.isArray(w.boards) ? { boards: w.boards, cur: (sndS.remoto && sndS.remoto.cur) || '' } : null;
  sndPreparaTutti(); sndRender();
}
function sndPreparaTutti() { for (const s of sndTutti()) sndPrepara(s); }

// I file nel deposito della partita (come le canzoni): una volta sola, poi si sa già l'impronta.
let sndCond = { occupato: false, ancora: false };
async function sndCondividiTutti() {
  if (!sndMaster() || typeof NET === 'undefined' || !NET.on || typeof netPutAsset !== 'function') { sndSync(); return; }
  if (sndCond.occupato) { sndCond.ancora = true; return; }
  sndCond.occupato = true;
  try {
    await sndLib.init();
    const tutti = sndTutti().filter(s => s.file && sndLib.has(s.file));
    for (const s of tutti) {
      if (s.gid) continue;
      const bytes = await sndLib.bytes(s.file);
      if (bytes) s.gid = toHex(await crypto.subtle.digest('SHA-256', bytes));
    }
    const hs = [...new Set(tutti.map(s => s.gid).filter(Boolean))].filter(h => !NET.assetKnown.has(h));
    if (hs.length) {
      const mancano = await new Promise(res => {
        const t = setTimeout(() => { NET.onAssetNeed = null; res(hs); }, 4000);
        NET.onAssetNeed = x => { clearTimeout(t); NET.onAssetNeed = null; res(x); };
        netSend({ t: 'intent', op: 'asset.have', hashes: hs });
      });
      for (const h of hs) if (!mancano.includes(h)) NET.assetKnown.add(h);
      for (const h of mancano) {
        const s = tutti.find(x => x.gid === h), bytes = s && await sndLib.bytes(s.file);
        if (!bytes) continue;
        sndWarn('Mando «' + (s.title || s.file) + '» ai giocatori…');
        const ok = await netPutAsset(h, bytes, sndMime(s.file), s.file);
        sndWarn(ok ? '' : 'Non sono riuscito a mandare «' + (s.title || s.file) + '» ai giocatori.');
        if (ok) NET.assetKnown.add(h);
      }
    }
    scheduleBoardSave();
  } catch {} finally {
    sndCond.occupato = false;
    if (sndCond.ancora) { sndCond.ancora = false; sndCondividiTutti(); } else sndSync();
  }
}

// ---------- L'immagine di un suono: si rimpicciolisce (resta nella soundboard, quindi deve essere leggera) ----------
function sndImmagine(file) {
  return new Promise(ok => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      try {
        const N = 96, c = document.createElement('canvas'); c.width = c.height = N;
        const x = c.getContext('2d'), k = Math.max(N / im.width, N / im.height), w = im.width * k, h = im.height * k;
        x.drawImage(im, (N - w) / 2, (N - h) / 2, w, h);
        let d = c.toDataURL('image/webp', 0.75);
        if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.8);
        ok(d);
      } catch { ok(''); }
      URL.revokeObjectURL(u);
    };
    im.onerror = () => { URL.revokeObjectURL(u); ok(''); };
    im.src = u;
  });
}

// ---------- Lo strumento ----------
const soundBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Soundboard" title="Soundboard">
     <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
       <path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/>
     </svg>
   </button>
   <div class="tbody" inert>
     <div class="trow sbHead"><select id="sbBoard" aria-label="Soundboard"></select><button id="sbEdit" type="button" class="sbMaster" title="Modifica la soundboard" aria-label="Modifica la soundboard" aria-pressed="false">✏️</button></div>
     <div id="sbEditBoard" class="sbMaster sbEditRow" hidden>
       <div class="trow"><input id="sbBoardName" type="text" maxlength="40" placeholder="Nome della soundboard" autocomplete="off"><button id="sbBoardDel" type="button" title="Elimina questa soundboard" aria-label="Elimina questa soundboard">🗑</button></div>
     </div>
     <div id="sbGrid" class="sbGrid"></div>
     <div id="sbEmpty" class="tnote" hidden></div>
     <div class="trow sbBtns"><button id="sbStop" type="button">⏹ Ferma tutto</button></div>
     <div class="trow sbMaster sbAdd" id="sbAddRow" hidden><button id="sbAddSound" type="button">＋ Nuovo suono</button><button id="sbAddBoard" type="button">＋ Soundboard</button></div>
     <div id="sbForm" class="sbForm" hidden>
       <label class="row" id="sbFFileRow">Suono <input id="sbFFile" type="file" accept="audio/*,.mp3,.ogg,.oga,.opus,.wav,.m4a,.aac,.flac"></label>
       <label class="row">Titolo <input id="sbFTitle" type="text" maxlength="40" autocomplete="off"></label>
       <div class="trow sbImgRow"><span id="sbFImg" class="sbThumb"></span><button id="sbFImgBtn" type="button">🖼 Immagine…</button><button id="sbFImgDel" type="button" title="Togli l'immagine" aria-label="Togli l'immagine">✕</button></div>
       <input id="sbFImgFile" type="file" accept="image/*" hidden>
       <div class="trow"><button id="sbFSave" type="button" class="sbOk">Salva</button><button id="sbFCancel" type="button">Annulla</button></div>
       <div class="trow sbFMore" id="sbFMore"><button id="sbFLeft" type="button" title="Sposta indietro" aria-label="Sposta indietro">◀</button><button id="sbFRight" type="button" title="Sposta avanti" aria-label="Sposta avanti">▶</button><button id="sbFDel" type="button" title="Elimina il suono" aria-label="Elimina il suono">🗑 Elimina</button></div>
     </div>
     <div class="trow mVol"><button id="sbMute" type="button" title="Silenzia (solo per te)" aria-label="Silenzia (solo per te)" aria-pressed="false">🔊</button><label for="sbVol">Volume</label> <input id="sbVol" type="range" min="0" max="100" step="1"> <output id="sbVolOut"></output></div>
     <p class="tnote">Il volume è tuo e separato da quello della musica.</p>
     <p class="tnote" id="sbWarn" hidden></p>
   </div>`);
soundBox.id = 'soundBox';
document.body.appendChild(soundBox);

function sndRender() {
  const master = sndMaster(), d = sndDati(), b = sndBoard();
  const sel = $('sbBoard');
  sel.replaceChildren(...d.boards.map(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name || 'Soundboard'; o.setAttribute('data-noi18n', ''); return o; }));
  sel.hidden = d.boards.length < 2 && !sndS.modifica;
  if (b) sel.value = b.id;
  for (const el of soundBox.querySelectorAll('.sbMaster')) el.hidden = !master || (el.id !== 'sbEdit' && !sndS.modifica);
  $('sbEdit').setAttribute('aria-pressed', sndS.modifica); $('sbEdit').classList.toggle('on', sndS.modifica);
  $('sbBoardName').value = b ? b.name || '' : '';
  const grid = $('sbGrid');
  grid.classList.toggle('modifica', sndS.modifica);
  grid.replaceChildren(...((b && b.sounds) || []).map(s => {
    const t = mk('button', 'sbTile' + (sndS.editing && sndS.editing.s === s ? ' on' : '') + (sndS.buf.has(sndChiave(s)) || !sndChiave(s) ? '' : ' carica'));
    t.type = 'button'; t.title = s.title || '';
    const im = mk('span', 'sbImg');
    if (s.img) im.style.backgroundImage = 'url("' + s.img + '")'; else im.textContent = '🔊';
    const n = mk('span', 'sbName'); n.textContent = s.title || '…'; n.setAttribute('data-noi18n', '');
    t.append(im, n);
    t.addEventListener('click', () => { if (sndS.modifica && master) sndApri(s); else sndPremi(s); });
    return t;
  }));
  const vuoto = $('sbEmpty');
  vuoto.hidden = !!(b && b.sounds && b.sounds.length);
  vuoto.textContent = master ? 'Nessun suono: tocca ✏️ e poi «Nuovo suono».' : 'Nessun suono.';
  $('sbForm').hidden = !(sndS.editing && master);
  sndVolume();
}
// Non si ricarica la griglia mentre si scrive nel modulo: il modulo sta fuori dalla griglia, quindi basta rifare questa.

// ---------- Modifica (solo il master) ----------
let sndImgNuova = null;                                // l'immagine scelta nel modulo (data URL)
function sndApri(s) {
  const nuovo = !s;
  sndS.editing = { s: s || { id: sndRid(), title: '', img: '', file: '', gid: '' }, nuovo, file: null };
  sndImgNuova = sndS.editing.s.img || '';
  $('sbFTitle').value = sndS.editing.s.title || '';
  $('sbFFile').value = '';
  $('sbFFileRow').hidden = !nuovo;
  $('sbFMore').hidden = nuovo;
  sndPreviewImg();
  sndRender();
}
function sndPreviewImg() {
  const el = $('sbFImg');
  el.style.backgroundImage = sndImgNuova ? 'url("' + sndImgNuova + '")' : '';
  el.textContent = sndImgNuova ? '' : '🔊';
}
function sndChiudi() { sndS.editing = null; sndImgNuova = null; sndRender(); }
$('sbEdit').addEventListener('click', () => { sndS.modifica = !sndS.modifica; if (!sndS.modifica) sndS.editing = null; sndRender(); });
$('sbBoard').addEventListener('change', e => { settings.soundboard.cur = e.target.value; sndS.remoto && (sndS.remoto.cur = e.target.value); sndS.editing = null; scheduleBoardSave(); sndRender(); });
$('sbStop').addEventListener('click', sndFermaTutti);
$('sbMute').addEventListener('click', () => sndMuta());
$('sbVol').addEventListener('input', e => sndImposta(+e.target.value));
$('sbAddBoard').addEventListener('click', () => {
  const b = { id: sndRid(), name: 'Soundboard ' + (settings.soundboard.boards.length + 1), sounds: [] };
  settings.soundboard.boards.push(b); settings.soundboard.cur = b.id; sndSalva();
  $('sbBoardName').focus(); $('sbBoardName').select();
});
$('sbBoardName').addEventListener('change', e => { const b = sndBoard(); if (!b || !sndMaster()) return; b.name = e.target.value.trim().slice(0, 40) || 'Soundboard'; sndSalva(); });
$('sbBoardDel').addEventListener('click', () => {
  const b = sndBoard(); if (!b) return;
  if (b.sounds.length && !confirm('Eliminare la soundboard «' + (b.name || '') + '» e i suoi ' + b.sounds.length + ' suoni? I file restano nella cartella «suoni» della campagna.')) return;
  settings.soundboard.boards = settings.soundboard.boards.filter(x => x !== b);
  settings.soundboard.cur = (settings.soundboard.boards[0] || {}).id || '';
  sndS.editing = null; sndSalva();
});
$('sbAddSound').addEventListener('click', () => {
  if (!sndBoard()) { $('sbAddBoard').click(); }
  if (sndTutti().length >= SND_TILES) { sndWarn('Troppi suoni: al massimo ' + SND_TILES + '.'); return; }
  sndApri(null);
});
$('sbFFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f || !sndS.editing) return;
  if (!$('sbFTitle').value.trim()) $('sbFTitle').value = (typeof musicTitolo === 'function' ? musicTitolo(f.name) : f.name).slice(0, 40);
});
$('sbFImgBtn').addEventListener('click', () => $('sbFImgFile').click());
$('sbFImgFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  sndImgNuova = await sndImmagine(f); sndPreviewImg();
});
$('sbFImgDel').addEventListener('click', () => { sndImgNuova = ''; sndPreviewImg(); });
$('sbFCancel').addEventListener('click', sndChiudi);
$('sbFSave').addEventListener('click', async () => {
  const ed = sndS.editing, b = sndBoard(); if (!ed || !b) return;
  const titolo = $('sbFTitle').value.trim().slice(0, 40);
  if (ed.nuovo) {
    const f = $('sbFFile').files[0];
    if (!f) { sndWarn('Scegli il file audio del suono.'); return; }
    if (!/^audio\//.test(f.type) && !/\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i.test(f.name)) { sndWarn('Questo non sembra un file audio.'); return; }
    if (f.size > SND_MAX) { sndWarn('«' + f.name + '» è troppo grande (al massimo 10 MB: sono effetti brevi, per le canzoni c\'è Musica).'); return; }
    try {
      sndWarn('Salvo «' + f.name + '»…');
      ed.s.file = await sndLib.add(f);
      sndWarn('');
    } catch (err) { sndWarn('Non riesco a salvare «' + f.name + '»: ' + (err.message || err)); return; }
    ed.s.title = titolo || (typeof musicTitolo === 'function' ? musicTitolo(ed.s.file) : ed.s.file).slice(0, 40);
    ed.s.img = sndImgNuova || '';
    b.sounds.push(ed.s);
    sndPrepara(ed.s);
  } else {
    ed.s.title = titolo || ed.s.title; ed.s.img = sndImgNuova || '';
  }
  sndS.editing = null; sndImgNuova = null;
  sndSalva(); sndCondividiTutti();
});
function sndSposta(d) {
  const ed = sndS.editing, b = sndBoard(); if (!ed || !b) return;
  const i = b.sounds.indexOf(ed.s), j = i + d;
  if (i < 0 || j < 0 || j >= b.sounds.length) return;
  b.sounds.splice(i, 1); b.sounds.splice(j, 0, ed.s); sndSalva();
}
$('sbFLeft').addEventListener('click', () => sndSposta(-1));
$('sbFRight').addEventListener('click', () => sndSposta(1));
$('sbFDel').addEventListener('click', async () => {
  const ed = sndS.editing, b = sndBoard(); if (!ed || !b) return;
  if (!confirm('Eliminare «' + (ed.s.title || '') + '» dalla soundboard?')) return;
  b.sounds = b.sounds.filter(x => x !== ed.s);
  // il file si toglie dalla cartella solo se nessun altro suono lo usa
  if (ed.s.file && !sndTutti().some(x => x.file === ed.s.file)) { try { await sndLib.remove(ed.s.file); } catch {} }
  sndS.editing = null; sndSalva();
});

soundBox.querySelector('.tgrip').addEventListener('click', () => {
  const open = !soundBox.classList.contains('open');
  toggleOpen(soundBox, open);
  if (open) { sndSblocca(); sndRender(); }
});
registerTool('sound', soundBox, soundBox.querySelector('.tgrip'), 'Soundboard');

// Il tasto destro sullo strumento: volume e muto.
function soundMenuExtra() {
  const v = sndS.muted ? 0 : sndS.vol;
  return [
    { label: sndS.muted ? '🔊 Riattiva i suoni' : '🔇 Silenzia i suoni (solo per te)', fn: () => sndMuta() },
    { label: '🔉 Volume dei suoni: ' + (sndS.muted ? 'muto' : sndS.vol + '%'), items: [100, 75, 50, 25, 10].map(x => ({ label: (v === x ? '✓ ' : '') + x + '%', fn: () => sndImposta(x) })) },
    { label: '⏹ Ferma tutti i suoni', fn: sndFermaTutti }
  ];
}

// Il volume anche nelle Impostazioni.
if ($('sndVolSet')) $('sndVolSet').addEventListener('input', e => sndImposta(+e.target.value));

// All'avvio: i file salvati e (il master) i suoni pronti per essere ascoltati.
function soundRestore() {
  sndVolume();
  sndLib.init().then(() => { if (sndMaster()) sndPreparaTutti(); sndRender(); });
}
soundRestore();
