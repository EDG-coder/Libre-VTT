// ---------- Musica: un link di YouTube per tutti, il volume per ciascuno ----------
// Lo stato della riproduzione (cosa suona, se va, da che punto) è un oggetto solo:
// in Fase 2 il server lo manderà ai giocatori e ognuno chiamerà musicApply().
// Il volume invece non viaggia mai: resta nel browser di chi ascolta.

const MUSIC_VOL_KEY = 'uffa-music-vol';
settings.music = settings.music || { id: '', title: '', playing: false, at: 0, t0: 0, list: [], loop: true };

const music = {
  player: null, ready: false, apiFailed: false,
  vol: 60, muted: false,
  pending: null,                 // stato da applicare appena il lettore è pronto
  ticking: 0
};
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
     <div class="mNow" id="musicNow">Niente in riproduzione</div>
     <div class="trow mSeekRow"><span id="musicTime">0:00</span><input id="musicSeek" type="range" min="0" max="1000" step="1" value="0" aria-label="Punto del brano"><span id="musicDur">0:00</span></div>
     <div class="trow mBtns">
       <button id="musicPrev" type="button" title="Brano precedente">⏮</button>
       <button id="musicPlay" type="button" title="Riproduci o metti in pausa">▶</button>
       <button id="musicNext" type="button" title="Brano successivo">⏭</button>
       <button id="musicLoop" type="button" title="Ripeti la scaletta">🔁</button>
     </div>
     <label class="trow mVol">Volume <input id="musicVol" type="range" min="0" max="100" step="1"> <output id="musicVolOut"></output></label>
     <p class="tnote">Il volume è tuo: non cambia quello degli altri.</p>
     <div class="mMaster" id="musicMaster">
       <div class="trow"><input id="musicUrl" type="text" placeholder="Incolla un link di YouTube" autocomplete="off"><button id="musicAdd" type="button">Aggiungi</button></div>
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
        if (e.data === YT.PlayerState.ENDED && musicIsMaster()) musicNext();
        musicRefresh();
      },
      onError: () => musicWarn('Questo video non si può riprodurre (potrebbe essere bloccato dall\'autore).')
    }
  });
}
const musicWarn = t => { const el = $('musicWarn'); el.textContent = t || ''; el.hidden = !t; };

// Finché non c'è il server (Fase 2) comanda chi usa questa pagina.
function musicIsMaster() { return typeof isMaster !== 'function' || isMaster(); }

function musicApplyVolume() {
  if (!music.ready) return;
  try {
    music.player.setVolume(music.muted ? 0 : music.vol);
    if (music.muted) music.player.mute(); else music.player.unMute();
  } catch {}
}

// Porta il lettore allo stato descritto (è la funzione che userà anche il server).
function musicApply(st) {
  Object.assign(settings.music, st);
  const m = settings.music;
  if (!music.ready) { music.pending = { ...m }; musicLoadApi(); musicRefresh(); return; }
  const cur = (music.player.getVideoData && music.player.getVideoData().video_id) || '';
  const want = m.at + (m.playing && m.t0 ? (Date.now() - m.t0) / 1000 : 0);
  try {
    if (m.id && cur !== m.id) {
      if (m.playing) music.player.loadVideoById(m.id, want);
      else music.player.cueVideoById(m.id, want);
    } else if (m.id) {
      if (Math.abs((music.player.getCurrentTime() || 0) - want) > 2.5) music.player.seekTo(want, true);
      if (m.playing && music.player.getPlayerState() !== YT.PlayerState.PLAYING) music.player.playVideo();
      if (!m.playing && music.player.getPlayerState() === YT.PlayerState.PLAYING) music.player.pauseVideo();
    } else {
      music.player.stopVideo();
    }
  } catch {}
  musicApplyVolume();
  musicRefresh();
}

// Chi comanda cambia lo stato: qui si salva e (in Fase 2) si manda a tutti.
function musicSet(patch) {
  if (!musicIsMaster()) return;
  const m = settings.music;
  Object.assign(m, patch);
  if (m.playing) m.t0 = Date.now(); else { m.at = musicPos(); m.t0 = 0; }
  scheduleBoardSave();
  if (typeof sendToPlayers === 'function') sendToPlayers('music', { ...m });
  musicApply({});
}
function musicPos() {
  try { return music.ready ? (music.player.getCurrentTime() || 0) : settings.music.at; } catch { return settings.music.at; }
}

