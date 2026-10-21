// ---------- Schede (personaggi) ----------
// Si appoggia a script.js (stesse variabili globali): addChat, rnd, createPhoto, persist, settings, ecc.
let sheets = [], sheetsReady = false, sheetsTimer = 0;

const scheduleSheets = () => {
  if (!sheetsReady) return;
  clearTimeout(sheetsTimer);
  sheetsTimer = setTimeout(() => { sheetsTimer = 0; persist.save('sheets', sheets); }, 400);
};
addEventListener('pagehide', () => { if (sheetsTimer) { clearTimeout(sheetsTimer); persist.save('sheets', sheets, true); } });

async function loadSheets() {
  const saved = await persist.load('sheets');
  sheets = Array.isArray(saved) ? saved : [];
  sheetsReady = true;
  renderSheetList();
}

// ---------- Tiri rapidi: "2d6+3", "1d20-1", "1d8+1d6+2", "2d20kh1" ----------
// Stessa grammatica del server di gioco (game-server.js): quando si gioca in rete tira lui,
// da soli tira questa. «khN»/«klN» = tieni i N più alti / più bassi (vantaggio, svantaggio, 4d6kh3).
const DTERM = '(?:\\d*d\\d+(?:k[hl]\\d+)?|\\d+)';
const DEXPR_RE = new RegExp('^[+-]?' + DTERM + '(?:[+-]' + DTERM + ')*$');
function parseExpr(str) {
  const s = String(str || '').replace(/\s+/g, '').toLowerCase();
  if (s.length > 80 || !DEXPR_RE.test(s)) return null;
  const rolls = [], drop = []; let mod = 0, sides = 0, mixed = false, count = 0, adv = '';
  for (const tkn of s.match(new RegExp('[+-]?' + DTERM, 'g'))) {
    const neg = tkn[0] === '-', body = tkn.replace(/^[+-]/, '');
    const dm = body.match(/^(\d*)d(\d+)(?:k([hl])(\d+))?$/);
    if (dm) {
      const cnt = parseInt(dm[1] || '1', 10), faces = parseInt(dm[2], 10);
      if (!(cnt >= 1 && cnt <= 100) || !(faces >= 2 && faces <= 1000)) return null;
      if ((count += cnt) > 200) return null;
      if (sides && sides !== faces) mixed = true;
      sides = faces;
      const start = rolls.length, vals = [];
      for (let i = 0; i < cnt; i++) { const v = rnd(faces); vals.push(v); rolls.push((neg ? -1 : 1) * v); }
      if (dm[3]) {
        const k = parseInt(dm[4], 10);
        if (!(k >= 1 && k <= cnt)) return null;
        const hi = dm[3] === 'h';
        const order = vals.map((_, i) => i).sort((a, b) => (hi ? vals[b] - vals[a] : vals[a] - vals[b]) || a - b);
        for (const i of order.slice(k)) drop.push(start + i);
        if (faces === 20 && cnt === 2 && k === 1 && !adv) adv = hi ? 'adv' : 'dis';
      }
    } else {
      const v = parseInt(body, 10);
      if (!(v >= 0 && v <= 10000)) return null;
      mod += (neg ? -1 : 1) * v;
    }
  }
  if (!rolls.length || Math.abs(mod) > 10000) return null;
  const total = rolls.reduce((a, b, i) => drop.includes(i) ? a : a + b, 0) + mod;
  const out = { rolls, mod, sides: mixed ? 0 : sides, total };
  if (drop.length) out.drop = drop.sort((a, b) => a - b);
  if (adv) out.adv = adv;
  return out;
}
/** Tira e scrive in chat. Vantaggio/svantaggio e «segreto» vengono dai pulsanti dei dadi. */
function rollExpr(expr, label) {
  const d = diceApply(expr);
  const r = parseExpr(d.expr);
  if (!r) return false;
  const m = { kind: 'roll', label: label || String(expr).replace(/\s+/g, ''), ...r };
  if (d.secret) m.secret = true;
  addChat(m);
  diceShowLast(m);
  return m;
}
// in chat: /r 2d6+3  (oppure /roll ...)
function chatCommand(text) {
  const m = text.match(/^\/(?:r|roll)\s+(.+)$/i);
  if (!m) return false;
  if (!rollExpr(m[1])) addChat({ kind: 'text', text: 'Tiro non valido: ' + m[1] });
  return true;
}

