// ---------- Editor del segnalino: ritaglio della sagoma ----------
// Apre una finestra dove l'immagine si sposta e si ingrandisce sotto una maschera,
// si toglie lo sfondo (bacchetta magica o gomma) e si aggiunge un bordo che segue la sagoma.
// Il risultato è un'immagine con la trasparenza, salvata negli assets e pronta per la mappa.

const TOKEN_FOLDER = 'Segnalini';   // cartella degli assets dove finiscono i segnalini ritagliati
const CROP_MAX = 1024;          // lato massimo dell'immagine su cui si lavora
const CROP_UNDO = 6;            // quanti passi indietro si possono annullare

const crop = {
  src: null,                    // immagine originale (canvas), per il «ripristina»
  work: null,                   // immagine su cui si lavora (con i buchi di trasparenza)
  name: 'segnalino',
  shape: 'circle',              // circle | square | hex | none  (none = solo la sagoma)
  x: 0, y: 0, zoom: 1, rot: 0, flip: false,
  ring: '#ffffff', ringW: 0, fill: false, fillColor: '#2b2f3a',
  tool: 'move',                 // move | wand | erase | restore
  tol: 30, brush: 18,
  undo: [], onDone: null
};

// ---------- Finestra ----------
document.body.insertAdjacentHTML('beforeend', `
<dialog id="cropDialog" aria-label="Ritaglia il segnalino">
  <form method="dialog" id="cropForm">
    <header class="cHead">
      <h3>Ritaglia il segnalino</h3>
      <p>Trascina per spostare, rotella per ingrandire. Con la bacchetta togli lo sfondo, con la gomma rifinisci la sagoma.</p>
    </header>
    <div class="cMain">
      <div class="cStageWrap">
        <div class="cStage">
          <canvas id="cropCanvas" width="720" height="720"></canvas>
          <div id="cropGuide"></div>
        </div>
        <div class="cTools" role="group" aria-label="Strumento">
          <button type="button" data-tool="move" class="on" title="Sposta e ingrandisci l'immagine">✋ Sposta</button>
          <button type="button" data-tool="wand" title="Clic su un colore per toglierlo">🪄 Bacchetta</button>
          <button type="button" data-tool="erase" title="Cancella a mano">🧽 Gomma</button>
          <button type="button" data-tool="restore" title="Rimetti quello che hai cancellato">↺ Ripristina</button>
          <span class="cSpacer"></span>
          <button type="button" id="cropUndo" title="Annulla l'ultima modifica alla sagoma">↩ Annulla</button>
        </div>
      </div>

      <aside class="cSide">
        <section class="cGroup">
          <h4>Immagine</h4>
          <div class="cRow">
            <button type="button" id="cropFromAssets" class="btn ghost">Dagli assets</button>
            <label class="btn ghost" for="cropFile">Dal computer</label>
            <input id="cropFile" type="file" accept="image/*" hidden>
          </div>
          <p class="cHint" id="cropSrcName">Nessuna immagine scelta.</p>
        </section>

        <section class="cGroup">
          <h4>Forma del ritaglio</h4>
          <div class="cSeg" id="cropShape">
            <button type="button" data-shape="circle" class="on">◯ Tondo</button>
            <button type="button" data-shape="square">▢ Quadrato</button>
            <button type="button" data-shape="hex">⬡ Esagono</button>
            <button type="button" data-shape="none">✂ Solo sagoma</button>
          </div>
          <label class="cCheck"><input type="checkbox" id="cropFill"> Sfondo pieno dietro l'immagine
            <input type="color" id="cropFillColor" value="#2b2f3a"></label>
        </section>

        <section class="cGroup">
          <h4>Inquadratura</h4>
          <label class="cRange">Ingrandimento <input type="range" id="cropZoom" min="20" max="400" step="1" value="100"><output id="cropZoomOut">100%</output></label>
          <label class="cRange">Rotazione <input type="range" id="cropRot" min="-180" max="180" step="1" value="0"><output id="cropRotOut">0°</output></label>
          <div class="cRow">
            <button type="button" id="cropFlip" class="btn ghost">⇄ Specchia</button>
            <button type="button" id="cropCenter" class="btn ghost">⊹ Centra</button>
          </div>
        </section>

        <section class="cGroup">
          <h4>Sagoma</h4>
          <div class="cRow"><button type="button" id="cropAuto" class="btn">🪄 Togli lo sfondo</button>
            <button type="button" id="cropReset" class="btn ghost">Rimetti tutto</button></div>
          <label class="cRange">Tolleranza <input type="range" id="cropTol" min="2" max="120" step="1" value="30"><output id="cropTolOut">30</output></label>
          <label class="cRange">Pennello <input type="range" id="cropBrush" min="4" max="80" step="1" value="18"><output id="cropBrushOut">18</output></label>
        </section>

        <section class="cGroup">
          <h4>Bordo</h4>
          <label class="cRange">Spessore <input type="range" id="cropRingW" min="0" max="8" step="0.5" value="0"><output id="cropRingWOut">nessuno</output></label>
          <div class="cRow cSwRow" id="cropRingSw"></div>
        </section>

        <section class="cGroup cPrevGroup">
          <h4>Anteprima</h4>
          <div class="cPrev"><canvas id="cropPrevA" width="128" height="128"></canvas><canvas id="cropPrevB" width="128" height="128"></canvas></div>
          <label class="cRow">Nome <input type="text" id="cropName" maxlength="40" placeholder="Es. Goblin" autocomplete="off"></label>
        </section>
      </aside>
    </div>

    <footer class="dialogBtns">
      <button type="button" id="cropCancel" class="btn ghost">Annulla</button>
      <button type="button" id="cropSave" class="btn">Salva il segnalino</button>
    </footer>
  </form>
</dialog>`);

