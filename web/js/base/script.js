const $ = id => document.getElementById(id);
const viewport = $('viewport'), stage = $('stage'), world = $('world'), bgBox = $('bgBox'), map = $('map');
const board = $('board'), boardFill = $('boardFill'), pingsEl = $('pings'), targetSwitch = $('targetSwitch');
const upload = $('upload'), gridEl = $('grid');

const STEP = 1.1;          // fattore di zoom per ogni scatto della rotellina
const BTN_STEP = 1.3;      // fattore di zoom dei pulsanti + e −
const MIN_FACTOR = 0.4;    // zoom minimo = 40% della vista "adatta allo schermo"
const MAX_FACTOR = 8;      // zoom massimo = 8 volte la vista "adatta allo schermo"
const KEEP = 80;           // px di contenuto che devono restare sempre visibili
const MIN_PHOTO = 30;      // dimensione minima di una foto/sfondo, in px a schermo
const DEFAULT_RECT = { x: 0, y: 0, w: 1900, h: 1100 };   // rettangolo di default (38 x 22 celle da 50)
const DEFAULT_BG = 'assets/Sfondi/main.webp';    // sfondo della prima scena (la schermata di benvenuto)
const BG_FOLDER = 'Sfondi';               // cartella degli assets dove finiscono gli sfondi caricati
const SNAP_PX = 8;         // distanza (px a schermo) entro cui i bordi del rettangolo e dell'immagine si agganciano
const PING_HOLD = 350;     // ms di pressione prima che parta il ping
const CM = 96 / 2.54;      // px CSS in un centimetro
const SIDE_DEFAULT = 340, SIDE_MIN = 280;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const view = { x: 0, y: 0, s: 1 };
let zTop = 1;
let layer = 'tokens';      // 'tokens' = si modificano i segnalini, 'map' = si modifica il rettangolo / lo sfondo
let target = 'board';      // nel livello Mappa: 'board' = rettangolo, 'bg' = immagine

// ---------- Impostazioni e scene ----------
const DEFAULT_GRID = { show: false, snap: false, fitToken: true, size: 50, color: '#ffffff', opacity: 85 };
const DEFAULT_BORDER = { color: '#000000', transparent: false, width: 3 };
const DEFAULT_PING = { color: '#ff4d4d', size: 2, speed: 8, fade: 2500 };      // size in cm, speed in cm/s, fade in ms
const SECTIONS = { look: true, res: false, grid: true, gridDefault: false, map: false, border: false, ping: false, sheets: false, tools: false, ordineStrumenti: false, hidden: false, chat: false };   // sezioni aperte di default
const RESOLUTIONS = [[480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '1440p'], [0, 'Originale']];
const settings = { theme: 'dark', autoBg: true, fogColor: 'auto', fogVeil: 0.55, caratLibere: false, spareggioDes: true, prefT: 0, boxLabels: ['', '', ''], resToken: 720, resBg: 1080, gridDefault: { ...DEFAULT_GRID }, border: { ...DEFAULT_BORDER }, ping: { ...DEFAULT_PING }, sections: {},
  tools: {}, drawerOpen: true, publicScene: null, unit: 'ft', sheetClose: 'x', rulerCenter: false, dockOpen: true, hiddenLayer: { show: true, opacity: 45 }, chatTabs: { rolls: false, rules: false },
  sheetStyle: { preset: 'parchment', accent: '', scale: 100, font: 'serif' }, pen: { color: '#ff4d4d', width: 4, tool: 'pen', fill: false } };
// Le impostazioni scelte nella home (rotellina): arrivano nell'indirizzo e valgono se sono più nuove
// di quelle salvate nella campagna. La dimensione dell'interfaccia sul telefono è lo zoom della pagina.
const PREF_HOME = (() => { try { const p = JSON.parse(new URLSearchParams(location.search).get('pref')); return p && typeof p === 'object' ? p : null; } catch { return null; } })();
(function scalaPagina() {
  let sc = PREF_HOME && +PREF_HOME.scala;
  try { if (sc) localStorage.setItem('libre-scala', String(sc)); else sc = +localStorage.getItem('libre-scala'); } catch {}
  if (!window.LIBRE_NATIVO || !LIBRE_NATIVO.disponibile || !(sc >= 70 && sc <= 160) || sc === 100) return;
  const v = document.querySelector('meta[name=viewport]'), k = sc / 100;
  if (v) v.content = `initial-scale=${k}, minimum-scale=${k}, maximum-scale=${k}, user-scalable=no, viewport-fit=cover`;
})();
function prefDallaHome() {
  const p = PREF_HOME;
  if (!p || !(+p.t > (settings.prefT || 0))) return false;
  if (['dark', 'light', 'system'].includes(p.tema)) settings.theme = p.tema;
  if (typeof p.caratLibere === 'boolean') settings.caratLibere = p.caratLibere;
  if (typeof p.spareggioDes === 'boolean') settings.spareggioDes = p.spareggioDes;
  settings.prefT = +p.t;
  return true;
}
let scenes = [], cur = null;            // cur = scena attiva
let grid = { ...DEFAULT_GRID };         // = cur.grid (stessa referenza)

// ---------- Salvataggio dello stato (chat e mappa) ----------
let online = false, boardReady = false, boardTimer = 0;
const persist = {
  async load(key) {
    try {
      if (online) { const r = await fetch('api/state?key=' + key); return r.ok ? await r.json() : null; }
      const v = localStorage.getItem('uffa-' + key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  save(key, value, flush) {
    const body = JSON.stringify(value);
    if (online) {
      fetch('api/state?key=' + key, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: !!flush && body.length < 60000 }).catch(() => {});
    } else {
      try { localStorage.setItem('uffa-' + key, body); } catch {}
    }
  }
};

// ---------- Geometria: sfondo, segnalini, limiti ----------
const num = (el, p) => parseFloat(el.style[p]) || 0;
const rectOf = el => ({ x: num(el, 'left'), y: num(el, 'top'), w: num(el, 'width'), h: num(el, 'height') });
const bgRect = () => bgBox.hidden ? null : rectOf(bgBox);
const boardRect = () => rectOf(board);
const baseRect = boardRect;

// il rettangolo (#board) è la fonte; #boardFill lo copia
function syncFill() { for (const p of ['left', 'top', 'width', 'height']) boardFill.style[p] = board.style[p]; }
function setBoard(r) {
  Object.assign(board.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  syncFill(); clipBg();
}
// l'immagine si vede solo dentro il rettangolo (tranne quando la si sta modificando)
function clipBg() {
  if (bgBox.hidden) return;
  if (layer === 'map' && target === 'bg') { bgBox.style.clipPath = ''; return; }
  const b = boardRect(), r = rectOf(bgBox);
  const l = Math.max(0, b.x - r.x), t = Math.max(0, b.y - r.y);
  const rr = Math.max(0, r.x + r.w - (b.x + b.w)), bb = Math.max(0, r.y + r.h - (b.y + b.h));
  bgBox.style.clipPath = l || t || rr || bb ? `inset(${t}px ${rr}px ${bb}px ${l}px)` : '';
}
setBoard(DEFAULT_RECT);

// tutto quello che si deve poter raggiungere: rettangolo + sfondo + segnalini.
// L'ingombro dei segnalini si ricalcola solo quando cambiano (non a ogni movimento delle dita).
let ingombroFoto = null;
new MutationObserver(() => { ingombroFoto = null; }).observe(world, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
function contentBounds() {
  const r = boardRect(), g = bgRect();
  let l = r.x, t = r.y, rr = r.x + r.w, b = r.y + r.h;
  if (g) { l = Math.min(l, g.x); t = Math.min(t, g.y); rr = Math.max(rr, g.x + g.w); b = Math.max(b, g.y + g.h); }
  if (!ingombroFoto) {
    let fl = Infinity, ft = Infinity, fr = -Infinity, fb = -Infinity;
    for (const p of world.querySelectorAll('.photo')) {
      const q = rectOf(p);
      fl = Math.min(fl, q.x); ft = Math.min(ft, q.y); fr = Math.max(fr, q.x + q.w); fb = Math.max(fb, q.y + q.h);
    }
    ingombroFoto = { l: fl, t: ft, r: fr, b: fb };
  }
  const f = ingombroFoto;
  if (f.l !== Infinity) { l = Math.min(l, f.l); t = Math.min(t, f.t); rr = Math.max(rr, f.r); b = Math.max(b, f.b); }
  return { x: l, y: t, w: rr - l, h: b - t };
}
const fitScale = r => Math.min(innerWidth / r.w, innerHeight / r.h);
function limits() {
  const fit = fitScale(baseRect());
  return { minS: fit * 0.9 * MIN_FACTOR, maxS: Math.max(fit * 0.9 * MAX_FACTOR, 4) };
}

// ---------- Vista (pan + zoom) ----------
function clampView() {
  const { minS, maxS } = limits(), b = contentBounds();
  view.s = clamp(view.s, minS, maxS);
  view.x = clamp(view.x, KEEP - (b.x + b.w) * view.s, innerWidth - KEEP - b.x * view.s);
  view.y = clamp(view.y, KEEP - (b.y + b.h) * view.s, innerHeight - KEEP - b.y * view.s);
}
function applyView() {
  cancelAnimationFrame(vistaRaf); vistaRaf = 0;
  clampView();
  const t = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  for (const el of [stage, world]) { el.style.transform = t; el.style.setProperty('--inv', 1 / view.s); }
  placeGrid();
  inMovimento();
}
// Durante un gesto (dita, rotellina) la vista si ridisegna una volta per fotogramma, e la mappa sta
// su un livello a parte (will-change) che si sposta senza ridisegnarla. Finito il gesto si toglie:
// il browser la ridisegna nitida alla nuova scala, solo la parte che si vede. Tenerlo sempre
// (com'era) su Android fissava la risoluzione e, ingrandendo molto, le tessere finivano la memoria
// della scheda grafica: mappa a blocchi, poi un rettangolo, poi niente.
let vistaRaf = 0, fermaMovimento = 0;
function richiediVista() { if (!vistaRaf) vistaRaf = requestAnimationFrame(() => { vistaRaf = 0; applyView(); }); }
function inMovimento() {
  document.body.classList.add('vistaMuove');
  clearTimeout(fermaMovimento);
  fermaMovimento = setTimeout(() => document.body.classList.remove('vistaMuove'), 180);
}

// animazione breve per i pulsanti dello zoom
let tween = 0, goal = null;
const stopTween = () => { cancelAnimationFrame(tween); goal = null; };
function setView(t, anim) {
  stopTween();
  if (!anim || matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(view, t); applyView(); scheduleBoardSave(); return; }
  const from = { ...view }, t0 = performance.now(), D = 240;
  goal = t;
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    for (const p of ['x', 'y', 's']) view[p] = from[p] + (t[p] - from[p]) * e;
    applyView();
    if (k < 1) tween = requestAnimationFrame(step); else { goal = null; scheduleBoardSave(); }
  };
  tween = requestAnimationFrame(step);
}
function zoomBy(f, cx = innerWidth / 2, cy = innerHeight / 2) {
  const from = goal || view, { minS, maxS } = limits();
  const s = clamp(from.s * f, minS, maxS), k = s / from.s;
  setView({ s, x: cx - (cx - from.x) * k, y: cy - (cy - from.y) * k }, true);
}
// centra tutto lo sfondo alla massima dimensione possibile, senza tagliarlo (margin < 1 lascia un po' d'aria)
function fitView(anim, margin = 1) {
  const r = baseRect(), s = fitScale(r) * margin;
  setView({ s, x: (innerWidth - r.w * s) / 2 - r.x * s, y: (innerHeight - r.h * s) / 2 - r.y * s }, anim);
}
// una vista salvata su uno schermo di un'altra misura (il master sul computer, il telefono girato):
// si tiene lo stesso punto della mappa al centro e si scala nella stessa proporzione
function adattaVista(v) {
  const W = innerWidth, H = innerHeight;
  if (!(v.w > 0 && v.h > 0)) return (W < 600 || (H < 500 && W < 1000)) ? null : v;   // vista vecchia senza misura: sul telefono si centra
  if (v.w === W && v.h === H) return v;
  const cx = (v.w / 2 - v.x) / v.s, cy = (v.h / 2 - v.y) / v.s, s = v.s * Math.min(W / v.w, H / v.h);
  return { x: W / 2 - cx * s, y: H / 2 - cy * s, s };
}
let vistaW = innerWidth, vistaH = innerHeight;
addEventListener('resize', () => {
  // cambia la larghezza (telefono girato, finestra ridimensionata): stesso centro. Se cambia solo
  // l'altezza (la tastiera del telefono che si apre) la mappa resta dov'è.
  if (innerWidth !== vistaW) { const v = adattaVista({ x: view.x, y: view.y, s: view.s, w: vistaW, h: vistaH }); if (v) Object.assign(view, { x: v.x, y: v.y, s: v.s }); }
  vistaW = innerWidth; vistaH = innerHeight;
  applyView();
});

// Zoom con la rotellina, centrato sul puntatore (con limiti min/max)
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  stopTween();
  const { minS, maxS } = limits();
  const newS = clamp(view.s * (e.deltaY < 0 ? STEP : 1 / STEP), minS, maxS);
  const f = newS / view.s;
  view.x = e.clientX - (e.clientX - view.x) * f;
  view.y = e.clientY - (e.clientY - view.y) * f;
  view.s = newS;
  richiediVista();
  scheduleBoardSave();
}, { passive: false });

// Pizzico col touchpad (arriva come rotellina con Ctrl): mai lo zoom di tutta la pagina.
// Sulla mappa ci pensa la mappa; sulla scheda Standard ingrandisce il foglio; altrove non fa niente.
addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const w = e.target.closest && e.target.closest('.stdWin');
  if (w && typeof stdZoom === 'function') stdZoom(w, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) / 250));
}, { passive: false, capture: true });
// Safari / iPad: il pizzico arriva anche come «gesture»
for (const t of ['gesturestart', 'gesturechange']) addEventListener(t, e => e.preventDefault(), { passive: false });