// ---------- Aspetto delle schede (impostazioni) ----------
const SH_PRESETS = {
  parchment: { bg: '#f2e6c9', fg: '#3b2a14', line: '#c9b385', soft: '#e6d6ad', accent: '#8b1e1e', font: 'serif' },
  dark:      { bg: '#1a1d26', fg: '#e8ecf3', line: '#2e3446', soft: '#242a38', accent: '#7c5cff', font: 'sans' },
  light:     { bg: '#ffffff', fg: '#1b2230', line: '#cbd3e1', soft: '#eef1f6', accent: '#2f6fdc', font: 'sans' },
  night:     { bg: '#0e1a2b', fg: '#d6e4ff', line: '#24405f', soft: '#16293f', accent: '#3ad0ff', font: 'sans' }
};
const SH_FONTS = { serif: 'Georgia, "Times New Roman", serif', sans: 'system-ui, -apple-system, "Segoe UI", sans-serif' };
const onColor = hex => {            // testo chiaro o scuro sopra il colore principale
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#14110a' : '#ffffff';
};
function applySheetStyle() {
  const st = settings.sheetStyle, p = SH_PRESETS[st.preset] || SH_PRESETS.parchment, r = document.documentElement.style;
  const accent = /^#[0-9a-f]{6}$/i.test(st.accent) ? st.accent : p.accent;
  r.setProperty('--sh-bg', p.bg); r.setProperty('--sh-fg', p.fg); r.setProperty('--sh-line', p.line); r.setProperty('--sh-soft', p.soft);
  r.setProperty('--sh-accent', accent); r.setProperty('--sh-on', onColor(accent));
  r.setProperty('--sh-font', SH_FONTS[st.font] || SH_FONTS[p.font]);
  r.setProperty('--sh-scale', (st.scale || 100) / 100);
}
function syncSheetForm() {
  const st = settings.sheetStyle, p = SH_PRESETS[st.preset] || SH_PRESETS.parchment;
  $('shPreset').value = st.preset; $('shFont').value = st.font;
  $('shAccent').value = /^#[0-9a-f]{6}$/i.test(st.accent) ? st.accent : p.accent;
  $('shScale').value = st.scale; $('shScaleOut').textContent = st.scale;
  $('shClose').value = settings.sheetClose; $('unitSel').value = settings.unit;
}
const styleChanged = () => { applySheetStyle(); syncSheetForm(); scheduleBoardSave(); };
$('shPreset').addEventListener('change', e => { const st = settings.sheetStyle; st.preset = e.target.value; st.font = SH_PRESETS[st.preset].font; st.accent = ''; styleChanged(); });
$('shFont').addEventListener('change', e => { settings.sheetStyle.font = e.target.value; styleChanged(); });
$('shAccent').addEventListener('input', e => { settings.sheetStyle.accent = e.target.value; styleChanged(); });
$('shAccentReset').addEventListener('click', () => { settings.sheetStyle.accent = ''; styleChanged(); });
$('shScale').addEventListener('input', e => { settings.sheetStyle.scale = +e.target.value; styleChanged(); });
$('shClose').addEventListener('change', e => { settings.sheetClose = e.target.value === 'dot' ? 'dot' : 'x'; refreshControls(); scheduleBoardSave(); });
$('unitSel').addEventListener('change', e => { settings.unit = e.target.value; scheduleBoardSave(); });

// ---------- Icone ----------
const iconCache = new Map();
function makeIcon(s) {                       // pallino colorato con l'iniziale, se la scheda non ha un'immagine
  const key = s.id + (s.name.trim()[0] || '?');
  if (!iconCache.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), hue = [...s.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
    x.fillStyle = `hsl(${hue} 55% 42%)`; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.font = '700 64px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((s.name.trim()[0] || '?').toUpperCase(), 64, 68);
    iconCache.set(key, c.toDataURL('image/webp', 0.8));
  }
  return iconCache.get(key);
}
const iconOf = s => resolveUrl(s.icon) || makeIcon(s);

function pickAsset(cb) {                     // finestra con le immagini degli assets
  const dlg = $('pickDialog'), pg = $('pickGrid');
  if (!data.items.length) pg.textContent = 'Nessuna immagine negli assets: caricane una nella scheda Assets.';
  else pg.replaceChildren(...data.items.map(a => {
    const b = document.createElement('button'), im = new Image();
    b.type = 'button'; b.title = a.name; im.src = a.url; im.alt = a.name; b.append(im);
    b.addEventListener('click', () => { dlg.close(); cb(a); });
    return b;
  }));
  dlg.showModal();
}
function setSheetIcon(s, a) {
  s.icon = { url: a.url, aid: a.id };
  renderSheetList(); wins.get(s.id) && refreshWinIcon(wins.get(s.id));
  scheduleSheets();
}

// ---------- Nuova scheda ----------
document.body.insertAdjacentHTML('beforeend', `
<dialog id="sheetDialog"><form method="dialog" id="sheetForm">
  <h3>Nuova scheda</h3>
  <label class="field">Nome <input id="sheetNameIn" type="text" maxlength="40" autocomplete="off"></label>
  <fieldset class="types"><legend>Modello</legend>
    <label class="opt"><input type="radio" name="tpl" value="standard" checked> Standard · scheda italiana D&amp;D 5e (3 pagine)</label>
    <label class="opt"><input type="radio" name="tpl" value="dnd5e"> Open · D&amp;D 5ª edizione</label>
    <label class="opt"><input type="radio" name="tpl" value="simple"> Open · Semplice (solo testo)</label>
  </fieldset>
  <div class="dialogBtns"><button type="button" id="sheetImport" class="btn ghost" title="Una scheda salvata prima in un file (anche da un'altra partita)">📂 Importa da un file…</button><span style="flex:1"></span><button type="button" id="sheetCancel" class="btn ghost">Annulla</button><button type="submit" class="btn">Crea</button></div>
</form></dialog>
<dialog id="pickDialog"><h3>Scegli l'icona (il segnalino)</h3><div id="pickGrid"></div>
  <div class="dialogBtns"><button type="button" id="pickCancel" class="btn ghost">Annulla</button></div></dialog>`);

function newSheet(name, tpl) {
  const f = {};
  if (tpl === 'dnd5e' || tpl === 'standard') Object.assign(f, { level: '1', str: '10', dex: '10', con: '10', int: '10', wis: '10', cha: '10', ac: '10', speed: settings.unit === 'm' ? '9 m' : '30 ft' });
  return { id: uid(), name, tpl, icon: null, f };
}
$('sheetNew').addEventListener('click', () => {
  $('sheetNameIn').value = tr('Personaggio') + ' ' + (sheets.length + 1);
  $('sheetDialog').showModal(); $('sheetNameIn').select();
});
$('sheetForm').addEventListener('submit', e => {
  e.preventDefault();
  const s = newSheet($('sheetNameIn').value.trim().slice(0, 40) || tr('Personaggio'), $('sheetForm').elements.tpl.value);
  sheets.push(s); renderSheetList(); scheduleSheets();
  if (typeof onSheetCreated === 'function') onSheetCreated(s);
  $('sheetDialog').close(); openSheet(s.id);
});
$('sheetCancel').addEventListener('click', () => $('sheetDialog').close());
$('pickCancel').addEventListener('click', () => $('pickDialog').close());

