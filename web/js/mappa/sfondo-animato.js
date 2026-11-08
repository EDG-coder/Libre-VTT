// Sfondi animati delle scene: GIF, WebP e PNG animati, e video in loop (mp4, webm) senza audio.
// Il master li mette come uno sfondo qualsiasi; i giocatori li vedono come lui, sotto nebbia, luci e segnalini.
// Un'immagine animata si tiene così com'è (convertita in WebP perderebbe il movimento); un video si
// mostra in un <video> muto, in loop, che si ferma quando la pagina non si vede.
// Su ogni dispositivo si può fermare il movimento (Impostazioni › Aspetto): si mostra il primo fotogramma.
// Questo file non tocca la pagina: dà solo gli attrezzi, li usa script.js (setBgBox e caricamenti).
'use strict';
const SFONDO_ANIM = (() => {
  const MAX_VIDEO = 25 * 1024 * 1024;           // come il deposito della partita (server/game-server.js)
  const MAX_ANIMATA = 12 * 1024 * 1024;         // un'immagine animata: come qualsiasi immagine
  const VIDEO_MIME = /^video\/(mp4|webm)$/i;
  const eVideoFile = f => !!f && (VIDEO_MIME.test(f.type || '') || /\.(mp4|m4v|webm)$/i.test(f.name || ''));
  const eVideoNome = n => /\.(mp4|m4v|webm)(?:[?#]|$)/i.test(String(n || ''));

  // ---------- indirizzi ammessi per uno sfondo ----------
  // Solo indirizzi di immagini e video: http(s) (server locale, deposito, sito), blob: (browser) e data: di
  // un'immagine o di un video. Un «javascript:» o simili non arriva mai a un src.
  function urlMedia(u) {
    let x; try { x = new URL(String(u || ''), location.href); } catch { return ''; }
    if (x.protocol === 'http:' || x.protocol === 'https:' || x.protocol === 'blob:' || x.protocol === 'file:') return x.href;   // file: = index.html aperto con doppio clic
    if (x.protocol === 'data:' && /^data:(image|video)\//i.test(x.href)) return x.href;
    return '';
  }

  // ---------- un'immagine è animata? (condiviso/animazione.js: si leggono solo le intestazioni) ----------
  /** 'video', 'img' (immagine animata) o '' (un'immagine ferma). */
  async function tipo(blob, nome) {
    if (!blob) return '';
    if (VIDEO_MIME.test(blob.type || '') || eVideoNome(nome)) return 'video';
    if (!/^image\/(gif|webp|a?png)$/i.test(blob.type || '') && !/\.(gif|webp|png|apng)$/i.test(nome || '')) return '';
    try {
      const b = new Uint8Array(await blob.arrayBuffer());
      return typeof ANIMAZIONE !== 'undefined' && ANIMAZIONE.animata(b) ? 'img' : '';
    } catch { return ''; }
  }
  /** Come tipo(), ma da un indirizzo di un asset già caricato. */
  async function tipoDaUrl(url, nome) {
    if (eVideoNome(nome) || eVideoNome(url)) return 'video';
    if (/\.svg(?:[?#]|$)|^data:image\/svg/i.test(String(url || '')) || /\.(jpe?g|svg|avif|bmp)$/i.test(nome || '')) return '';
    // un asset di questo browser (IndexedDB): il file c'è già in memoria. Quelli del server arrivano
    // con «anim» già scritto nell'elenco (server/server.js), quindi qui non si scarica niente.
    return blobs.has(url) ? tipo(blobs.get(url), nome) : '';
  }
  const blobs = new Map();                      // blob: degli assets salvati nel browser → il loro file

  // ---------- misure e primo fotogramma di un video ----------
  /** Le misure di un video: { w, h } oppure null se non si legge. */
  const misureVideo = url => new Promise(res => {
    const v = document.createElement('video');
    const fine = r => { clearTimeout(t); v.removeAttribute('src'); try { v.load(); } catch {} res(r); };
    const t = setTimeout(() => fine(null), 30000);
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    v.onloadedmetadata = () => fine(v.videoWidth > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => fine(null);
    const u = urlMedia(url);
    if (!u) return fine(null);
    v.src = u;
  });
  /** Un fotogramma del video, già copiato su un canvas (miniature delle scene, colore della pagina):
   *  il video si chiude subito, così non tiene occupato il decodificatore del telefono. */
  const fotogramma = url => new Promise(res => {
    const v = document.createElement('video');
    const fine = ok => {
      clearTimeout(t);
      let c = null;
      if (ok && v.videoWidth > 0) {
        c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        try { c.getContext('2d').drawImage(v, 0, 0); } catch { c = null; }
      }
      v.removeAttribute('src'); try { v.load(); } catch {}
      res(c);
    };
    const t = setTimeout(() => fine(false), 30000);
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) v.crossOrigin = 'anonymous';
    v.onloadeddata = () => {
      if (v.currentTime > 0 || !(v.duration > 0.2)) return fine(true);
      v.onseeked = () => fine(true);
      v.currentTime = Math.min(0.1, v.duration / 2);                       // il primo fotogramma a volte è nero
    };
    v.onerror = () => fine(false);
    const u = urlMedia(url);
    if (!u) return fine(false);
    v.src = u;
  });
  /** Il primo fotogramma di un'immagine animata, come immagine ferma (blob: in memoria). */
  const ferme = new Map();
  function fermaImmagine(url) {
    if (!ferme.has(url)) ferme.set(url, (async () => {
      const u = urlMedia(url);
      if (!u) throw new Error('no');
      const im = new Image(); im.src = u; await im.decode();
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      if (!b) throw new Error('no');
      return URL.createObjectURL(b);
    })().catch(e => { ferme.delete(url); throw e; }));
    return ferme.get(url);
  }

  // ---------- movimento sì / no (per questo dispositivo) ----------
  const CHIAVE = 'libre-sfondi-animati';
  const pocoMoto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let attivo = !pocoMoto;
  try { const v = localStorage.getItem(CHIAVE); if (v === '0' || v === '1') attivo = v === '1'; } catch {}
  const ascolta = new Set();
  return {
    MAX_VIDEO, MAX_ANIMATA, urlMedia, ricordaBlob: (u, b) => blobs.set(u, b), eVideoFile, eVideoNome, tipo, tipoDaUrl, misureVideo, fotogramma, fermaImmagine,
    get attivo() { return attivo; },
    set attivo(v) {
      attivo = !!v;
      try { localStorage.setItem(CHIAVE, attivo ? '1' : '0'); } catch {}
      for (const f of ascolta) try { f(attivo); } catch {}
    },
    quandoCambia: f => ascolta.add(f)
  };
})();
