// ---------- Nebbia di guerra ----------
// Una griglia di caselle sopra il rettangolo della mappa: scoperte o coperte.
// Chi conduce la vede come un velo e la dipinge col pennello; per i giocatori è nero pieno,
// e i segnalini che stanno sotto al nero non gli arrivano nemmeno (ci pensa il server).

const FOG_CELL = 25;          // lato di una casella di nebbia, in unità della mappa
const FOG_STEPS = [[50, 'grossa'], [25, 'media'], [12, 'fine'], [6, 'finissima']];
const FOG_VEIL = 0.55;        // quanto si vede attraverso il velo, per chi conduce

const fogCanvas = document.createElement('canvas');
fogCanvas.id = 'fogCanvas';
stage.appendChild(fogCanvas);

/** La nebbia della scena di adesso, creandola se serve. */
function fogOf(make) {
  if (!cur) return null;
  if (!cur.fog && make) {
    const b = boardRect();
    const cols = Math.max(1, Math.ceil(b.w / FOG_CELL)), rows = Math.max(1, Math.ceil(b.h / FOG_CELL));
    cur.fog = { on: true, x: b.x, y: b.y, cell: FOG_CELL, cols, rows, cells: '0'.repeat(cols * rows) };
  }
  return cur.fog || null;
}

const fogIdx = (f, cx, cy) => cy * f.cols + cx;
const fogGet = (f, cx, cy) => f.cells[fogIdx(f, cx, cy)] === '1';
function fogSet(f, cx, cy, on) {
  if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) return false;
  const i = fogIdx(f, cx, cy);
  if ((f.cells[i] === '1') === on) return false;
  f.cells = f.cells.slice(0, i) + (on ? '1' : '0') + f.cells.slice(i + 1);
  return true;
}

// ---------- Disegno ----------
function fogApply() {
  const f = fogOf(false);
  const mine = typeof isMaster !== 'function' || isMaster();
  if (!f || !f.on) { fogCanvas.hidden = true; return; }
  fogCanvas.hidden = false;
  const w = f.cols * f.cell, h = f.rows * f.cell;
  // un pixel del canvas per casella: lo stiriamo con il css, resta leggerissimo
  if (fogCanvas.width !== f.cols || fogCanvas.height !== f.rows) { fogCanvas.width = f.cols; fogCanvas.height = f.rows; }
  Object.assign(fogCanvas.style, { left: f.x + 'px', top: f.y + 'px', width: w + 'px', height: h + 'px' });
  fogCanvas.style.opacity = mine ? FOG_VEIL : 1;
  const ctx = fogCanvas.getContext('2d');
  ctx.clearRect(0, 0, f.cols, f.rows);
  ctx.fillStyle = '#000';
  for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) {
    if (f.cells[fogIdx(f, x, y)] !== '1') ctx.fillRect(x, y, 1, 1);
  }
}

function fogPush() {
  const f = fogOf(false);
  if (typeof NET !== 'undefined' && NET.on && typeof intent === 'function') intent('fog.set', { scene: cur.id, fog: f });
  scheduleBoardSave();
}

// ---------- Il pennello ----------
const fogTool = { on: false, mode: 'reveal', size: 3, shape: 'brush' };   // brush | rect | poly

// Anteprima di quello che stai per scoprire o coprire: disegnata a schermo, non sulla mappa.
const fogDraw = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
fogDraw.id = 'fogDraw';
document.body.appendChild(fogDraw);
const clearDraw = () => fogDraw.replaceChildren();

/** Dalle coordinate della mappa a quelle dello schermo. */
const toScreen = (x, y) => [x * view.s + view.x, y * view.s + view.y];