// ---------- Elenco ----------
function renderSheetList() {
  const list = $('sheetList');
  if (!sheets.length) { list.innerHTML = '<div class="empty">Nessuna scheda. Creane una con «Nuova scheda».</div>'; return; }
  list.replaceChildren(...sheets.map(s => {
    const d = document.createElement('div'), im = new Image(), nm = document.createElement('span'), sm = document.createElement('small');
    d.className = 'sheetItem'; d.dataset.id = s.id; d.draggable = true; d.title = 'Doppio clic per aprire, trascina sulla mappa per il segnalino';
    im.className = 'sicon'; im.src = iconOf(s); im.alt = ''; im.draggable = false;
    nm.className = 'nm'; nm.textContent = s.name; sm.textContent = { standard: 'Standard', dnd5e: 'Open D&D 5e', simple: 'Open semplice' }[s.tpl] || '';
    d.append(im, nm, sm);
    d.addEventListener('dblclick', () => openSheet(s.id));
    d.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-sheet', s.id); e.dataTransfer.effectAllowed = 'copy'; });
    return d;
  }));
}
function deleteSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (!s || !confirm(`Eliminare la scheda «${s.name}»?`)) return;
  wins.get(id) && closeWin(wins.get(id));
  sheets = sheets.filter(x => x.id !== id);
  world.querySelectorAll('.photo').forEach(p => { if (p.dataset.sheet === id) delete p.dataset.sheet; });
  if (typeof onSheetDeleted === 'function') onSheetDeleted(id);
  renderSheetList(); scheduleSheets(); scheduleBoardSave();
}
function duplicateSheet(id) {
  const s = sheets.find(x => x.id === id); if (!s) return;
  const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.name = (s.name + ' (copia)').slice(0, 40);
  delete c.owner; delete c._access;
  sheets.push(c); renderSheetList(); scheduleSheets();
  if (typeof onSheetCreated === 'function') onSheetCreated(c);
}
const sheetItemMenu = id => [
  { label: '📜 Apri', fn: () => openSheet(id) },
  { label: '🖼 Cambia icona…', fn: () => pickAsset(a => setSheetIcon(sheets.find(x => x.id === id), a)) },
  { label: 'Duplica', fn: () => duplicateSheet(id) },
  '-', { label: 'Elimina', danger: true, fn: () => deleteSheet(id) }
];

