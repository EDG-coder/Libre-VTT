// ---------- Cartella delle schede nel menu di sinistra ----------
// Uno scomparto dove parcheggiare le finestre aperte: diventano miniature,
// la manopola ne cambia la dimensione e un clic le rimette dov'erano.

const PARK_SIZES = [30, 40, 52, 66, 84];      // lato delle miniature, in px

const folderBox = mk('div', 'tool glass',
  `<button class="tgrip" type="button" aria-label="Cartella delle schede" title="Cartella delle schede: trascinaci dentro le finestre">
     <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
       <path d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2.5h7A1.5 1.5 0 0119 10v7a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 17z"/>
     </svg>
   </button>
   <div class="tbody" inert>
     <div class="tnote" id="parkNote">Trascina qui la barra di una finestra per metterla via.</div>
     <div id="parkGrid" class="parkGrid"></div>
     <label class="trow">Dimensione <input id="parkSize" type="range" min="0" max="4" step="1"> <output id="parkSizeOut"></output></label>
     <div class="trow"><button id="parkOpenAll" type="button">Riapri tutte</button></div>
   </div>`);
folderBox.id = 'folderTool';
document.body.appendChild(folderBox);
const parkGrid = $('parkGrid');

const parked = new Map();                     // finestra -> la sua miniatura nella cartella
settings.park = settings.park || { size: 2, ids: [] };

function parkSizePx() { return PARK_SIZES[clamp(settings.park.size | 0, 0, 4)]; }
function parkApplySize() {
  parkGrid.style.setProperty('--ps', parkSizePx() + 'px');
  $('parkSize').value = settings.park.size;
  $('parkSizeOut').textContent = parkSizePx() + ' px';
}
$('parkSize').addEventListener('input', e => { settings.park.size = +e.target.value; parkApplySize(); scheduleBoardSave(); });

function parkRemember() {
  settings.park.ids = [...parked.keys()].map(w => w._sheet && w._sheet.id).filter(Boolean);
  scheduleBoardSave();
}

function parkChip(w) {
  const chip = mk('button', 'parkChip');
  chip.type = 'button';
  const name = w._sheet ? w._sheet.name : (w._chat ? w._chat.name : 'Finestra');
  chip.title = 'Riapri «' + name + '»';
  const im = new Image();
  im.src = w._sheet ? iconOf(w._sheet) : 'data:image/svg+xml;utf8,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#7c5cff"/><text x="12" y="17" text-anchor="middle" font-size="13" fill="#fff">💬</text></svg>');
  im.alt = ''; im.draggable = false;
  const nm = mk('span', 'parkName'); nm.textContent = name;
  chip.append(im, nm);
  chip.addEventListener('click', () => unpark(w));
  return chip;
}

function park(w) {
  if (!w || parked.has(w)) return;
  w._parkPos = { left: w.style.left, top: w.style.top, state: w._state };
  if (w._state !== 'open') setWinState(w, 'open');
  w.style.display = 'none';
  const chip = parkChip(w);
  parkGrid.appendChild(chip);
  parked.set(w, chip);
  if (w._onCloseExtra !== parkForget) { w._onCloseOld = w._onClose; w._onClose = () => { parkForget(w); if (w._onCloseOld) w._onCloseOld(); }; w._onCloseExtra = parkForget; }
  setDrawer(true);
  refreshParkNote();
  parkRemember();
}
function unpark(w) {
  const chip = parked.get(w);
  if (!chip) return;
  chip.remove(); parked.delete(w);
  w.style.display = '';
  if (w._parkPos) {
    w.style.left = w._parkPos.left; w.style.top = w._parkPos.top;
    if (w._parkPos.state && w._parkPos.state !== 'open') setWinState(w, w._parkPos.state);
  }
  bringWin(w);
  refreshParkNote();
  parkRemember();
}
function parkForget(w) {
  const chip = parked.get(w);
  if (chip) { chip.remove(); parked.delete(w); refreshParkNote(); parkRemember(); }
}
function refreshParkNote() {
  $('parkNote').textContent = parked.size
    ? parked.size + (parked.size === 1 ? ' finestra messa via.' : ' finestre messe via.')
    : 'Trascina qui la barra di una finestra per metterla via.';
}

$('parkOpenAll').addEventListener('click', () => [...parked.keys()].forEach(unpark));

// ---- bersaglio del trascinamento: la cartella si illumina quando ci passi sopra ----
function overFolder(x, y) {
  if (!folderBox.isConnected) return false;
  const r = folderBox.getBoundingClientRect();
  return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
}
function winDragOver(e) {
  const hot = overFolder(e.clientX, e.clientY);
  folderBox.classList.toggle('dropHot', hot);
  if (hot && drawer.classList.contains('closed')) setDrawer(true);
  if (hot && !folderBox.classList.contains('open')) toggleOpen(folderBox, true);
  return hot;
}
function winDragDrop(e, w) {
  folderBox.classList.remove('dropHot');
  if (overFolder(e.clientX, e.clientY)) { park(w); return true; }
  return false;
}

folderBox.querySelector('.tgrip').addEventListener('click', () => toggleOpen(folderBox, !folderBox.classList.contains('open')));
registerTool('folder', folderBox, folderBox.querySelector('.tgrip'), 'Cartella delle schede');

// ---- menu del clic destro sulla cartella ----
function folderToolExtra() {
  return [
    { label: 'Riapri tutte le finestre', off: !parked.size, fn: () => [...parked.keys()].forEach(unpark) },
    { label: 'Miniature più grandi', off: settings.park.size >= 4, fn: () => { settings.park.size++; parkApplySize(); scheduleBoardSave(); } },
    { label: 'Miniature più piccole', off: settings.park.size <= 0, fn: () => { settings.park.size--; parkApplySize(); scheduleBoardSave(); } }
  ];
}

// ---- all'avvio: rimetti via le schede che erano nella cartella ----
function parkRestore() {
  parkApplySize();
  refreshParkNote();
  for (const id of (settings.park.ids || []).slice()) {
    const s = sheets.find(x => x.id === id);
    if (s) park(openSheet(id));
  }
}