/** Riempie tutte le caselle il cui centro cade dentro la figura. */
function fogFill(inside) {
  const f = fogOf(true);
  if (!f) return false;
  let changed = false;
  for (let cy = 0; cy < f.rows; cy++) for (let cx = 0; cx < f.cols; cx++) {
    const wx = f.x + (cx + 0.5) * f.cell, wy = f.y + (cy + 0.5) * f.cell;
    if (inside(wx, wy) && fogSet(f, cx, cy, fogTool.mode === 'reveal')) changed = true;
  }
  if (changed) fogApply();
  return changed;
}
const insideRect = (a, b) => (x, y) =>
  x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y);
/** Punto dentro poligono, con il classico conteggio degli attraversamenti. */
const insidePoly = pts => (x, y) => {
  let on = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = [pts[i].x, pts[i].y], [xj, yj] = [pts[j].x, pts[j].y];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) on = !on;
  }
  return on;
};

function fogPaintAt(clientX, clientY) {
  const f = fogOf(true);
  if (!f) return;
  const wx = (clientX - view.x) / view.s, wy = (clientY - view.y) / view.s;
  const cx = Math.floor((wx - f.x) / f.cell), cy = Math.floor((wy - f.y) / f.cell);
  const r = fogTool.size - 1;
  let changed = false;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.hypot(x - cx, y - cy) > r + 0.3) continue;
    if (fogSet(f, x, y, fogTool.mode === 'reveal')) changed = true;
  }
  if (changed) fogApply();
  return changed;
}

let fogDrag = 0, fogDirty = false, fogRect = null, fogPoly = null;
const fogAllowed = () => fogTool.on && (typeof can !== 'function' || can('revealFog'));
const fogWorld = e => ({ x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s });
const fogColor = () => fogTool.mode === 'reveal' ? '#ffd93d' : '#4da6ff';

function drawRectPreview(a, b) {
  const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y);
  fogDraw.innerHTML = `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}"
    fill="${fogColor()}" fill-opacity=".18" stroke="${fogColor()}" stroke-width="2" stroke-dasharray="7 5"/>`;
}
function drawPolyPreview(pts, cursor) {
  const all = cursor ? pts.concat(cursor) : pts;
  const d = all.map(p => toScreen(p.x, p.y).join(',')).join(' ');
  const dots = pts.map((p, i) => {
    const [x, y] = toScreen(p.x, p.y);
    return `<circle cx="${x}" cy="${y}" r="${i === 0 ? 7 : 5}" fill="${i === 0 ? fogColor() : '#fff'}" stroke="#000" stroke-opacity=".6" stroke-width="1.5"/>`;
  }).join('');
  fogDraw.innerHTML =
    `<polygon points="${d}" fill="${fogColor()}" fill-opacity=".16" stroke="${fogColor()}" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>` + dots;
}
function closePoly() {
  if (fogPoly && fogPoly.length >= 3 && fogFill(insidePoly(fogPoly))) fogPush();
  fogPoly = null; clearDraw();
}

viewport.addEventListener('pointerdown', e => {
  if (!fogAllowed() || e.button !== 0) return;
  e.stopImmediatePropagation(); e.preventDefault();

  if (fogTool.shape === 'poly') {
    const p = fogWorld(e);
    if (!fogPoly) { fogPoly = [p]; drawPolyPreview(fogPoly); return; }
    const [fx, fy] = toScreen(fogPoly[0].x, fogPoly[0].y);
    if (fogPoly.length >= 3 && Math.hypot(e.clientX - fx, e.clientY - fy) < 14) { closePoly(); return; }
    fogPoly.push(p); drawPolyPreview(fogPoly);
    return;
  }
  fogDrag = e.pointerId;
  viewport.setPointerCapture(e.pointerId);
  if (fogTool.shape === 'rect') { fogRect = { a: fogWorld(e), b: fogWorld(e) }; drawRectPreview(fogRect.a, fogRect.b); return; }
  fogDirty = fogPaintAt(e.clientX, e.clientY) || fogDirty;
}, true);

