// ---------- Telefoni, tablet e DeX: tocco, mouse e schermi di ogni misura ----------
// Si appoggia a script.js, extras.js, sheets.js, net.js (variabili globali condivise) e non
// cambia niente di come funziona con il mouse. Due cose decide da solo:
//
//   come si comanda   «ui-mouse»: come sul computer (anche con Samsung DeX, un Chromebook, un
//                     iPad con il trackpad); «ui-touch»: comandi più grandi e i gesti qui sotto.
//                     Si passa dall'uno all'altro appena si usa l'altro modo (tocchi lo schermo,
//                     muovi il mouse).
//   quanto è grande   «ui-tel» su un telefono (o una finestra stretta): pannelli a tutto
//                     schermo, strumenti che si aprono dal basso.
//
// Gesti sulla mappa (con le dita):
//   un dito su un punto libero      sposta la vista            due dita     zoom e spostamento
//   un dito su un segnalino         lo sposta (come il mouse)  tocco lungo  il menu del clic destro
//   tieni premuto su un punto libero: ping                     tocco con due dita: menu della mappa
//   doppio tocco = doppio clic (apre la scheda del segnalino, modifica un testo…)

(() => {
  'use strict';
  const R = document.documentElement;
  const NAT = window.LIBRE_NATIVO || { disponibile: false, info: {} };
  const LUNGO = 500;          // ms per il tocco lungo
  const SOGLIA = 9;           // px: oltre, non è più un tocco ma un trascinamento

  // ======================= Che dispositivo è =======================
  const mqGrosso = matchMedia('(pointer: coarse)');
  let ultimo = null;          // l'ultimo modo usato davvero: 'touch' | 'mouse'
  const desktop = () => !!(NAT.info && (NAT.info.desktop || NAT.info.dex));

  function aggiorna() {
    const info = NAT.info || {};
    const tocco = ultimo ? ultimo === 'touch' : desktop() ? false : (mqGrosso.matches && !info.mouse);
    R.classList.toggle('ui-touch', tocco);
    R.classList.toggle('ui-mouse', !tocco);
    R.classList.toggle('ui-dex', !!info.dex);
    R.classList.toggle('ui-desktop', desktop());
    // la misura la decide la finestra (in DeX le finestre si ridimensionano come sul computer)
    const w = innerWidth, h = innerHeight;
    R.classList.toggle('ui-tel', w < 600 || (h < 500 && w < 1000));
    R.classList.toggle('ui-vert', h >= w);
  }
  aggiorna();
  addEventListener('resize', aggiorna);
  addEventListener('libre-nativo', () => { ultimo = desktop() ? 'mouse' : ultimo; aggiorna(); });
  mqGrosso.addEventListener && mqGrosso.addEventListener('change', aggiorna);
  addEventListener('pointerdown', e => {
    const t = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'mouse' ? 'mouse' : null;   // la penna non cambia niente
    if (t && t !== ultimo) { ultimo = t; aggiorna(); }
  }, true);
  const toccoOra = () => R.classList.contains('ui-touch');
  const telefono = () => R.classList.contains('ui-tel');

  // ======================= Utilità =======================
  const vibra = () => { try { if (NAT.disponibile) NAT.vibra(12); else if (navigator.vibrate) navigator.vibrate(12); } catch {} };
  const NATIVI = 'input, textarea, select, [contenteditable="true"]';
  let mangiaClick = 0;                         // dopo un tocco lungo il «clic» che segue non conta
  addEventListener('click', e => {
    if (performance.now() < mangiaClick) { e.stopImmediatePropagation(); e.preventDefault(); mangiaClick = 0; }
  }, true);
  addEventListener('pointerdown', () => { mangiaClick = 0; }, true);   // un tocco nuovo: quel clic non arriverà più
  const ferma = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
  function menuIn(x, y, el) {
    if (typeof contextItems !== 'function' || typeof showMenu !== 'function') return false;
    const items = contextItems(el || document.elementFromPoint(x, y) || viewport, { clientX: x, clientY: y });
    if (!items || !items.length) return false;
    showMenu(x, y, items);
    vibra();
    mangiaClick = performance.now() + 700;
    return true;
  }

  /** Annulla quello che la mappa stava facendo con il primo dito (arriva il secondo: è uno zoom). */
  function annullaGesto() {
    try {
      if (typeof mode !== 'undefined' && mode && activeEl) {
        if (mode === 'photo') {
          activeEl.style.left = origX + 'px'; activeEl.style.top = origY + 'px';
          for (const g of group) { g.el.style.left = g.x + 'px'; g.el.style.top = g.y + 'px'; }
        } else if (mode === 'resize') {
          Object.assign(activeEl.style, { left: origX + 'px', top: origY + 'px', width: origW + 'px', height: origH + 'px' });
        } else if (mode === 'frame') {
          activeEl.style.left = origX + 'px'; activeEl.style.top = origY + 'px';
          if (companion && activeEl === board) { bgBox.style.left = companion.x + 'px'; bgBox.style.top = companion.y + 'px'; }
        }
      }
      if (typeof mode !== 'undefined' && mode) stop();
      if (typeof shp !== 'undefined' && shp) { if (shp.el) shp.el.remove(); live.remove(); shp = null; }
      if (typeof erasing !== 'undefined') erasing = null;
      if (typeof ruler !== 'undefined' && ruler && ruler.id !== -1) clearRuler();
      if (typeof fogDrag !== 'undefined' && fogDrag) { fogDrag = 0; fogRect = null; if (typeof clearDraw === 'function') clearDraw(); }
    } catch (err) { console.warn('annullaGesto', err); }
  }

  // ======================= Le dita sulla mappa =======================
  const dita = new Map();     // pointerId -> { x, y, x0, y0, t0 }
  let pan = null;             // un dito su un punto libero: { id, vx, vy, pingTimer, ping }
  let pz = null;              // due dita: lo zoom
  let lungo = null;           // tocco lungo su un segnalino: { id, timer }
  const ignora = new Set();   // dita già usate da un gesto: i loro eventi non vanno alla mappa
  let selezioneArea = false;  // il pulsante «selezione»: un dito disegna il rettangolo invece di spostare

  const nodo = e => e.target instanceof Node;
  const sullaMappa = e => e.pointerType === 'touch' && nodo(e) && viewport.contains(e.target);
  const strumentoAttivo = () =>
    (typeof penOn !== 'undefined' && penOn) || (typeof rulerOn !== 'undefined' && rulerOn) ||
    (typeof fogAllowed === 'function' && fogAllowed());
  function suCornice(e) {                       // livello «Mappa»: si sta spostando il rettangolo o lo sfondo
    if (typeof layer === 'undefined' || layer !== 'map') return false;
    if (e.target.closest('.handle')) return true;
    const el = editTarget(), r = rectOf(el);
    const wx = (e.clientX - view.x) / view.s, wy = (e.clientY - view.y) / view.s;
    return wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h;
  }

  function inizioZoom() {
    const [a, b] = [...dita.values()];
    stopTween();
    pz = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
      s0: view.s, x0: view.x, y0: view.y, t0: performance.now(), mosso: false };
  }
  function muoviZoom() {
    const [a, b] = [...dita.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const { minS, maxS } = limits();
    const s = clamp(pz.s0 * d / pz.d0, minS, maxS), k = s / pz.s0;
    // il punto della mappa che stava sotto le dita all'inizio resta sotto le dita
    view.s = s;
    view.x = cx - (pz.cx - pz.x0) * k;
    view.y = cy - (pz.cy - pz.y0) * k;
    if (Math.abs(d - pz.d0) > SOGLIA || Math.hypot(cx - pz.cx, cy - pz.cy) > SOGLIA) pz.mosso = true;
    applyView();
  }

  addEventListener('pointerdown', e => {
    if (!sullaMappa(e)) return;
    dita.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });

    if (dita.size === 2) {                     // il secondo dito: zoom (quello che faceva il primo si annulla)
      if (pan) { clearTimeout(pan.pingTimer); if (pan.ping && typeof livePing !== 'undefined' && livePing) { livePing.held = false; livePing = null; } }
      if (lungo) { clearTimeout(lungo.timer); lungo = null; }
      annullaGesto();
      pan = null;
      for (const id of dita.keys()) ignora.add(id);
      inizioZoom();
      ferma(e);
      return;
    }
    if (dita.size > 2) { ignora.add(e.pointerId); ferma(e); return; }

    // un dito solo
    if (strumentoAttivo() || selezioneArea || suCornice(e)) return;          // penna, righello, nebbia, rettangolo: come col mouse
    const foto = e.target.closest('.photo');
    if (foto) {                                // un segnalino: lo muove la mappa; se resta fermo a lungo, il menu
      lungo = { id: e.pointerId, timer: setTimeout(() => {
        const d = dita.get(e.pointerId);
        if (!d || Math.hypot(d.x - d.x0, d.y - d.y0) > SOGLIA) return;
        annullaGesto();
        ignora.add(e.pointerId);
        lungo = null;
        menuIn(d.x, d.y, foto);
      }, LUNGO) };
      return;
    }
    // un punto libero: sposta la vista (o, se resta fermo, ping)
    ferma(e);
    try { viewport.setPointerCapture(e.pointerId); } catch {}
    stopTween();
    if (typeof select === 'function') select(null);
    if (typeof closeCtx === 'function') closeCtx();
    pan = { id: e.pointerId, vx: view.x, vy: view.y, mosso: false, ping: false };
    const x = e.clientX, y = e.clientY;
    pan.pingTimer = setTimeout(() => {
      if (!pan || pan.mosso || pan.id !== e.pointerId) return;
      pan.ping = true;
      vibra();
      startPing(x, y);                         // cresce finché il dito resta giù
    }, typeof PING_HOLD === 'number' ? PING_HOLD + 100 : 450);
  }, true);

  addEventListener('pointermove', e => {
    const d = dita.get(e.pointerId);
    if (!d) return;
    d.x = e.clientX; d.y = e.clientY;
    if (pz && dita.size >= 2 && ignora.has(e.pointerId)) { muoviZoom(); ferma(e); return; }
    if (ignora.has(e.pointerId)) { ferma(e); return; }
    if (lungo && lungo.id === e.pointerId && Math.hypot(d.x - d.x0, d.y - d.y0) > SOGLIA) { clearTimeout(lungo.timer); lungo = null; }
    if (pan && pan.id === e.pointerId) {
      ferma(e);
      if (pan.ping) return;
      const dx = d.x - d.x0, dy = d.y - d.y0;
      if (!pan.mosso && Math.hypot(dx, dy) <= SOGLIA) return;
      pan.mosso = true; clearTimeout(pan.pingTimer);
      view.x = pan.vx + dx; view.y = pan.vy + dy;
      applyView();
    }
  }, true);

  function fineDito(e) {
    const d = dita.get(e.pointerId);
    if (!d) return;
    dita.delete(e.pointerId);
    if (lungo && lungo.id === e.pointerId) { clearTimeout(lungo.timer); lungo = null; }
    if (pan && pan.id === e.pointerId) {
      ferma(e);
      clearTimeout(pan.pingTimer);
      if (pan.ping && typeof livePing !== 'undefined' && livePing) { livePing.held = false; livePing = null; }
      if (pan.mosso) scheduleBoardSave();
      pan = null;
      return;
    }
    if (ignora.has(e.pointerId)) {
      ignora.delete(e.pointerId);
      ferma(e);
      if (pz && dita.size < 2) {
        const breve = performance.now() - pz.t0 < 320;
        if (breve && !pz.mosso && e.type === 'pointerup') menuIn(pz.cx, pz.cy);   // tocco con due dita: il menu della mappa
        else scheduleBoardSave();
        pz = null;
      }
    }
  }
  addEventListener('pointerup', fineDito, true);
  addEventListener('pointercancel', fineDito, true);

  // ======================= Tocco lungo fuori dalla mappa = clic destro =======================
  let lungoUi = null;
  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !nodo(e) || !e.target.closest || viewport.contains(e.target) || e.target.closest(NATIVI)) return;
    clearTimeout(lungoUi && lungoUi.timer);
    const x = e.clientX, y = e.clientY, el = e.target;
    lungoUi = { id: e.pointerId, x, y, timer: setTimeout(() => {
      lungoUi = null;
      if (typeof drag !== 'undefined' && drag && drag.dito) return;   // sta tenendo uno strumento per spostarlo
      if (menuIn(x, y, el)) { if (typeof drag !== 'undefined') drag = null; }
    }, LUNGO + 50) };
  }, true);
  addEventListener('pointermove', e => {
    if (lungoUi && e.pointerId === lungoUi.id && Math.hypot(e.clientX - lungoUi.x, e.clientY - lungoUi.y) > SOGLIA) { clearTimeout(lungoUi.timer); lungoUi = null; }
  }, true);
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, e => {
    if (lungoUi && e.pointerId === lungoUi.id) { clearTimeout(lungoUi.timer); lungoUi = null; }
  }, true);
  // il menu del sistema (Android lo apre con il tocco lungo) non serve: c'è il nostro
  addEventListener('contextmenu', e => { if (toccoOra() && e.target.closest && !e.target.closest(NATIVI)) e.preventDefault(); }, true);

  // ======================= Doppio tocco = doppio clic =======================
  // I browser dei telefoni il doppio clic a volte lo mandano e a volte no: lo facciamo noi,
  // e scartiamo il loro, così arriva sempre una volta sola.
  let tap = null, ultimoTocco = 0;
  addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    ultimoTocco = performance.now();
    const d0 = tap;
    const ora = { t: performance.now(), x: e.clientX, y: e.clientY };
    tap = ora;
    if (!d0 || ora.t - d0.t > 330 || Math.hypot(ora.x - d0.x, ora.y - d0.y) > 26) return;
    tap = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const ev = new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, view: window });
    ev._libre = true;
    setTimeout(() => el.dispatchEvent(ev), 0);
  }, true);
  addEventListener('dblclick', e => {
    if (!e._libre && performance.now() - ultimoTocco < 700) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ======================= Le cose che col mouse si trascinano =======================
  // Assets e schede sulla mappa si portano trascinando: con le dita basta un tocco.
  document.addEventListener('click', e => {
    if (!toccoOra() || !e.target.closest || e.target.closest('button, input, select, textarea')) return;
    const a = e.target.closest('.asset');
    if (a && a._asset) {
      addPhotoToMap(a._asset.url, null, a._asset.id);
      if (telefono() && side.classList.contains('open')) sideToggle.click();
      if (typeof netSay === 'function') netSay('«' + a._asset.name + '» è sulla mappa.');
      return;
    }
    const s = e.target.closest('.sheetItem');
    if (s) openSheet(s.dataset.id);
  });
  // una scheda si mette sulla mappa anche dal suo menu
  if (typeof contextItems === 'function') {
    const prima = contextItems;
    contextItems = function (t, e) {                // eslint-disable-line no-global-assign
      const items = prima(t, e);
      const s = t && t.closest && t.closest('.sheetItem');
      if (items && s) {
        const sh = sheets.find(x => x.id === s.dataset.id);
        if (sh) items.splice(1, 0, { label: '🎯 Metti sulla mappa', fn: () => {
          tokenFromSheet(sh, (innerWidth / 2 - view.x) / view.s, (innerHeight / 2 - view.y) / view.s);
          if (telefono() && side.classList.contains('open')) sideToggle.click();
        } });
      }
      return items;
    };
  }
  // sul telefono una scheda aperta copre tutto: il menu laterale si chiude
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                     // eslint-disable-line no-global-assign
      const w = prima(id);
      if (w && telefono() && side.classList.contains('open')) sideToggle.click();
      return w;
    };
  }

  // ======================= Pulsante «selezione» (solo col tocco) =======================
  const selBtn = document.createElement('button');
  selBtn.type = 'button'; selBtn.id = 'selArea'; selBtn.className = 'soloTocco';
  selBtn.title = 'Selezione: con un dito disegni il rettangolo per scegliere più segnalini (lo spostamento resta a due dita)';
  selBtn.setAttribute('aria-pressed', 'false');
  selBtn.textContent = '⬚';
  selBtn.addEventListener('click', () => {
    selezioneArea = !selezioneArea;
    selBtn.classList.toggle('on', selezioneArea);
    selBtn.setAttribute('aria-pressed', String(selezioneArea));
  });
  $('dock').insertBefore(selBtn, $('dock').firstChild);

  // ======================= Tasto «indietro» del telefono =======================
  // Chiude la cosa più in alto. false = non c'era niente da chiudere (l'app decide cosa fare).
  window.LIBRE_INDIETRO = () => {
    if (typeof ctx !== 'undefined' && !ctx.hidden) { closeCtx(); return true; }
    const dlg = [...document.querySelectorAll('dialog[open]')].pop();
    if (dlg) { dlg.close(); return true; }
    if (typeof textEd !== 'undefined' && textEd) { textEd.commit(); return true; }
    if (!$('sceneMenu').hidden) { closeSceneMenu(); return true; }
    const strumento = [...document.querySelectorAll('.tool.open, #dice.open')].pop();
    if (strumento) {
      const grip = strumento.id === 'dice' ? $('diceToggle') : strumento.id === 'zoomBox' ? $('zoomToggle') : strumento.querySelector('.tgrip');
      if (grip) { grip.click(); return true; }
    }
    const fin = [...document.querySelectorAll('.sheetWin')].filter(w => w._state === 'open').sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
    if (fin) { closeWin(fin); return true; }
    if (side.classList.contains('open')) { sideToggle.click(); return true; }
    if (selection && selection.length) { select(null); return true; }
    return false;
  };

  // ======================= Mentre si gioca in compagnia, lo schermo non si spegne =======================
  if (NAT.disponibile) {
    let acceso = null;
    setInterval(() => {
      const ora = !!(typeof NET !== 'undefined' && (NET.on || NET.retrying));
      if (ora !== acceso) { acceso = ora; NAT.schermoAcceso(ora); }
    }, 3000);
  }

  // ======================= La guida: anche i gesti =======================
  const guida = document.querySelector('#helpDialog .helpList');
  if (guida) {
    const li = document.createElement('li');
    li.className = 'soloTocco';
    li.innerHTML = '<b>Con le dita</b>: un dito su un punto libero sposta la mappa, due dita la ingrandiscono. ' +
      '<b>Tocco lungo</b> su qualsiasi cosa = clic destro (il menu). Tieni premuto su un punto libero: ping. ' +
      'Tocco con due dita: il menu della mappa. Doppio tocco = doppio clic. ⬚ in basso: selezione di più segnalini. ' +
      'Negli assets e nelle schede basta un tocco per mettere l\'immagine o il personaggio sulla mappa. ' +
      'Per spostare un pulsante del menu a sinistra <b>tienilo premuto</b> un attimo (si ingrandisce) e poi trascinalo; fuori dal menu si trascina subito.';
    guida.prepend(li);
  }
})();