// ---------- Scaletta ----------
function musicPlayId(id, title) {
  musicSet({ id, title: title || id, playing: true, at: 0 });
}
function musicNext(step = 1) {
  const m = settings.music, i = m.list.findIndex(x => x.id === m.id);
  if (!m.list.length) return;
  let j = i + step;
  if (j >= m.list.length) { if (!m.loop) { musicSet({ playing: false }); return; } j = 0; }
  if (j < 0) j = m.list.length - 1;
  musicPlayId(m.list[j].id, m.list[j].title);
}

$('musicAdd').addEventListener('click', () => {
  const raw = $('musicUrl').value, id = ytId(raw);
  if (!id) { musicWarn('Non riconosco questo link di YouTube.'); return; }
  musicWarn('');
  const m = settings.music;
  if (!m.list.some(x => x.id === id)) m.list.push({ id, title: id });
  $('musicUrl').value = '';
  if (!m.id) musicPlayId(id); else { scheduleBoardSave(); musicRenderList(); }
});
$('musicUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('musicAdd').click(); } });
$('musicPlay').addEventListener('click', () => {
  const m = settings.music;
  if (!m.id && m.list.length) { musicPlayId(m.list[0].id, m.list[0].title); return; }
  musicSet({ playing: !m.playing });
});
$('musicNext').addEventListener('click', () => musicNext(1));
$('musicPrev').addEventListener('click', () => musicNext(-1));
$('musicLoop').addEventListener('click', () => { settings.music.loop = !settings.music.loop; scheduleBoardSave(); musicRefresh(); });
$('musicSeek').addEventListener('input', e => {
  if (!musicIsMaster() || !music.ready) return;
  const dur = music.player.getDuration() || 0;
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
    const b = mk('button'); b.type = 'button'; b.className = 'mPick'; b.textContent = it.title || it.id;
    b.addEventListener('click', () => musicPlayId(it.id, it.title));
    const x = mk('button'); x.type = 'button'; x.className = 'mDel'; x.textContent = '×'; x.title = 'Togli dalla scaletta';
    x.addEventListener('click', () => {
      settings.music.list = m.list.filter(y => y.id !== it.id);
      scheduleBoardSave(); musicRenderList();
    });
    row.append(b, x);
    return row;
  }));
}

const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function musicRefresh() {
  const m = settings.music, master = musicIsMaster();
  $('musicNow').textContent = m.id ? (m.title || m.id) : 'Niente in riproduzione';
  $('musicPlay').textContent = m.playing ? '⏸' : '▶';
  $('musicLoop').classList.toggle('on', !!m.loop);
  $('musicVol').value = music.vol;
  $('musicVolOut').textContent = music.muted ? 'muto' : music.vol + '%';
  $('musicMaster').hidden = !master;
  for (const id of ['musicPlay', 'musicNext', 'musicPrev', 'musicLoop', 'musicSeek']) $(id).disabled = !master;
  // il titolo vero arriva dal lettore appena è pronto
  if (music.ready && m.id) {
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
  if (open) { musicLoadApi(); musicRefresh(); }
});
registerTool('music', musicBox, musicBox.querySelector('.tgrip'), 'Musica');

function musicMenuExtra() {
  return [
    { label: music.muted ? '🔊 Riattiva l\'audio' : '🔇 Silenzia (solo per te)', fn: () => { music.muted = !music.muted; musicApplyVolume(); musicSaveVol(); musicRefresh(); } },
    { label: musicVideoOn ? '🙈 Nascondi il video' : '👁 Mostra il video', fn: () => musicShowVideo() }
  ];
}

// All'avvio riprende quello che stava suonando (solo chi comanda fa ripartire da solo).
function musicRestore() {
  musicRefresh();
  const m = settings.music;
  if (m.id && m.playing) { musicLoadApi(); music.pending = { ...m }; }
  musicTick();
}
