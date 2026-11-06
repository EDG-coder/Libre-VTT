// ---------- Musica: link di YouTube o canzoni dal computer, per tutti; il volume per ciascuno ----------
// Lo stato della riproduzione (cosa suona, se va, da che punto) è un oggetto solo: il server lo
// manda ai giocatori e ognuno chiama musicApply(). Il volume invece non viaggia mai.
// Le canzoni dal computer stanno nella cartella musica/ della campagna (senza server, nel browser);
// in rete il master le mette nel deposito della partita e i giocatori le ascoltano da lì («gid»).
// loop: false (una volta), true (ripete la scaletta), 'one' (ripete il brano).
// Ogni scena può avere la sua canzone (sc.musica): parte quando la scena diventa quella dei giocatori.

const MUSIC_VOL_KEY = 'uffa-music-vol';
settings.music = settings.music || { id: '', title: '', playing: false, at: 0, t0: 0, list: [], loop: true };

const music = {
  player: null, ready: false, apiFailed: false,
  vol: 60, muted: false,
  pending: null,                 // stato da applicare appena il lettore è pronto
  ticking: 0,
  fadeK: 1, fading: false,       // dissolvenza: il volume si moltiplica per fadeK
  bloccata: false,               // il browser non lascia partire l'audio finché non si tocca la pagina
  pinLocale: 0
};
settings.music.src = settings.music.src || 'yt';
try {
  const v = JSON.parse(localStorage.getItem(MUSIC_VOL_KEY) || '{}');
  if (Number.isFinite(v.vol)) music.vol = clamp(v.vol, 0, 100);
  music.muted = !!v.muted;
} catch {}
const musicSaveVol = () => { try { localStorage.setItem(MUSIC_VOL_KEY, JSON.stringify({ vol: music.vol, muted: music.muted })); } catch {} };