// ---------- Griglia (disegnata a schermo ma solo dentro il rettangolo, con linee sempre sottili) ----------
function paintGrid() {
  const gc = `color-mix(in srgb, ${grid.color} ${grid.opacity}%, transparent)`, dk = 'rgba(0, 0, 0, .4)';
  gridEl.style.backgroundImage =
    `linear-gradient(to right, ${gc} 1px, transparent 0), linear-gradient(to bottom, ${gc} 1px, transparent 0),` +
    `linear-gradient(to right, ${dk} 3px, transparent 0), linear-gradient(to bottom, ${dk} 3px, transparent 0)`;
  placeGrid();
}
function placeGrid() {
  const r = boardRect(), s = view.s;
  const x0 = Math.round(view.x + r.x * s), y0 = Math.round(view.y + r.y * s);
  const x1 = Math.round(view.x + (r.x + r.w) * s), y1 = Math.round(view.y + (r.y + r.h) * s);
  const l = Math.max(0, x0), t = Math.max(0, y0), rr = Math.min(innerWidth, x1), bb = Math.min(innerHeight, y1);
  const visible = !!grid.show && rr > l && bb > t;
  gridEl.classList.toggle('on', visible);
  if (!visible) return;
  const c = Math.max(3, grid.size * s), px = x0 - l, py = y0 - t;
  Object.assign(gridEl.style, { left: l + 'px', top: t + 'px', width: rr - l + 'px', height: bb - t + 'px', backgroundSize: `${c}px ${c}px` });
  gridEl.style.backgroundPosition = `${px}px ${py}px, ${px}px ${py}px, ${px - 1}px ${py - 1}px, ${px - 1}px ${py - 1}px`;
}
// le celle partono dall'angolo in alto a sinistra del rettangolo
const snapPoint = (x, y) => {
  if (!grid.snap) return { x, y };
  const b = boardRect();
  return { x: b.x + Math.round((x - b.x) / grid.size) * grid.size, y: b.y + Math.round((y - b.y) / grid.size) * grid.size };
};

function paintBorder() {
  const b = settings.border;
  board.style.setProperty('--bw', b.width);
  board.style.setProperty('--bc', b.transparent ? 'transparent' : b.color);
}
paintBorder();

// ---------- Selezione (anche multipla) ----------
let selected = null;       // l'ultimo selezionato
let selection = [];        // tutti i selezionati
function setSelection(list) {
  for (const p of selection) p.classList.remove('selected');
  selection = list.filter(p => p && p.isConnected);
  selected = selection[selection.length - 1] || null;
  for (const p of selection) p.classList.add('selected');
  world.classList.toggle('multi', selection.length > 1);     // con più segnalini niente maniglie
}
const select = photo => setSelection(photo ? [photo] : []);
const marqueeEl = document.createElement('div');
marqueeEl.id = 'marquee'; marqueeEl.hidden = true;
document.body.appendChild(marqueeEl);
function finishMarquee() {
  const r = marqueeEl.getBoundingClientRect();
  marqueeEl.hidden = true;
  setSelection([...world.querySelectorAll('.photo')].filter(p => {
    if ((p.dataset.layer || 'tokens') !== layer) return false;
    const q = p.getBoundingClientRect();
    return q.right >= r.left && q.left <= r.right && q.bottom >= r.top && q.top <= r.bottom;
  }));
}

// ---------- Livelli: segnalini / mappa ----------
const editTarget = () => target === 'bg' && !bgBox.hidden ? bgBox : board;
function refreshEditing() {
  const inMap = layer === 'map', hasBg = !bgBox.hidden;
  board.classList.toggle('editing', inMap && !(target === 'bg' && hasBg));
  bgBox.classList.toggle('editing', inMap && target === 'bg' && hasBg);
  targetSwitch.hidden = !(inMap && hasBg);
  targetSwitch.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.target === (target === 'bg' && hasBg ? 'bg' : 'board')));
  clipBg();
}
function setLayer(l) {
  layer = l;
  viewport.classList.toggle('layer-map', l === 'map');
  viewport.classList.toggle('layer-hidden', l === 'hidden');
  select(null);
  document.querySelectorAll('#layerSwitch button').forEach(b => b.classList.toggle('active', b.dataset.layer === l));
  refreshEditing();
}
document.querySelectorAll('#layerSwitch button').forEach(b => b.addEventListener('click', () => setLayer(b.dataset.layer)));
targetSwitch.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { target = b.dataset.target; refreshEditing(); }));

// ---------- Interazione: destro = vista, sinistro = foto (o rettangolo/sfondo nel livello Mappa) ----------
viewport.addEventListener('contextmenu', e => e.preventDefault());

// Il segnalino su cui agisce un clic: quello più in alto. Per un giocatore net.js lo cambia: tra quelli
// impilati sotto il puntatore, il primo che può muovere (così il suo si prende anche se un altro lo copre).
function fotoDelClic(e) { return e.target.closest('.photo'); }

let mode = null;           // 'pan' | 'photo' | 'frame' | 'resize' | 'ping' | null
let startX = 0, startY = 0;
let origX = 0, origY = 0;  // posizione iniziale (vista o elemento)
let origW = 0, origH = 0;  // dimensioni iniziali dell'elemento
let dir = '';              // maniglia in uso: n, s, e, w, ne, nw, se, sw
let activeEl = null;       // foto, rettangolo o sfondo in uso
let companion = null;      // spostando il rettangolo, l'immagine lo segue (posizione iniziale)
let group = [], photoMoved = false;       // altri segnalini selezionati che si muovono insieme
let rightPhoto = null, moved = false;   // clic destro su una foto = duplica (se non si trascina)
let holdTimer = 0, livePing = null;

viewport.addEventListener('pointerdown', e => {
  stopTween();
  if (e.button === 2) {                       // tasto destro: sposta la vista
    mode = 'pan';
    rightPhoto = e.target.closest('.photo'); moved = false;
    origX = view.x; origY = view.y;
    viewport.classList.add('panning');
  } else if (e.button === 0 && layer === 'map' && !e.target.closest('.photo')) {   // livello Mappa: si sposta/ridimensiona il rettangolo o lo sfondo
    const el = editTarget(), r = rectOf(el);
    const wx = (e.clientX - view.x) / view.s, wy = (e.clientY - view.y) / view.s;
    const handle = e.target.closest('.handle');
    if (handle && handle.parentElement === el) { mode = 'resize'; dir = handle.dataset.d; }
    else if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) { mode = 'frame'; viewport.classList.add('panning'); }
    else return;
    activeEl = el; origX = r.x; origY = r.y; origW = r.w; origH = r.h;
    companion = el === board && !bgBox.hidden ? { x: num(bgBox, 'left'), y: num(bgBox, 'top') } : null;
  } else if (e.button === 0) {                // livello Segnalini: seleziona / sposta / ridimensiona la foto
    const photo = fotoDelClic(e);
    if (!photo) {                             // clic su un punto libero: deseleziona; se si tiene premuto parte il ping
      select(null);
      mode = 'ping';
      const x = e.clientX, y = e.clientY;
      holdTimer = setTimeout(() => { holdTimer = 0; startPing(x, y); }, PING_HOLD);
    } else {
      if (!selection.includes(photo)) select(photo);
      activeEl = photo; photoMoved = false;
      if (photo.dataset.layer !== 'map') photo.style.zIndex = ++zTop;
      group = selection.length > 1 ? selection.filter(p => p !== photo).map(p => ({ el: p, x: num(p, 'left'), y: num(p, 'top') })) : [];
      origX = num(photo, 'left'); origY = num(photo, 'top');
      origW = num(photo, 'width'); origH = num(photo, 'height');
      const handle = e.target.closest('.handle');
      if (handle && photo.contains(handle)) { mode = 'resize'; dir = handle.dataset.d; }
      else { mode = 'photo'; photo.classList.add('dragging'); }
    }
  } else return;
  startX = e.clientX; startY = e.clientY;
  viewport.setPointerCapture(e.pointerId);
});

// ---- aggancio dei bordi: il rettangolo si aggancia all'immagine e viceversa ----
function snapSource(el) {
  if (el === board) { const g = bgRect(); return g && { xs: [g.x, g.x + g.w], ys: [g.y, g.y + g.h] }; }
  if (el === bgBox) { const b = boardRect(); return { xs: [b.x, b.x + b.w], ys: [b.y, b.y + b.h] }; }
  return null;
}
function snapTo(v, cands) {
  let best = v, d = SNAP_PX / view.s;
  for (const c of cands) { const k = Math.abs(c - v); if (k < d) { d = k; best = c; } }
  return best;
}
function snapMove(v, size, cands) {          // aggancia il bordo iniziale o quello finale
  let best = v, d = SNAP_PX / view.s;
  for (const c of cands) {
    if (Math.abs(v - c) < d) { d = Math.abs(v - c); best = c; }
    if (Math.abs(v + size - c) < d) { d = Math.abs(v + size - c); best = c - size; }
  }
  return best;
}

