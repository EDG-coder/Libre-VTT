// ---------- Strumenti, menu del clic destro, scena per i giocatori, guida ----------
// Si appoggia a script.js e sheets.js (variabili globali condivise).

const SVGNS = 'http://www.w3.org/2000/svg';
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ======================= Menu a scomparsa a sinistra =======================
const drawer = mk('div', '', '<div class="slots"></div><button class="dhandle" type="button" aria-label="Apri o chiudi il menu degli strumenti" title="Strumenti"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>');
drawer.id = 'toolDrawer';
document.body.appendChild(drawer);
const slotsEl = drawer.querySelector('.slots');
const TOOLS = [];
let drag = null;

function setDrawer(open) {
  drawer.classList.toggle('closed', !open);
  settings.drawerOpen = open;
}
drawer.querySelector('.dhandle').addEventListener('click', () => { setDrawer(drawer.classList.contains('closed')); scheduleBoardSave(); });

// Con il dito: uno strumento nel menu si stacca tenendolo premuto un attimo (così il menu si può
// ancora scorrere col dito); uno già fuori si trascina subito. Finché lo si trascina, il browser
// non deve scorrere la pagina: se ci prova, interrompe il gesto (pointercancel) e lo strumento si ferma.
const PRESA_DITO = 280;   // ms
function startToolDrag(e, t) {
  if (e.button !== 0) return;
  if (drag && drag.timer) clearTimeout(drag.timer);
  const r = t.el.getBoundingClientRect();
  const nelMenu = t.docked || (t.temp && !!t.slot && t.el.parentElement === t.slot);
  const d = drag = { t, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, on: false,
    dito: e.pointerType === 'touch', presa: e.pointerType !== 'touch' || !nelMenu };
  if (!d.presa) d.timer = setTimeout(() => {
    if (drag !== d) return;
    d.presa = true; d.timer = null;
    t.el.classList.add('preso');
    try { if (window.LIBRE_NATIVO && LIBRE_NATIVO.disponibile) LIBRE_NATIVO.vibra(15); else if (navigator.vibrate) navigator.vibrate(15); } catch {}
  }, PRESA_DITO);
}
// mentre un dito tiene uno strumento, niente scorrimento della pagina
addEventListener('touchmove', e => { if (drag && drag.dito && drag.presa) e.preventDefault(); }, { passive: false });
function registerTool(id, el, grip, name) {
  el.classList.add('tool'); grip.classList.add('tgrip');
  const slot = mk('div', 'slot'); slot.dataset.tool = id;
  slotsEl.appendChild(slot); slot.appendChild(el);               // all'inizio tutti stanno nel menu
  const t = { id, el, grip, slot, name, docked: true };
  TOOLS.push(t);
  // si osserva il contenuto intero (non solo i pezzi che c'erano all'inizio): righe nuove dei turni,
  // finestre messe nella cartella, testi che vanno a capo… il pannello aperto si allunga da solo
  // (il pannello ha un'altezza massima, quindi si osservano i pezzi dentro, anche quelli aggiunti dopo)
  const body = el.querySelector('.tbody') || el.querySelector('#diceBody');
  if (body && osservaPannelli) {
    for (const c of body.children) osservaPannelli.observe(c);
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) osservaPannelli.observe(n);
      if (el.classList.contains('open')) requestAnimationFrame(() => misuraPannello(el));
    }).observe(body, { childList: true });
  }
  grip.addEventListener('pointerdown', e => startToolDrag(e, t));
  return t;
}
// una scheda ridotta a icona si comporta da strumento "temporaneo": ha una casella solo finché sta nel menu
function sheetTool(w) {
  const t = w._tool || (w._tool = { id: 'sheet:' + w.dataset.id, el: w, grip: w, slot: null, docked: false, temp: true });
  t.docked = !!t.slot && w.parentElement === t.slot;
  return t;
}
function dockTool(t) {                                           // dentro il menu
  t.docked = true; t.el.style.left = t.el.style.top = '';
  if (t.temp) {
    t.slot = t.ghost || mk('div', 'slot'); t.ghost = null;
    slotsEl.appendChild(t.slot); t.el.classList.add('tool');
  }
  t.slot.classList.remove('hole', 'hot', 'ghost');
  t.slot.appendChild(t.el);
  if (!t.temp) settings.tools[t.id] = { docked: true };
}
function placeTool(t, x, y) {
  x = clamp(x, 0, Math.max(0, innerWidth - t.el.offsetWidth)); y = clamp(y, 0, Math.max(0, innerHeight - t.el.offsetHeight));
  t.el.style.left = x + 'px'; t.el.style.top = y + 'px';
  if (!t.temp) settings.tools[t.id] = { docked: false, x, y };
}
function floatTool(t, x, y) {                                    // fuori dal menu: lascia un buco (o, se temporanea, la casella sparisce)
  t.docked = false; document.body.appendChild(t.el); placeTool(t, x, y);
  if (t.temp) { if (t.slot) t.slot.remove(); t.slot = null; t.el.classList.remove('tool'); }
  else t.slot.classList.add('hole');
}
function inDrawer(x, y) {                                        // solo l'area del menu stesso (o la sua linguetta se è chiuso)
  const r = (drawer.classList.contains('closed') ? drawer.querySelector('.dhandle') : drawer).getBoundingClientRect();
  return x >= r.left - 24 && x <= r.right + 30 && y >= r.top - 24 && y <= r.bottom + 24;
}
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const { t } = drag, dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.presa) {                                             // il dito si è mosso prima di «prendere» lo strumento:
    if (Math.hypot(dx, dy) > 10) { clearTimeout(drag.timer); drag = null; }   // sta scorrendo il menu
    return;
  }
  if (!drag.on) {
    if (Math.hypot(dx, dy) < (drag.dito ? 3 : 6)) return;        // sotto i 6 px è ancora un clic
    drag.on = true; t.el.classList.add('dragging');
    t.docked = t.docked || (t.temp && !!t.slot && t.el.parentElement === t.slot);
    if (t.docked) floatTool(t, drag.ox, drag.oy);
  }
  placeTool(t, drag.ox + dx, drag.oy + dy);
  const hot = inDrawer(e.clientX, e.clientY);
  drawer.classList.toggle('dropping', hot);
  if (t.slot) t.slot.classList.toggle('hot', hot);
  if (t.temp) {                                                  // il menu si allarga con una casella momentanea
    if (hot && !t.ghost) { t.ghost = mk('div', 'slot hole hot ghost'); slotsEl.appendChild(t.ghost); }
    else if (!hot && t.ghost) { t.ghost.remove(); t.ghost = null; }
  }
  if (hot && drawer.classList.contains('closed')) setDrawer(true);
});
function dragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { t } = drag, was = drag.on, preso = drag.dito && drag.presa && t.el.classList.contains('preso');
  if (drag.timer) clearTimeout(drag.timer);
  drag = null;
  t.el.classList.remove('preso');
  const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };      // il rilascio non deve contare come clic
  if (!was) {
    if (preso) { addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => removeEventListener('click', eat, true), 400); }
    return;
  }
  t.el.classList.remove('dragging'); drawer.classList.remove('dropping');
  if (t.slot) t.slot.classList.remove('hot');
  if (e.type === 'pointerup' && inDrawer(e.clientX, e.clientY)) dockTool(t);
  else if (t.ghost) { t.ghost.remove(); t.ghost = null; }
  scheduleBoardSave();
  addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', eat, true), 0);
}
addEventListener('pointerup', dragEnd);
addEventListener('pointercancel', dragEnd);
addEventListener('resize', () => TOOLS.forEach(t => { if (!t.docked) { const r = t.el.getBoundingClientRect(); placeTool(t, r.left, r.top); } }));

