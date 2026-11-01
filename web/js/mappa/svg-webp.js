// ---------- SVG mostrati come WebP (punto 8) ----------
// Un SVG pesante (una mappa disegnata a mano) il browser lo ridisegna a ogni cambio di zoom e scatta.
// Qui ogni dispositivo (master e giocatori) lo disegna una volta su un canvas e lo tiene come WebP al
// 95% nella sua memoria (IndexedDB), con chiave «impronta del file + misura»; la campagna e la rete
// continuano a usare l'SVG originale. La misura: lato lungo = misura sulla mappa × zoom massimo ×
// densità dello schermo, con un tetto (8192 px sul telefono, 16384 sul computer, e al massimo 24-40
// milioni di pixel). Se si ingrandisce oltre quello che il WebP regge, si torna all'SVG: mai sgranato.
// Il WebP si mostra con «content: url(…)» sull'<img>: l'attributo src resta l'SVG, quindi tutto il
// resto (salvataggi, rete, copie dei segnalini) non cambia. Si spegne con ?svgwebp=0.
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('svgwebp') === '0' || typeof indexedDB === 'undefined') return;
  const TELEFONO = matchMedia('(pointer: coarse)').matches;
  const TETTO = TELEFONO ? 8192 : 16384, AREA = TELEFONO ? 24e6 : 40e6, QUALITA = 0.95;
  const DB = 'libre-svg-webp';

  // ---------- IndexedDB: chiave → blob WebP ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('webp');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const dbGet = async k => { try { const d = await db(); return await new Promise(ok => { const q = d.transaction('webp').objectStore('webp').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; } };
  const dbPut = async (k, v) => { try { const d = await db(); d.transaction('webp', 'readwrite').objectStore('webp').put(v, k); } catch {} };

  // ---------- è un SVG? e la sua impronta ----------
  const info = new Map();                                        // url → Promise<{ hash } | null>
  const forse = u => /\.svg(?:[?#]|$)/i.test(u) || /^data:image\/svg/i.test(u) || /\/asset\/[a-f0-9]{64}/.test(u);
  function svgDi(url) {
    if (!info.has(url)) info.set(url, (async () => {
      try {
        const r = await fetch(url); if (!r.ok) return null;
        const t = (r.headers.get('content-type') || '').toLowerCase();
        if (!t.includes('svg') && !/\.svg(?:[?#]|$)|^data:image\/svg/i.test(url)) return null;
        const buf = await r.arrayBuffer();
        const testa = new TextDecoder().decode(buf.slice(0, 400)).trimStart();
        if (!/^(<\?xml|<svg|<!--|<!DOCTYPE svg)/i.test(testa)) return null;
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
        return { hash: h, blob: new Blob([buf], { type: 'image/svg+xml' }) };
      } catch { return null; }
    })());
    return info.get(url);
  }

  // ---------- la misura del WebP per un'immagine grande w×h sulla mappa ----------
  function misura(w, h) {
    const maxS = typeof limits === 'function' ? limits().maxS : 4, dpr = Math.min(devicePixelRatio || 1, 3);
    let k = Math.max(w, h) * maxS * dpr / Math.max(w, h);       // pixel del WebP per unità della mappa
    k = Math.min(k, TETTO / Math.max(w, h), Math.sqrt(AREA / (w * h)));
    // a scalini, così piccoli cambi di misura (o di zoom massimo) riusano lo stesso file
    const W = Math.max(16, Math.round(w * k / 64) * 64), H = Math.max(16, Math.round(W * h / w));
    return { W, H };
  }
  async function disegna(blob, W, H) {
    const u = URL.createObjectURL(blob), im = new Image();
    try {
      im.src = u; await im.decode();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(im, 0, 0, W, H);
      const out = await new Promise(ok => c.toBlob(ok, 'image/webp', QUALITA));
      c.width = c.height = 0;
      return out && out.type === 'image/webp' ? out : null;
    } catch { return null; } finally { URL.revokeObjectURL(u); }
  }

  // ---------- le immagini sulla mappa ----------
  const pronti = new Map();                                      // chiave → url del blob
  const stato = new WeakMap();                                   // img → { src, W, wMondo, url }
  const coda = []; let lavoro = false;
  const dimMondo = img => {
    const box = img.closest('.photo') || (img.id === 'map' ? bgBox : null);
    if (!box) return null;
    const w = parseFloat(box.style.width) || 0, h = parseFloat(box.style.height) || 0;
    return w > 0 && h > 0 ? { w, h } : null;
  };
  function togli(img) { if (img.style.content) img.style.content = ''; img.classList.remove('svgWebp'); }
  function controlla(img) {
    const s = stato.get(img);
    if (!s || !s.url || img.getAttribute('src') !== s.src) return togli(img);
    const d = dimMondo(img); if (!d) return;
    const serve = Math.max(d.w, d.h) * (typeof view !== 'undefined' ? view.s : 1) * Math.min(devicePixelRatio || 1, 3);
    const regge = serve <= Math.max(s.W, s.H) * 1.02;            // oltre: torna l'SVG originale, nitido
    const v = `url("${s.url}")`;
    if (regge && img.style.content !== v) { img.style.content = v; img.classList.add('svgWebp'); }
    else if (!regge && img.style.content) togli(img);
  }
  async function prepara(img) {
    const src = img.getAttribute('src') || '';
    if (!src || !forse(src)) { stato.delete(img); return togli(img); }
    const d = dimMondo(img); if (!d) return;
    const prima = stato.get(img);
    const { W, H } = misura(d.w, d.h);
    if (prima && prima.src === src && prima.W === W && prima.url) return controlla(img);
    const sv = await svgDi(src);
    if (!sv) { stato.set(img, { src, W, H, url: null }); return togli(img); }
    const chiave = sv.hash + '@' + W + 'x' + H;
    let url = pronti.get(chiave);
    if (!url) {
      let blob = await dbGet(chiave);
      if (!blob) {
        blob = await disegna(sv.blob, W, H);
        if (!blob) { stato.set(img, { src, W, H, url: null }); return; }
        dbPut(chiave, blob);
      }
      url = URL.createObjectURL(blob); pronti.set(chiave, url);
    }
    if (img.getAttribute('src') !== src) return;                 // nel frattempo è cambiata
    stato.set(img, { src, W, H, url });
    controlla(img);
  }
  // una alla volta, quando il browser è libero
  const dopo = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 1500 }) : f => setTimeout(f, 200);
  function accoda(img) { if (!coda.includes(img)) coda.push(img); if (!lavoro) { lavoro = true; dopo(gira); } }
  async function gira() {
    const img = coda.shift();
    if (img && img.isConnected) { try { await prepara(img); } catch {} }
    if (coda.length) dopo(gira); else lavoro = false;
  }
  const tutte = () => [map, ...document.querySelectorAll('#world .photo img')];
  function rivedi() { for (const img of tutte()) { if (forse(img.getAttribute('src') || '')) accoda(img); else togli(img); } }

  // quando cambia qualcosa: nuove immagini, src, misure
  let attesa = 0;
  const presto = () => { clearTimeout(attesa); attesa = setTimeout(rivedi, 400); };
  new MutationObserver(presto).observe(world, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
  new MutationObserver(presto).observe(map, { attributes: true, attributeFilter: ['src'] });
  new MutationObserver(presto).observe(bgBox, { attributes: true, attributeFilter: ['style'] });
  // con lo zoom: WebP o SVG secondo quanto si ingrandisce (una volta per fotogramma)
  let raf = 0;
  const allaVista = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; for (const img of tutte()) if (stato.get(img)) controlla(img); }); };
  if (typeof applyView === 'function') {
    const prima = applyView;
    applyView = function () { const r = prima.apply(this, arguments); allaVista(); return r; };   // eslint-disable-line no-global-assign
  }
  addEventListener('resize', presto);
  setTimeout(rivedi, 1500);
  window.svgWebpRivedi = rivedi;
})();