function resizeEl(el, dx, dy) {
  const min = MIN_PHOTO / view.s, sn = snapSource(el);
  const sx = v => sn ? snapTo(v, sn.xs) : v, sy = v => sn ? snapTo(v, sn.ys) : v;
  const hasE = dir.includes('e'), hasW = dir.includes('w');
  const hasS = dir.includes('s'), hasN = dir.includes('n');
  let L = origX, T = origY, R = origX + origW, B = origY + origH;

  if (dir.length === 2 && el !== board) {
    // angolo: ridimensionamento proporzionale, ancorato all'angolo opposto (il rettangolo invece è libero)
    const nw = origW + (hasE ? dx : -dx);
    const nh = origH + (hasS ? dy : -dy);
    const k = Math.max(nw / origW, nh / origH, min / origW, min / origH);
    const w = origW * k, h = origH * k;
    L = hasW ? origX + origW - w : origX; R = L + w;
    T = hasN ? origY + origH - h : origY; B = T + h;
  } else {
    // lato (o angolo libero): si sposta solo quel bordo
    if (hasE) R = Math.max(L + min, sx(origX + origW + dx));
    if (hasW) L = Math.min(origX + origW - min, sx(origX + dx));
    if (hasS) B = Math.max(T + min, sy(origY + origH + dy));
    if (hasN) T = Math.min(origY + origH - min, sy(origY + dy));
  }
  el.style.left = L + 'px'; el.style.top = T + 'px';
  el.style.width = (R - L) + 'px'; el.style.height = (B - T) + 'px';
}

viewport.addEventListener('pointermove', e => {
  if (!mode) return;
  const dx = e.clientX - startX, dy = e.clientY - startY;
  if (mode === 'ping') {
    if (livePing || Math.hypot(dx, dy) <= 6) return;
    clearTimeout(holdTimer); holdTimer = 0; mode = 'marquee'; marqueeEl.hidden = false;   // si sta trascinando: niente ping, rettangolo di selezione
  }
  if (mode === 'marquee') {
    Object.assign(marqueeEl.style, { left: Math.min(startX, e.clientX) + 'px', top: Math.min(startY, e.clientY) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
    return;
  }
  if (mode === 'pan') {
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    view.x = origX + dx;
    view.y = origY + dy;
    applyView();
  } else if (mode === 'photo') {
    // le foto vivono nelle coordinate della mappa: dividi per lo zoom
    const p = snapPoint(origX + dx / view.s, origY + dy / view.s);
    activeEl.style.left = p.x + 'px';
    activeEl.style.top  = p.y + 'px';
    if (Math.hypot(dx, dy) > 3) photoMoved = true;
    for (const g of group) { g.el.style.left = g.x + (p.x - origX) + 'px'; g.el.style.top = g.y + (p.y - origY) + 'px'; }
  } else if (mode === 'frame') {
    const nx = origX + dx / view.s, ny = origY + dy / view.s;
    if (activeEl === board) {                 // il rettangolo porta con sé l'immagine
      board.style.left = nx + 'px'; board.style.top = ny + 'px';
      if (companion) { bgBox.style.left = companion.x + (nx - origX) + 'px'; bgBox.style.top = companion.y + (ny - origY) + 'px'; }
    } else {                                  // l'immagine si aggancia ai bordi del rettangolo
      const b = boardRect();
      bgBox.style.left = snapMove(nx, origW, [b.x, b.x + b.w]) + 'px';
      bgBox.style.top = snapMove(ny, origH, [b.y, b.y + b.h]) + 'px';
    }
  } else if (mode === 'resize') {
    resizeEl(activeEl, dx / view.s, dy / view.s);
  }
  if (activeEl === board || activeEl === bgBox) { syncFill(); clipBg(); placeGrid(); }
});

function stop() {
  if (mode === 'marquee') finishMarquee();
  if (mode === 'photo' && !photoMoved && selection.length > 1) select(activeEl);     // clic semplice: resta solo questo
  group = [];
  const wasFrame = activeEl === bgBox || activeEl === board;
  clearTimeout(holdTimer); holdTimer = 0;
  if (livePing) { livePing.held = false; livePing = null; }     // rilasciato: il ping smette di crescere e sbiadisce
  mode = null; companion = null;
  viewport.classList.remove('panning');
  if (activeEl) activeEl.classList.remove('dragging');
  activeEl = null;
  if (wasFrame) applyView();     // i limiti della vista e la griglia dipendono dal rettangolo e dallo sfondo
  scheduleBoardSave();
}
viewport.addEventListener('pointerup', () => { rightPhoto = null; stop(); });
viewport.addEventListener('pointercancel', stop);

// ---------- Ping: tieni premuto e un cerchio cresce dal cursore (dimensioni reali in cm, non seguono lo zoom) ----------
function startPing(x, y) {
  const { color, size, speed, fade } = settings.ping;
  const max = size * CM, rate = speed * CM;                     // px e px/s
  const el = document.createElement('div');
  el.className = 'ping';
  el.style.setProperty('--pc', color);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.width = el.style.height = '0px';
  pingsEl.appendChild(el);
  const ping = { held: true };
  livePing = ping;
  const t0 = performance.now();
  let tf = 0, r = 0;
  const frame = now => {
    if (!tf) {
      r = Math.min(max, (now - t0) / 1000 * rate);
      el.style.width = el.style.height = 2 * r + 'px';
      if (r >= max || !ping.held) { tf = now; if (livePing === ping && r >= max) livePing = null; }   // crescita finita (o rilascio): inizia a sbiadire
    }
    if (tf) {
      const k = fade > 0 ? (now - tf) / fade : 1;
      if (k >= 1) { el.remove(); return; }
      el.style.opacity = 1 - k;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- Foto (segnalini) sulla mappa ----------
const HANDLES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];   // i lati prima, gli angoli sopra
let added = 0;
const addHandles = el => { for (const d of HANDLES) { const hd = document.createElement('div'); hd.className = 'handle'; hd.dataset.d = d; el.appendChild(hd); } };
addHandles(bgBox);
addHandles(board);

function createPhoto(url, w, h, l, t, aid, silent, lay) {
  const photo = document.createElement('div');
  photo.className = 'photo';
  photo.dataset.layer = lay || 'tokens';
  if (aid != null) photo.dataset.aid = aid;
  Object.assign(photo.style, { width: w + 'px', height: h + 'px', left: l + 'px', top: t + 'px', zIndex: ++zTop });
  const img = new Image();
  // Un'immagine della sessione può non essere ancora arrivata: si riprova qualche volta
  // prima di dare per perso il segnalino.
  let tries = 0;
  img.onerror = () => {
    if (/\/asset\/[a-f0-9]{64}/.test(url) && ++tries <= 6) { setTimeout(() => { img.src = url + '?r=' + tries; }, 900 * tries); return; }
    photo.remove(); setSelection(selection); scheduleBoardSave();
  };
  img.src = url; img.draggable = false;
  photo.appendChild(img);
  addHandles(photo);
  world.appendChild(photo);
  if (!silent) { select(photo); scheduleBoardSave(); }
  return photo;
}

// `at` = centro in coordinate mappa (es. punto di rilascio); senza, va al centro dello schermo
function addPhotoToMap(url, at, aid) {
  const img = new Image();
  img.onload = () => {
    let w = Math.min(img.naturalWidth, 250);
    let h = w * img.naturalHeight / img.naturalWidth;
    const fit = grid.show && grid.fitToken;           // con la griglia visibile il lato lungo è una casella
    if (fit) { const k = grid.size / Math.max(img.naturalWidth, img.naturalHeight); w = img.naturalWidth * k; h = img.naturalHeight * k; }
    let l, t;
    if (at && fit && grid.snap) {                     // al centro della casella sotto il rilascio
      const b = boardRect();
      l = b.x + Math.floor((at.x - b.x) / grid.size) * grid.size + (grid.size - w) / 2;
      t = b.y + Math.floor((at.y - b.y) / grid.size) * grid.size + (grid.size - h) / 2;
    }
    else if (at) { l = at.x - w / 2; t = at.y - h / 2; }
    else {
      const off = (added++ % 8) * 20;
      l = (innerWidth / 2 - view.x) / view.s - w / 2 + off;
      t = (innerHeight / 2 - view.y) / view.s - h / 2 + off;
    }
    const p = fit && grid.snap && at ? { x: l, y: t } : snapPoint(l, t);
    if (layer === 'map') setLayer('tokens');
    createPhoto(url, w, h, p.x, p.y, aid, false, layer === 'hidden' ? 'hidden' : 'tokens');
  };
  img.src = url;
}

// Duplica con stessa dimensione e proporzioni, spostata di poco (di una cella se la griglia aggancia)
// Copia un oggetto con TUTTE le sue impostazioni (misure, livello, collegamento alla scheda, forma...)
function cloneEl(src, dx, dy) {
  const l = num(src, 'left') + dx, t = num(src, 'top') + dy, w = num(src, 'width'), h = num(src, 'height');
  const el = src._shape ? createShape({ ...src._shape }, w, h, l, t, src.dataset.layer)
    : createPhoto(src.querySelector('img').src, w, h, l, t, src.dataset.aid, false, src.dataset.layer);
  for (const k of Object.keys(src.dataset)) if (k !== 'aid') el.dataset[k] = src.dataset[k];
  applyLook(el);
  return el;
}
function duplicatePhoto(src) {
  const d = grid.snap ? grid.size : 20 / view.s;
  return cloneEl(src, d, d);
}

// Canc / Backspace elimina la foto selezionata
addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    e.preventDefault();
    for (const p of selection) p.remove();
    setSelection([]);
    scheduleBoardSave();
  }
});

// Rilascio di una miniatura sulla mappa
viewport.addEventListener('dragover', e => {
  if (e.dataTransfer.types.includes('application/x-asset')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
});
viewport.addEventListener('drop', e => {
  const raw = e.dataTransfer.getData('application/x-asset');
  if (!raw) return;
  e.preventDefault();
  const a = JSON.parse(raw);
  addPhotoToMap(a.url, { x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s }, a.id);
});

// ---------- Sfondo della scena ----------
function setBgBox(bg) {
  if (!bg) {
    bgBox.hidden = true; bgBox.dataset.url = ''; bgBox.dataset.aid = '';
    map.removeAttribute('src');
    refreshEditing();
    return;
  }
  bgBox.hidden = false;
  Object.assign(bgBox.style, { left: bg.x + 'px', top: bg.y + 'px', width: bg.w + 'px', height: bg.h + 'px' });
  bgBox.dataset.url = bg.url; bgBox.dataset.aid = bg.aid ?? ''; bgBox.dataset.gid = bg.gid || '';
  map.src = bg.url;
  riduciSulTelefono(bg.url);
  refreshEditing();
}
// Sul telefono una mappa enorme (oltre 4096 px di lato) si mostra da una copia ridotta, fatta qui
// e tenuta solo in memoria: la campagna resta com'è. Le misure restano quelle dell'originale.
const LATO_TELEFONO = 4096, copieRidotte = new Map();
async function riduciSulTelefono(url) {
  map.dataset.nw = map.dataset.nh = '';
  if (!matchMedia('(pointer: coarse)').matches || !url || typeof createImageBitmap !== 'function') return;
  try {
    let copia = copieRidotte.get(url);
    if (!copia) {
      const im = new Image(); im.src = url; await im.decode();
      const lato = Math.max(im.naturalWidth, im.naturalHeight);
      if (lato <= LATO_TELEFONO) return;
      const k = LATO_TELEFONO / lato, w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', .9));
      if (!blob) return;
      copia = { src: URL.createObjectURL(blob), nw: im.naturalWidth, nh: im.naturalHeight };
      copieRidotte.set(url, copia);
    }
    if (bgBox.dataset.url !== url) return;            // nel frattempo è cambiato lo sfondo
    map.dataset.nw = copia.nw; map.dataset.nh = copia.nh;
    map.src = copia.src;
  } catch {}
}
const misuraMappa = () => ({ w: +map.dataset.nw || map.naturalWidth, h: +map.dataset.nh || map.naturalHeight });
// legge le misure naturali dell'immagine: {url, aid, x, y, w, h} oppure null se non si carica
const loadBg = (url, aid) => new Promise(res => {
  const im = new Image();
  im.onload = () => res({ url, aid, x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight });
  im.onerror = () => res(null);
  im.src = url;
});
async function setBackground(url, aid) {
  const bg = await loadBg(url, aid);
  if (!bg) { setStatus('❌ Non riesco a leggere questa immagine come sfondo.'); return; }
  setBgBox(bg);
  setBoard({ x: bg.x, y: bg.y, w: bg.w, h: bg.h });     // il rettangolo copre tutta la mappa
  fitView(false, 0.9);
  updatePageColor();
  scheduleBoardSave();
}

// ---------- Colore della pagina dall'immagine di sfondo (colore più presente) ----------
const colorCache = new Map();
function dominantColor(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, 64 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height).data, buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);   // 16 livelli per canale
          let b = buckets.get(key); if (!b) buckets.set(key, b = [0, 0, 0, 0]);
          b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2];
        }
        let best = null;
        for (const b of buckets.values()) if (!best || b[0] > best[0]) best = b;
        res(best ? `rgb(${Math.round(best[1] / best[0])}, ${Math.round(best[2] / best[0])}, ${Math.round(best[3] / best[0])})` : null);
      } catch { res(null); }      // es. aprendo index.html con doppio clic il browser blocca la lettura dei pixel
    };
    im.onerror = () => res(null);
    im.src = url;
  });
}
async function updatePageColor() {
  const root = document.documentElement, url = settings.autoBg && !bgBox.hidden ? bgBox.dataset.url : '';
  let color = null;
  if (url) {
    if (!colorCache.has(url)) colorCache.set(url, await dominantColor(url));
    if (bgBox.dataset.url !== url || !settings.autoBg) return;       // nel frattempo è cambiato qualcosa
    color = colorCache.get(url);
  }
  if (color) root.style.setProperty('--page-bg', color); else root.style.removeProperty('--page-bg');
  document.querySelector('meta[name=theme-color]').content = color || getComputedStyle(root).getPropertyValue('--bg').trim();
  if (typeof fogApply === 'function') fogApply();            // la nebbia «automatica» ha il colore dello sfondo
}