function toggleOpen(box, open) {                                 // pannello che si allarga (penna, calcolatrice)
  const body = box.querySelector('.tbody');
  if (open) misuraPannello(box);
  box.classList.toggle('open', open); body.inert = !open;
  if (open) chiudiSovrapposti(box);
}
// Alto quanto il contenuto, ma mai oltre il fondo della finestra: quello che non ci sta si scorre.
function misuraPannello(box) {
  const body = box.querySelector('.tbody') || box.querySelector('#diceBody');
  if (!body) return;
  const top = Math.max(0, box.getBoundingClientRect().top), spazio = innerHeight - top - 10;
  box.style.setProperty('--dh', Math.max(120, Math.min(body.scrollHeight, spazio)) + 'px');
}
// Il contenuto può crescere mentre è aperto (una scaletta, un testo che va a capo): si rimisura.
const osservaPannelli = typeof ResizeObserver === 'function'
  ? new ResizeObserver(es => es.forEach(e => { const b = e.target.closest('.tool'); if (b && b.classList.contains('open')) requestAnimationFrame(() => misuraPannello(b)); }))
  : null;
addEventListener('resize', () => document.querySelectorAll('.tool.glass.open').forEach(misuraPannello));
// Aprendo un pannello, quelli già aperti che gli finirebbero sotto si chiudono.
function chiudiSovrapposti(box) {
  const r = box.getBoundingClientRect(), body = box.querySelector('.tbody, #diceBody, #zoomBody');
  const w = Math.max(r.width, parseFloat(getComputedStyle(box).getPropertyValue('--tw')) || 0, body ? body.scrollWidth : 0);
  const h = Math.max(r.height, parseFloat(box.style.getPropertyValue('--dh')) || 0);
  const mio = { l: r.left, t: r.top, r: r.left + w, b: r.top + h };
  for (const t of TOOLS) {
    if (t.el === box || !t.el.classList.contains('open')) continue;
    if (t.id === 'turni' && t.el.classList.contains('toolOn')) continue;   // l'ordine dei turni acceso dal master resta aperto
    const q = t.el.getBoundingClientRect();
    if (q.left < mio.r && q.right > mio.l && q.top < mio.b && q.bottom > mio.t) t.grip.click();
  }
}

// ======================= Penna, forme e testo =======================
// Tutto ciò che disegni è un oggetto come un segnalino (ma non sta negli assets): si seleziona, si sposta, si ridimensiona,
// si copia, si cambia di livello. Ogni oggetto appartiene a un livello: mappa, segnalini o nascosto.
const ICON = (d) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PEN_TOOLS = [['select', '⬚', 'Selezione: clic sugli oggetti disegnati'], ['pen', '✏️', 'Penna'], ['line', '╱', 'Linea'], ['rect', '▭', 'Rettangolo'],
  ['ellipse', '◯', 'Ellisse'], ['tri', '△', 'Triangolo'], ['text', 'T', 'Testo: scrivi con la tastiera, Invio per confermare'], ['erase', '🧽', 'Gomma']];
const penBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Penna" title="Penna e forme">${ICON('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>')}</button>
   <div class="tbody" inert>
     <div class="tnote" id="penLayer"></div>
     <div class="trow" id="penTools"></div>
     <div class="trow" id="penSw"></div>
     <label class="trow">Spessore <input id="penW" type="range" min="1" max="24" step="1"> <output id="penWOut"></output> px</label>
     <label class="trow"><input id="penFill" type="checkbox"> Riempi le forme</label>
     <div class="trow"><button id="penUndo" type="button">↩ Annulla</button><button id="penClear" type="button">🗑 Cancella livello</button></div>
   </div>`);
penBox.id = 'penBox'; document.body.appendChild(penBox);        // serve nel documento per trovare i suoi elementi
const penGrip = penBox.querySelector('.tgrip');

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pathOf = p => { let d = `M${p[0]} ${p[1]}`; if (p.length === 2) d += 'l.01 0'; for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`; return d; };
const mctx = document.createElement('canvas').getContext('2d');
function textBox(txt, fs) {
  if (mctx) mctx.font = `600 ${fs}px system-ui, sans-serif`;
  const lines = txt.split('\n');
  const wd = l => (mctx && mctx.measureText(l) && mctx.measureText(l).width) || l.length * fs * 0.6;
  return { vw: Math.max(fs, Math.max(...lines.map(wd)) + fs * 0.15), vh: lines.length * fs * 1.25 };
}
function shapeSvg(sh) {                                          // disegno vettoriale dentro il riquadro dell'oggetto
  const { vw, vh, sw } = sh, p = sw / 2, c = sh.c;
  if (sh.t === 'text') {
    const lh = sh.fs * 1.25, tx = sh.txt.split('\n').map((l, i) => `<tspan x="0" y="${+(sh.fs * 0.95 + i * lh).toFixed(1)}">${esc(l) || ' '}</tspan>`).join('');
    return `<svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none"><rect width="${vw}" height="${vh}" fill="transparent"/><text font-family="system-ui, sans-serif" font-size="${sh.fs}" font-weight="600" fill="${c}" stroke="rgba(0,0,0,.45)" stroke-width="${+(sh.fs * 0.05).toFixed(2)}" paint-order="stroke" xml:space="preserve">${tx}</text></svg>`;
  }
  const geo = {
    rect: a => `<rect x="${p}" y="${p}" width="${Math.max(0, vw - sw)}" height="${Math.max(0, vh - sw)}" ${a}/>`,
    ellipse: a => `<ellipse cx="${vw / 2}" cy="${vh / 2}" rx="${Math.max(0, (vw - sw) / 2)}" ry="${Math.max(0, (vh - sw) / 2)}" ${a}/>`,
    tri: a => `<polygon points="${vw / 2},${p} ${p},${vh - p} ${vw - p},${vh - p}" ${a}/>`,
    line: a => `<line x1="${sh.fx ? vw - p : p}" y1="${sh.fy ? vh - p : p}" x2="${sh.fx ? p : vw - p}" y2="${sh.fy ? p : vh - p}" ${a}/>`,
    path: a => `<path d="${sh.d}" ${a}/>`
  }[sh.t];
  const open = sh.t === 'line' || sh.t === 'path';
  const fill = open || !sh.fill ? 'none' : `color-mix(in srgb, ${c} 35%, transparent)`;
  const st = 'stroke-linecap="round" stroke-linejoin="round"';
  // sotto: stessa figura con tratto trasparente più largo, così si clicca facilmente
  return `<svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">${geo(`fill="none" stroke="transparent" stroke-width="${Math.max(sw, 12)}" ${st}`)}${geo(`fill="${fill}" stroke="${c}" stroke-width="${sw}" ${st}`)}</svg>`;
}
function createShape(sh, w, h, l, t, lay, silent) {
  const el = document.createElement('div');
  el.className = 'photo shape'; el.dataset.layer = lay || 'tokens'; el._shape = sh;
  Object.assign(el.style, { width: w + 'px', height: h + 'px', left: l + 'px', top: t + 'px', zIndex: el.dataset.layer === 'map' ? 1 : ++zTop });
  el.innerHTML = shapeSvg(sh);
  addHandles(el);
  world.appendChild(el);
  if (!silent) { select(el); scheduleBoardSave(); }
  return el;
}
function refreshShape(el) {
  const old = el.querySelector('svg');
  if (old) old.remove();
  el.insertAdjacentHTML('afterbegin', shapeSvg(el._shape));
}

const curLay = () => layer === 'map' ? 'map' : layer === 'hidden' ? 'hidden' : 'tokens';
const LAYER_NAMES = { map: 'Mappa (sotto i segnalini)', tokens: 'Segnalini', hidden: 'Nascosto' };
const refreshPenLabel = () => { $('penLayer').textContent = 'Disegni sul livello: ' + LAYER_NAMES[curLay()]; };
new MutationObserver(refreshPenLabel).observe(viewport, { attributes: true, attributeFilter: ['class'] });