viewport.addEventListener('pointermove', e => {
  if (fogPoly) { e.stopImmediatePropagation(); drawPolyPreview(fogPoly, fogWorld(e)); return; }
  if (fogDrag !== e.pointerId) return;
  e.stopImmediatePropagation();
  if (fogRect) { fogRect.b = fogWorld(e); drawRectPreview(fogRect.a, fogRect.b); return; }
  fogDirty = fogPaintAt(e.clientX, e.clientY) || fogDirty;
}, true);

const fogEnd = e => {
  if (fogDrag !== e.pointerId) return;
  fogDrag = 0;
  if (fogRect) {
    const { a, b } = fogRect; fogRect = null; clearDraw();
    if (Math.hypot(b.x - a.x, b.y - a.y) * view.s > 5 && fogFill(insideRect(a, b))) fogPush();
    return;
  }
  if (fogDirty) { fogDirty = false; fogPush(); }
};
viewport.addEventListener('pointerup', fogEnd, true);
viewport.addEventListener('pointercancel', fogEnd, true);
viewport.addEventListener('dblclick', e => { if (fogPoly) { e.stopImmediatePropagation(); closePoly(); } }, true);
addEventListener('keydown', e => {
  if (!fogPoly) return;
  if (e.key === 'Enter') { e.preventDefault(); closePoly(); }
  if (e.key === 'Escape') { e.preventDefault(); fogPoly = null; clearDraw(); }
});