// ---------- Tema ----------
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme === 'system' ? (darkMq.matches ? 'dark' : 'light') : settings.theme;
  updatePageColor();
}
darkMq.addEventListener('change', () => settings.theme === 'system' && applyTheme());


// ---------- Scene ----------
function newScene(name, type) {
  const g = { ...settings.gridDefault, show: type === 'map' };
  if (type !== 'map') g.snap = false;
  return { id: uid(), name, type, bg: null, board: { ...DEFAULT_RECT }, grid: g, photos: [], view: null };
}

// scrive nella scena attiva quello che c'è sullo schermo
function captureScene() {
  if (!cur) return;
  cur.view = { x: view.x, y: view.y, s: view.s, w: innerWidth, h: innerHeight };
  cur.board = rectOf(board);
  cur.bg = bgBox.hidden ? null : { ...rectOf(bgBox), url: rifImmagine(bgBox.dataset.url, bgBox.dataset.gid), gid: bgBox.dataset.gid || undefined, aid: bgBox.dataset.aid === '' ? undefined : +bgBox.dataset.aid };
  cur.photos = [...world.querySelectorAll('.photo')].map(p => ({
    id: p.dataset.pid && p.dataset.pid !== 'pending' ? p.dataset.pid : (p.dataset.pid = uid()),
    owner: p.dataset.owner || undefined, gid: p.dataset.gid || undefined,
    url: p._shape ? undefined : rifImmagine(p.querySelector('img').getAttribute('src'), p.dataset.gid), shape: p._shape, layer: p.dataset.layer, aid: p.dataset.aid === undefined ? undefined : +p.dataset.aid,
    l: num(p, 'left'), t: num(p, 'top'), w: num(p, 'width'), h: num(p, 'height'), z: +p.style.zIndex, sheet: p.dataset.sheet, name: p.dataset.name, round: p.dataset.round, ring: p.dataset.ring,
    fx: p.dataset.fx || undefined, crossed: p.dataset.crossed ? true : undefined, vals: p.dataset.vals || undefined,
    ...(typeof luceDatiSegnalino === 'function' ? luceDatiSegnalino(p) : {})
  }));
  if (typeof drawSnapshot === 'function') cur.draw = drawSnapshot();
}

// Un'immagine si salva sempre con il suo riferimento stabile («gs:<hash>» per il deposito della
// partita, «assets/…» per quelle della campagna), mai con l'indirizzo calcolato per mostrarla
// (http://127.0.0.1:<porta>/asset/<hash>): la porta cambia a ogni avvio e l'immagine sparirebbe.
// Le campagne salvate così dalle versioni prima si sistemano da sole quando si rileggono.
function rifImmagine(url, gid) {
  if (gid) return 'gs:' + gid;
  const m = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/asset\/([a-f0-9]{64})/.exec(String(url || ''));
  if (m) return 'gs:' + m[1];
  const a = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/(assets\/.+)$/.exec(String(url || ''));
  return a ? decodeURI(a[1]) : url;
}
// i link blob: durano solo una sessione: in modalità "solo browser" si ritrovano tramite l'id dell'asset
function resolveUrl(o) {
  if (!o || !o.url) return null;
  if (!o.gid && /^https?:/.test(o.url)) { const r = rifImmagine(o.url); if (r !== o.url) o = { ...o, url: r }; }
  // «gs:<hash>» è un file del deposito della sessione: lo serve il server di gioco locale
  const gid = o.gid || (o.url.startsWith('gs:') ? o.url.slice(3) : null);
  if (gid && typeof netAssetUrl === 'function') return netAssetUrl(gid);
  if (o.url.startsWith('gs:')) return null;
  if (o.aid != null && store === localStore) return data.items.find(i => i.id === o.aid)?.url || null;
  return o.url.startsWith('blob:') ? null : o.url;
}

/** Un segnalino (o un disegno) dai dati salvati o arrivati dal server; null se l'immagine non c'è. */
function creaDaDati(p) {
  if (p.shape) {
    const el = createShape(p.shape, p.w, p.h, p.l, p.t, p.layer, true);
    if (p.sheet) el.dataset.sheet = p.sheet;
    if (p.id) el.dataset.pid = p.id;
    if (p.owner) el.dataset.owner = p.owner;
    return el;
  }
  const url = resolveUrl(p);
  if (!url) return null;
  const el = createPhoto(url, p.w, p.h, p.l, p.t, p.aid, true, p.layer);
  datiSuSegnalino(el, p);
  return el;
}
/** Nome, scheda, proprietario, effetti, immagine condivisa: dai dati al segnalino che c'è già. */
function datiSuSegnalino(el, p) {
  for (const k of ['sheet', 'name', 'round', 'ring']) if (p[k]) el.dataset[k] = p[k]; else delete el.dataset[k];
  if (p.id) el.dataset.pid = p.id;
  if (p.owner) el.dataset.owner = p.owner; else delete el.dataset.owner;
  if (typeof fxDaDati === 'function') fxDaDati(el, p);
  const g = p.gid || (String(p.url).startsWith('gs:') ? p.url.slice(3) : '');
  if (g) el.dataset.gid = g; else delete el.dataset.gid;
  applyLook(el);
}

async function showScene(sc) {
  if (cur && cur !== sc) captureScene();
  cur = sc; grid = sc.grid;
  stopTween(); select(null);
  world.replaceChildren();
  for (const p of sc.photos.slice().sort((a, b) => a.z - b.z)) creaDaDati(p);
  if (typeof drawLoad === 'function') drawLoad(sc.draw);
  if (typeof updateTokenBars === 'function') updateTokenBars();
  setBoard(sc.board);
  const url = resolveUrl(sc.bg);
  setBgBox(url ? { ...sc.bg, url, gid: sc.bg.gid || (String(sc.bg.url).startsWith('gs:') ? sc.bg.url.slice(3) : undefined) } : null);
  setLayer('tokens');
  paintGrid();
  const vista = sc.view && adattaVista(sc.view);
  if (vista) { Object.assign(view, { x: vista.x, y: vista.y, s: vista.s }); applyView(); } else fitView(false, 0.9);
  updatePageColor();
  renderSceneUI(); syncSettings();
}

async function switchScene(id) {
  closeSceneMenu();
  const sc = scenes.find(s => s.id === id);
  if (!sc || sc === cur) return;
  await showScene(sc);
  scheduleBoardSave();
}

// menu delle scene
const sceneMenu = $('sceneMenu'), sceneBtn = $('sceneBtn');
const closeSceneMenu = () => { sceneMenu.hidden = true; sceneBtn.setAttribute('aria-expanded', 'false'); };
sceneBtn.addEventListener('click', () => {
  const open = sceneMenu.hidden;
  sceneMenu.hidden = !open;
  sceneBtn.setAttribute('aria-expanded', open);
});
addEventListener('pointerdown', e => { if (!sceneMenu.hidden && !$('sceneWrap').contains(e.target)) closeSceneMenu(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeSceneMenu(); });

function renderSceneUI() {
  $('sceneName').textContent = cur.name;
  document.title = 'LIBRE VTT - ' + cur.name;
  $('sceneIcon').textContent = cur.type === 'map' ? '🗺' : '🎬';
  $('gridSceneName').textContent = '«' + cur.name + '»';
  $('sceneList').replaceChildren(...scenes.map(sc => {
    const row = document.createElement('div');
    row.className = 'sceneRow' + (sc === cur ? ' active' : '');
    row.dataset.id = sc.id;
    const pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'pick';
    const ic = document.createElement('span'); ic.textContent = sc.type === 'map' ? '🗺' : '🎬';
    const nm = document.createElement('span'); nm.textContent = sc.name;
    pick.append(ic, nm);
    pick.addEventListener('click', () => switchScene(sc.id));
    const ren = document.createElement('button');
    ren.type = 'button'; ren.textContent = '✎'; ren.title = 'Rinomina'; ren.setAttribute('aria-label', 'Rinomina ' + sc.name);
    ren.addEventListener('click', () => {
      const n = prompt('Nuovo nome della scena', sc.name);
      if (n && n.trim()) { sc.name = n.trim().slice(0, 40); renderSceneUI(); scheduleBoardSave(); }
    });
    row.append(pick, ren);
    if (typeof decorateSceneRow === 'function') decorateSceneRow(row, sc);
    if (scenes.length > 1) {
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '🗑'; del.title = 'Elimina'; del.setAttribute('aria-label', 'Elimina ' + sc.name);
      del.addEventListener('click', async () => {
        if (!confirm(`Eliminare la scena «${sc.name}» con tutti i suoi segnalini?`)) return;
        const i = scenes.indexOf(sc);
        if (sc === cur) { const next = scenes[i + 1] || scenes[i - 1]; scenes.splice(i, 1); cur = null; await showScene(next); }
        else { scenes.splice(i, 1); renderSceneUI(); }
        scheduleBoardSave();
      });
      row.append(del);
    }
    return row;
  }));
  if (typeof afterSceneUI === 'function') afterSceneUI();
}

// finestra "Nuova scena"
const sceneDialog = $('sceneDialog'), sceneForm = $('sceneForm');
$('sceneNew').addEventListener('click', () => {
  closeSceneMenu();
  sceneForm.reset();
  $('sceneNameInput').value = tr('Scena') + ' ' + (scenes.length + 1);
  sceneDialog.showModal();
  $('sceneNameInput').select();
});
$('sceneCancel').addEventListener('click', () => sceneDialog.close());
sceneForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('sceneCreate'); btn.disabled = true;
  const type = sceneForm.elements.sceneType.value;
  const sc = newScene($('sceneNameInput').value.trim().slice(0, 40) || tr('Scena') + ' ' + (scenes.length + 1), type);
  const file = $('sceneBgInput').files[0];
  if (file) {
    try {
      const rec = await uploadBackground(file);
      sc.bg = await loadBg(rec.url, rec.id);
      if (sc.bg) sc.board = { x: sc.bg.x, y: sc.bg.y, w: sc.bg.w, h: sc.bg.h };
    } catch (err) { setStatus('❌ ' + err.message); }
  }
  scenes.push(sc);
  await showScene(sc);
  scheduleBoardSave();
  btn.disabled = false;
  sceneDialog.close();
});