let penPanel = false, penOn = false, shp = null, erasing = null, lastPtr = null;
const penStack = [];
function refreshPen() {
  penOn = penPanel && settings.pen.tool !== 'select';
  penBox.classList.toggle('toolOn', penPanel);
  viewport.classList.toggle('pen-on', penOn && settings.pen.tool !== 'erase');
  viewport.classList.toggle('pen-erase', penOn && settings.pen.tool === 'erase');
  $('penTools').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tool === settings.pen.tool));
}
function setPen(on) {
  penPanel = on;
  if (on) { setRuler(false); refreshPenLabel(); }
  if (penBox.classList.contains('open') !== on) toggleOpen(penBox, on);
  refreshPen();
}
penGrip.addEventListener('click', () => setPen(!penPanel));
for (const [id, ico, tip] of PEN_TOOLS) {
  const b = mk('button'); b.type = 'button'; b.dataset.tool = id; b.textContent = ico; b.title = tip; b.setAttribute('aria-label', tip);
  b.addEventListener('click', () => { settings.pen.tool = id; refreshPen(); scheduleBoardSave(); });
  $('penTools').appendChild(b);
}
const penSw = $('penSw');
for (const [c, n] of SWATCHES) {
  const b = mk('button', 'sw'); b.type = 'button'; b.dataset.color = c; b.title = n; b.style.background = c; b.setAttribute('aria-label', n);
  b.addEventListener('click', () => { settings.pen.color = c; syncPen(); scheduleBoardSave(); });
  penSw.appendChild(b);
}
const penColor = mk('input'); penColor.type = 'color'; penColor.title = 'Altro colore';
penColor.addEventListener('input', () => { settings.pen.color = penColor.value; syncPen(); scheduleBoardSave(); });
penSw.appendChild(penColor);
$('penW').addEventListener('input', e => { settings.pen.width = +e.target.value; syncPen(); scheduleBoardSave(); });
$('penFill').addEventListener('input', e => { settings.pen.fill = e.target.checked; scheduleBoardSave(); });
function syncPen() {
  penSw.querySelectorAll('.sw').forEach(b => b.classList.toggle('active', b.dataset.color === settings.pen.color));
  penColor.value = /^#[0-9a-f]{6}$/i.test(settings.pen.color) ? settings.pen.color : '#ff4d4d';
  $('penW').value = settings.pen.width; $('penWOut').textContent = settings.pen.width; $('penFill').checked = !!settings.pen.fill;
}
$('penUndo').addEventListener('click', () => {
  while (penStack.length) {
    const el = penStack.pop();
    if (el.isConnected) { el.remove(); setSelection(selection); scheduleBoardSave(); break; }
  }
});
$('penClear').addEventListener('click', () => {
  const lay = curLay(), list = [...world.querySelectorAll('.photo.shape')].filter(p => p.dataset.layer === lay);
  if (!list.length || !confirm('Cancellare tutti i disegni di questo livello nella scena?')) return;
  list.forEach(p => p.remove()); setSelection([]); scheduleBoardSave();
});

// vecchi tratti salvati dalla versione precedente: diventano oggetti normali (una volta sola)
function drawLoad(d) {
  if (!d || !(d.map || d.tokens)) return;
  for (const key of ['map', 'tokens']) for (const st of (d[key] || [])) {
    const xs = st.p.filter((_, i) => i % 2 === 0), ys = st.p.filter((_, i) => i % 2), pad = st.w / 2;
    const l = Math.min(...xs) - pad, t = Math.min(...ys) - pad, vw = Math.max(...xs) - Math.min(...xs) + st.w, vh = Math.max(...ys) - Math.min(...ys) + st.w;
    createShape({ t: 'path', c: st.c, sw: st.w, vw, vh, d: pathOf(st.p.map((v, i) => +(v - (i % 2 ? t : l)).toFixed(1))) }, vw, vh, l, t, key, true);
  }
}
function drawSnapshot() { return undefined; }