// ---------- Segnalini collegati ----------
function tokenFromSheet(s, wx, wy) {
  if (!s) return;
  if (layer === 'map') setLayer('tokens');
  const fit = grid.show && grid.fitToken, size = fit ? grid.size : 60;
  let l = wx - size / 2, t = wy - size / 2;
  if (fit && grid.snap) {
    const b = boardRect();
    l = b.x + Math.floor((wx - b.x) / grid.size) * grid.size + (grid.size - size) / 2;
    t = b.y + Math.floor((wy - b.y) / grid.size) * grid.size + (grid.size - size) / 2;
  } else { const p = snapPoint(l, t); l = p.x; t = p.y; }
  const el = createPhoto(iconOf(s), size, size, l, t, s.icon && s.icon.aid, false, layer === 'hidden' ? 'hidden' : 'tokens');
  el.dataset.sheet = s.id; el.dataset.name = s.name;
  updateTokenBars(); scheduleBoardSave();
}
viewport.addEventListener('dragover', e => {
  if (e.dataTransfer.types.includes('application/x-sheet')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
});
viewport.addEventListener('drop', e => {
  const id = e.dataTransfer.getData('application/x-sheet');
  if (!id) return;
  e.preventDefault();
  tokenFromSheet(sheets.find(s => s.id === id), (e.clientX - view.x) / view.s, (e.clientY - view.y) / view.s);
});
viewport.addEventListener('dblclick', e => {
  const p = e.target.closest('.photo');
  if (p && p.dataset.sheet && layer === 'tokens') openSheet(p.dataset.sheet);
});
function linkToken(el, id) {
  el.dataset.sheet = id;
  const s = sheets.find(x => x.id === id);
  if (s) el.dataset.name = s.name;
  if (s && !s.icon) {                          // la scheda prende come icona l'immagine di questo segnalino
    s.icon = { url: el.querySelector('img').getAttribute('src'), aid: el.dataset.aid === undefined ? undefined : +el.dataset.aid };
    renderSheetList(); scheduleSheets();
  }
  updateTokenBars(); scheduleBoardSave();
}
function moveLayer(list, lay) {
  for (const p of list) p.dataset.layer = lay;
  setSelection([]); scheduleBoardSave();
}
function tokenMenu(el) {
  const s = el.dataset.sheet && sheets.find(x => x.id === el.dataset.sheet);
  const group = selection.length > 1 && selection.includes(el) ? selection : [el], many = group.length > 1;
  const lay = el.dataset.layer || 'tokens';
  const pickSheet = fn => sheets.length ? sheets.map(x => ({ label: x.name, fn: () => fn(x) })) : [{ label: 'Nessuna scheda: creane una', off: true }];
  const items = [];
  if (!el._shape) {
    items.push(s ? { label: `📜 Apri la scheda «${s.name}»`, fn: () => openSheet(s.id) }
      : { label: '📜 Apri una scheda…', items: pickSheet(x => { linkToken(el, x.id); openSheet(x.id); }) });
    items.push({ label: '🔗 Collega a una scheda', items: pickSheet(x => linkToken(el, x.id)) });
    items.push({ label: '✂ Ritaglia la sagoma…', fn: () => cropExistingToken(el) });
    if (s) items.push({ label: 'Scollega dalla scheda', fn: () => { delete el.dataset.sheet; scheduleBoardSave(); } });
    items.push('-');
  } else if (el._shape.t === 'text') items.push({ label: '✎ Modifica il testo', fn: () => editText(el) }, '-');
  items.push(
    { label: many ? `Copia (${group.length})` : 'Copia', fn: () => copySel() },
    { label: many ? `Duplica (${group.length})` : 'Duplica', fn: () => setSelection(group.map(p => duplicatePhoto(p))) },
    { label: 'Porta in primo piano', fn: () => { for (const p of group) if (p.dataset.layer !== 'map') p.style.zIndex = ++zTop; scheduleBoardSave(); } },
    { label: 'Cambia livello', items: [
      { label: (lay === 'tokens' ? '✓ ' : '') + 'Segnalini', fn: () => moveLayer(group, 'tokens') },
      { label: (lay === 'hidden' ? '✓ ' : '') + 'Nascosto', fn: () => moveLayer(group, 'hidden') }
    ] },
    ...(typeof turniVoceMenu === 'function' ? turniVoceMenu(group) : []),
    '-', { label: many ? `Elimina i ${group.length} oggetti` : 'Elimina', danger: true, fn: () => { for (const p of group) p.remove(); setSelection([]); scheduleBoardSave(); } }
  );
  return items;
}

// ---------- Finestre (schede e chat) ----------
// Tre stati: aperta, barra (solo il titolo, piccola) e icona (solo il segnalino, trascinabile nel menu a sinistra).
const wins = new Map();          // schede aperte
const allWins = new Set();       // tutte le finestre
let winZ = 150000;
const bringWin = w => { w.style.zIndex = ++winZ; };
function closeWin(w) {
  if (w._tool && w._tool.slot) w._tool.slot.remove();      // la casella temporanea del menu sparisce
  w.remove(); allWins.delete(w); wins.delete(w.dataset.id);
  if (w._onClose) w._onClose();
}
function refreshWinIcon(w) { w._ic.src = iconOf(w._sheet); }
function winControls(w) {                                  // pallino rosso a sinistra OPPURE X a destra, mai insieme
  const dot = settings.sheetClose === 'dot';
  const b = document.createElement('button');
  b.type = 'button'; b.className = dot ? 'sdot' : 'sx'; b.textContent = dot ? '' : '✕'; b.title = 'Chiudi'; b.setAttribute('aria-label', 'Chiudi');
  b.addEventListener('click', () => closeWin(w));
  w._left.replaceChildren(...(dot ? [b] : []));
  w._right.replaceChildren(...(dot ? [] : [b]));
}
const refreshControls = () => allWins.forEach(winControls);

function setWinState(w, st) {
  if (st === w._state) return;
  if (st !== 'icon' && w._tool && w._tool.slot && w.parentElement === w._tool.slot) {   // era nel menu a sinistra: la tolgo
    const r = w.getBoundingClientRect(); floatTool(w._tool, r.left + 80, r.top);
  }
  if (w._state === 'open') w._full = { w: w.style.width, h: w.style.height };
  if (w._state === 'min') w._barW = w.style.width;
  w.classList.remove('min', 'icon');
  w._state = st;
  if (st === 'open') { w.style.width = w._full ? w._full.w : ''; w.style.height = w._full ? w._full.h : ''; }
  else if (st === 'min') { w.classList.add('min'); w.style.width = w._barW || ''; w.style.height = ''; }
  else { w.classList.add('icon'); w.style.width = w.style.height = ''; }
}
const toggleMin = w => setWinState(w, w._state === 'open' ? 'min' : 'open');

function makeFrame(id, cls) {
  const w = document.createElement('div'), n = allWins.size;
  w.className = 'sheetWin ' + (cls || ''); w.dataset.id = id;
  Object.assign(w.style, {
    left: Math.max(8, Math.min(innerWidth - 340, 90 + n * 28)) + 'px', top: 70 + n * 28 + 'px',
    width: Math.min(640, innerWidth - 20) + 'px', height: Math.min(560, innerHeight - 90) + 'px'
  });
  const mkEl = (tag, c) => { const e = document.createElement(tag); e.className = c; return e; };
  const bar = mkEl('div', 'stitle'), left = mkEl('span', 'sdotSlot'), right = mkEl('span', 'sxSlot'), nm = mkEl('span', 'sname'), ic = new Image(), body = mkEl('div', 'sbody');
  ic.className = 'sicon'; ic.alt = ''; ic.draggable = false;
  bar.append(left, ic, nm, right); w.append(bar, body);
  Object.assign(w, { _left: left, _right: right, _ic: ic, _name: nm, _body: body, _state: 'open' });
  document.body.appendChild(w); allWins.add(w); bringWin(w); winControls(w);
  w.addEventListener('pointerdown', () => bringWin(w), true);
  w.addEventListener('dblclick', e => {                    // doppio clic su una zona vuota o sulla barra: riduci / ripristina
    if (e.target.closest('input, textarea, select, button, label, .rb, .chipRoll')) return;
    toggleMin(w);
  });
  bar.addEventListener('pointerdown', e => {               // la barra sposta la finestra (in forma d'icona la porta nel menu)
    if (e.button !== 0 || e.target.closest('button')) return;
    if (w._state === 'icon') { if (w._sheet) startToolDrag(e, sheetTool(w)); return; }
    e.preventDefault();
    const r = w.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const move = ev => {
      w.style.left = clamp(r.left + ev.clientX - sx, 80 - w.offsetWidth, innerWidth - 80) + 'px';
      w.style.top = clamp(r.top + ev.clientY - sy, 0, innerHeight - 40) + 'px';
      if (typeof winDragOver === 'function') winDragOver(ev);          // la cartella delle schede si illumina
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (ev && typeof winDragDrop === 'function') winDragDrop(ev, w);  // rilasciata sulla cartella: la mette via
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  if (typeof ResizeObserver === 'function') {              // barra rimpicciolita al massimo: diventa un'icona
    new ResizeObserver(() => { if (w._state === 'min' && w._sheet && w.offsetWidth < 96) setWinState(w, 'icon'); }).observe(w);
  }
  return w;
}
const sheetWinMenu = w => {
  const st = w._state;
  return [
    st === 'open' ? { label: 'Riduci a barra', fn: () => setWinState(w, 'min') } : { label: 'Ripristina', fn: () => setWinState(w, 'open') },
    ...(w._sheet && st !== 'icon' ? [{ label: 'Riduci a icona', fn: () => setWinState(w, 'icon') }] : []),
    ...(w._sheet ? [{ label: '🖼 Cambia icona…', fn: () => pickAsset(a => setSheetIcon(w._sheet, a)) }] : []),
    ...(w._sheet && w._sheet.tpl !== 'simple' ? [{ label: (vistaScheda.get(w._sheet.id) || w._sheet.tpl) === 'standard' ? '📋 Vedi come scheda Open' : '📜 Vedi come scheda Standard', fn: () => cambiaVista(w) }] : []),
    ...(w._sheet && typeof vociFileScheda === 'function' ? vociFileScheda(w) : []),
    '-', { label: 'Chiudi', fn: () => closeWin(w) }
  ];
};

function openSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (!s) return;
  const old = wins.get(id);
  if (old) { if (old._state !== 'open') setWinState(old, 'open'); bringWin(old); return old; }
  const w = makeFrame(id, '');
  w._sheet = s; wins.set(id, w);
  w._name.textContent = s.name;
  refreshWinIcon(w);
  w._ic.addEventListener('click', () => { if (w._state !== 'icon') pickAsset(a => setSheetIcon(s, a)); });
  const tpl = vistaScheda.get(id) || s.tpl;       // si può guardare la stessa scheda nell'altro formato
  const std = tpl === 'standard';
  if (std) {
    stdMigrate(s);
    w.classList.add('stdWin');
    Object.assign(w.style, { width: Math.min(880, innerWidth - 20) + 'px', height: Math.min(900, innerHeight - 80) + 'px' });
  }
  const body = w._body;
  body.innerHTML = (std ? '' : '<div class="box nameBox"><label class="lab">Nome del personaggio<input type="text" data-name maxlength="40"></label></div>') +
    (std ? standardHtml() : tpl === 'dnd5e' ? dndHtml() : simpleHtml());
  const ni = body.querySelector('[data-name]');
  if (ni) {
    ni.value = s.name;
    ni.addEventListener('input', () => { s.name = ni.value; w._name.textContent = s.name; renderSheetList(); scheduleSheets(); });
  }
  bindSheet(body, s);
  if (std) stdSetup(w, body, s);
  if (tpl === 'dnd5e') openSetup(w, body, s);
  return w;
}
// Standard e Open D&D 5e usano gli stessi campi: la stessa scheda si può vedere nei due formati.
// La scelta vale per questo dispositivo e finché il programma resta aperto.
const vistaScheda = new Map();
function cambiaVista(w) {
  const s = w._sheet, ora = vistaScheda.get(s.id) || s.tpl;
  vistaScheda.set(s.id, ora === 'standard' ? 'dnd5e' : 'standard');
  const r = w.getBoundingClientRect();
  closeWin(w);
  const n = openSheet(s.id);
  if (n) { n.style.left = r.left + 'px'; n.style.top = r.top + 'px'; }
}

// ---------- Contenuto: calcoli e tiri ----------
const ABIL = [['str', 'FOR', 'Forza'], ['dex', 'DES', 'Destrezza'], ['con', 'COS', 'Costituzione'], ['int', 'INT', 'Intelligenza'], ['wis', 'SAG', 'Saggezza'], ['cha', 'CAR', 'Carisma']];
const SKILLS = [
  ['acro', 'Acrobazia', 'dex'], ['anim', 'Addestrare animali', 'wis'], ['arca', 'Arcano', 'int'], ['athl', 'Atletica', 'str'],
  ['dece', 'Inganno', 'cha'], ['hist', 'Storia', 'int'], ['insi', 'Intuizione', 'wis'], ['inti', 'Intimidire', 'cha'],
  ['inve', 'Indagare', 'int'], ['medi', 'Medicina', 'wis'], ['natu', 'Natura', 'int'], ['perception', 'Percezione', 'wis'],
  ['perf', 'Intrattenere', 'cha'], ['pers', 'Persuasione', 'cha'], ['reli', 'Religione', 'int'], ['slei', 'Rapidità di mano', 'dex'],
  ['stea', 'Furtività', 'dex'], ['surv', 'Sopravvivenza', 'wis']
];
const iv = v => parseInt(v, 10) || 0;
const sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);        // per mostrarlo
const sgnE = n => (n >= 0 ? '+' : '') + n;                  // per l'espressione del tiro
const abMod = (s, a) => Math.floor((iv(s.f[a]) - 10) / 2);
const profB = s => (s.f.profb !== undefined && s.f.profb !== '') ? iv(s.f.profb) : 2 + Math.floor((Math.max(1, iv(s.f.level)) - 1) / 4);
const skillB = (s, k) => abMod(s, SKILLS.find(x => x[0] === k)[2]) + (s.f['kp_' + k] ? profB(s) : 0);
const abilName = a => ABIL.find(x => x[0] === a)[2];
function calcValue(s, key) {
  const [t, a] = key.split(':');
  if (t === 'mod') return abMod(s, a);
  if (t === 'save') return abMod(s, a) + (s.f['sp_' + a] ? profB(s) : 0);
  if (t === 'skill') return skillB(s, a);
  if (t === 'prof') return profB(s);
  if (t === 'init') return abMod(s, 'dex') + iv(s.f.initb);
  if (t === 'pp') return 10 + skillB(s, 'perception');
  if (t === 'wsum') return +Object.keys(s.f).filter(k => /^iv\d+w$/.test(k)).reduce((a, k) => a + (parseFloat(String(s.f[k]).replace(',', '.')) || 0), 0).toFixed(2);
  if (t === 'wmax') return +(iv(s.f.str) * 7.5).toFixed(1);
  return 0;
}
function recalc(root, s) {
  root.querySelectorAll('[data-c]').forEach(o => { const v = calcValue(s, o.dataset.c); o.textContent = ['pp', 'wsum', 'wmax'].includes(o.dataset.c) ? v : sgn(v); });
  // la percezione passiva dice da dove viene il numero (per confrontarlo con altre schede)
  const sag = abMod(s, 'wis'), comp = s.f.ke_perception ? profB(s) * 2 : s.f.kp_perception ? profB(s) : 0;
  const perche = `10 + Saggezza (${sgn(sag)})` + (comp ? ` + ${s.f.ke_perception ? 'maestria' : 'competenza'} in Percezione (${sgn(comp)})` : ' — senza competenza in Percezione: spunta la casella di Percezione se il personaggio ce l\'ha');
  root.querySelectorAll('[data-c="pp"]').forEach(o => { o.title = perche; });
}
function doRoll(s, key) {
  const [t, a] = key.split(':');
  let expr, label;
  if (t === 'spatk') { expr = '1d20' + sgnE(iv(s.f.spatk)); label = `${s.name} · Attacco con incantesimo`; }
  else if (t === 'atk') { expr = '1d20' + sgnE(iv(s.f['ab' + a])); label = `${s.name} · ${s.f['an' + a] || 'Attacco'}`; }
  else if (t === 'dmg') { expr = s.f['ad' + a] || ''; label = `${s.name} · Danni ${s.f['an' + a] || ''}`.trim(); }
  else {
    expr = '1d20' + sgnE(calcValue(s, key));
    const nm = t === 'mod' ? 'Prova di ' + abilName(a) : t === 'save' ? 'Tiro salvezza ' + abilName(a) : t === 'skill' ? SKILLS.find(x => x[0] === a)[1] : 'Iniziativa';
    label = `${s.name} · ${nm}`;
  }
  if (!rollExpr(expr, label)) addChat({ kind: 'text', text: `${s.name}: tiro non valido («${expr}»)` });
}
// sotto ogni area di testo: un pulsante per ogni [[espressione | nome]] scritta dentro
function chipsFor(ta, s) {
  let box = ta.nextElementSibling;
  if (!box || !box.classList.contains('chips')) { box = document.createElement('div'); box.className = 'chips'; ta.after(box); }
  const out = [];
  for (const m of ta.value.matchAll(/\[\[\s*([^\]|]+?)\s*(?:\|\s*([^\]]+?)\s*)?\]\]/g)) {
    const b = document.createElement('button'), expr = m[1], name = m[2] || m[1];
    b.type = 'button'; b.className = 'chipRoll'; b.textContent = '🎲 ' + name; b.title = expr;
    b.addEventListener('click', () => { if (!rollExpr(expr, `${s.name} · ${name}`)) addChat({ kind: 'text', text: `${s.name}: tiro non valido («${expr}»)` }); });
    out.push(b);
  }
  box.replaceChildren(...out);
}
/** Collega un campo (data-f) al valore della scheda: lo mostra e lo salva quando cambia. */
// Le sei caratteristiche stanno tra 1 e 30 (si può togliere il limite nelle impostazioni).
const CARATTERISTICHE = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
function limitaCaratteristica(el) {
  if (settings.caratLibere || el.value === '') return;
  const v = parseInt(el.value, 10);
  if (!Number.isFinite(v)) { el.value = ''; return; }
  const c = Math.max(1, Math.min(30, v));
  if (String(c) !== el.value) el.value = String(c);
}
function bindField(el, root, s) {
  const k = el.dataset.f;
  if (el.type === 'checkbox') el.checked = !!s.f[k]; else el.value = s.f[k] ?? '';
  if (CARATTERISTICHE.has(k) && el.type === 'number') {
    if (!settings.caratLibere) { el.min = 1; el.max = 30; }
    el.step = 1;
  }
  el.addEventListener('input', () => {
    if (CARATTERISTICHE.has(k)) limitaCaratteristica(el);
    s.f[k] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    recalc(root, s);
    if (el.tagName === 'TEXTAREA') chipsFor(el, s);
    if (k === 'hp' || k === 'hpmax') updateTokenBars();
    scheduleSheets();
  });
  if (el.tagName === 'TEXTAREA') chipsFor(el, s);
}
function bindSheet(root, s) {
  root.querySelectorAll('[data-f]').forEach(el => bindField(el, root, s));
  root.addEventListener('click', e => {
    const sr = e.target.closest('.sendRule');          // trascrive il testo (regole, privilegi...) in chat
    if (sr) {
      const txt = (s.f[sr.dataset.send] || '').trim();
      if (txt) addChat({ kind: 'rule', title: `${s.name} · ${sr.parentElement.firstChild.textContent.trim()}`, text: txt });
      return;
    }
    const pg = e.target.closest('.stabs button');                     // pagine della scheda Standard
    if (pg) {
      root.querySelectorAll('.stabs button').forEach(b => b.classList.toggle('on', b === pg));
      root.querySelectorAll('.spage').forEach(p => { p.hidden = p.dataset.pg !== pg.dataset.pg; });
      return;
    }
    const b = e.target.closest('[data-r]'); if (b) doRoll(s, b.dataset.r);
  });
  recalc(root, s);
}