// ---------- Impostazioni ----------
const SWATCHES = [['#ffffff', 'Bianco'], ['#000000', 'Nero'], ['#ff4d4d', 'Rosso'], ['#ffd93d', 'Giallo'], ['#4dff88', 'Verde'], ['#4da6ff', 'Azzurro']];

// Crea i controlli di un gruppo di impostazioni dentro `root`; lavora sull'oggetto restituito da get()
const gridFields = withShow => [
  ...(withShow ? [{ f: 'show', type: 'check', label: 'Mostra la griglia' }] : []),
  { f: 'snap', type: 'check', label: 'Aggancia le immagini alla griglia' },
  { f: 'fitToken', type: 'check', label: 'Nuovi segnalini grandi quanto una casella (con la griglia visibile)' },
  { f: 'size', type: 'range', label: 'Cella', min: 20, max: 200, step: 5 },
  { f: 'color', type: 'color', label: 'Colore' },
  { f: 'opacity', type: 'range', label: 'Opacità', min: 10, max: 100, step: 5, unit: '%' }
];
const BORDER_FIELDS = [
  { f: 'color', type: 'color', label: 'Colore' },
  { f: 'transparent', type: 'check', label: 'Bordo trasparente' },
  { f: 'width', type: 'range', label: 'Spessore', min: 1, max: 12, step: 1, unit: ' px' }
];
const PING_FIELDS = [
  { f: 'color', type: 'color', label: 'Colore' },
  { f: 'size', type: 'range', label: 'Dimensione (raggio)', min: 0.3, max: 5, step: 0.1, unit: ' cm' },
  { f: 'speed', type: 'range', label: 'Velocità di crescita', min: 0.5, max: 10, step: 0.5, unit: ' cm/s' },
  { f: 'fade', type: 'number', label: 'Durata (dissolvenza)', min: 300, max: 8000, step: 100, unit: ' ms' }
];
function fieldHtml(d) {
  const rng = `min="${d.min}" max="${d.max}" step="${d.step}"`;
  if (d.type === 'check') return `<label class="check"><input data-f="${d.f}" type="checkbox"> ${d.label}</label>`;
  if (d.type === 'range') return `<label class="row">${d.label} <input data-f="${d.f}" type="range" ${rng}> <output data-o="${d.f}"></output>${d.unit || ''}</label>`;
  if (d.type === 'number') return `<label class="row">${d.label} <input data-f="${d.f}" type="number" ${rng}>${d.unit || ''}</label>`;
  return `<div class="row">${d.label} <div class="swatches">` +
    SWATCHES.map(([c, n]) => `<button type="button" data-color="${c}" title="${n}" aria-label="${n}" style="background:${c}"></button>`).join('') +
    `</div><input data-f="${d.f}" type="color" title="Altro colore"></div>`;
}
function buildForm(root, fields, { get, onChange }) {
  root.innerHTML = fields.map(fieldHtml).join('');
  const sync = () => {
    const g = get();
    root.querySelectorAll('[data-f]').forEach(i => {
      if (i.type === 'checkbox') i.checked = !!g[i.dataset.f];
      else if (!(i.type === 'number' && i === document.activeElement)) i.value = g[i.dataset.f];   // non disturbare chi sta scrivendo
    });
    root.querySelectorAll('[data-o]').forEach(o => { o.textContent = g[o.dataset.o]; });
    root.querySelectorAll('.swatches button').forEach(b => b.classList.toggle('active', !g.transparent && b.dataset.color === g.color));
  };
  root.addEventListener('input', e => {
    const i = e.target, f = i.dataset.f; if (!f) return;
    const g = get();
    if (i.type === 'checkbox') g[f] = i.checked;
    else if (i.type === 'range') g[f] = +i.value;
    else if (i.type === 'number') { const v = parseFloat(i.value); if (!Number.isFinite(v)) return; g[f] = clamp(v, +i.min, +i.max); }
    else { g[f] = i.value; if ('transparent' in g) g.transparent = false; }
    sync(); onChange();
  });
  root.querySelectorAll('.swatches button').forEach(b => b.addEventListener('click', () => {
    const g = get(); g.color = b.dataset.color; if ('transparent' in g) g.transparent = false;
    sync(); onChange();
  }));
  return sync;
}
const syncSceneGrid = buildForm($('gridScene'), gridFields(true), { get: () => grid, onChange: () => { paintGrid(); scheduleBoardSave(); } });
const syncDefaultGrid = buildForm($('gridDefault'), gridFields(false), { get: () => settings.gridDefault, onChange: scheduleBoardSave });
const syncBorder = buildForm($('borderForm'), BORDER_FIELDS, { get: () => settings.border, onChange: () => { paintBorder(); scheduleBoardSave(); } });
const syncPingForm = buildForm($('pingForm'), PING_FIELDS, { get: () => settings.ping, onChange: scheduleBoardSave });

// sezioni comprimibili: titolo + freccia, il contenuto scorre via
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const sects = [...document.querySelectorAll('#tab-settings .sect')].map(sec => {
  const h = sec.querySelector(':scope > h4');
  const head = document.createElement('button'), title = document.createElement('span');
  head.type = 'button'; head.className = 'sectHead'; title.className = 'sectTitle';
  title.append(...h.childNodes); h.remove();
  head.append(title); head.insertAdjacentHTML('beforeend', CHEVRON);
  const body = document.createElement('div'), inner = document.createElement('div'), content = document.createElement('div');
  body.className = 'sectBody'; inner.className = 'sectInner'; content.className = 'sectContent';
  content.append(...sec.childNodes); inner.append(content); body.append(inner);
  sec.append(head, body);
  const apply = () => {
    const open = settings.sections[sec.dataset.sect] ?? SECTIONS[sec.dataset.sect] ?? true;
    sec.classList.toggle('open', open); head.setAttribute('aria-expanded', open); inner.inert = !open;
  };
  head.addEventListener('click', () => {
    settings.sections[sec.dataset.sect] = !sec.classList.contains('open');
    apply(); scheduleBoardSave();
  });
  apply();
  return apply;
});

// pulsanti a scelta singola
function segmented(root, get, set) {
  const sync = () => root.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === String(get())));
  root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { set(b.dataset.v); sync(); }));
  return sync;
}
const syncTheme = segmented($('themeSeg'), () => settings.theme, v => { settings.theme = v; settings.prefT = Date.now(); applyTheme(); scheduleBoardSave(); });
let uploadAs = 'token';
const syncUploadAs = segmented($('uploadAs'), () => uploadAs, v => { uploadAs = v; });
syncUploadAs();

for (const [id, key] of [['resToken', 'resToken'], ['resBg', 'resBg']]) {
  $(id).replaceChildren(...RESOLUTIONS.map(([v, l]) => new Option(l, v)));
  $(id).addEventListener('change', e => { settings[key] = +e.target.value; scheduleBoardSave(); });
}
$('autoBg').addEventListener('input', e => { settings.autoBg = e.target.checked; updatePageColor(); scheduleBoardSave(); });
$('spareggioDes').addEventListener('input', e => { settings.spareggioDes = e.target.checked; settings.prefT = Date.now(); scheduleBoardSave(); if (typeof turniDisegna === 'function') turniDisegna(); });
['caselleG', 'caselleR', 'caselleB'].forEach((id, i) => $(id).addEventListener('input', e => {
  settings.boxLabels[i] = e.target.value.slice(0, 14); scheduleBoardSave(); if (typeof hudDisegna === 'function') hudDisegna();
}));
$('caratLibere').addEventListener('input', e => {
  settings.caratLibere = e.target.checked; settings.prefT = Date.now(); scheduleBoardSave();
  document.querySelectorAll('.sheetWin input[type=number]').forEach(i => {
    if (!CARATTERISTICHE.has(i.dataset.f)) return;
    if (settings.caratLibere) { i.removeAttribute('min'); i.removeAttribute('max'); } else { i.min = 1; i.max = 30; }
  });
});

// nebbia di guerra: colore (per tutti) e quanto copre per chi conduce
let fogColorUltimo = '#000000';
const fogColorReady = () => typeof fogApply === 'function';
const syncFogColor = segmented($('fogColorSeg'), () => settings.fogColor === 'auto' ? 'auto' : 'custom', v => {
  settings.fogColor = v === 'auto' ? 'auto' : ($('fogColorIn').value || fogColorUltimo);
  syncFog(); if (fogColorReady()) fogApply(); scheduleBoardSave();
});
$('fogColorIn').addEventListener('input', e => {
  fogColorUltimo = e.target.value; settings.fogColor = e.target.value;
  syncFog(); if (fogColorReady()) fogApply(); scheduleBoardSave();
});
$('fogVeilIn').addEventListener('input', e => {
  settings.fogVeil = Math.max(0.1, Math.min(1, +e.target.value / 100));
  $('fogVeilOut').textContent = e.target.value + '%';
  if (fogColorReady()) fogApply(); scheduleBoardSave();
});
function syncFog() {
  syncFogColor();
  const auto = settings.fogColor === 'auto';
  if (!auto) $('fogColorIn').value = settings.fogColor;
  $('fogColorIn').classList.toggle('spento', auto);
  $('fogColorNota').hidden = !auto;
  const v = Math.round((settings.fogVeil || 0.55) * 100);
  $('fogVeilIn').value = v; $('fogVeilOut').textContent = v + '%';
}

$('applyDefault').addEventListener('click', () => {
  const show = grid.show;
  Object.assign(grid, settings.gridDefault, { show });
  syncSceneGrid(); paintGrid(); scheduleBoardSave();
});
$('bgReset').addEventListener('click', () => {
  if (bgBox.hidden) setBoard({ ...DEFAULT_RECT });
  else {
    const { w, h } = misuraMappa();
    Object.assign(bgBox.style, { left: '0px', top: '0px', width: w + 'px', height: h + 'px' });
    setBoard({ x: 0, y: 0, w, h });
  }
  fitView(true, 0.9);
});
$('bgFit').addEventListener('click', () => {
  if (bgBox.hidden) return;
  setBoard(rectOf(bgBox));
  applyView(); scheduleBoardSave();
});
$('bgRemove').addEventListener('click', () => {
  if (bgBox.hidden || !confirm('Togliere lo sfondo da questa scena? Il rettangolo resta.')) return;
  setBgBox(null); applyView(); updatePageColor(); scheduleBoardSave();
});

function syncSettings() {
  syncTheme(); syncSceneGrid(); syncDefaultGrid(); syncBorder(); syncPingForm(); sects.forEach(f => f());
  $('autoBg').checked = settings.autoBg;
  $('caratLibere').checked = !!settings.caratLibere;
  $('spareggioDes').checked = settings.spareggioDes !== false;
  ['caselleG', 'caselleR', 'caselleB'].forEach((id, i) => { if (document.activeElement !== $(id)) $(id).value = settings.boxLabels[i] || ''; });
  syncFog();
  $('resToken').value = settings.resToken; $('resBg').value = settings.resBg;
}

// ---------- Zoom: la lente si allunga ----------
const zoomBox = $('zoomBox');
$('zoomToggle').addEventListener('click', () => {
  const open = !zoomBox.classList.contains('open');
  zoomBox.classList.toggle('open', open);
  $('zoomBody').inert = !open;
  $('zoomToggle').setAttribute('aria-expanded', open);
  if (open && typeof chiudiSovrapposti === 'function') chiudiSovrapposti(zoomBox);
});
$('zoomIn').addEventListener('click', () => zoomBy(BTN_STEP));
$('zoomOut').addEventListener('click', () => zoomBy(1 / BTN_STEP));
$('zoomFit').addEventListener('click', () => fitView(true));