// ---- disegno con il mouse ----
const wpt = e => ({ x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s });
const live = document.createElementNS(SVGNS, 'svg');             // anteprima del tratto a mano libera
live.setAttribute('class', 'drawSvg'); live.style.zIndex = 99999;
function startShape(e) {
  const tool = settings.pen.tool, w = wpt(e), p0 = tool === 'pen' ? w : snapPoint(w.x, w.y);
  shp = { id: e.pointerId, tool, p0, pts: [+p0.x.toFixed(1), +p0.y.toFixed(1)], start: [e.clientX, e.clientY], lay: curLay(), el: null,
    sw: +Math.max(0.5, settings.pen.width / view.s).toFixed(2) };
  if (tool === 'pen') {
    const p = document.createElementNS(SVGNS, 'path');
    for (const [k, v] of Object.entries({ fill: 'none', stroke: settings.pen.color, 'stroke-width': shp.sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) p.setAttribute(k, v);
    shp.path = p; live.replaceChildren(p); world.appendChild(live);
  }
  viewport.setPointerCapture(e.pointerId);
}
function moveShape(e) {
  const w = wpt(e);
  if (shp.tool === 'pen') { shp.pts.push(+w.x.toFixed(1), +w.y.toFixed(1)); shp.path.setAttribute('d', pathOf(shp.pts)); return; }
  const q = snapPoint(w.x, w.y), a = shp.p0;
  const l = Math.min(a.x, q.x), t = Math.min(a.y, q.y), bw = Math.max(Math.abs(q.x - a.x), shp.sw), bh = Math.max(Math.abs(q.y - a.y), shp.sw);
  const sh = { t: shp.tool, c: settings.pen.color, sw: shp.sw, fill: settings.pen.fill, vw: bw, vh: bh, fx: q.x < a.x, fy: q.y < a.y };
  if (!shp.el) shp.el = createShape(sh, bw, bh, l, t, shp.lay, true);
  else {
    shp.el._shape = sh;
    Object.assign(shp.el.style, { left: l + 'px', top: t + 'px', width: bw + 'px', height: bh + 'px' });
    refreshShape(shp.el);
  }
}
function endShape(e) {
  const s = shp; shp = null; live.remove();
  if (s.tool === 'pen') {
    const xs = s.pts.filter((_, i) => i % 2 === 0), ys = s.pts.filter((_, i) => i % 2), pad = s.sw / 2;
    const l = Math.min(...xs) - pad, t = Math.min(...ys) - pad, vw = Math.max(...xs) - Math.min(...xs) + s.sw, vh = Math.max(...ys) - Math.min(...ys) + s.sw;
    const rel = s.pts.map((v, i) => +(v - (i % 2 ? t : l)).toFixed(1));
    penStack.push(createShape({ t: 'path', c: settings.pen.color, sw: s.sw, vw, vh, d: pathOf(rel) }, vw, vh, l, t, s.lay, true));
    scheduleBoardSave();
  } else if (s.el) {
    if (Math.hypot(e.clientX - s.start[0], e.clientY - s.start[1]) < 4) s.el.remove();     // un semplice clic non crea nulla
    else { penStack.push(s.el); scheduleBoardSave(); }
  }
}
function eraseAt(x, y) {                                          // la gomma cancella i disegni del livello selezionato
  for (const n of document.elementsFromPoint(x, y)) {
    const o = n.closest && n.closest('.photo.shape');
    if (o && o.dataset.layer === curLay()) { o.remove(); setSelection(selection); scheduleBoardSave(); }
  }
}

// ---- testo con la tastiera ----
let textEd = null;
function openTextEditor(cx, cy, existing) {
  if (textEd) textEd.commit();
  const sh0 = existing ? existing._shape : null;
  const fs = sh0 ? sh0.fs : +((settings.pen.width * 3 + 12) / view.s).toFixed(1);
  const ta = document.createElement('textarea');
  ta.className = 'textEdit'; ta.rows = 1; ta.value = sh0 ? sh0.txt : '';
  Object.assign(ta.style, { left: cx + 'px', top: cy + 'px', fontSize: fs * view.s + 'px', color: sh0 ? sh0.c : settings.pen.color });
  document.body.appendChild(ta);
  const lay = curLay(), at = snapPoint((cx - view.x) / view.s, (cy - view.y) / view.s), color = settings.pen.color;
  let done = false;
  const commit = () => {
    if (done) return;
    done = true; textEd = null;
    const txt = ta.value.replace(/\s+$/, '');
    ta.remove();
    if (!txt) { if (existing) { existing.remove(); setSelection([]); scheduleBoardSave(); } return; }
    const tb = textBox(txt, fs);
    if (existing) {
      Object.assign(existing._shape, { txt, vw: tb.vw, vh: tb.vh });
      Object.assign(existing.style, { width: tb.vw + 'px', height: tb.vh + 'px' });
      refreshShape(existing);
    } else {
      penStack.push(createShape({ t: 'text', c: color, fs, txt, vw: tb.vw, vh: tb.vh, sw: 0 }, tb.vw, tb.vh, at.x, at.y, lay, true));
    }
    scheduleBoardSave();
  };
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { done = true; textEd = null; ta.remove(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commit(); }   // Maiusc+Invio: a capo
  });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
  ta.addEventListener('blur', commit);
  textEd = { commit };
  setTimeout(() => ta.focus(), 0);
}
function editText(el) { const r = el.getBoundingClientRect(); openTextEditor(r.left, r.top, el); }
viewport.addEventListener('dblclick', e => {
  const p = e.target.closest('.photo.shape');
  if (p && p._shape.t === 'text') editText(p);
});

// ======================= Righello =======================
const rulerBox = mk('div', 'tool glass', `<button class="tgrip" type="button" aria-label="Righello">${ICON('<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10.5 8v4.5M14.5 8v3M18.5 8v4.5"/>')}</button>`);
rulerBox.id = 'rulerBox'; document.body.appendChild(rulerBox);
const rulerGrip = rulerBox.querySelector('.tgrip');
const rulerSvg = document.createElementNS(SVGNS, 'svg'); rulerSvg.id = 'rulerSvg'; document.body.appendChild(rulerSvg);
let rulerOn = false, ruler = null, rulerFade = 0;
const unitTxt = () => settings.unit === 'm' ? '1,5 m' : '5 ft';
const rulerTitle = () => { rulerGrip.title = `Righello: ${unitTxt()} per ogni casella della griglia`; };
function setRuler(on) {
  rulerOn = on; rulerBox.classList.toggle('toolOn', on); viewport.classList.toggle('ruler-on', on);
  if (on) { if (penPanel) setPen(false); select(null); } else clearRuler();
}
rulerGrip.addEventListener('click', () => setRuler(!rulerOn));
$('unitSel').addEventListener('change', rulerTitle);
function clearRuler() { clearTimeout(rulerFade); rulerSvg.replaceChildren(); ruler = null; }
const cellCenter = (x, y) => { const b = boardRect(), s = grid.size; return { x: b.x + (Math.floor((x - b.x) / s) + .5) * s, y: b.y + (Math.floor((y - b.y) / s) + .5) * s }; };
const rp = e => { const x = (e.clientX - view.x) / view.s, y = (e.clientY - view.y) / view.s; return settings.rulerCenter ? cellCenter(x, y) : snapPoint(x, y); };
function drawRuler() {
  const { a, b } = ruler, k = view.s;
  const x1 = a.x * k + view.x, y1 = a.y * k + view.y, x2 = b.x * k + view.x, y2 = b.y * k + view.y;
  const cells = Math.hypot(b.x - a.x, b.y - a.y) / grid.size, v = cells * (settings.unit === 'm' ? 1.5 : 5);
  const txt = `${+v.toFixed(1)} ${settings.unit === 'm' ? 'm' : 'ft'} · ${+cells.toFixed(1)} caselle`;
  rulerSvg.innerHTML =
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffd93d" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="${x1}" cy="${y1}" r="5" fill="#ffd93d" stroke="#000" stroke-opacity=".6"/><circle cx="${x2}" cy="${y2}" r="5" fill="#ffd93d" stroke="#000" stroke-opacity=".6"/>` +
    `<text x="${(x1 + x2) / 2 + 10}" y="${(y1 + y2) / 2 - 10}">${txt}</text>`;
}

// ---- puntatore per penna, gomma e righello (prima di script.js) ----
viewport.addEventListener('pointerdown', e => {
  if (e.button === 2) clearRuler();
  if (e.button !== 0) return;
  if (penOn) {
    e.stopImmediatePropagation(); e.preventDefault();
    const tool = settings.pen.tool;
    if (tool === 'text') openTextEditor(e.clientX, e.clientY);
    else if (tool === 'erase') { erasing = e.pointerId; eraseAt(e.clientX, e.clientY); viewport.setPointerCapture(e.pointerId); }
    else startShape(e);
  } else if (rulerOn) {
    clearRuler(); const a = rp(e); ruler = { id: e.pointerId, a, b: a }; drawRuler(); viewport.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation(); e.preventDefault();
  }
}, true);
viewport.addEventListener('pointermove', e => {
  if (shp && e.pointerId === shp.id) { moveShape(e); e.stopImmediatePropagation(); }
  else if (erasing === e.pointerId) { eraseAt(e.clientX, e.clientY); e.stopImmediatePropagation(); }
  else if (ruler && e.pointerId === ruler.id) { ruler.b = rp(e); drawRuler(); e.stopImmediatePropagation(); }
}, true);
viewport.addEventListener('pointerup', e => {
  if (shp && e.pointerId === shp.id) { endShape(e); e.stopImmediatePropagation(); }
  else if (erasing === e.pointerId) { erasing = null; e.stopImmediatePropagation(); }
  else if (ruler && e.pointerId === ruler.id) { ruler.id = -1; rulerFade = setTimeout(clearRuler, 5000); e.stopImmediatePropagation(); }
}, true);
viewport.addEventListener('pointermove', e => { lastPtr = wpt(e); });
viewport.addEventListener('wheel', clearRuler);

// ======================= Creazione segnalini =======================
const tokBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Crea segnalino" title="Crea un segnalino">${ICON('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>')}</button>
   <div class="tbody" inert>
     <label class="trow">Nome <input id="tkName" type="text" maxlength="24" placeholder="Es. Goblin 1" autocomplete="off"></label>
     <div class="trow">Forma <button id="tkRound" type="button" class="on">◯ Tondo</button><button id="tkSquare" type="button">▢ Quadrato</button></div>
     <div class="trow">Colore <span id="tkSw" class="trow"></span><input id="tkColor" type="color" value="#d9534f" title="Altro colore"></div>
     <div class="trow">Bordo <input id="tkRing" type="color" value="#ffffff"> <label><input id="tkNoRing" type="checkbox"> senza bordo</label></div>
     <div class="trow">Immagine <button id="tkImg" type="button">Scegli…</button><button id="tkImgX" type="button" hidden>Togli</button></div>
     <label class="trow">Grandezza <select id="tkSize"><option value="0.5">½ casella</option><option value="1" selected>1 casella</option><option value="2">2 caselle</option><option value="3">3 caselle</option><option value="4">4 caselle</option></select></label>
     <label class="trow">Scheda <select id="tkSheet"></select></label>
     <div class="trow"><div id="tkPrev" draggable="true" title="Trascinalo sulla mappa"></div><button id="tkAdd" type="button">＋ Aggiungi al centro</button></div>
   </div>`);
tokBox.id = 'tokBox'; document.body.appendChild(tokBox);
const tok = { name: '', round: true, color: '#d9534f', ring: '#ffffff', noRing: false, img: null, baked: false, size: 1, sheet: '' };
function applyLook(el) {                                         // bordo colorato dei segnalini con immagine
  if (el.dataset.ring) el.style.setProperty('--ring', el.dataset.ring); else el.style.removeProperty('--ring');
}
function tokUrl() {
  if (tok.img) return tok.img.url;
  const txt = esc(tok.name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase());
  const ring = tok.noRing ? '' : `stroke="${tok.ring}" stroke-width="8"`;
  const shape = tok.round ? `<circle cx="64" cy="64" r="60" fill="${tok.color}" ${ring}/>` : `<rect x="4" y="4" width="120" height="120" rx="14" fill="${tok.color}" ${ring}/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${shape}<text x="64" y="66" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="700" font-size="${txt.length > 2 ? 40 : 52}" fill="${onColor(tok.color)}">${txt}</text></svg>`);
}
function refreshTok() {
  $('tkRound').classList.toggle('on', tok.round); $('tkSquare').classList.toggle('on', !tok.round);
  $('tkImgX').hidden = !tok.img; $('tkImg').textContent = tok.img ? tok.img.name.slice(0, 18) : 'Scegli…';
  $('tkSw').querySelectorAll('.sw').forEach(b => b.classList.toggle('active', !tok.img && b.dataset.color === tok.color));
  const im = new Image(); im.src = tokUrl(); im.alt = '';
  if (tok.img && !tok.baked && tok.round) im.style.borderRadius = '50%';
  $('tkPrev').replaceChildren(im);
}
function refreshTokSheets() {
  const sel = $('tkSheet');
  sel.replaceChildren(new Option('— nessuna scheda —', ''), ...sheets.map(s => new Option(s.name, s.id)));
  sel.value = sheets.some(s => s.id === tok.sheet) ? tok.sheet : '';
  tok.sheet = sel.value;
}
// «Goblin» aggiunto quando c'è già un «Goblin»: il primo diventa «Goblin 1», il nuovo «Goblin 2»
function numeraNome(nm, altri) {
  const base = nm.replace(/\s+\d+$/, ''), re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s+(\\d+))?$');
  const stessi = altri.filter(o => re.test(o.dataset.name || ''));
  if (!stessi.length) return nm;
  let max = 0;
  for (const o of stessi) { const m = re.exec(o.dataset.name); max = Math.max(max, m[1] ? +m[1] : 0); }
  const senza = stessi.filter(o => o.dataset.name === base);
  if (senza.length === 1 && !stessi.some(o => /\s1$/.test(o.dataset.name))) { senza[0].dataset.name = base + ' 1'; max = Math.max(max, 1); }
  else if (!max) max = senza.length;
  return base + ' ' + (max + 1);
}
function makeToken(wx, wy) {
  if (layer === 'map') setLayer('tokens');
  const size = tok.size * (grid.show ? grid.size : 60), p = snapPoint(wx - size / 2, wy - size / 2);
  // se lì c'è già un segnalino, una casella più in là (così non finiscono uno sopra l'altro)
  const altri = [...world.querySelectorAll('.photo')].filter(o => !o._shape && (o.dataset.layer || 'tokens') !== 'map');
  const passo = grid.show ? grid.size : size;
  for (let n = 0; n < 40 && altri.some(o => Math.abs(num(o, 'left') - p.x) < 1 && Math.abs(num(o, 'top') - p.y) < 1); n++) p.x += passo;
  const el = createPhoto(tokUrl(), size, size, p.x, p.y, tok.img ? tok.img.id : undefined, false, layer === 'hidden' ? 'hidden' : 'tokens');
  const sh = sheets.find(s => s.id === tok.sheet), nm = tok.name.trim() || (sh ? sh.name : '');
  if (nm) el.dataset.name = numeraNome(nm, altri);
  if (tok.img && !tok.baked) { if (tok.round) el.dataset.round = '1'; if (!tok.noRing) el.dataset.ring = tok.ring; }
  if (sh) el.dataset.sheet = sh.id;
  applyLook(el); updateTokenBars(); scheduleBoardSave();
}
for (const [c, n] of SWATCHES.slice(0, 7)) {
  const b = mk('button', 'sw'); b.type = 'button'; b.dataset.color = c; b.title = n; b.style.background = c; b.setAttribute('aria-label', n);
  b.addEventListener('click', () => { tok.color = c; tok.img = null; tok.baked = false; $('tkColor').value = c; refreshTok(); });
  $('tkSw').appendChild(b);
}
$('tkName').addEventListener('input', e => { tok.name = e.target.value; refreshTok(); });
$('tkRound').addEventListener('click', () => { tok.round = true; refreshTok(); });
$('tkSquare').addEventListener('click', () => { tok.round = false; refreshTok(); });
$('tkColor').addEventListener('input', e => { tok.color = e.target.value; tok.img = null; tok.baked = false; refreshTok(); });
$('tkRing').addEventListener('input', e => { tok.ring = e.target.value; refreshTok(); });
$('tkNoRing').addEventListener('input', e => { tok.noRing = e.target.checked; refreshTok(); });
$('tkImg').addEventListener('click', () => pickAsset(a => { tok.img = a; refreshTok(); }));
$('tkImgX').addEventListener('click', () => { tok.img = null; refreshTok(); });
$('tkSize').addEventListener('input', e => { tok.size = +e.target.value; });
$('tkSheet').addEventListener('input', e => { tok.sheet = e.target.value; });
$('tkAdd').addEventListener('click', () => makeToken((innerWidth / 2 - view.x) / view.s, (innerHeight / 2 - view.y) / view.s));
$('tkPrev').addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-token', '1'); e.dataTransfer.effectAllowed = 'copy'; });
viewport.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-token')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
viewport.addEventListener('drop', e => {
  if (!e.dataTransfer.getData('application/x-token')) return;
  e.preventDefault();
  makeToken((e.clientX - view.x) / view.s, (e.clientY - view.y) / view.s);
});
tokBox.querySelector('.tgrip').addEventListener('click', () => {
  const open = !tokBox.classList.contains('open');
  if (open) { refreshTokSheets(); refreshTok(); }
  toggleOpen(tokBox, open);
});

// ======================= Frecce: muovono i segnalini selezionati =======================
addEventListener('keydown', e => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d || !selection.length || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  e.preventDefault();
  const step = grid.snap ? grid.size : (e.shiftKey ? 1 : 10) / view.s;      // con l'aggancio: una casella; Maiusc: spostamenti fini
  for (const p of selection) {
    let x = num(p, 'left') + d[0] * step, y = num(p, 'top') + d[1] * step;
    if (grid.snap) { const q = snapPoint(x, y); x = q.x; y = q.y; }
    p.style.left = x + 'px'; p.style.top = y + 'px';
  }
  scheduleBoardSave();
});

// ======================= Calcolatrice =======================
const KEYS = ['C', '⌫', '(', ')', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+'];
const calcBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Calcolatrice" title="Calcolatrice">${ICON('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>')}</button>
   <div class="tbody" inert>
     <input id="calcDisp" type="text" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="Operazione">
     <div id="calcRes"></div>
     <div id="calcKeys"></div>
     <div class="trow"><button id="calcSend" type="button">Invia il risultato in chat</button></div>
   </div>`);