$('cropForm').addEventListener('submit', e => e.preventDefault());   // Invio non deve chiudere la finestra
const cropDlg = $('cropDialog'), cropCv = $('cropCanvas'), cropCtx = cropCv.getContext('2d');
const CS = cropCv.width;        // lato dell'area di lavoro, in pixel del canvas

// ---------- Disegno ----------
function cropMaskPath(ctx, shape, size, inset = 0) {
  const r = size / 2, rr = r - inset;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(r, r, rr, 0, Math.PI * 2);
  else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 90), x = r + rr * Math.cos(a), y = r + rr * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  } else {
    const k = size * 0.14, a = inset, b = size - inset * 2;
    if (ctx.roundRect) ctx.roundRect(a, a, b, b, k);
    else ctx.rect(a, a, b, b);                       // browser vecchi: angoli vivi
  }
}

// disegna l'immagine (senza bordo) dentro un quadrato di lato `size`
function cropDrawImage(ctx, size) {
  if (!crop.work) return;
  const w = crop.work.width, h = crop.work.height, s = size / Math.max(w, h) * crop.zoom;
  ctx.save();
  ctx.translate(size / 2 + crop.x * size / 100, size / 2 + crop.y * size / 100);
  ctx.rotate(crop.rot * Math.PI / 180);
  if (crop.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(crop.work, -w * s / 2, -h * s / 2, w * s, h * s);
  ctx.restore();
}

// il segnalino finito: maschera, immagine, bordo
function cropRender(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const t = crop.ringW * size / 100;

  ctx.save();
  if (crop.shape !== 'none') { cropMaskPath(ctx, crop.shape, size); ctx.clip(); }
  if (crop.fill) { ctx.fillStyle = crop.fillColor; ctx.fillRect(0, 0, size, size); }
  cropDrawImage(ctx, size);
  ctx.restore();

  if (t > 0) {
    if (crop.shape !== 'none') {
      ctx.save();
      cropMaskPath(ctx, crop.shape, size); ctx.clip();
      cropMaskPath(ctx, crop.shape, size);
      ctx.lineWidth = t * 2; ctx.strokeStyle = crop.ring; ctx.stroke();
      ctx.restore();
    } else {
      // contorno della sagoma: la stessa figura tinta, spostata tutt'intorno e messa sotto
      const o = document.createElement('canvas'); o.width = o.height = size;
      const oc = o.getContext('2d');
      oc.drawImage(c, 0, 0);
      oc.globalCompositeOperation = 'source-in';
      oc.fillStyle = crop.ring; oc.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'destination-over';
      for (let a = 0; a < 24; a++) {
        const ang = a * Math.PI / 12;
        ctx.drawImage(o, Math.cos(ang) * t, Math.sin(ang) * t);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  return c;
}

function cropPaint() {
  cropCtx.clearRect(0, 0, CS, CS);
  // scacchiera: si capisce dov'è trasparente
  const q = 18;
  cropCtx.save();
  for (let y = 0; y < CS; y += q) for (let x = 0; x < CS; x += q) {
    cropCtx.fillStyle = ((x / q + y / q) % 2) ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.015)';
    cropCtx.fillRect(x, y, q, q);
  }
  cropCtx.restore();
  // l'immagine intera, in chiaro fuori dalla maschera
  if (crop.work) {
    cropCtx.save(); cropCtx.globalAlpha = .22; cropDrawImage(cropCtx, CS); cropCtx.restore();
  }
  cropCtx.drawImage(cropRender(CS), 0, 0);
  // il profilo della maschera
  if (crop.shape !== 'none') {
    cropCtx.save();
    cropMaskPath(cropCtx, crop.shape, CS, 1);
    cropCtx.setLineDash([9, 7]); cropCtx.lineWidth = 2; cropCtx.strokeStyle = 'rgba(255,255,255,.75)';
    cropCtx.stroke();
    cropCtx.restore();
  }
  cropPreview();
}

function cropPreview() {
  const img = cropRender(128);
  for (const [id, bg] of [['cropPrevA', '#1b2030'], ['cropPrevB', '#e8e2d2']]) {
    const c = $(id), x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = bg; x.fillRect(0, 0, 128, 128);
    x.drawImage(img, 0, 0);
  }
}

// ---------- Carico l'immagine ----------
function cropLoad(url, name) {
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => {
    const k = Math.min(1, CROP_MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    crop.src = c;
    crop.work = document.createElement('canvas'); crop.work.width = w; crop.work.height = h;
    crop.work.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0);
    crop.undo = [];
    crop.x = crop.y = crop.rot = 0; crop.zoom = 1; crop.flip = false;
    if (name) { crop.name = name.replace(/\.[^.]+$/, ''); $('cropName').value = crop.name; }
    $('cropSrcName').textContent = name || 'Immagine caricata';
    cropSyncForm(); cropPaint();
  };
  im.onerror = () => { $('cropSrcName').textContent = '❌ Non riesco a leggere questa immagine.'; };
  im.src = url;
}

// ---------- Togliere lo sfondo ----------
function cropSnapshot() {
  if (!crop.work) return;
  const ctx = crop.work.getContext('2d', { willReadFrequently: true });
  crop.undo.push(ctx.getImageData(0, 0, crop.work.width, crop.work.height));
  if (crop.undo.length > CROP_UNDO) crop.undo.shift();
}
function cropUndoStep() {
  const d = crop.undo.pop();
  if (!d) return;
  crop.work.getContext('2d').putImageData(d, 0, 0);
  cropPaint();
}

// riempimento a partire da uno o più punti: toglie tutto quello che somiglia al colore di partenza
function cropFlood(seeds, tol) {
  const W = crop.work.width, H = crop.work.height;
  const ctx = crop.work.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H), px = img.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (const [sx, sy] of seeds) {
    const p = (sy * W + sx) * 4;
    if (px[p + 3] === 0) continue;
    r += px[p]; g += px[p + 1]; b += px[p + 2]; n++;
  }
  if (!n) return false;
  r /= n; g /= n; b /= n;
  const lim = tol * tol * 3;
  const seen = new Uint8Array(W * H), q = [];
  for (const [sx, sy] of seeds) { const i = sy * W + sx; if (!seen[i]) { seen[i] = 1; q.push(i); } }
  while (q.length) {
    const i = q.pop(), p = i * 4;
    if (px[p + 3] !== 0) {
      const dr = px[p] - r, dg = px[p + 1] - g, db = px[p + 2] - b;
      if (dr * dr + dg * dg + db * db > lim) continue;
      px[p + 3] = 0;
    }
    const x = i % W, y = (i - x) / W;
    if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; q.push(i - 1); }
    if (x < W - 1 && !seen[i + 1]) { seen[i + 1] = 1; q.push(i + 1); }
    if (y > 0 && !seen[i - W]) { seen[i - W] = 1; q.push(i - W); }
    if (y < H - 1 && !seen[i + W]) { seen[i + W] = 1; q.push(i + W); }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

function cropAutoBg() {
  if (!crop.work) return;
  cropSnapshot();
  const W = crop.work.width, H = crop.work.height, m = 1;
  const seeds = [[m, m], [W - 1 - m, m], [m, H - 1 - m], [W - 1 - m, H - 1 - m],
    [(W >> 1), m], [(W >> 1), H - 1 - m], [m, (H >> 1)], [W - 1 - m, (H >> 1)]];
  cropFlood(seeds, crop.tol);
  cropPaint();
}

// dal punto del canvas al pixel dell'immagine (tiene conto di spostamento, zoom, rotazione, specchio)
function cropToImage(cx, cy) {
  if (!crop.work) return null;
  const w = crop.work.width, h = crop.work.height, s = CS / Math.max(w, h) * crop.zoom;
  let x = cx - (CS / 2 + crop.x * CS / 100), y = cy - (CS / 2 + crop.y * CS / 100);
  const a = -crop.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  [x, y] = [x * ca - y * sa, x * sa + y * ca];
  if (crop.flip) x = -x;
  const ix = Math.round(x / s + w / 2), iy = Math.round(y / s + h / 2);
  return (ix >= 0 && iy >= 0 && ix < w && iy < h) ? [ix, iy, s] : null;
}

function cropBrushAt(cx, cy, restore) {
  const p = cropToImage(cx, cy);
  if (!p) return;
  const [ix, iy, s] = p, rad = Math.max(1, crop.brush / s / 2);
  const ctx = crop.work.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.beginPath(); ctx.arc(ix, iy, rad, 0, Math.PI * 2);
  if (restore) { ctx.clip(); ctx.drawImage(crop.src, 0, 0); }
  else { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); }
  ctx.restore();
}

// ---------- Comandi ----------
function cropSyncForm() {
  $('cropZoom').value = Math.round(crop.zoom * 100); $('cropZoomOut').textContent = Math.round(crop.zoom * 100) + '%';
  $('cropRot').value = crop.rot; $('cropRotOut').textContent = crop.rot + '°';
  $('cropTol').value = crop.tol; $('cropTolOut').textContent = crop.tol;
  $('cropBrush').value = crop.brush; $('cropBrushOut').textContent = crop.brush;
  $('cropRingW').value = crop.ringW; $('cropRingWOut').textContent = crop.ringW ? crop.ringW + '%' : 'nessuno';
  $('cropFill').checked = crop.fill; $('cropFillColor').value = crop.fillColor;
  $('cropShape').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.shape === crop.shape));
  cropDlg.querySelectorAll('.cTools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === crop.tool));
  $('cropGuide').dataset.tool = crop.tool;
  $('cropRingSw').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.color === crop.ring));
}