// ---------- Modelli ----------
const fld = (label, k, type = 'text') => `<label class="lab">${label}<input type="${type}" data-f="${k}"></label>`;
const area = (label, k, ph = '') => `<div class="box"><h5>${label}<button type="button" class="sendRule" data-send="${k}" title="Invia questo testo in chat">💬</button></h5><textarea data-f="${k}" placeholder="${ph}"></textarea></div>`;
// dndHtml(): il modello «Open D&D 5e» sta in sheet-open.js
const simpleHtml = () => `<div class="sgrid">
  ${area('Descrizione', 'desc')}
  ${area('Tiri rapidi', 'quick', 'Scrivi [[1d20+5 | Attacco]] o [[2d6+3 | Danni]]: sotto compare un pulsante per tirare')}
  <div class="box full"><h5>Appunti</h5><textarea data-f="notes" style="min-height:160px"></textarea></div>
</div>`;

// ---------- Modello Standard: la scheda italiana D&D 5e (3 pagine) ----------
const STD_SKILLS = ['acro', 'anim', 'arca', 'athl', 'stea', 'inve', 'dece', 'inti', 'perf', 'insi', 'medi', 'natu', 'perception', 'pers', 'slei', 'reli', 'surv', 'hist'];
const ck = (k, title) => `<input type="checkbox" data-f="${k}" title="${title || ''}">`;
const rows = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
function standardHtml() {
  const abil = ABIL.map(([k, , nm]) => `<div class="ab"><b>${nm.toUpperCase()}</b><input type="number" data-f="${k}" aria-label="Punteggio di ${nm}"><button type="button" class="rb" data-r="mod:${k}" data-c="mod:${k}" title="Prova di ${nm}"></button></div>`).join('');
  const saves = ABIL.map(([k, , nm]) => `<div class="rl2">${ck('sp_' + k, 'Competenza')}<button type="button" class="rb" data-r="save:${k}" data-c="save:${k}"></button><span>${nm}</span></div>`).join('');
  const skills = STD_SKILLS.map(k => { const [, nm, a] = SKILLS.find(x => x[0] === k), sh = ABIL.find(x => x[0] === a)[1]; return `<div class="rl2">${ck('kp_' + k, 'Competenza')}<button type="button" class="rb" data-r="skill:${k}" data-c="skill:${k}"></button><span>${nm} <small>(${sh[0] + sh.slice(1).toLowerCase()})</small></span></div>`; }).join('');
  const lim = rows(6, i => `<div class="lf"><input type="text" data-f="lf${i}n" placeholder="Nome"><span class="rest">${ck('lf' + i + 'b', 'Riposo breve')}${ck('lf' + i + 'l', 'Riposo lungo')}${ck('lf' + i + 'a', 'Alba')}</span><input type="number" data-f="lf${i}t" placeholder="Tot"><input type="number" data-f="lf${i}u" placeholder="Usi"></div>`);
  const atk = rows(8, i => `<div class="atk"><input type="text" data-f="an${i}" placeholder="Arma"><input type="number" data-f="ab${i}" placeholder="Bonus att."><input type="text" data-f="ad${i}" placeholder="Danni / tipo (1d8+3)"><div class="bt"><button type="button" class="rb" data-r="atk:${i}">Colpire</button><button type="button" class="rb" data-r="dmg:${i}">Danni</button></div></div>`);
  const spl = rows(9, i => `<div class="box"><h5>Livello ${i + 1}<button type="button" class="sendRule" data-send="sp${i + 1}" title="Invia in chat">💬</button></h5>
      <div class="row2">${fld('Slot totali', 'sl' + (i + 1) + 't', 'number')}${fld('Slot spesi', 'sl' + (i + 1) + 'u', 'number')}</div><textarea data-f="sp${i + 1}" placeholder="Es. Palla di fuoco [[8d6 | Danni]]"></textarea></div>`);
  const inv = Array.from({ length: 20 }, (_, i) => `<div class="iv"><input type="text" data-f="iv${i}n" placeholder="Oggetto"><input type="text" inputmode="decimal" data-f="iv${i}w" placeholder="kg"></div>`);
  return `<div class="stabs"><button type="button" class="on" data-pg="1">Scheda</button><button type="button" data-pg="2">Personaggio</button><button type="button" data-pg="3">Incantesimi</button></div>
  <div class="spage" data-pg="1"><div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Classe', 'class')}${fld('Livello', 'level', 'number')}${fld('Nome giocatore', 'player')}${fld('Razza', 'race')}${fld('Background', 'bg')}${fld('Allineamento / sesso', 'align')}</div></div>
    <div class="box"><h5>Caratteristiche</h5><div class="abil">${abil}</div>
      <div class="hdr" style="margin-top:8px"><label class="rl2">${ck('insp')}<span>Ispirazione</span></label>
        <div class="stat"><span class="lab">Bonus di competenza</span><output data-c="prof"></output></div>${fld('Competenza (manuale)', 'profb', 'number')}</div></div>
    <div class="box"><h5>Tiri salvezza</h5>${saves}</div>
    <div class="box"><h5>Abilità</h5>${skills}<div class="stat" style="margin-top:6px"><span class="lab">Saggezza (Percezione) passiva</span><output data-c="pp"></output></div></div>
    <div class="box"><h5>Combattimento</h5>
      <div class="hdr">${fld('CA', 'ac', 'number')}${fld('CA temporanea', 'actemp', 'number')}<div class="stat"><span class="lab">Iniziativa</span><button type="button" class="rb" data-r="init" data-c="init"></button></div></div>
      <div class="hp" style="margin-top:8px">${fld('PF max', 'hpmax', 'number')}${fld('PF attuali', 'hp', 'number')}${fld('PF temporanei', 'hpt', 'number')}</div>
      <div class="hdr" style="margin-top:8px">${fld('Affaticamento', 'fatigue')}${fld('Visione', 'vision')}${fld('Velocità', 'speed')}<label class="rl2">${ck('darkv')}<span>Scurovisione</span></label></div>
      <div class="hp" style="margin-top:8px">${fld('Dadi vita (DV)', 'hd')}${fld('Totali', 'hdt', 'number')}${fld('Usati', 'hdu', 'number')}</div>
      <div class="ds"><span>Successi</span>${ck('ds1')}${ck('ds2')}${ck('ds3')}<span>Fallimenti</span>${ck('df1')}${ck('df2')}${ck('df3')}<small>TS contro morte</small></div></div>
    <div class="box"><h5>Livello di follia</h5><div class="row2">${fld('Livello', 'madness')}${fld('CD prova abilità', 'madcd', 'number')}</div></div>
    <div class="box full"><h5>Privilegi &amp; tratti limitati <small>(rb breve · rl lungo · al alba)</small></h5>${lim}</div>
    <div class="box">${'<h5>Tratti razziali &amp; privilegi da background<button type="button" class="sendRule" data-send="racial" title="Invia in chat">💬</button></h5><textarea data-f="racial"></textarea>'}</div>
    <div class="box full"><h5>Attacchi &amp; incantesimi</h5>${atk}
      <div class="hdr" style="margin-top:6px">${fld('CD TS incantesimi', 'spcd', 'number')}<div class="stat"><span class="lab">Bonus att. incantesimi</span><input type="number" data-f="spatk"><button type="button" class="rb" data-r="spatk">Tira</button></div></div>
      <h5 style="margin-top:8px">Munizioni</h5>${rows(3, i => `<div class="am"><input type="text" data-f="am${i}n" placeholder="Munizione"><input type="number" data-f="am${i}q" placeholder="Q.tà"></div>`)}</div>
    <div class="box full"><h5>Armatura</h5><div class="hdr">${fld('Armatura', 'ar_name')}${fld('CA', 'ar_ca', 'number')}${fld('Des max', 'ar_dexmax')}${fld('For', 'ar_for')}${fld('Scudo', 'ar_shield')}<label class="rl2">${ck('ar_dis')}<span>Svantaggio furtività</span></label></div></div>
    <div class="box"><h5>Consumabili</h5>${rows(5, i => `<div class="am"><input type="text" data-f="cn${i}n" placeholder="Consumabile"><input type="number" data-f="cn${i}u" placeholder="Nr. usi"></div>`)}
      <h5 style="margin-top:8px">Monete</h5><div class="coins">${[['mr', 'MR'], ['ma', 'MA'], ['me', 'ME'], ['mo', 'MO'], ['mp', 'MP']].map(([k, l]) => fld(l, k, 'number')).join('')}</div></div>
    <div class="box"><h5>Oggetti magici armonizzati <small>(max 3)</small></h5>${rows(3, i => `<input type="text" data-f="mi${i}" style="margin-bottom:4px">`)}</div>
    <div class="box"><h5>Competenze</h5>
      <div class="rl2"><span>Armature:</span>${ck('pa_l')} leggere ${ck('pa_m')} medie ${ck('pa_p')} pesanti ${ck('pa_s')} scudi</div>
      <div class="rl2"><span>Armi:</span>${ck('pw_s')} semplici ${ck('pw_g')} da guerra ${ck('pw_a')} altro</div>
      <textarea data-f="prof_text" placeholder="Altre competenze e strumenti"></textarea></div>
    ${area('Linguaggi', 'langs')}${area('Talenti', 'feats')}${area('Equipaggiamento', 'equip')}${area('Privilegi di classe', 'classf', 'Es. Ira [[1d12 | Dado ira]]')}
  </div></div>
  <div class="spage" data-pg="2" hidden><div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Età', 'age')}${fld('Altezza', 'height')}${fld('Peso', 'weight')}${fld('Occhi', 'eyes')}${fld('Carnagione', 'skin')}${fld('Capelli', 'hair')}</div></div>
    ${area('Aspetto del personaggio', 'look')}
    <div class="box"><h5>Fazione</h5>${fld('Nome', 'faction')}<textarea data-f="symbol" placeholder="Simbolo"></textarea></div>
    ${area('Tratti caratteriali', 'traits')}${area('Ideali', 'ideals')}${area('Legami', 'bonds')}${area('Difetti', 'flaws')}${area('Nemici', 'enemies')}${area('Tratti &amp; privilegi aggiuntivi', 'extra')}
    <div class="box full"><h5>Inventario</h5><div class="invgrid"><div>${inv.slice(0, 10).join('')}</div><div>${inv.slice(10).join('')}</div></div>
      <div class="hdr" style="margin-top:8px"><div class="stat"><span class="lab">Peso trasportato (kg)</span><output data-c="wsum"></output></div><div class="stat"><span class="lab">Peso massimo trasportabile (kg)</span><output data-c="wmax"></output></div></div></div>
  </div></div>
  <div class="spage" data-pg="3" hidden><div class="sgrid">
    <div class="box full"><div class="hdr">${fld('Classe da incantatore', 'sc_class')}${fld('Caratteristica', 'sc_ab')}${fld('Bonus attacco', 'spatk', 'number')}${fld('CD tiro salvezza', 'spcd', 'number')}</div></div>
    ${area('Trucchetti', 'cantrips', 'Es. Dardo di fuoco [[1d10 | Danni]]')}${area('Incantesimi conosciuti', 'known')}${spl}
  </div></div>`;
}

// ---------- Integrazione scheda ↔ segnalino (in lavorazione): barra dei PF ----------
function updateTokenBars() {
  world.querySelectorAll('.photo[data-sheet]').forEach(p => {
    const sh = sheets.find(x => x.id === p.dataset.sheet), mx = sh ? iv(sh.f.hpmax) : 0;
    if (sh && sh.name) p.dataset.name = sh.name;
    if (mx > 0) { p.dataset.hp = '1'; p.style.setProperty('--hpv', Math.max(0, Math.min(100, Math.round(iv(sh.f.hp) / mx * 100)))); }
    else { delete p.dataset.hp; p.style.removeProperty('--hpv'); }
  });
}