// ---------- Menu laterale ----------
const side = document.getElementById('side');
const sideBody = document.getElementById('sideBody');
const sideToggle = document.getElementById('sideToggle');

sideToggle.addEventListener('click', () => {
  const open = !side.classList.contains('open');
  side.classList.remove(open ? 'closing' : 'open');
  side.classList.add(open ? 'open' : 'closing');
  sideBody.inert = !open;
  document.body.classList.toggle('menu-open', open);
  sideToggle.setAttribute('aria-expanded', open);
});
side.addEventListener('animationend', e => {
  if (e.animationName === 'slideOut') side.classList.remove('closing');
});

// Bordo sinistro trascinabile: cambia la larghezza del pannello (si ricorda)
const sideGrip = $('sideGrip'), rootEl = document.documentElement;
const sideMax = () => Math.max(SIDE_MIN, Math.min(900, innerWidth * 0.92));
function setSideW(w, save) {
  w = Math.round(clamp(w, SIDE_MIN, sideMax()));
  rootEl.style.setProperty('--side-w', w + 'px');
  if (save) { try { localStorage.setItem('uffa-side-w', w); } catch {} }
  return w;
}
try { const w = parseFloat(localStorage.getItem('uffa-side-w')); if (w > 0) setSideW(w); } catch {}
let sideDrag = null;
sideGrip.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault();
  sideDrag = e.pointerId;
  sideGrip.setPointerCapture(e.pointerId);
  document.body.classList.add('side-resizing');
});
sideGrip.addEventListener('pointermove', e => { if (e.pointerId === sideDrag) setSideW(innerWidth - e.clientX); });
const endSideDrag = e => {
  if (e.pointerId !== sideDrag) return;
  sideDrag = null;
  document.body.classList.remove('side-resizing');
  setSideW(side.getBoundingClientRect().width, true);
};
sideGrip.addEventListener('pointerup', endSideDrag);
sideGrip.addEventListener('pointercancel', endSideDrag);
sideGrip.addEventListener('dblclick', () => setSideW(SIDE_DEFAULT, true));

// Schede: cambia la sezione sotto e l'aura colorata
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab.dataset.tab));
  sideBody.style.setProperty('--aura', tab.style.getPropertyValue('--aura'));
}));

// ---------- Chat (salvata, si cancella con clic destro) ----------
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
let chat = [], chatReady = false;

// Un colore stabile per ogni persona, ricavato dal suo nome.
function whoHue(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function whoTag(m) {
  if (!m.by) return null;
  const b = document.createElement('b');
  b.className = 'who';
  b.textContent = m.by;
  b.style.setProperty('--wh', whoHue(m.by));
  return b;
}

// Nel messaggio del tiro per colpire: «Danni» e, se il d20 è un critico, «Danni critici». Li vedono solo chi
// ha tirato e il master (gli altri non devono tirare i danni al posto suo).
function pulsantiDanni(d, m, critico) {
  if (!m.rif || typeof tiraDanni !== 'function') return;
  const inRete = typeof NET !== 'undefined' && NET.on;
  if (inRete && !(isMaster() || (NET.me && m.byId === NET.me.token))) return;
  const box = document.createElement('span'); box.className = 'rDanni';
  const b = (t, crit) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = tr(t); if (crit) x.className = 'crit'; x.addEventListener('click', () => tiraDanni(m.rif, crit, !!m.secret)); return x; };
  box.append(b('🗡 Danni', false));
  if (critico) box.append(b('💥 Danni critici', true));
  d.append(box);
}

function msgEl(m) {
  const d = document.createElement('div');
  d.dataset.id = m.id;
  const who = whoTag(m);
  if (m.kind === 'roll') {
    d.className = 'msg roll';
    if (m.secret) d.classList.add('secret');
    const head = document.createElement('span'); head.className = 'rl';
    if (who) d.append(who);
    if (m.hidden || !Array.isArray(m.rolls)) {          // il tiro segreto di un altro: si sa solo che c'è stato
      d.classList.add('single', 'hiddenRoll');
      head.textContent = '🔒 tiro segreto';
      const q = document.createElement('span'); q.className = 'rr'; q.textContent = '?';
      d.append(head, q);
      return d;
    }
    head.textContent = '🎲 ' + m.label;
    d.append(head);
    // due tiri alla pari (dalla scheda in vantaggio o svantaggio): si vedono tutti e due, senza dire quale vale
    if (m.doppio && Array.isArray(m.rolls) && m.rolls.length === 2) {
      d.classList.add('doppio');
      if (m.secret) { const s = document.createElement('span'); s.className = 'sec'; s.textContent = '🔒 segreto'; s.title = 'Lo vedete solo tu e il master'; d.append(s); }
      const mod = m.mod || 0, box = document.createElement('span'); box.className = 'rr rDue'; box.title = tr('Due tiri: scegli tu quale tenere');
      m.rolls.forEach((v, i) => {
        if (i) box.append(document.createTextNode(' · '));
        const b = document.createElement('b'); b.textContent = v + mod;
        if (m.sides === 20 && v >= (m.crit || 20)) b.className = 'max'; else if (m.sides === 20 && v === 1) b.className = 'min';
        if (mod) b.title = `${v} ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}`;
        box.append(b);
      });
      d.append(box);
      pulsantiDanni(d, m, m.sides === 20 && m.rolls.some(v => v >= (m.crit || 20)));   // critico se lo è almeno uno dei due: sceglie chi tira
      return d;
    }
    if (m.adv) { const a = document.createElement('span'); a.className = 'adv ' + m.adv; a.textContent = m.adv === 'adv' ? 'vantaggio' : 'svantaggio'; d.append(a); }
    if (m.secret) { const s = document.createElement('span'); s.className = 'sec'; s.textContent = '🔒 segreto'; s.title = 'Lo vedete solo tu e il master'; d.append(s); }
    // tirato da scollegati (dadi provvisori): il server non l'ha tirato lui, ha solo controllato che i dadi tornino
    if (m.provvisorio) { const s = document.createElement('span'); s.className = 'provv'; s.textContent = '⚠ non verificato'; s.title = 'Tirato da scollegato: i dadi li ha tirati il suo dispositivo, non il server'; d.append(s); }
    const drop = new Set(m.drop || []), mod = m.mod || 0;
    const kept = m.rolls.filter((_, i) => !drop.has(i));
    const single = kept.length === 1 && !mod;
    if (single) d.classList.add('single');
    // critico: 20 naturale, o dal valore «Critico da» della scheda (19, 18…); l'1 naturale resta sempre un fallimento
    if (m.sides === 20 && kept.length === 1 && kept[0] >= (m.crit || 20)) d.classList.add('max');
    if (m.sides === 20 && kept.length === 1 && kept[0] === 1) d.classList.add('min');
    const body = document.createElement('span'); body.className = 'rr';
    if (single) {
      body.textContent = m.total;
      d.append(body);
      if (drop.size) {                                   // vantaggio senza modificatori: il dado scartato, piccolo e barrato
        const x = document.createElement('span'); x.className = 'rd';
        x.append(...m.rolls.flatMap((v, i) => drop.has(i) ? [Object.assign(document.createElement('s'), { textContent: Math.abs(v) })] : []));
        d.append(x);
      }
    } else {
      m.rolls.forEach((v, i) => {
        const gone = drop.has(i);
        if (i > 0) body.append(gone ? ' ' : (v < 0 ? ' − ' : ' + '));
        else if (v < 0) body.append('− ');
        const n = document.createElement(gone ? 's' : 'span'); n.textContent = Math.abs(v);
        if (gone) n.title = 'scartato';
        body.append(n);
      });
      if (mod) body.append((mod > 0 ? ' + ' : ' − ') + Math.abs(mod));
      const t = document.createElement('b'); t.className = 'tot'; t.textContent = '= ' + m.total;
      d.append(body, t);
      // danni di più tipi: il totale di ciascuno («8 tagliente + 3 fuoco»)
      if (Array.isArray(m.parti) && m.parti.length > 1) {
        const pt = document.createElement('span'); pt.className = 'rParti';
        m.parti.forEach((p, i) => { if (i) pt.append(' + '); const b = document.createElement('b'); b.textContent = p.total; pt.append(b, ' ' + (p.tipo || '')); });
        d.append(pt);
      }
    }
    pulsantiDanni(d, m, m.sides === 20 && kept.length === 1 && kept[0] >= (m.crit || 20));
  } else if (m.kind === 'rule') {
    d.className = 'msg rule';
    const h = document.createElement('b'), t = document.createElement('div');
    h.textContent = m.title; t.textContent = m.text;
    if (who) d.append(who);
    d.append(h, t);
  } else if (m.kind === 'link') {
    d.className = 'msg link';
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '🔗 Apri la chat «' + m.text + '»';
    b.addEventListener('click', () => { if (typeof openChatWin === 'function') openChatWin(m.target); });
    d.append(b);
  } else {
    d.className = 'msg';
    if (who) d.append(who);
    if (m.whisper) {                                   // sussurro: lo vedono solo i due e chi conduce
      d.classList.add('whisper');
      const w = document.createElement('span'); w.className = 'wh';
      w.textContent = tr('🤫 sussurro a {nome}', { nome: m.whisper.toName });
      w.title = tr('Lo vedete solo voi due e il master');
      d.append(w, ' ');
    }
    d.append(...testoConTiri(m.text));
  }
  return d;
}
// [[1d20+5]] o [[2d6+3 | Danni]] dentro un messaggio: diventa un pulsante che tira (come nelle schede)
function testoConTiri(t) {
  const out = [], re = /\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g;
  let da = 0, m;
  while ((m = re.exec(String(t)))) {
    if (m.index > da) out.push(document.createTextNode(t.slice(da, m.index)));
    const b = document.createElement('button'), expr = m[1], nome = m[2] || m[1];
    b.type = 'button'; b.className = 'chipRoll'; b.textContent = '🎲 ' + nome; b.title = expr;
    b.addEventListener('click', () => { if (typeof rollExpr === 'function' && !rollExpr(expr, nome)) addChat({ kind: 'text', text: 'Tiro non valido: ' + expr }); });
    out.push(b);
    da = re.lastIndex;
  }
  if (da < String(t).length) out.push(document.createTextNode(String(t).slice(da)));
  return out;
}
// La chat scorre da sola solo se eri già in fondo (o quasi); altrimenti compare «Nuovi messaggi ↓».
const chatInFondo = () => chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 48;
function chatGiu() { chatLog.scrollTop = chatLog.scrollHeight; $('chatNuovi').hidden = true; }
$('chatNuovi').addEventListener('click', chatGiu);
chatLog.addEventListener('scroll', () => { if (chatInFondo()) $('chatNuovi').hidden = true; });
function addChat(m) {
  m.id = m.id || Date.now() + '-' + Math.random().toString(36).slice(2, 7);   // quelli del server hanno già il loro (serve per cancellarli)
  chat.push(m);
  if (typeof chatVisible !== 'function' || chatVisible(m)) {
    const giu = chatInFondo();
    chatLog.appendChild(msgEl(m));
    if (giu) chatGiu(); else $('chatNuovi').hidden = false;      // chi sta leggendo più su non viene spostato
  }
  else if (typeof chatUnread === 'function') chatUnread(m);
  if (chatReady) persist.save('chat', chat);
}
function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (typeof chatCommand === 'function' && chatCommand(text)) { chatInput.value = ''; return; }
  addChat({ kind: 'text', text });
  chatInput.value = ''; chatInput.style.height = '';
}
document.getElementById('chatSend').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });   // Maiusc+Invio va a capo
chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = Math.min(120, chatInput.scrollHeight) + 'px'; });