for (const [c, n] of [['#ffffff', 'Bianco'], ['#000000', 'Nero'], ['#ff4d4d', 'Rosso'], ['#ffd93d', 'Giallo'], ['#4dff88', 'Verde'], ['#4da6ff', 'Azzurro']]) {
  const b = mk('button', 'sw'); b.type = 'button'; b.dataset.color = c; b.title = n; b.style.background = c; b.setAttribute('aria-label', n);
  b.addEventListener('click', () => { crop.ring = c; if (!crop.ringW) crop.ringW = 3; cropSyncForm(); cropPaint(); });
  $('cropRingSw').appendChild(b);
}
{
  const ci = mk('input'); ci.type = 'color'; ci.value = crop.ring; ci.title = 'Altro colore';
  ci.addEventListener('input', () => { crop.ring = ci.value; if (!crop.ringW) crop.ringW = 3; cropSyncForm(); cropPaint(); });
  $('cropRingSw').appendChild(ci);
}

$('cropShape').addEventListener('click', e => {
  const b = e.target.closest('[data-shape]'); if (!b) return;
  crop.shape = b.dataset.shape; cropSyncForm(); cropPaint();
});
cropDlg.querySelector('.cTools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]'); if (!b) return;
  crop.tool = b.dataset.tool; cropSyncForm();
});
$('cropZoom').addEventListener('input', e => { crop.zoom = +e.target.value / 100; cropSyncForm(); cropPaint(); });
$('cropRot').addEventListener('input', e => { crop.rot = +e.target.value; cropSyncForm(); cropPaint(); });
$('cropTol').addEventListener('input', e => { crop.tol = +e.target.value; cropSyncForm(); });
$('cropBrush').addEventListener('input', e => { crop.brush = +e.target.value; cropSyncForm(); });
$('cropRingW').addEventListener('input', e => { crop.ringW = +e.target.value; cropSyncForm(); cropPaint(); });
$('cropFill').addEventListener('input', e => { crop.fill = e.target.checked; cropPaint(); });
$('cropFillColor').addEventListener('input', e => { crop.fillColor = e.target.value; crop.fill = true; cropSyncForm(); cropPaint(); });
$('cropFlip').addEventListener('click', () => { crop.flip = !crop.flip; cropPaint(); });
$('cropCenter').addEventListener('click', () => { crop.x = crop.y = crop.rot = 0; crop.zoom = 1; cropSyncForm(); cropPaint(); });
$('cropAuto').addEventListener('click', cropAutoBg);
$('cropUndo').addEventListener('click', cropUndoStep);
$('cropReset').addEventListener('click', () => {
  if (!crop.src) return;
  cropSnapshot();
  const ctx = crop.work.getContext('2d');
  ctx.clearRect(0, 0, crop.work.width, crop.work.height);
  ctx.drawImage(crop.src, 0, 0);
  cropPaint();
});
$('cropName').addEventListener('input', e => { crop.name = e.target.value; });
$('cropFromAssets').addEventListener('click', () => pickAsset(a => cropLoad(a.url, a.name)));
$('cropFile').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) cropLoad(URL.createObjectURL(f), f.name);
});