// ---------- Finestra dello strumento ----------
const musicBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Musica" title="Musica">
     <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
       <path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>
     </svg>
   </button>
   <div class="tbody" inert>
     <div class="mNow"><span id="musicNow">Niente in riproduzione</span> <span id="musicLoopTag" class="mLoopTag" hidden></span></div>
     <div class="trow mSeekRow"><span id="musicTime">0:00</span><input id="musicSeek" type="range" min="0" max="1000" step="1" value="0" aria-label="Punto del brano"><span id="musicDur">0:00</span></div>
     <div class="trow mBtns">
       <button id="musicPrev" type="button" title="Brano precedente">⏮</button>
       <button id="musicPlay" type="button" title="Riproduci o metti in pausa">▶</button>
       <button id="musicNext" type="button" title="Brano successivo">⏭</button>
       <button id="musicLoop" type="button" title="Ripeti la scaletta" aria-label="Ripeti la scaletta">🔁</button>
     </div>
     <label class="trow mVol">Volume <input id="musicVol" type="range" min="0" max="100" step="1"> <output id="musicVolOut"></output></label>
     <p class="tnote">Il volume è tuo: non cambia quello degli altri.</p>
     <div class="mMaster" id="musicMaster">
       <div class="trow"><input id="musicUrl" type="text" placeholder="Incolla un link di YouTube" autocomplete="off"><button id="musicAdd" type="button">Aggiungi</button></div>
       <div class="trow"><button id="musicFromPc" type="button" class="mPc">📁 Canzoni dal computer…</button></div>
       <input id="musicFile" type="file" accept="audio/*,.mp3,.ogg,.oga,.opus,.wav,.m4a,.aac,.flac" multiple hidden>
       <div id="musicList" class="mList"></div>
     </div>
     <p class="tnote" id="musicWarn" hidden></p>
   </div>`);
musicBox.id = 'musicBox';
document.body.appendChild(musicBox);
// L'iframe di YouTube sta FUORI dal pannello, attaccato al documento: se lo si sposta nel DOM
// (per esempio trascinando il tool nel menu a sinistra) si ricarica e la musica riparte da zero.
document.body.insertAdjacentHTML('beforeend', '<div id="musicPlayerHost" aria-hidden="true"><div id="musicPlayer"></div></div>');
const musicHost = document.getElementById('musicPlayerHost');

// Quando si vuole vedere il video, lo si mette sopra al pannello seguendone la posizione.
let musicVideoOn = false, musicFollow = 0;
function musicPlaceVideo() {
  if (!musicVideoOn) { musicHost.classList.remove('shown'); return; }
  const body = musicBox.querySelector('.tbody');
  const r = (musicBox.classList.contains('open') ? body : musicBox).getBoundingClientRect();
  musicHost.classList.add('shown');
  Object.assign(musicHost.style, {
    left: Math.round(r.left) + 'px',
    top: Math.round(r.bottom + 6) + 'px',
    width: Math.max(180, Math.round(r.width)) + 'px'
  });
}
function musicShowVideo(on) {
  musicVideoOn = on === undefined ? !musicVideoOn : !!on;
  clearInterval(musicFollow);
  if (musicVideoOn) { musicPlaceVideo(); musicFollow = setInterval(musicPlaceVideo, 250); }
  else musicHost.classList.remove('shown');
}
addEventListener('resize', musicPlaceVideo);

// ---------- Link di YouTube ----------
function ytId(raw) {
  const s = String(raw || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch { return null; }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
  if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null;
  const v = u.searchParams.get('v');
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/\/(?:embed|shorts|v|live)\/([\w-]{11})/);
  return m ? m[1] : null;
}

// ---------- Il lettore ----------
function musicLoadApi() {
  if (window.YT && window.YT.Player) { musicMakePlayer(); return; }
  if (document.getElementById('ytApiTag')) return;
  const tag = document.createElement('script');
  tag.id = 'ytApiTag';
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => {
    music.apiFailed = true;
    musicWarn('Non riesco a contattare YouTube: serve internet perché la musica parta.');
  };
  document.head.appendChild(tag);
  setTimeout(() => { if (!music.ready && !window.YT) tag.onerror(); }, 8000);
}
window.onYouTubeIframeAPIReady = () => musicMakePlayer();


function musicMakePlayer() {
  if (music.player) return;
  music.player = new YT.Player('musicPlayer', {
    height: '150', width: '260',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => {
        music.ready = true;
        musicApplyVolume();
        musicWarn('');
        if (music.pending) { const st = music.pending; music.pending = null; musicApply(st); }
      },
      onStateChange: e => {
        if (e.data === YT.PlayerState.ENDED && musicIsMaster() && settings.music.src !== 'file') musicEnded();
        musicRefresh();
      },
      // 101 e 150: l'autore non permette di usare il video fuori da YouTube (spesso per i diritti d'autore)
      onError: e => musicWarn(e && (e.data === 101 || e.data === 150)
        ? 'L\'autore non permette di usare questo video fuori da YouTube (di solito per i diritti d\'autore): prova un\'altra canzone o un altro caricamento.'
        : e && (e.data === 100) ? 'Questo video non esiste più o è privato.'
        : e && (e.data === 2) ? 'Il link di questo video non è valido.'
        : 'Questo video non si può riprodurre (potrebbe essere bloccato dall\'autore).')
    }
  });
}
const musicWarn = t => { const el = $('musicWarn'); el.textContent = t || ''; el.hidden = !t; };

// Finché non c'è il server (Fase 2) comanda chi usa questa pagina.
function musicIsMaster() { return typeof isMaster !== 'function' || isMaster(); }

// ---------- Le canzoni dal computer ----------
// Con il server locale stanno nella cartella musica/ della campagna; aprendo la pagina senza server,
// nel browser (IndexedDB). Il nome del file è la chiave.
const MUSIC_EXT = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm' };
const musicMime = n => MUSIC_EXT[String(n || '').split('.').pop().toLowerCase()] || 'audio/mpeg';
const MUSIC_MAX = 40 * 1024 * 1024;
const musLib = {
  srv: false, brani: [], blob: new Map(), pronta: null,
  init() {
    return this.pronta ||= (async () => {
      try {
        const r = await fetch('api/musica');
        if (r.ok) { this.srv = true; this.brani = (await r.json()).brani || []; return; }
      } catch {}
      try { for (const x of await musLibIdb('readonly', st => st.getAll()) || []) { this.blob.set(x.name, URL.createObjectURL(x.blob)); this.brani.push({ name: x.name, bytes: x.blob.size }); } } catch {}
    })();
  },
  async ricarica() { this.pronta = null; this.brani = []; await this.init(); },
  has(n) { return !!n && this.brani.some(b => b.name === n); },
  url(n) { return this.srv ? 'musica/' + encodeURIComponent(n) : this.blob.get(n) || null; },
  async add(file) {
    await this.init();
    if (this.srv) {
      const r = await fetch('api/musica?' + new URLSearchParams({ name: file.name }), { method: 'POST', headers: { 'Content-Type': file.type || musicMime(file.name) }, body: file });
      if (!r.ok) throw new Error(await r.text());
      const b = await r.json();
      if (!this.has(b.name)) this.brani.push(b);
      return b.name;
    }
    let n = file.name.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 80) || 'canzone.mp3';
    await musLibIdb('readwrite', st => st.put({ name: n, blob: file }));
    this.blob.set(n, URL.createObjectURL(file));
    if (!this.has(n)) this.brani.push({ name: n, bytes: file.size });
    return n;
  },
  async remove(n) {
    if (this.srv) { const r = await fetch('api/musica?' + new URLSearchParams({ name: n }), { method: 'DELETE' }); if (!r.ok) throw new Error(await r.text()); }
    else await musLibIdb('readwrite', st => st.delete(n));
    this.brani = this.brani.filter(b => b.name !== n);
  },
  async bytes(n) { const u = this.url(n); if (!u) return null; const r = await fetch(u); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; }
};
function musLibIdb(modo, fn) {
  return new Promise((ok, no) => {
    if (typeof indexedDB === 'undefined') return no(new Error('niente IndexedDB'));
    const r = indexedDB.open('libre-musica', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('brani', { keyPath: 'name' });
    r.onerror = () => no(r.error);
    r.onsuccess = () => {
      const d = r.result, t = d.transaction('brani', modo), q = fn(t.objectStore('brani'));
      let out; if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => { d.close(); ok(out); }; t.onerror = () => { d.close(); no(t.error); };
    };
  });
}
const musicTitolo = n => String(n || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || n;

// In rete: la canzone va nel deposito della partita (una volta sola), così i giocatori la ricevono.
const musicGid = new Map();         // nome del file -> hash
async function musicCondividi(it) {
  if (typeof NET === 'undefined' || !NET.on || typeof netPutAsset !== 'function') return it.gid || '';
  try {
    let h = musicGid.get(it.file) || it.gid || '';
    let bytes = null;
    if (!h) {
      bytes = await musLib.bytes(it.file);
      if (!bytes) return it.gid || '';
      h = toHex(await crypto.subtle.digest('SHA-256', bytes));
    }
    musicGid.set(it.file, h);
    if (!NET.assetKnown.has(h)) {
      // il server ce l'ha già? (di una sessione di prima)
      const manca = await new Promise(res => {
        const t = setTimeout(() => { NET.onAssetNeed = null; res(true); }, 4000);
        NET.onAssetNeed = hs => { clearTimeout(t); NET.onAssetNeed = null; res(hs.includes(h)); };
        netSend({ t: 'intent', op: 'asset.have', hashes: [h] });
      });
      if (!manca) NET.assetKnown.add(h);
      else {
        bytes = bytes || await musLib.bytes(it.file);
        if (!bytes) return '';
        if (bytes.length > MUSIC_MAX) { musicWarn('«' + it.title + '» supera i 40 MB: i giocatori non la sentiranno.'); return ''; }
        musicWarn('Mando «' + it.title + '» ai giocatori…');
        const ok = await netPutAsset(h, bytes, musicMime(it.file), it.file);
        musicWarn(ok ? '' : 'Non sono riuscito a mandare «' + it.title + '» ai giocatori.');
        if (!ok) return '';
        NET.assetKnown.add(h);
      }
    }
    // l'hash si ricorda anche nella scaletta e nelle scene, così la volta dopo non si ricalcola
    for (const x of settings.music.list) if (x.file === it.file) x.gid = h;
    if (typeof scenes !== 'undefined') for (const sc of scenes) if (sc.musica && sc.musica.file === it.file) sc.musica.gid = h;
    return h;
  } catch { return it.gid || ''; }
}

// ---------- Il lettore per i file: un elemento <audio> ----------
const musicAudio = new Audio();
musicAudio.preload = 'auto';
musicAudio.addEventListener('ended', () => { if (musicIsMaster() && settings.music.src === 'file') musicEnded(); musicRefresh(); });
musicAudio.addEventListener('error', () => { if (settings.music.src === 'file' && settings.music.id && musicAudio.getAttribute('src')) musicWarn('Non riesco a suonare «' + (settings.music.title || '') + '».'); });
musicAudio.addEventListener('loadedmetadata', () => musicRefresh());
function musicFileSrc(m) {
  if (musicIsMaster() && musLib.has(m.file)) return musLib.url(m.file);
  if (m.gid && typeof netAssetUrl === 'function') return netAssetUrl(m.gid);
  return musLib.has(m.file) ? musLib.url(m.file) : null;
}
// Il browser blocca l'audio che parte da solo finché non si tocca la pagina: al primo tocco riparte.
function musicBloccata() {
  if (music.bloccata) return;
  music.bloccata = true;
  musicWarn('Il browser ha fermato l\'audio: tocca un punto qualsiasi della pagina per sentire la musica.');
  const via = () => {
    removeEventListener('pointerdown', via, true); removeEventListener('keydown', via, true);
    music.bloccata = false; musicWarn('');
    if (settings.music.playing) musicApplyNow();
  };
  addEventListener('pointerdown', via, true); addEventListener('keydown', via, true);
}

function musicApplyVolume() {
  const v = music.muted ? 0 : music.vol * music.fadeK;
  musicAudio.volume = Math.max(0, Math.min(1, v / 100));
  musicAudio.muted = music.muted;
  if (!music.ready) return;
  try {
    music.player.setVolume(v);
    if (music.muted) music.player.mute(); else music.player.unMute();
  } catch {}
}
// Porta fadeK da dove è a «a» in «ms» millisecondi.
function musicRampa(a, ms, poi) {
  clearInterval(music.rampa);
  const da = music.fadeK, t0 = Date.now();
  music.rampa = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    music.fadeK = da + (a - da) * k; musicApplyVolume();
    if (k >= 1) { clearInterval(music.rampa); if (poi) poi(); }
  }, 50);
}
const MUSIC_FADE = 2500;
const musicSuona = () => settings.music.src === 'file' ? !musicAudio.paused
  : music.ready && (() => { try { return music.player.getPlayerState() === YT.PlayerState.PLAYING; } catch { return false; } })();

// Porta il lettore allo stato descritto (lo chiama anche net.js quando arriva dal server).
// Con «fade» la canzone che suonava sfuma prima di cambiare, e la nuova entra piano.
function musicApply(st, primaDi) {
  const prima = primaDi || { ...settings.music };
  Object.assign(settings.music, st);
  const m = settings.music;
  m.src = m.src || 'yt';
  const cambia = prima.playing && (prima.id !== m.id || !m.playing);
  if (m.fade && cambia && musicSuona()) {
    if (!music.fading) {
      music.fading = true;
      musicRampa(0, MUSIC_FADE, () => {
        music.fading = false;
        musicApplyNow();
        if (settings.music.playing) musicRampa(1, MUSIC_FADE / 2); else { music.fadeK = 1; musicApplyVolume(); }
      });
    }
    musicRefresh();
    return;
  }
  if (!music.fading) { clearInterval(music.rampa); music.fadeK = 1; }
  musicApplyNow();
}
function musicApplyNow() {
  const m = settings.music;
  if (music.fading) return;
  const want = () => Math.max(0, m.at + (m.playing && m.t0 ? (Date.now() - m.t0) / 1000 : 0));
  if (m.src === 'file') {
    if (music.ready) { try { music.player.stopVideo(); } catch {} }
    const src = m.id ? musicFileSrc(m) : null;
    if (!src) {
      musicAudio.pause();
      if (m.id && m.playing && !musicIsMaster() && !m.gid) musicWarn('Questa canzone è sul computer di chi conduce: non è arrivata.');
      musicRefresh(); return;
    }
    if (musicAudio.getAttribute('src') !== src) musicAudio.src = src;
    musicAudio.loop = m.loop === 'one';
    const seek = () => {
      let w = want(); const d = musicAudio.duration;
      if (d > 0 && w >= d) {
        if (m.loop !== 'one' && m.playing && musicIsMaster()) { musicEnded(); return; }   // è finita mentre la pagina era chiusa
        w = m.loop === 'one' ? w % d : d;
      }
      if (Math.abs((musicAudio.currentTime || 0) - w) > 2.5 || !m.playing) { try { musicAudio.currentTime = w; } catch {} }
    };
    if (musicAudio.readyState >= 1) seek(); else musicAudio.addEventListener('loadedmetadata', seek, { once: true });
    if (m.playing) { const p = musicAudio.play(); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotAllowedError') musicBloccata(); }); }
    else musicAudio.pause();
    musicApplyVolume(); musicRefresh();
    return;
  }
  musicAudio.pause();
  if (!music.ready) { music.pending = { ...m }; if (m.id) musicLoadApi(); musicRefresh(); return; }
  const cur = (music.player.getVideoData && music.player.getVideoData().video_id) || '';
  try {
    if (m.id && cur !== m.id) {
      if (m.playing) music.player.loadVideoById(m.id, want());
      else music.player.cueVideoById(m.id, want());
    } else if (m.id) {
      if (Math.abs((music.player.getCurrentTime() || 0) - want()) > 2.5) music.player.seekTo(want(), true);
      if (m.playing && music.player.getPlayerState() !== YT.PlayerState.PLAYING) music.player.playVideo();
      if (!m.playing && music.player.getPlayerState() === YT.PlayerState.PLAYING) music.player.pauseVideo();
    } else {
      music.player.stopVideo();
    }
  } catch {}
  musicApplyVolume();
  musicRefresh();
}

// Chi comanda cambia lo stato: qui si salva e (net.js) si manda a tutti.
// «fade» e «scena» valgono solo per il cambio che li chiede.
function musicSet(patch) {
  if (!musicIsMaster()) return;
  const m = settings.music;
  const stesso = !('id' in patch) || patch.id === m.id, pos = musicPos(), prima = { ...m }, suonava = musicSuona();
  Object.assign(m, { fade: false, scena: false }, patch);
  if (!('at' in patch)) m.at = stesso ? pos : 0;
  // con la dissolvenza la nuova canzone entra quando la vecchia ha finito di sfumare: si parte da lì
  m.t0 = m.playing ? Date.now() + (m.fade && !stesso && suonava ? MUSIC_FADE : 0) : 0;
  scheduleBoardSave();
  if (typeof sendToPlayers === 'function') sendToPlayers('music', { ...m });
  musicApply({}, prima);
}
function musicPos() {
  try {
    if (settings.music.src === 'file') return musicAudio.getAttribute('src') ? musicAudio.currentTime || 0 : settings.music.at;
    return music.ready ? (music.player.getCurrentTime() || 0) : settings.music.at;
  } catch { return settings.music.at; }
}
function musicDur() {
  try { return settings.music.src === 'file' ? (Number.isFinite(musicAudio.duration) ? musicAudio.duration : 0) : music.ready ? music.player.getDuration() || 0 : 0; } catch { return 0; }
}

// ---------- Scaletta ----------
// Un brano: { id, title, src: 'yt' | 'file', file } (per i file l'id è «f:<nome del file>»).
async function musicPlayItem(it, extra = {}) {
  if (!it || !musicIsMaster()) return;
  const st = { id: it.id, title: it.title || it.id, src: it.src || 'yt', file: it.file || '', gid: '', playing: true, at: 0, ...extra };
  if (st.src === 'file') { await musLib.init(); st.gid = await musicCondividi(it); }
  musicSet(st);
}
function musicPlayId(id, title) {
  const it = settings.music.list.find(x => x.id === id) || { id, title };
  musicPlayItem(it);
}
// La canzone è finita (solo chi comanda decide cosa viene dopo).
function musicEnded() {
  const m = settings.music;
  if (m.loop === 'one') { musicSet({ at: 0, playing: true }); return; }
  if (m.scena && !m.loop) { musicSet({ playing: false, at: 0 }); return; }   // la canzone della scena, una volta sola
  musicNext(1, true);
}
function musicNext(step = 1, finita = false) {
  const m = settings.music, i = m.list.findIndex(x => x.id === m.id);
  if (!m.list.length || (i < 0 && finita)) { if (finita) musicSet({ playing: false, at: 0 }); return; }
  let j = i < 0 ? (step > 0 ? 0 : m.list.length - 1) : i + step;
  if (j >= m.list.length) { if (m.loop !== true) { musicSet({ playing: false, at: 0 }); return; } j = 0; }
  if (j < 0) j = m.list.length - 1;
  musicPlayItem(m.list[j]);
}

$('musicAdd').addEventListener('click', () => {
  const raw = $('musicUrl').value, id = ytId(raw);
  if (!id) { musicWarn('Non riconosco questo link di YouTube.'); return; }
  musicWarn('');
  const m = settings.music;
  if (!m.list.some(x => x.id === id)) m.list.push({ id, title: id, src: 'yt' });
  $('musicUrl').value = '';
  if (!m.id) musicPlayId(id); else { scheduleBoardSave(); musicRenderList(); }
  musicScenaForm();
});
$('musicUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('musicAdd').click(); } });

/** Prende canzoni dal computer: finiscono nella campagna e nella scaletta. Restituisce i brani aggiunti. */
async function musicImporta(files) {
  const nuovi = [];
  for (const f of files || []) {
    if (!/^audio\//.test(f.type) && !/\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)$/i.test(f.name)) continue;
    if (f.size > MUSIC_MAX) { musicWarn('«' + f.name + '» è troppo grande (al massimo 40 MB).'); continue; }
    try {
      musicWarn('Salvo «' + f.name + '»…');
      const n = await musLib.add(f);
      const it = { id: 'f:' + n, title: musicTitolo(n), src: 'file', file: n };
      if (!settings.music.list.some(x => x.id === it.id)) settings.music.list.push(it);
      nuovi.push(it);
      musicWarn('');
    } catch (e) { musicWarn('Non riesco a salvare «' + f.name + '»: ' + (e.message || e)); }
  }
  if (nuovi.length) { scheduleBoardSave(); musicRenderList(); musicScenaForm(); }
  return nuovi;
}
$('musicFromPc').addEventListener('click', () => $('musicFile').click());
$('musicFile').addEventListener('change', async e => {
  const nuovi = await musicImporta(e.target.files);
  e.target.value = '';
  if (nuovi.length && !settings.music.id) musicPlayItem(nuovi[0]);
});

$('musicPlay').addEventListener('click', () => {
  const m = settings.music;
  if (!m.id && m.list.length) { musicPlayItem(m.list[0]); return; }
  musicSet({ playing: !m.playing });
});
$('musicNext').addEventListener('click', () => musicNext(1));
$('musicPrev').addEventListener('click', () => musicNext(-1));
// Tre stati, ben diversi a vederli: spento (barrato e grigio), ripete la scaletta (🔁 acceso), ripete il brano (🔂 acceso)
$('musicLoop').addEventListener('click', () => {
  const l = settings.music.loop;
  musicSet({ loop: l === true ? 'one' : l === 'one' ? false : true });
});
$('musicSeek').addEventListener('input', e => {
  if (!musicIsMaster()) return;
  const dur = musicDur();
  if (dur > 0) musicSet({ at: dur * e.target.value / 1000 });
});
$('musicVol').addEventListener('input', e => {
  music.vol = +e.target.value; music.muted = false;
  musicApplyVolume(); musicSaveVol(); musicRefresh();
});

function musicRenderList() {
  const m = settings.music;
  $('musicList').replaceChildren(...m.list.map(it => {
    const row = mk('div', 'mItem' + (it.id === m.id ? ' on' : ''));
    const b = mk('button'); b.type = 'button'; b.className = 'mPick';
    b.textContent = (it.src === 'file' ? '📁 ' : '') + (it.title || it.id);
    b.setAttribute('data-noi18n', '');
    b.title = it.src === 'file' ? 'Dal computer: ' + it.file : 'YouTube';
    b.addEventListener('click', () => musicPlayItem(it));
    const x = mk('button'); x.type = 'button'; x.className = 'mDel'; x.textContent = '×'; x.title = 'Togli dalla scaletta';
    x.addEventListener('click', () => {
      settings.music.list = m.list.filter(y => y.id !== it.id);
      scheduleBoardSave(); musicRenderList(); musicScenaForm();
    });
    row.append(b, x);
    return row;
  }));
}

const MUSIC_LOOP = {
  false: { t: '🔁', tip: 'Ripetizione spenta: la scaletta si ferma alla fine', tag: '' },
  true: { t: '🔁', tip: 'Ripete la scaletta', tag: '🔁 scaletta in loop' },
  one: { t: '🔂', tip: 'Ripete questo brano', tag: '🔂 in loop' }
};
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function musicRefresh() {
  const m = settings.music, master = musicIsMaster();
  $('musicNow').textContent = m.id ? (m.title || m.id) : 'Niente in riproduzione';
  $('musicPlay').textContent = m.playing ? '⏸' : '▶';
  const lk = m.loop === 'one' ? 'one' : m.loop ? 'true' : 'false', L = MUSIC_LOOP[lk], lb = $('musicLoop');
  lb.textContent = L.t; lb.title = L.tip; lb.setAttribute('aria-label', L.tip);
  lb.classList.toggle('on', lk !== 'false'); lb.classList.toggle('off', lk === 'false'); lb.classList.toggle('uno', lk === 'one');
  lb.setAttribute('aria-pressed', lk !== 'false');
  const tag = $('musicLoopTag');
  tag.textContent = m.id ? (L.tag || 'una volta') : ''; tag.hidden = !m.id; tag.classList.toggle('acceso', !!L.tag);
  $('musicVol').value = music.vol;
  $('musicVolOut').textContent = music.muted ? 'muto' : music.vol + '%';
  $('musicMaster').hidden = !master;
  for (const id of ['musicPlay', 'musicNext', 'musicPrev', 'musicLoop', 'musicSeek']) $(id).disabled = !master;
  if (m.src === 'file') {
    const dur = musicDur(), pos = musicPos();
    $('musicDur').textContent = mmss(dur);
    $('musicTime').textContent = mmss(pos);
    if (dur > 0 && document.activeElement !== $('musicSeek')) $('musicSeek').value = Math.round(pos / dur * 1000);
  } else if (music.ready && m.id) {
    // il titolo vero arriva dal lettore appena è pronto
    try {
      const d = music.player.getVideoData();
      if (d && d.title && d.title !== m.title) {
        m.title = d.title;
        const it = m.list.find(x => x.id === m.id); if (it) it.title = d.title;
        $('musicNow').textContent = d.title;
      }
      const dur = music.player.getDuration() || 0, pos = music.player.getCurrentTime() || 0;
      $('musicDur').textContent = mmss(dur);
      $('musicTime').textContent = mmss(pos);
      if (dur > 0 && document.activeElement !== $('musicSeek')) $('musicSeek').value = Math.round(pos / dur * 1000);
    } catch {}
  }
  musicRenderList();
}

// un battito al secondo per la barra del tempo
function musicTick() {
  if (musicBox.classList.contains('open')) musicRefresh();
  music.ticking = setTimeout(musicTick, 1000);
}

musicBox.querySelector('.tgrip').addEventListener('click', () => {
  const open = !musicBox.classList.contains('open');
  toggleOpen(musicBox, open);
  if (open) { if (settings.music.src !== 'file') musicLoadApi(); musicRefresh(); }
});
registerTool('music', musicBox, musicBox.querySelector('.tgrip'), 'Musica');

function musicMenuExtra() {
  return [
    { label: music.muted ? '🔊 Riattiva l\'audio' : '🔇 Silenzia (solo per te)', fn: () => { music.muted = !music.muted; musicApplyVolume(); musicSaveVol(); musicRefresh(); } },
    { label: musicVideoOn ? '🙈 Nascondi il video' : '👁 Mostra il video', fn: () => musicShowVideo() }
  ];
}

// ---------- La musica della scena (Impostazioni › Musica di questa scena) ----------
// sc.musica = { id, title, src, file, loop: true/false, cambio: 'stop' | 'fade' } oppure { stop: true, cambio }
// Parte quando la scena diventa quella che vedono i giocatori (📌, menu, pannello).
function musicaDellaScena(id, daRete) {
  if (!musicIsMaster()) return;
  if (daRete && Date.now() - music.pinLocale < 5000) return;    // l'eco di un 📌 appena dato da qui
  const sc = typeof scenes !== 'undefined' && scenes.find(s => s.id === id), mu = sc && sc.musica;
  if (!mu) return;
  const fade = mu.cambio === 'fade', m = settings.music;
  if (mu.stop) { if (m.playing) musicSet({ playing: false, fade }); return; }
  const loop = mu.loop ? 'one' : false;
  if (m.id === mu.id && m.playing) { if (m.loop !== loop) musicSet({ loop, scena: true }); return; }   // sta già suonando
  musicPlayItem(mu, { loop, fade, scena: true });
}
if (typeof setPublicScene === 'function') {
  setPublicScene = (prima => function (id) {                    // eslint-disable-line no-func-assign
    const era = settings.publicScene;
    const r = prima.apply(this, arguments);
    if (id && id !== era) { music.pinLocale = Date.now(); musicaDellaScena(id); }
    return r;
  })(setPublicScene);
}

const msSel = $('scMusBrano');
function musicScenaForm() {
  if (!msSel || typeof cur === 'undefined' || !cur) return;
  const sect = $('scMusSect');
  if (sect) sect.hidden = !musicIsMaster();
  $('scMusNome').textContent = '«' + cur.name + '»';
  const mu = cur.musica || null;
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  const grp = (t, items) => { const g = document.createElement('optgroup'); g.label = t; g.append(...items); return g; };
  const yt = settings.music.list.filter(x => x.src !== 'file');
  const files = musLib.brani.map(b => b.name);
  if (mu && mu.file && !files.includes(mu.file)) files.push(mu.file);
  const o = [opt('', 'Nessuna (la musica resta com\'è)'), opt('stop', '⏹ Ferma la musica')];
  const fo = files.map(n => { const x = opt('f:' + n, musicTitolo(n)); x.setAttribute('data-noi18n', ''); return x; });
  const yo = yt.map(it => { const x = opt(it.id, it.title || it.id); x.setAttribute('data-noi18n', ''); return x; });
  if (mu && mu.src === 'yt' && !yt.some(x => x.id === mu.id)) { const x = opt(mu.id, mu.title || mu.id); x.setAttribute('data-noi18n', ''); yo.push(x); }
  msSel.replaceChildren(...o, ...(fo.length ? [grp('Dal computer', fo)] : []), ...(yo.length ? [grp('YouTube', yo)] : []));
  msSel.value = !mu ? '' : mu.stop ? 'stop' : mu.id;
  const canzone = !!(mu && !mu.stop);
  $('scMusLoop').checked = !!(mu && mu.loop);
  $('scMusLoop').disabled = !canzone;
  const cambio = (mu && mu.cambio) || 'stop';
  for (const b of document.querySelectorAll('#scMusCambio button')) { b.classList.toggle('active', b.dataset.v === cambio); b.setAttribute('aria-pressed', b.dataset.v === cambio); b.disabled = !mu; }
  $('scMusOra').disabled = !mu;
  $('scMusVia').hidden = !(mu && mu.src === 'file');
}
function musicScenaSalva(patch) {
  if (!cur) return;
  const prima = cur.musica || {};
  const v = 'brano' in patch ? patch.brano : (prima.stop ? 'stop' : prima.id || '');
  const loop = 'loop' in patch ? patch.loop : !!prima.loop, cambio = patch.cambio || prima.cambio || 'stop';
  if (!v) cur.musica = undefined;
  else if (v === 'stop') cur.musica = { stop: true, cambio };
  else if (v.startsWith('f:')) cur.musica = { id: v, title: musicTitolo(v.slice(2)), src: 'file', file: v.slice(2), loop, cambio };
  else { const it = settings.music.list.find(x => x.id === v) || (prima.id === v ? prima : { id: v, title: v }); cur.musica = { id: v, title: it.title || v, src: 'yt', loop, cambio }; }
  scheduleBoardSave(); musicScenaForm();
}
if (msSel) {
  msSel.addEventListener('change', () => musicScenaSalva({ brano: msSel.value }));
  $('scMusLoop').addEventListener('change', e => musicScenaSalva({ loop: e.target.checked }));
  for (const b of document.querySelectorAll('#scMusCambio button')) b.addEventListener('click', () => musicScenaSalva({ cambio: b.dataset.v }));
  $('scMusOra').addEventListener('click', () => { music.pinLocale = 0; if (cur) musicaDellaScena(cur.id); });
  $('scMusPc').addEventListener('click', () => $('scMusFile').click());
  $('scMusFile').addEventListener('change', async e => {
    const nuovi = await musicImporta(e.target.files);
    e.target.value = '';
    if (nuovi.length) musicScenaSalva({ brano: nuovi[0].id });
  });
  $('scMusVia').addEventListener('click', async () => {
    const mu = cur && cur.musica; if (!mu || mu.src !== 'file') return;
    if (!confirm('Eliminare «' + mu.title + '» dalla cartella della campagna? Le scene che la usano restano senza musica.')) return;
    try { await musLib.remove(mu.file); } catch (e) { alert(e.message || e); return; }
    settings.music.list = settings.music.list.filter(x => x.file !== mu.file);
    for (const sc of scenes) if (sc.musica && sc.musica.file === mu.file) sc.musica = undefined;
    scheduleBoardSave(); musicRenderList(); musicScenaForm();
  });
}
if (typeof renderSceneUI === 'function') {
  renderSceneUI = (prima => function () {                       // eslint-disable-line no-func-assign
    const r = prima.apply(this, arguments);
    musicScenaForm();
    return r;
  })(renderSceneUI);
}

// All'avvio riprende quello che stava suonando (solo chi comanda fa ripartire da solo).
function musicRestore() {
  musicRefresh();
  const m = settings.music;
  m.fade = false;
  musLib.init().then(() => {
    musicScenaForm();
    if (m.id && m.playing) { if (m.src === 'file') musicApply({}); else { musicLoadApi(); music.pending = { ...m }; } }
  });
  musicTick();
}