calcBox.id = 'calcBox'; document.body.appendChild(calcBox);
function calcEval(src) {                                         // piccolo calcolatore, senza eval
  const t = src.replace(/\s+/g, '').replace(/÷/g, '/').replace(/×/g, '*').replace(/[−–]/g, '-').replace(/,/g, '.');
  if (!t || !/^[0-9+\-*/().%]*$/.test(t)) return NaN;
  let i = 0;
  const expr = () => { let v = term(); while (t[i] === '+' || t[i] === '-') { const o = t[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = unary(); while (t[i] === '*' || t[i] === '/') { const o = t[i++], r = unary(); v = o === '*' ? v * r : v / r; } return v; };
  const unary = () => { if (t[i] === '-') { i++; return -unary(); } if (t[i] === '+') { i++; return unary(); } return post(); };
  const post = () => { let v = atom(); while (t[i] === '%') { i++; v /= 100; } return v; };
  const atom = () => {
    if (t[i] === '(') { i++; const v = expr(); if (t[i] !== ')') throw 0; i++; return v; }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i)); if (!m) throw 0;
    i += m[0].length; return parseFloat(m[0]);
  };
  try { const v = expr(); return i === t.length ? v : NaN; } catch { return NaN; }
}
const fmtNum = v => String(+v.toPrecision(12));
function calcRefresh() {
  const v = calcEval($('calcDisp').value);
  $('calcRes').textContent = Number.isFinite(v) && $('calcDisp').value.trim() ? '= ' + fmtNum(v) : '';
}
{
  const keys = calcBox.querySelector('#calcKeys');
  for (const k of KEYS) {
    const b = mk('button', k === '÷' || k === '×' || k === '−' || k === '+' ? 'op' : ''); b.type = 'button'; b.textContent = k;
    b.addEventListener('click', () => {
      const d = $('calcDisp');
      if (k === 'C') d.value = ''; else if (k === '⌫') d.value = d.value.slice(0, -1); else d.value += k;
      calcRefresh(); d.focus();
    });
    keys.appendChild(b);
  }
  const eq = mk('button', 'eq'); eq.type = 'button'; eq.textContent = '='; eq.style.gridColumn = '1 / -1';
  eq.addEventListener('click', calcEquals);
  keys.appendChild(eq);
}
function calcEquals() {
  const v = calcEval($('calcDisp').value);
  if (Number.isFinite(v)) { $('calcDisp').value = fmtNum(v); $('calcRes').textContent = ''; } else $('calcRes').textContent = 'Operazione non valida';
}
$('calcDisp').addEventListener('input', calcRefresh);
$('calcDisp').addEventListener('keydown', e => { if (e.key === 'Enter') calcEquals(); });
$('calcSend').addEventListener('click', () => {
  const src = $('calcDisp').value.trim(), v = calcEval(src);
  if (src && Number.isFinite(v)) addChat({ kind: 'text', text: `🧮 ${src} = ${fmtNum(v)}` });
});
calcBox.querySelector('.tgrip').addEventListener('click', () => toggleOpen(calcBox, !calcBox.classList.contains('open')));