// ---------- Mouse sul canvas ----------
let cropDrag = null;
const cropPt = e => {
  const r = cropCv.getBoundingClientRect();
  return [(e.clientX - r.left) * CS / r.width, (e.clientY - r.top) * CS / r.height];
};
cropCv.addEventListener('pointerdown', e => {
  if (!crop.work || e.button !== 0) return;
  const [x, y] = cropPt(e);
  cropCv.setPointerCapture(e.pointerId);
  if (crop.tool === 'move') { cropDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: crop.x, oy: crop.y }; return; }
  if (crop.tool === 'wand') {
    const p = cropToImage(x, y);
    if (p) { cropSnapshot(); cropFlood([[p[0], p[1]]], crop.tol); cropPaint(); }
    return;
  }
  cropSnapshot();
  cropDrag = { id: e.pointerId, brush: true };
  cropBrushAt(x, y, crop.tool === 'restore'); cropPaint();
});
cropCv.addEventListener('pointermove', e => {
  if (!cropDrag || e.pointerId !== cropDrag.id) return;
  const [x, y] = cropPt(e);
  if (cropDrag.brush) { cropBrushAt(x, y, crop.tool === 'restore'); cropPaint(); return; }
  const r = cropCv.getBoundingClientRect();
  crop.x = cropDrag.ox + (e.clientX - cropDrag.x) * 100 / r.width;
  crop.y = cropDrag.oy + (e.clientY - cropDrag.y) * 100 / r.height;
  cropPaint();
});
const cropEnd = e => { if (cropDrag && e.pointerId === cropDrag.id) cropDrag = null; };
cropCv.addEventListener('pointerup', cropEnd);
cropCv.addEventListener('pointercancel', cropEnd);
cropCv.addEventListener('wheel', e => {
  e.preventDefault();
  crop.zoom = clamp(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.2, 4);
  cropSyncForm(); cropPaint();
}, { passive: false });