async function loadChat() {
  const saved = await persist.load('chat');
  if (Array.isArray(saved)) {
    const merged = saved.concat(chat);           // eventuali messaggi scritti mentre caricava
    const changed = merged.length !== saved.length;
    chat = merged;
    if (typeof renderChat === 'function') renderChat(); else { chatLog.replaceChildren(...chat.map(msgEl)); chatLog.scrollTop = chatLog.scrollHeight; }
    chatReady = true;
    if (changed) persist.save('chat', chat);
  } else {
    chatReady = true;
    if (chat.length) persist.save('chat', chat);
  }
}

// ---------- Menu del clic destro (generico) ----------
// items: [{ label, fn, danger, off, items: [sottomenu] }] oppure '-' come separatore
const ctx = document.getElementById('ctx');
let ctxStack = [];
const closeCtx = () => { ctx.hidden = true; ctxStack = []; };
function menuBtn(it) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = it.label + (it.items ? '  ›' : '');
  b.classList.toggle('danger', !!it.danger); b.disabled = !!it.off;
  b.addEventListener('click', () => {
    if (it.items) { ctxStack.push(it.items); drawMenu(); return; }
    if (!it.keep) closeCtx();
    if (it.fn) it.fn();
  });
  return b;
}
function drawMenu() {
  const rows = [];
  if (ctxStack.length > 1) rows.push(menuBtn({ label: '← Indietro', keep: true, fn: () => { ctxStack.pop(); drawMenu(); } }));
  for (const it of ctxStack[ctxStack.length - 1]) {
    if (it === '-') { const d = document.createElement('div'); d.className = 'sep'; rows.push(d); } else rows.push(menuBtn(it));
  }
  ctx.replaceChildren(...rows);
}
function showMenu(x, y, items) {
  if (!items || !items.length) return;
  ctxStack = [items]; drawMenu();
  ctx.hidden = false; ctx.style.left = '0px'; ctx.style.top = '0px';
  ctx.style.left = Math.max(4, Math.min(x, innerWidth - ctx.offsetWidth - 8)) + 'px';
  ctx.style.top = Math.max(4, Math.min(y, innerHeight - ctx.offsetHeight - 8)) + 'px';
}
function deleteChat(id) {
  chat = chat.filter(m => m.id !== id);
  chatLog.querySelectorAll('.msg').forEach(el => { if (el.dataset.id === id) el.remove(); });
  persist.save('chat', chat);
}
addEventListener('pointerdown', e => { if (!ctx.hidden && !ctx.contains(e.target)) closeCtx(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeCtx(); });
chatLog.addEventListener('scroll', closeCtx);
addEventListener('blur', closeCtx);
// ---------- Assets: server (cartella assets/) oppure, se spento, solo questo browser ----------
const folderBar = $('folderBar'), assetGrid = $('assetGrid'), storeStatus = $('storeStatus');
let modeMsg = '';
const setStatus = (msg = modeMsg) => { storeStatus.textContent = msg; };

const serverStore = {
  async call(method, path, params = {}, body) {
    let r;
    try {
      r = await fetch(`api/${path}?${new URLSearchParams(params)}`, { method, headers: body ? { 'Content-Type': body.type } : {}, body });
    } catch { throw new Error('server non raggiungibile'); }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  list: () => serverStore.call('GET', 'assets'),
  add: (name, folder, blob) => serverStore.call('POST', 'assets', { name, folder }, blob),
  remove: a => serverStore.call('DELETE', 'assets', { name: a.name, folder: a.folder }),
  move: (a, to) => serverStore.call('POST', 'move', { name: a.name, from: a.folder, to }),
  addFolder: async name => (await serverStore.call('POST', 'folders', { name })).name,
  removeFolder: name => serverStore.call('DELETE', 'folders', { name })
};

// Stesse operazioni, ma dentro IndexedDB: funziona anche aprendo index.html con doppio clic
const localStore = (() => {
  let dbp;
  const urls = new Map();   // id -> blob URL (non si revoca: le foto sulla mappa lo usano)
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('uffa-assets', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore('folders', { keyPath: 'name' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const stores = async (mode = 'readonly') => {
    const tx = (await open()).transaction(['items', 'folders'], mode);
    return [tx.objectStore('items'), tx.objectStore('folders')];
  };
  const free = (all, folder, name) => {
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 0; ; i++) {
      const n = i ? `${stem}-${i}${ext}` : name;
      if (!all.some(x => x.folder === folder && x.name === n)) return n;
    }
  };
  return {
    async list() {
      const [it, fo] = await stores();
      const [all, names] = await Promise.all([req(it.getAll()), req(fo.getAllKeys())]);
      all.sort((a, b) => b.t - a.t);
      const items = all.map(i => {
        if (!urls.has(i.id)) urls.set(i.id, URL.createObjectURL(i.blob));
        return { id: i.id, name: i.name, folder: i.folder, url: urls.get(i.id) };
      });
      const folders = names.sort((a, b) => a.localeCompare(b)).map(name => ({ name, count: items.filter(i => i.folder === name).length }));
      return { folders, items };
    },
    async add(name, folder, blob) {
      const [it] = await stores('readwrite');
      const final = free(await req(it.getAll()), folder, name);
      const id = await req(it.add({ name: final, folder, blob, t: Date.now() }));
      urls.set(id, URL.createObjectURL(blob));
      return { id, name: final, folder, url: urls.get(id) };
    },
    async remove(a) { const [it] = await stores('readwrite'); await req(it.delete(a.id)); },
    async move(a, to) {
      const [it] = await stores('readwrite');
      const all = await req(it.getAll()), rec = all.find(x => x.id === a.id);
      if (!rec) throw new Error('foto non trovata');
      rec.name = free(all, to, rec.name); rec.folder = to;
      await req(it.put(rec));
    },
    async addFolder(raw) {
      const name = raw.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._]+/, '').slice(0, 60);
      if (!name) throw new Error('nome non valido');
      const [, fo] = await stores('readwrite');
      if (await req(fo.get(name))) throw new Error('esiste già una cartella con questo nome');
      await req(fo.put({ name }));
      return name;
    },
    async removeFolder(name) {
      const [it, fo] = await stores('readwrite');
      if ((await req(it.getAll())).some(i => i.folder === name)) throw new Error('la cartella non è vuota');
      await req(fo.delete(name));
    }
  };
})();

let store = serverStore, data = { folders: [], items: [] }, current = '';

async function reload(gia) {
  try { data = gia || await store.list(); } catch (err) { setStatus('❌ ' + err.message); return; }
  if (current && !data.folders.some(f => f.name === current)) current = '';
  render();
}
async function act(fn) {
  setStatus();
  try { await fn(); await reload(); } catch (err) { setStatus('❌ ' + err.message); }
}

function chip(name, label, count) {
  const c = document.createElement('div');
  c.className = 'chip' + (name === current ? ' active' : '');
  c.dataset.folder = name;
  const main = document.createElement('button');
  main.type = 'button';
  main.textContent = label + (count == null ? '' : ` (${count})`);
  main.addEventListener('click', () => { current = name; render(); });
  c.appendChild(main);
  if (name && count === 0) {                       // si può eliminare solo una cartella vuota
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Elimina la cartella ' + name);
    x.addEventListener('click', () => confirm(`Eliminare la cartella «${name}»?`) && act(() => store.removeFolder(name)));
    c.appendChild(x);
  }
  // le miniature trascinate qui vengono spostate nella cartella
  c.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('application/x-asset')) { e.preventDefault(); c.classList.add('over'); }
  });
  c.addEventListener('dragleave', () => c.classList.remove('over'));
  c.addEventListener('drop', e => {
    e.preventDefault(); c.classList.remove('over');
    const a = JSON.parse(e.dataTransfer.getData('application/x-asset'));
    if (a.folder !== name) act(() => store.move(a, name));
  });
  return c;
}