// ======================= Registrazione degli strumenti nel menu =======================
registerTool('dice', $('dice'), $('diceToggle'), 'Dadi');
registerTool('pen', penBox, penGrip, 'Penna');
registerTool('token', tokBox, tokBox.querySelector('.tgrip'), 'Segnalini');
registerTool('calc', calcBox, calcBox.querySelector('.tgrip'), 'Calcolatrice');
registerTool('ruler', rulerBox, rulerGrip, 'Righello');
registerTool('zoom', $('zoomBox'), $('zoomToggle'), 'Zoom');
syncPen(); rulerTitle();

// ======================= Scena mostrata ai giocatori =======================
// Variabile di collegamento per il futuro server dei giocatori (Rust). Finché è spenta non parte nulla.
const PLAYER_LINK = { enabled: false, url: null };            // es. { enabled: true, url: 'ws://localhost:9000' }
function sendToPlayers(type, payload) {
  if (!PLAYER_LINK.enabled) return false;
  // TODO (Rust): inviare { type, payload } al server dei giocatori usando PLAYER_LINK.url
  return true;
}
const sceneSummary = sc => ({ id: sc.id, name: sc.name, type: sc.type });
const getPublicScene = () => scenes.find(s => s.id === settings.publicScene) || null;   // la scena che vedono i giocatori
function setPublicScene(id) {
  settings.publicScene = id;
  sendToPlayers('scene', id ? sceneSummary(scenes.find(s => s.id === id)) : null);
  renderSceneUI(); scheduleBoardSave();
}
const badge = mk('button', '', ''); badge.id = 'publicBadge'; badge.type = 'button';
$('dock').appendChild(badge);
badge.addEventListener('click', () => { const p = getPublicScene(); if (p && p !== cur) switchScene(p.id); });
function decorateSceneRow(row, sc) {                             // chiamata da script.js per ogni riga
  const on = settings.publicScene === sc.id, pin = mk('button', 'pin' + (on ? ' on' : ''), '📌');
  pin.type = 'button'; pin.title = on ? 'I giocatori vedono questa scena (clic per smettere)' : 'Mostra questa scena ai giocatori';
  pin.setAttribute('aria-label', pin.title);
  pin.addEventListener('click', () => setPublicScene(on ? null : sc.id));
  row.classList.toggle('public', on); row.append(pin);
}
function afterSceneUI() {
  const pub = getPublicScene();
  if (settings.publicScene && !pub) settings.publicScene = null;  // la scena è stata eliminata
  badge.classList.toggle('show', !!pub); badge.classList.toggle('other', !!pub && pub !== cur);
  if (pub) badge.textContent = pub === cur ? '👁 I giocatori vedono questa scena' : '👁 I giocatori vedono: ' + pub.name;
}