// ---------- Lo strumento nel menu ----------
const fogBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Nebbia di guerra" title="Nebbia di guerra">
     <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
       <path d="M4 15.5h10.5a3 3 0 100-6 4.5 4.5 0 00-8.6-1.3A3.4 3.4 0 004 15.5z"/><path d="M6 19h12"/>
     </svg>
   </button>
   <div class="tbody" inert>
     <label class="trow"><input id="fogOn" type="checkbox"> Nebbia accesa in questa scena</label>
     <div class="trow" id="fogModes">
       <button type="button" data-m="reveal" class="on">☀ Scopri</button>
       <button type="button" data-m="hide">☁ Copri</button>
     </div>
     <div class="trow" id="fogShapes">
       <button type="button" data-s="brush" class="on" title="Dipingi a mano libera">✏️ Pennello</button>
       <button type="button" data-s="rect" title="Trascina per fare un rettangolo">▭ Rettangolo</button>
       <button type="button" data-s="poly" title="Clic per ogni vertice, doppio clic o Invio per chiudere">⬟ Poligono</button>
     </div>
     <label class="trow" id="fogSizeRow">Pennello <input id="fogSize" type="range" min="1" max="12" step="1"> <output id="fogSizeOut"></output></label>
     <p class="tnote" id="fogTip"></p>
     <label class="trow">Finezza <select id="fogRes"></select></label>
     <div class="trow"><button id="fogAll" type="button">Scopri tutto</button><button id="fogNone" type="button">Copri tutto</button></div>
     <div class="trow"><button id="fogFit" type="button" title="Se hai cambiato la mappa, riadatta la nebbia al rettangolo">⤢ Adatta alla mappa</button></div>
     <p class="tnote">Per i giocatori la parte coperta è nera, e i segnalini che ci stanno sotto non gli vengono nemmeno mandati.</p>
   </div>`);
fogBox.id = 'fogBox';
document.body.appendChild(fogBox);

const FOG_TIPS = {
  brush: 'Tieni premuto e dipingi.',
  rect: 'Trascina da un angolo all\'altro.',
  poly: 'Un clic per ogni vertice. Doppio clic, Invio o clic sul primo punto per chiudere; Esc annulla.'
};
function fogSync() {
  const f = fogOf(false);
  $('fogOn').checked = !!(f && f.on);
  $('fogSize').value = fogTool.size;
  $('fogSizeOut').textContent = fogTool.size;
  $('fogModes').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === fogTool.mode));
  $('fogShapes').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === fogTool.shape));
  $('fogSizeRow').hidden = fogTool.shape !== 'brush';
  $('fogRes').value = String(f ? f.cell : FOG_CELL);
  $('fogTip').textContent = FOG_TIPS[fogTool.shape] || '';
  fogBox.classList.toggle('toolOn', fogTool.on);
  viewport.classList.toggle('fog-on', fogTool.on);
  if (!fogTool.on) { fogPoly = null; fogRect = null; clearDraw(); }
}
$('fogOn').addEventListener('input', e => {
  const f = fogOf(true);
  f.on = e.target.checked;
  fogApply(); fogPush(); fogSync();
});
$('fogModes').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  fogTool.mode = b.dataset.m; fogSync();
});
$('fogShapes').addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (!b) return;
  fogTool.shape = b.dataset.s; fogPoly = null; clearDraw(); fogSync();
});
$('fogSize').addEventListener('input', e => { fogTool.size = +e.target.value; fogSync(); });
$('fogAll').addEventListener('click', () => { const f = fogOf(true); f.cells = '1'.repeat(f.cols * f.rows); fogApply(); fogPush(); });

/** Cambia la finezza (o riadatta al rettangolo) tenendo quello che era già scoperto. */
function fogRebuild(cell) {
  const old = fogOf(false);
  const b = boardRect();
  const c = cell || (old ? old.cell : FOG_CELL);
  const cols = Math.max(1, Math.ceil(b.w / c)), rows = Math.max(1, Math.ceil(b.h / c));
  let cells = '0'.repeat(cols * rows);
  if (old && old.cells) {
    const out = new Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const wx = b.x + (x + 0.5) * c, wy = b.y + (y + 0.5) * c;
      const ox = Math.floor((wx - old.x) / old.cell), oy = Math.floor((wy - old.y) / old.cell);
      const inside = ox >= 0 && oy >= 0 && ox < old.cols && oy < old.rows;
      out[y * cols + x] = inside && old.cells[oy * old.cols + ox] === '1' ? '1' : '0';
    }
    cells = out.join('');
  }
  cur.fog = { on: old ? old.on : true, x: b.x, y: b.y, cell: c, cols, rows, cells };
  fogApply(); fogPush(); fogSync();
}
$('fogRes').addEventListener('change', e => fogRebuild(+e.target.value));
$('fogFit').addEventListener('click', () => fogRebuild());
$('fogNone').addEventListener('click', () => { const f = fogOf(true); f.cells = '0'.repeat(f.cols * f.rows); f.on = true; fogApply(); fogPush(); fogSync(); });

fogBox.querySelector('.tgrip').addEventListener('click', () => {
  const open = !fogBox.classList.contains('open');
  toggleOpen(fogBox, open);
  fogTool.on = open;
  if (open && typeof setPen === 'function') setPen(false);
  fogSync();
});
registerTool('fog', fogBox, fogBox.querySelector('.tgrip'), 'Nebbia di guerra');

function fogMenuExtra() {
  return [
    { label: fogTool.shape === 'brush' ? '▭ Passa al rettangolo' : fogTool.shape === 'rect' ? '⬟ Passa al poligono' : '✏️ Passa al pennello',
      fn: () => { fogTool.shape = { brush: 'rect', rect: 'poly', poly: 'brush' }[fogTool.shape]; fogSync(); } },
    { label: fogTool.mode === 'reveal' ? '☁ Passa a «copri»' : '☀ Passa a «scopri»', fn: () => { fogTool.mode = fogTool.mode === 'reveal' ? 'hide' : 'reveal'; fogSync(); } },
    { label: 'Scopri tutta la scena', fn: () => $('fogAll').click() },
    { label: 'Copri tutta la scena', fn: () => $('fogNone').click() }
  ];
}

// Quando cambia la scena, la nebbia è quella della scena nuova.
var showScene = (prev => async function (sc) {
  await prev(sc);
  fogApply(); fogSync();
})(showScene);

$('fogRes').replaceChildren(...FOG_STEPS.map(([v, l]) => new Option(l, v)));
fogSync();