// ---------- Apertura e salvataggio ----------
function openCrop({ url, name, onDone }) {
  crop.onDone = onDone || null;
  $('cropName').value = crop.name = name ? name.replace(/\.[^.]+$/, '') : 'segnalino';
  if (!url) { crop.src = crop.work = null; $('cropSrcName').textContent = 'Scegli un\'immagine dagli assets o dal computer.'; }
  cropSyncForm();
  cropDlg.showModal();
  if (url) cropLoad(url, name); else cropPaint();
}
$('cropCancel').addEventListener('click', () => cropDlg.close());

$('cropSave').addEventListener('click', async () => {
  if (!crop.work) { $('cropSrcName').textContent = 'Prima scegli un\'immagine.'; return; }
  const btn = $('cropSave'); btn.disabled = true;
  try {
    const size = settings.resToken ? Math.min(settings.resToken, 1024) : 512;
    const out = cropRender(size);
    const blob = await new Promise(r => out.toBlob(r, 'image/webp', 0.92))
      || await new Promise(r => out.toBlob(r, 'image/png'));
    if (!blob) throw new Error('questo browser non sa salvare l\'immagine');
    let rec;
    const inSessione = typeof NET !== 'undefined' && NET.on && typeof isMaster === 'function' && !isMaster();
    if (inSessione) {
      // Un giocatore non scrive negli assets condivisi: il segnalino se lo porta dietro
      // dentro al dato, così lo vedono tutti senza caricare niente sulla mappa degli altri.
      if (blob.size > 220 * 1024) throw new Error('immagine troppo pesante: abbassa la risoluzione dei segnalini nelle impostazioni');
      const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      rec = { url, name: (crop.name || 'segnalino') + '.webp', baked: true };
    } else {
      try { await store.addFolder(TOKEN_FOLDER); } catch { /* esiste già */ }
      rec = await store.add((crop.name || 'segnalino') + '.webp', TOKEN_FOLDER, blob);
      rec.baked = true;
      await reload();
    }
    cropDlg.close();
    if (crop.onDone) crop.onDone(rec);
  } catch (err) {
    $('cropSrcName').textContent = '❌ ' + err.message;
  } finally { btn.disabled = false; }
});

// ---------- Aggancio al resto dell'applicazione ----------
// Il pulsante «Immagine» dello strumento segnalini apre l'editor.
$('tkImg').replaceWith($('tkImg').cloneNode(true));          // via il vecchio ascoltatore
$('tkImg').addEventListener('click', () => openCrop({
  url: tok.img ? tok.img.url : null,
  name: tok.img ? tok.img.name : (tok.name || 'segnalino'),
  onDone: rec => { tok.img = rec; tok.baked = true; refreshTok(); }
}));
$('tkImgX').replaceWith($('tkImgX').cloneNode(true));
$('tkImgX').addEventListener('click', () => { tok.img = null; tok.baked = false; refreshTok(); });

// Clic destro su un segnalino già sulla mappa: si può ritagliare di nuovo.
function cropExistingToken(el) {
  const img = el.querySelector('img');
  if (!img) return;
  openCrop({
    url: img.getAttribute('src'), name: el.dataset.name || 'segnalino',
    onDone: rec => {
      img.src = rec.url;
      el.dataset.aid = rec.id ?? '';
      delete el.dataset.round; delete el.dataset.ring;     // forma e bordo sono già nell'immagine
      applyLook(el); scheduleBoardSave();
    }
  });
}