// ======================= Clic destro ovunque =======================
const copyText = t => { try { navigator.clipboard.writeText(t); } catch {} };
function toolMenu(el) {
  const t = TOOLS.find(x => x.el === el); if (!t) return null;
  const items = [t.docked
    ? { label: 'Estrai dal menu', fn: () => { const r = el.getBoundingClientRect(); floatTool(t, r.left + 80, r.top); scheduleBoardSave(); } }
    : { label: 'Rimetti nel menu a sinistra', fn: () => { dockTool(t); setDrawer(true); scheduleBoardSave(); } }];
  if (t.id === 'folder' && typeof folderToolExtra === 'function') items.push('-', ...folderToolExtra());
  if (t.id === 'music' && typeof musicMenuExtra === 'function') items.push('-', ...musicMenuExtra());
  if (t.id === 'fog' && typeof fogMenuExtra === 'function') items.push('-', ...fogMenuExtra());
  if (t.id === 'pen') items.push({ label: 'Annulla l\'ultimo tratto', fn: () => $('penUndo').click() }, { label: 'Cancella i disegni del livello', danger: true, fn: () => $('penClear').click() });
  if (t.id === 'ruler') items.push({ label: settings.rulerCenter ? 'Misura liberamente (non da centro a centro)' : 'Misura da centro a centro delle caselle', fn: () => { settings.rulerCenter = !settings.rulerCenter; syncExtraForm(); scheduleBoardSave(); } }, { label: settings.unit === 'm' ? 'Usa 5 ft per casella' : 'Usa 1,5 m per casella', fn: () => { settings.unit = settings.unit === 'm' ? 'ft' : 'm'; rulerTitle(); syncSheetForm(); scheduleBoardSave(); } });
  return items;
}
function mapMenu(e) {
  const pub = settings.publicScene === cur.id;
  return [
    { label: '📍 Ping qui', fn: () => startPing(e.clientX, e.clientY) },
    { label: 'Centra tutta la mappa', fn: () => fitView(true) },
    '-',
    { label: grid.show ? 'Nascondi la griglia' : 'Mostra la griglia', fn: () => { grid.show = !grid.show; paintGrid(); syncSceneGrid(); scheduleBoardSave(); } },
    { label: grid.snap ? 'Disattiva l\'aggancio alla griglia' : 'Attiva l\'aggancio alla griglia', fn: () => { grid.snap = !grid.snap; syncSceneGrid(); scheduleBoardSave(); } },
    { label: layer === 'map' ? 'Passa ai segnalini' : 'Modifica la mappa (rettangolo e sfondo)', fn: () => setLayer(layer === 'map' ? 'tokens' : 'map') },
    '-',
    { label: 'Seleziona tutto in questo livello', fn: () => setSelection([...world.querySelectorAll('.photo')].filter(p => (p.dataset.layer || 'tokens') === layer)) },
    { label: 'Incolla qui', off: !clip.length, fn: () => pasteClip({ x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s }) },
    { label: pub ? 'I giocatori non vedano più questa scena' : '📌 Mostra questa scena ai giocatori', fn: () => setPublicScene(pub ? null : cur.id) },
    { label: '＋ Nuova scena…', fn: () => $('sceneNew').click() }
  ];
}
function assetMenu(a) {
  if (!a) return null;
  const folders = [{ name: '' }, ...data.folders].filter(f => f.name !== a.folder);
  return [
    { label: 'Aggiungi alla mappa', fn: () => addPhotoToMap(a.url, null, a.id) },
    { label: '🖼 Usa come sfondo della scena', fn: () => setBackground(a.url, a.id) },
    { label: 'Sposta in', items: folders.map(f => ({ label: f.name || 'Principale', fn: () => act(() => store.move(a, f.name)) })) },
    '-', { label: 'Elimina', danger: true, fn: () => confirm(`Eliminare «${a.name}» dagli assets?`) && act(() => store.remove(a)) }
  ];
}
function folderMenu(name) {
  const f = data.folders.find(x => x.name === name);
  const items = [{ label: 'Apri', fn: () => { current = name; render(); } }];
  if (name) items.push('-', { label: f && f.count ? 'Elimina (non è vuota)' : 'Elimina la cartella', danger: true, off: !!(f && f.count), fn: () => act(() => store.removeFolder(name)) });
  return items;
}
function sceneRowMenu(row) {
  const sc = scenes.find(s => s.id === row.dataset.id); if (!sc) return null;
  const on = settings.publicScene === sc.id, byTitle = t => row.querySelector(`button[title="${t}"]`);
  return [
    { label: 'Vai a questa scena', fn: () => switchScene(sc.id) },
    { label: 'Rinomina', fn: () => byTitle('Rinomina') && byTitle('Rinomina').click() },
    { label: on ? 'I giocatori non vedano più questa scena' : '📌 Mostra ai giocatori', fn: () => setPublicScene(on ? null : sc.id) },
    ...(scenes.length > 1 ? ['-', { label: 'Elimina', danger: true, fn: () => byTitle('Elimina') && byTitle('Elimina').click() }] : [])
  ];
}
const sideMenu = () => [
  ...[['chat', '💬 Chat'], ['assets', '🎨 Assets'], ['sheets', '📜 Schede'], ['settings', '⚙️ Impostazioni']].map(([k, l]) => ({ label: 'Vai a ' + l, fn: () => document.querySelector(`.tab[data-tab="${k}"]`).click() })),
  '-', { label: 'Larghezza standard del menu', fn: () => setSideW(SIDE_DEFAULT, true) }, { label: 'Chiudi il menu laterale', fn: () => sideToggle.click() }
];
function contextItems(t, e) {
  let el;
  if ((el = t.closest('.tool'))) return toolMenu(el);
  if ((el = t.closest('.sheetWin'))) return t.closest('.stitle') ? sheetWinMenu(el) : [{ label: 'Riduci a barra', fn: () => el.classList.add('min') }, { label: 'Chiudi la scheda', fn: () => closeWin(el) }];
  if ((el = t.closest('.sheetItem'))) return sheetItemMenu(el.dataset.id);
  if ((el = t.closest('.photo'))) { if (!selection.includes(el)) select(el); return tokenMenu(el); }
  if ((el = t.closest('.msg'))) return msgMenu(el);
  if ((el = t.closest('.asset'))) return assetMenu(el._asset);
  if ((el = t.closest('.chip'))) return folderMenu(el.dataset.folder);
  if ((el = t.closest('.sceneRow'))) return sceneRowMenu(el);
  if (t.closest('#tab-chat')) return chatPaneMenu();
  if (t.closest('#side')) return sideMenu();
  if (t.closest('#sceneBtn, #dock, #sceneMenu')) return [{ label: '＋ Nuova scena…', fn: () => $('sceneNew').click() }, { label: 'Centra tutta la mappa', fn: () => fitView(true) }];
  if (t.closest('#viewport')) return mapMenu(e);
  return null;
}
// Il menu compare solo con un clic del tasto destro: se si tiene premuto per trascinare la vista, niente menu.
const NATIVE = 'input:not([type=checkbox]):not([type=range]), textarea, select, dialog';     // lì resta il menu normale (copia/incolla)
let rc = null;
addEventListener('pointerdown', e => { if (e.button === 2) rc = { x: e.clientX, y: e.clientY, t: e.target, at: performance.now(), moved: false }; }, true);
addEventListener('pointermove', e => { if (rc && Math.hypot(e.clientX - rc.x, e.clientY - rc.y) > 5) rc.moved = true; }, true);
addEventListener('pointerup', e => {
  if (e.button !== 2 || !rc) return;
  const r = rc; rc = null;
  if (r.moved || performance.now() - r.at > 450 || r.t.closest(NATIVE)) return;
  const items = contextItems(r.t, { clientX: r.x, clientY: r.y });
  if (items && items.length) showMenu(r.x, r.y, items); else closeCtx();
}, true);
addEventListener('contextmenu', e => { if (!e.target.closest(NATIVE)) e.preventDefault(); });

// ======================= Copia e incolla (Ctrl/Cmd+C, X, V e dal menu) =======================
let clip = [];
const recOf = p => ({ shape: p._shape && { ...p._shape }, url: p.querySelector('img') && rifImmagine(p.querySelector('img').getAttribute('src'), p.dataset.gid),
  l: num(p, 'left'), t: num(p, 'top'), w: num(p, 'width'), h: num(p, 'height'), data: { ...p.dataset } });
function copySel() { clip = selection.map(recOf); }
function pasteClip(at) {                                          // conserva misure, livello, collegamento alla scheda, forma...
  if (!clip.length) return;
  const minL = Math.min(...clip.map(r => r.l)), minT = Math.min(...clip.map(r => r.t));
  const off = grid.snap ? grid.size : 20 / view.s;
  const ox = at ? at.x - minL : off, oy = at ? at.y - minT : off;
  const made = clip.map(r => {
    const lay = layer === 'map' ? (r.data.layer || 'tokens') : curLay();
    const el = r.shape ? createShape({ ...r.shape }, r.w, r.h, r.l + ox, r.t + oy, lay, true)
      : createPhoto(r.url, r.w, r.h, r.l + ox, r.t + oy, r.data.aid, true, lay);
    for (const k of Object.keys(r.data)) if (k !== 'aid' && k !== 'layer') el.dataset[k] = r.data[k];
    applyLook(el);
    return el;
  });
  setSelection(made); scheduleBoardSave();
}
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if ((k === 'c' || k === 'x') && selection.length) {
    copySel();
    if (k === 'x') { for (const p of selection) p.remove(); setSelection([]); scheduleBoardSave(); }
    e.preventDefault();
  } else if (k === 'v' && clip.length) { pasteClip(lastPtr); e.preventDefault(); }
});

// ======================= Pulsanti in basso contraibili =======================
const dockEl = $('dock');
const dockZone = mk('div', '', '<button type="button" id="dockHandle" aria-label="Mostra o nascondi i pulsanti in basso" title="Pulsanti in basso"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>');
dockZone.id = 'dockZone';
document.body.appendChild(dockZone);
function setDock(open) {
  dockEl.classList.toggle('collapsed', !open); dockZone.classList.toggle('collapsed', !open);
  settings.dockOpen = open;
  if (!open && typeof closeSceneMenu === 'function') closeSceneMenu();
}
$('dockHandle').addEventListener('click', () => { setDock(dockEl.classList.contains('collapsed')); scheduleBoardSave(); });