function assetEl(a) {
  const d = document.createElement('div');
  d.className = 'asset'; d.draggable = true; d.title = a.name; d._asset = a;
  const im = new Image();
  im.src = a.url; im.alt = a.name; im.draggable = false;
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'del'; x.textContent = '×'; x.setAttribute('aria-label', 'Elimina ' + a.name);
  x.addEventListener('click', () => confirm(`Eliminare «${a.name}» dagli assets?`) && act(() => store.remove(a)));
  d.addEventListener('dragstart', e => {
    e.dataTransfer.setData('application/x-asset', JSON.stringify(a));
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'bgBtn'; b.textContent = '🖼'; b.title = 'Usa come sfondo della scena'; b.setAttribute('aria-label', 'Usa ' + a.name + ' come sfondo');
  b.addEventListener('click', () => setBackground(a.url, a.id));
  d.append(im, b, x);
  return d;
}

function render() {
  folderBar.replaceChildren(chip('', 'Principale'), ...data.folders.map(f => chip(f.name, '📁 ' + f.name, f.count)));
  assetGrid.replaceChildren(...data.items.filter(i => i.folder === current).map(assetEl));
}

$('newFolder').addEventListener('click', () => {
  const n = prompt('Nome della nuova cartella');
  if (n && n.trim()) act(async () => { current = await store.addFolder(n.trim()); });
});

// WebP con il lato corto limitato alla risoluzione scelta (0 = originale), sRGB senza profili ICC incorporati
async function toWebp(file, res) {
  const bmp = await createImageBitmap(file);
  const k = res ? Math.min(1, res * 16 / 9 / Math.max(bmp.width, bmp.height), res / Math.min(bmp.width, bmp.height)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') throw new Error('questo browser non sa creare WebP');
  return blob;
}

// salva l'immagine nella cartella degli sfondi (creandola se serve) e restituisce l'asset
async function uploadBackground(file) {
  try { await store.addFolder(BG_FOLDER); } catch { /* esiste già */ }
  return store.add(file.name.replace(/\.[^.]+$/, '') + '.webp', BG_FOLDER, await toWebp(file, settings.resBg));
}

upload.addEventListener('change', async () => {
  const files = [...upload.files].filter(f => f.type.startsWith('image/'));
  upload.value = '';   // permette di ricaricare lo stesso file
  setStatus();
  let first = null;
  for (const file of files) {
    try {
      if (uploadAs === 'bg') { const rec = await uploadBackground(file); first ||= rec; }
      else await store.add(file.name.replace(/\.[^.]+$/, '') + '.webp', current, await toWebp(file, settings.resToken));
    } catch (err) { setStatus('❌ ' + err.message); }
  }
  if (first) current = BG_FOLDER;
  await reload();
  if (first) setBackground(first.url, first.id);      // il primo file diventa lo sfondo della scena attiva
});

// ---------- Stato della mappa: scene, impostazioni ----------
function boardState() {
  captureScene();
  const ok = o => o && (o.shape || o.aid != null || !o.url.startsWith('blob:'));      // i link temporanei non sopravvivono al ricaricamento
  return {
    v: 2, active: cur.id, settings,
    scenes: scenes.map(sc => ({ ...sc, bg: ok(sc.bg) ? sc.bg : null, photos: sc.photos.filter(ok) }))
  };
}
function scheduleBoardSave() {
  if (!boardReady) return;
  clearTimeout(boardTimer);
  boardTimer = setTimeout(() => saveBoard(), 400);
}
function saveBoard(flush) {
  boardTimer = 0;
  if (boardReady) persist.save('board', boardState(), flush);
}
addEventListener('pagehide', () => { if (boardTimer) { clearTimeout(boardTimer); saveBoard(true); } });

async function loadBoard() {
  const st = await persist.load('board');
  let first;
  if (st && Array.isArray(st.scenes) && st.scenes.length) {
    const s = st.settings || {};
    if (['dark', 'light', 'system'].includes(s.theme)) settings.theme = s.theme;
    if (typeof s.autoBg === 'boolean') settings.autoBg = s.autoBg;
    if (RESOLUTIONS.some(r => r[0] === s.resToken)) settings.resToken = s.resToken;
    if (RESOLUTIONS.some(r => r[0] === s.resBg)) settings.resBg = s.resBg;
    settings.gridDefault = { ...DEFAULT_GRID, ...s.gridDefault };
    settings.border = { ...DEFAULT_BORDER, ...s.border };
    settings.ping = { ...DEFAULT_PING, ...s.ping };
    if (!(settings.ping.fade >= 300)) Object.assign(settings.ping, DEFAULT_PING);      // vecchi valori: il ping spariva subito
    for (const k of ['drawerOpen', 'publicScene', 'unit', 'sheetClose', 'rulerCenter', 'dockOpen']) if (s[k] !== undefined) settings[k] = s[k];
    if (s.fogColor === 'auto' || /^#[0-9a-f]{6}$/i.test(s.fogColor || '')) settings.fogColor = s.fogColor;
    if (s.fogVeil >= 0.05 && s.fogVeil <= 1) settings.fogVeil = +s.fogVeil;
    if (typeof s.caratLibere === 'boolean') settings.caratLibere = s.caratLibere;
    if (typeof s.spareggioDes === 'boolean') settings.spareggioDes = s.spareggioDes;
    if (typeof s.dadiProvvisori === 'boolean') settings.dadiProvvisori = s.dadiProvvisori;
    if (s.turni && Array.isArray(s.turni.righe)) settings.turni = s.turni;
    if (Array.isArray(s.boxLabels)) settings.boxLabels = [0, 1, 2].map(i => String(s.boxLabels[i] || '').slice(0, 14));
    if (+s.prefT > 0) settings.prefT = +s.prefT;
    for (const k of ['tools', 'sheetStyle', 'pen', 'hiddenLayer', 'chatTabs', 'park', 'music']) if (s[k] && typeof s[k] === 'object') settings[k] = { ...settings[k], ...s[k] };
    settings.sections = s.sections && typeof s.sections === 'object' ? { ...s.sections } : {};
    settings.toolOrder = Array.isArray(s.toolOrder) ? s.toolOrder.filter(x => typeof x === 'string').slice(0, 60) : null;
    paintBorder();
    const okRect = r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
    const pick = r => ({ x: r.x, y: r.y, w: r.w, h: r.h });
    scenes = st.scenes.map(sc => ({
      id: sc.id || uid(), name: sc.name || 'Scena', type: sc.type === 'cinematic' ? 'cinematic' : 'map',
      bg: sc.bg || null, grid: { ...DEFAULT_GRID, ...sc.grid }, photos: sc.photos || [], view: sc.view || null, draw: sc.draw || null,
      luce: sc.luce || undefined,
      // salvataggi precedenti: il rettangolo coincide con la mappa (o è quello di default)
      board: okRect(sc.board) ? pick(sc.board) : okRect(sc.bg) ? pick(sc.bg) : { ...DEFAULT_RECT }
    }));
    first = scenes.find(s => s.id === st.active) || scenes[0];
  } else {
    first = newScene(tr('Scena') + ' 1', 'map');
    if (st) {                                  // salvataggio del formato precedente (una sola mappa)
      Object.assign(first.grid, DEFAULT_GRID, st.grid || {});
      first.photos = st.photos || []; first.view = st.view || null;
    }
    first.bg = await loadBg(DEFAULT_BG);
    if (first.bg) first.board = { x: first.bg.x, y: first.bg.y, w: first.bg.w, h: first.bg.h };
    scenes = [first];
  }
  const daHome = prefDallaHome();
  applyTheme();
  await showScene(first);
  boardReady = true;
  if (daHome) scheduleBoardSave();
  if (typeof turniDisegna === 'function') turniDisegna();
  if (typeof afterBoardLoad === 'function') afterBoardLoad();
}

// ---------- Dadi ----------
const dice = $('dice'), diceToggle = $('diceToggle'), diceBody = $('diceBody');
const diceCount = $('diceCount'), diceLast = $('diceLast');

// numero casuale 1..n senza distorsioni
function rnd(n) {
  const a = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
  do crypto.getRandomValues(a); while (a[0] >= lim);
  return a[0] % n + 1;
}
const diceQty = () => Math.min(100, Math.max(1, parseInt(diceCount.value, 10) || 1));
function syncQty() {
  const q = diceQty();
  [...$('diceQty').children].forEach(b => b.classList.toggle('active', +b.dataset.q === q));
}
function fitDice() { if (dice.classList.contains('open')) dice.style.setProperty('--dh', diceBody.scrollHeight + 'px'); }

// ---------- Vantaggio / svantaggio e tiri segreti ----------
// Valgono per qualsiasi tiro: i pulsanti qui, quelli delle schede, «/r» in chat.
// Vantaggio e svantaggio toccano solo il d20 del tiro (1d20+5 → 2d20kh1+5): i danni restano uguali.
// Maiusc+clic = vantaggio, Alt+clic = svantaggio, solo per quel tiro.
const diceMode = { adv: 'none', secret: false };
let diceKeys = { adv: false, dis: false, at: 0 };
addEventListener('pointerdown', e => { diceKeys = { adv: e.shiftKey, dis: e.altKey && !e.shiftKey, at: performance.now() }; }, true);
function diceAdvNow() {
  if (performance.now() - diceKeys.at < 1500) { if (diceKeys.adv) return 'adv'; if (diceKeys.dis) return 'dis'; }
  return diceMode.adv;
}
/** Applica i modi all'espressione: { expr, secret, adv } */
function diceApply(expr) {
  const adv = diceAdvNow();
  let e = String(expr || '').replace(/\s+/g, '');
  if (adv !== 'none') {
    // il primo d20 singolo («d20», «1d20») diventa due d20 di cui si tiene il migliore (o il peggiore)
    e = e.replace(/(^|[+-])1?d20(?![\dk])/i, (_, sign) => sign + '2d20' + (adv === 'adv' ? 'kh1' : 'kl1'));
  }
  return { expr: e, secret: diceMode.secret, adv };
}
/** Riassunto dell'ultimo tiro sotto ai dadi. */
function diceShowLast(m) {
  if (!m || !m.rolls) return;
  const drop = new Set(m.drop || []);
  const kept = m.rolls.filter((_, i) => !drop.has(i));
  const tag = m.adv === 'adv' ? ' (vantaggio)' : m.adv === 'dis' ? ' (svantaggio)' : '';
  const parts = m.rolls.length <= 12 ? m.rolls.map((v, i) => drop.has(i) ? `(${v})` : String(v)).join(' ') : '';
  if (m.doppio && m.rolls.length === 2) { diceLast.textContent = `${m.label}: ${m.rolls.map(v => v + (m.mod || 0)).join(' · ')}` + (m.secret ? ' · 🔒 segreto' : ''); fitDice(); diceMostraGrande(m, ''); return; }
  diceLast.textContent = `${m.label}${tag}: ` + (kept.length === 1 && !m.mod && !drop.size ? m.total : (parts ? parts + ' → ' : '') + m.total) +
    (m.secret ? ' · 🔒 segreto' : '');
  fitDice();
  diceMostraGrande(m, tag);
}
// Con la chat chiusa il risultato si vedeva solo nella riga piccola dei dadi: compare anche grande,
// in alto al centro, per qualche secondo (un tocco lo chiude).
let dicePopTimer = 0;
function diceMostraGrande(m, tag) {
  const chatVista = document.body.classList.contains('menu-open') && $('tab-chat') && $('tab-chat').classList.contains('active');
  if (chatVista) return;
  let pop = $('dicePop');
  if (!pop) {
    pop = document.createElement('div'); pop.id = 'dicePop'; pop.setAttribute('role', 'status');
    pop.addEventListener('click', () => { pop.classList.remove('on'); });
    document.body.appendChild(pop);
  }
  const lab = document.createElement('span'), tot = document.createElement('b');
  lab.textContent = m.label + tag + (m.secret ? ' · 🔒' : '');
  tot.textContent = m.doppio && m.rolls && m.rolls.length === 2 ? m.rolls.map(v => v + (m.mod || 0)).join(' · ') : m.total;
  pop.replaceChildren(lab, tot);
  pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on');
  clearTimeout(dicePopTimer);
  dicePopTimer = setTimeout(() => pop.classList.remove('on'), 4500);
}
function diceSyncModes() {
  for (const b of $('diceAdv').children) { const on = b.dataset.adv === diceMode.adv; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); }
  for (const b of $('diceVis').children) { const on = (b.dataset.vis === 'secret') === diceMode.secret; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); }
  // anche a vassoio chiuso si vede che un modo è acceso: conta per i tiri delle schede
  const badge = $('diceBadge');
  const txt = (diceMode.adv === 'adv' ? 'V' : diceMode.adv === 'dis' ? 'S' : '') + (diceMode.secret ? '🔒' : '');
  badge.textContent = txt; badge.hidden = !txt;
  badge.className = diceMode.adv === 'dis' ? 'dis' : diceMode.adv === 'adv' ? 'adv' : '';
  diceToggle.title = [diceMode.adv === 'adv' ? 'Vantaggio acceso' : diceMode.adv === 'dis' ? 'Svantaggio acceso' : '',
    diceMode.secret ? 'Tiri segreti' : ''].filter(Boolean).join(' · ') || 'Dadi';
}

function rollDice(sides) {
  const n = diceQty();
  rollExpr(n + 'd' + sides, (n > 1 ? n : '') + 'd' + sides);
}

for (const q of [1, 2, 3, 4, 5, 6, 8, 10]) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.q = q; b.textContent = q;
  b.addEventListener('click', () => { diceCount.value = q; syncQty(); });
  $('diceQty').appendChild(b);
}
for (const n of [4, 6, 8, 10, 12, 20, 100]) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = 'd' + n;
  b.addEventListener('click', () => rollDice(n));
  $('diceTypes').appendChild(b);
}
diceCount.addEventListener('input', syncQty);
$('diceAdv').addEventListener('click', e => {
  const b = e.target.closest('[data-adv]'); if (!b) return;
  diceMode.adv = b.dataset.adv; diceSyncModes();
});
$('diceVis').addEventListener('click', e => {
  const b = e.target.closest('[data-vis]'); if (!b) return;
  diceMode.secret = b.dataset.vis === 'secret'; diceSyncModes();
});
diceSyncModes();
$('customRoll').addEventListener('click', () => {
  const n = Math.floor(+$('customSides').value);
  if (n >= 2 && n <= 1000) rollDice(n);
  else { diceLast.textContent = 'Il dado personalizzato va da 2 a 1000 facce.'; fitDice(); }
});
syncQty();

diceToggle.addEventListener('click', () => {
  const open = !dice.classList.contains('open');
  diceToggle.classList.remove('pop'); void diceToggle.offsetWidth; diceToggle.classList.add('pop');
  if (open) dice.style.setProperty('--dh', diceBody.scrollHeight + 'px');
  dice.classList.toggle('open', open);
  diceBody.inert = !open;
  diceToggle.setAttribute('aria-expanded', open);
  if (open && typeof chiudiSovrapposti === 'function') chiudiSovrapposti(dice);
});


addEventListener('DOMContentLoaded', async () => {      // dopo che sheets.js ed extras.js sono stati letti
  let primo = null;
  try { primo = await serverStore.list(); online = true; modeMsg = 'Le foto vengono salvate nella cartella assets/.'; }
  catch {
    store = localStore;
    modeMsg = 'Server spento: le foto restano solo in questo browser. Per salvarle nella cartella assets/ avvia "node server.js" e apri http://localhost:3000.';
  }
  setStatus();
  await reload(primo);  // l'elenco degli assets (già letto qui sopra) serve per ritrovare le immagini delle scene
  loadChat();
  loadBoard();
});