// ======================= Livello nascosto e altre impostazioni =======================
function applyHidden() {
  document.documentElement.style.setProperty('--hidden-op', settings.hiddenLayer.opacity / 100);
  viewport.classList.toggle('hide-hidden', !settings.hiddenLayer.show);
}
function syncExtraForm() {
  $('rulerCenter').checked = !!settings.rulerCenter;
  $('hlShow').checked = settings.hiddenLayer.show; $('hlOp').value = settings.hiddenLayer.opacity; $('hlOpOut').textContent = settings.hiddenLayer.opacity;
  $('chTabRolls').checked = settings.chatTabs.rolls; $('chTabRules').checked = settings.chatTabs.rules;
}
$('rulerCenter').addEventListener('input', e => { settings.rulerCenter = e.target.checked; scheduleBoardSave(); });
$('hlShow').addEventListener('input', e => { settings.hiddenLayer.show = e.target.checked; applyHidden(); scheduleBoardSave(); });
$('hlOp').addEventListener('input', e => { settings.hiddenLayer.opacity = +e.target.value; applyHidden(); syncExtraForm(); scheduleBoardSave(); });
$('chTabRolls').addEventListener('input', e => { settings.chatTabs.rolls = e.target.checked; renderChatTabs(); renderChat(); scheduleBoardSave(); });
$('chTabRules').addEventListener('input', e => { settings.chatTabs.rules = e.target.checked; renderChatTabs(); renderChat(); scheduleBoardSave(); });

// ======================= Chat: schede (tiri / regole) e finestre separate =======================
let chatTab = 'main';
const unread = new Set();
const CH_NAMES = { main: 'Generale', rolls: '🎲 Tiri', rules: '📖 Regole' };
function chatChannel(m) {                                         // in quale scheda finisce un messaggio
  if (m.kind === 'roll' && settings.chatTabs.rolls) return 'rolls';
  if (m.kind === 'rule' && settings.chatTabs.rules) return 'rules';
  return 'main';
}
const chatVisible = m => chatChannel(m) === chatTab;
function chatUnread(m) { unread.add(chatChannel(m)); renderChatTabs(); }
function renderChatTabs() {
  const bar = $('chatTabs'), ids = ['main', ...(settings.chatTabs.rolls ? ['rolls'] : []), ...(settings.chatTabs.rules ? ['rules'] : [])];
  if (!ids.includes(chatTab)) chatTab = 'main';
  bar.hidden = ids.length < 2;
  bar.replaceChildren(...ids.map(id => {
    const b = mk('button', (id === chatTab ? 'active ' : '') + (unread.has(id) ? 'dot' : ''));
    b.type = 'button'; b.textContent = CH_NAMES[id];
    b.addEventListener('click', () => { chatTab = id; unread.delete(id); renderChatTabs(); renderChat.cambio = true; renderChat(); });
    return b;
  }));
}
function renderChat() {
  const giu = chatInFondo(), su = chatLog.scrollTop;
  chatLog.replaceChildren(...chat.filter(chatVisible).map(msgEl));
  if (giu || renderChat.cambio) chatGiu(); else chatLog.scrollTop = su;      // ridisegnata: resta dove stavi leggendo
  renderChat.cambio = false;
}

let channels = [], chanTimer = 0;
const chatWins = new Map();
const saveChans = () => { clearTimeout(chanTimer); chanTimer = setTimeout(() => persist.save('chats', channels), 400); };
async function loadChannels() { const s = await persist.load('chats'); channels = Array.isArray(s) ? s : []; }
function newChannel() {
  const n = prompt('Nome della nuova chat', 'Chat ' + (channels.length + 1));
  if (!n || !n.trim()) return;
  const c = { id: uid(), name: n.trim().slice(0, 40), msgs: [] };
  channels.push(c); saveChans();
  addChat({ kind: 'link', text: c.name, target: c.id });          // il link in chat apre la finestra
  openChatWin(c.id);
}
function openChatWin(id) {
  const c = channels.find(x => x.id === id);
  if (!c) return;
  const old = chatWins.get(id);
  if (old) { if (old._state !== 'open') setWinState(old, 'open'); bringWin(old); return; }
  const w = makeFrame('chat:' + id, 'chatWin');
  w._ic.style.display = 'none'; w._name.textContent = '💬 ' + c.name;
  w._chat = c; w._onClose = () => chatWins.delete(id); chatWins.set(id, w);
  Object.assign(w.style, { width: '340px', height: '380px' });
  w._body.innerHTML = '<div class="clog"></div><textarea rows="1" placeholder="Scrivi…" title="Invio manda il messaggio, Maiusc+Invio va a capo"></textarea>';
  const log = w._body.querySelector('.clog'), ta = w._body.querySelector('textarea');
  w._redraw = () => { log.replaceChildren(...c.msgs.map(msgEl)); log.scrollTop = log.scrollHeight; };
  w._redraw();
  ta.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    c.msgs.push({ id: uid(), kind: 'text', text }); ta.value = ''; w._redraw(); saveChans();
  });
}
function msgMenu(el) {
  const items = [{ label: 'Copia il testo', fn: () => copyText(el.textContent) }];
  const win = el.closest('.chatWin');
  if (win) items.push('-', { label: 'Elimina il messaggio', danger: true, fn: () => { win._chat.msgs = win._chat.msgs.filter(m => m.id !== el.dataset.id); win._redraw(); saveChans(); } });
  else {
    items.push('-', { label: 'Nuova finestra di chat…', fn: newChannel });
    const m = chat.find(x => x.id === el.dataset.id);
    // in partita: i propri messaggi, e tutti per chi conduce
    if (m && (typeof chatPuoCancellare !== 'function' || chatPuoCancellare(m))) items.push({ label: 'Elimina il messaggio', danger: true, fn: () => deleteChat(el.dataset.id) });
  }
  return items;
}
const chatPaneMenu = () => [
  { label: 'Nuova finestra di chat…', fn: newChannel },
  { label: 'Apri una chat', items: channels.length ? channels.map(c => ({ label: c.name, fn: () => openChatWin(c.id) })) : [{ label: 'Nessuna chat creata', off: true }] },
  '-', { label: 'Svuota questa scheda della chat', danger: true, fn: () => {
    if (!confirm('Cancellare tutti i messaggi di questa scheda?')) return;
    chat = chat.filter(m => !chatVisible(m)); persist.save('chat', chat); renderChat();
  } }
];

// ======================= Guida iniziale (una volta per avvio del server) =======================
async function maybeWelcome() {
  let ls = sessionStorage, stamp = '1';                          // senza server: una volta per sessione del browser
  try { const r = await fetch('api/boot'); if (r.ok) { stamp = String((await r.json()).boot); ls = localStorage; } } catch {}
  try { if (ls.getItem('vtt-help') === stamp) return; ls.setItem('vtt-help', stamp); } catch {}
  $('helpDialog').showModal();
}
$('helpOk').addEventListener('click', () => $('helpDialog').close());
$('helpOpen').addEventListener('click', () => $('helpDialog').showModal());

// ======================= Dopo il caricamento dello stato =======================
function afterBoardLoad() {                                      // chiamata da script.js
  if (settings.sheetClose !== 'dot') settings.sheetClose = 'x';  // il pallino e la X non stanno più insieme
  if (!PEN_TOOLS.some(t => t[0] === settings.pen.tool)) settings.pen.tool = 'pen';
  applySheetStyle(); syncSheetForm(); syncExtraForm(); syncPen(); rulerTitle(); applyHidden(); refreshPen();
  for (const t of TOOLS) { const st = settings.tools[t.id]; if (st && st.docked === false && t.docked) floatTool(t, st.x, st.y); }
  setDrawer(settings.drawerOpen !== false); setDock(settings.dockOpen !== false);
  renderSceneUI(); renderChatTabs(); renderChat();
  loadSheets().then(() => { updateTokenBars(); if (typeof parkRestore === 'function') parkRestore(); });
  if (typeof musicRestore === 'function') musicRestore();
  loadChannels(); maybeWelcome();
}
