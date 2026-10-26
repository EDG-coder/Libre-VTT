// ---------- Miniature e anteprima delle scene ----------
// Ogni scena ha una miniatura (sfondo, segnalini e nebbia) disegnata dai suoi dati su un canvas
// piccolo: si rifà quando lasci la scena e si salva nella campagna in data/miniature/<id>.webp,
// così c'è anche alla riapertura. Nel menu delle scene ogni riga mostra la sua; passandoci sopra
// col mouse (o tenendo premuto col dito) si apre un'anteprima più grande, con il nome e quanti
// segnalini ha. «▦ Tutte le scene» le mostra a griglia: per scegliere, riordinare e duplicare.
// Il master può sistemare una scena mentre i giocatori ne vedono un'altra: la pillola in basso lo
// dice e ha «📌 Mostra ai giocatori».
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const W = 240, H = 160;                        // il doppio di 120 × 80: nitida anche sugli schermi densi
  const mini = new Map();                        // id scena → url (blob: o data:) della miniatura
  const firme = new Map();                       // id scena → «firma» dei dati usati per disegnarla
  const conduco = () => typeof isMaster !== 'function' || isMaster();
  const tocco = () => document.documentElement.classList.contains('ui-touch');

  // ---------- disegno ----------
  const immagini = new Map();
  function carica(url) {
    if (!url) return Promise.resolve(null);
    if (!immagini.has(url)) immagini.set(url, new Promise(ok => {
      const im = new Image();
      if (/^https?:/.test(url) && !url.startsWith(location.origin)) im.crossOrigin = 'anonymous';
      im.onload = () => ok(im); im.onerror = () => ok(null);
      im.src = url;
    }));
    return immagini.get(url);
  }
  const segnalini = sc => (sc.photos || []).filter(p => !p.shape && (p.layer || 'tokens') === 'tokens');
  const firma = sc => JSON.stringify([sc.bg && [sc.bg.url, sc.bg.x, sc.bg.y, sc.bg.w, sc.bg.h], sc.board,
    (sc.photos || []).filter(p => (p.layer || 'tokens') !== 'hidden').map(p => [p.url, p.shape ? 1 : 0, p.l, p.t, p.w, p.h, p.round, p.layer]),
    sc.fog && [sc.fog.on, sc.fog.cells, sc.fog.x, sc.fog.y], sc.grid && sc.grid.show, sc.type]);

  async function disegna(sc) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = (css.getPropertyValue('--page-bg') || css.getPropertyValue('--bg') || '#1a1d26').trim() || '#1a1d26';
    g.fillRect(0, 0, W, H);
    // l'inquadratura: il rettangolo della mappa (o lo sfondo), con un po' di margine
    const r = sc.board && sc.board.w > 0 ? sc.board : sc.bg && sc.bg.w > 0 ? sc.bg : { x: 0, y: 0, w: 1600, h: 1000 };
    const k = Math.min(W / r.w, H / r.h) * 0.98, ox = (W - r.w * k) / 2 - r.x * k, oy = (H - r.h * k) / 2 - r.y * k;
    const rett = (x, y, w, h) => [ox + x * k, oy + y * k, w * k, h * k];
    if (sc.bg) { const im = await carica(resolveUrl(sc.bg)); if (im) try { g.drawImage(im, ...rett(sc.bg.x, sc.bg.y, sc.bg.w, sc.bg.h)); } catch {} }
    else { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(...rett(r.x, r.y, r.w, r.h)); }
    // prima la mappa, poi i segnalini (il livello nascosto non si vede)
    const ordinati = (sc.photos || []).filter(p => !p.shape && (p.layer || 'tokens') !== 'hidden').sort((a, b) => ((a.layer === 'map') - (b.layer === 'map')) * -1 || (a.z || 0) - (b.z || 0));
    for (const p of ordinati) {
      const im = await carica(resolveUrl(p));
      const [x, y, w, h] = rett(p.l, p.t, p.w, p.h);
      g.save();
      if (p.round) { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.clip(); }
      if (im) try { g.drawImage(im, x, y, w, h); } catch {}
      else { g.fillStyle = '#d9534f'; g.fillRect(x, y, w, h); }
      g.restore();
    }
    // la nebbia: piena, come la vedono i giocatori
    const f = sc.fog;
    if (f && f.on && f.cells) {
      g.fillStyle = typeof fogColore === 'function' ? fogColore() : '#000';
      for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++)
        if (f.cells[y * f.cols + x] !== '1') g.fillRect(...rett(f.x + x * f.cell, f.y + y * f.cell, f.cell + 0.5 / k, f.cell + 0.5 / k));
    }
    try {
      return await new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(), 'image/webp', 0.82));
    } catch {                                    // un'immagine di un altro sito «sporca» il canvas: niente miniatura
      return null;
    }
  }

  // ---------- salvataggio ----------
  const inLinea = () => typeof online !== 'undefined' && online;
  async function aggiorna(sc, forza) {
    if (!sc || !conduco()) return;
    const fi = firma(sc);
    if (!forza && firme.get(sc.id) === fi && mini.has(sc.id)) return;
    firme.set(sc.id, fi);
    const b = await disegna(sc);
    if (!b) return;
    const vecchia = mini.get(sc.id);
    mini.delete(sc.id);
    if (vecchia && vecchia.startsWith('blob:') && ![...mini.values()].includes(vecchia)) URL.revokeObjectURL(vecchia);   // una copia può usare la stessa
    mini.set(sc.id, URL.createObjectURL(b));
    if (inLinea()) fetch('api/miniatura?id=' + encodeURIComponent(sc.id), { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: b }).catch(() => {});
    else {
      const fr = new FileReader();
      fr.onload = () => { try { localStorage.setItem('uffa-mini-' + sc.id, fr.result); } catch {} };
      fr.readAsDataURL(b);
    }
    ridisegnaMiniature();
  }
  async function leggi(sc) {
    if (mini.has(sc.id) || !conduco()) return;
    if (inLinea()) {
      try {
        const r = await fetch('api/miniatura?id=' + encodeURIComponent(sc.id));
        if (r.ok) { mini.set(sc.id, URL.createObjectURL(await r.blob())); firme.set(sc.id, firma(sc)); ridisegnaMiniature(); return; }
      } catch {}
    } else {
      let d = null; try { d = localStorage.getItem('uffa-mini-' + sc.id); } catch {}
      if (d) { mini.set(sc.id, d); firme.set(sc.id, firma(sc)); ridisegnaMiniature(); return; }
    }
    aggiorna(sc);                                 // non c'era: la si disegna dai dati
  }
  window.miniaturaScena = id => mini.get(id) || null;

  // quando lasci una scena (o la cambi), la sua miniatura si rifà
  const primaShow = window.showScene;
  window.showScene = async function (sc) {
    const prima = cur;
    if (prima && prima !== sc && boardReady) { captureScene(); const p = prima; setTimeout(() => aggiorna(p), 50); }
    return primaShow.apply(this, arguments);
  };
  // e prima di aprire il menu, quella di adesso
  $('sceneBtn').addEventListener('click', () => {
    if (!cur || $('sceneMenu').hidden) return;
    captureScene();
    aggiorna(cur);
    for (const sc of scenes) leggi(sc);
  });

  // ---------- nel menu ----------
  function ridisegnaMiniature() {
    document.querySelectorAll('#sceneList .sceneRow, #sceneGrid .scCard').forEach(r => {
      const im = r.querySelector('.sceneMini'), u = mini.get(r.dataset.id);
      if (im && u && im.src !== u) im.src = u;
      if (im) im.classList.toggle('vuota', !u);
    });
  }
  const primaDopo = window.afterSceneUI;
  window.afterSceneUI = function () {
    const r = primaDopo && primaDopo.apply(this, arguments);
    document.querySelectorAll('#sceneList .sceneRow').forEach(row => {
      const pick = row.querySelector('.pick');
      if (!pick || pick.querySelector('.sceneMini')) return;
      const im = document.createElement('img');
      im.className = 'sceneMini vuota'; im.alt = ''; im.draggable = false;
      pick.prepend(im);
      const ic = pick.querySelector('span'); if (ic) ic.classList.add('scIcona');
      row.addEventListener('mouseenter', () => { if (!tocco()) mostraAnteprima(row); });
      row.addEventListener('mouseleave', nascondiAnteprima);
    });
    ridisegnaMiniature();
    disegnaPillola();
    if (!$('sceneGridOpen')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'sceneGridOpen'; b.textContent = tr('▦ Tutte le scene');
      b.addEventListener('click', apriGriglia);
      $('sceneNew').before(b);
    }
    $('sceneGridOpen').hidden = !conduco();
    return r;
  };

  // ---------- anteprima grande ----------
  const anteprima = document.createElement('div');
  anteprima.id = 'scenePreview'; anteprima.hidden = true;
  anteprima.innerHTML = '<img alt=""><div class="spInfo"><b></b><span></span></div>';
  document.body.appendChild(anteprima);
  function mostraAnteprima(row) {
    const sc = scenes.find(s => s.id === row.dataset.id); if (!sc) return;
    const u = mini.get(sc.id);
    anteprima.querySelector('img').src = u || '';
    anteprima.querySelector('img').hidden = !u;
    anteprima.querySelector('b').textContent = sc.name;
    const n = segnalini(sc).length;
    anteprima.querySelector('span').textContent = (n === 1 ? tr('1 segnalino') : tr('{n} segnalini', { n })) +
      (settings.publicScene === sc.id ? ' · ' + tr('la vedono i giocatori') : '');
    anteprima.hidden = false;
    const r = row.getBoundingClientRect(), w = anteprima.offsetWidth, h = anteprima.offsetHeight;
    let left = r.right + 10, top = r.top + r.height / 2 - h / 2;
    if (left + w > innerWidth - 8) left = Math.max(8, r.left - w - 10);
    top = Math.max(8, Math.min(innerHeight - h - 8, top));
    anteprima.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function nascondiAnteprima() { anteprima.hidden = true; }
  // col dito: tenendo premuto su una riga compare l'anteprima, insieme al menu
  addEventListener('contextmenu', e => {
    const row = e.target.closest && e.target.closest('#sceneList .sceneRow, #sceneGrid .scCard');
    if (row && tocco()) mostraAnteprima(row);
  }, true);
  addEventListener('pointerdown', e => { if (!anteprima.hidden && !(e.target.closest && e.target.closest('.sceneRow'))) nascondiAnteprima(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') nascondiAnteprima(); });

  // ---------- la pillola «I giocatori vedono…» ----------
  function disegnaPillola() {
    const badge = $('publicBadge'); if (!badge) return;
    let b = $('pubMostra');
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.id = 'pubMostra';
      b.textContent = tr('📌 Mostra ai giocatori');
      b.title = tr('I giocatori passano a questa scena');
      b.addEventListener('click', () => setPublicScene(cur.id));
      badge.after(b);
    }
    const pub = typeof getPublicScene === 'function' ? getPublicScene() : null;
    b.hidden = !conduco() || !pub || pub === cur;
  }

  // ---------- griglia delle scene ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'sceneGridDlg';
  dlg.innerHTML = `<div class="sgHead"><h3>Scene</h3><span class="sgHint">Trascina per cambiare l'ordine.</span><button type="button" class="btn ghost" id="sceneGridClose">Chiudi</button></div><div id="sceneGrid"></div>`;
  document.body.appendChild(dlg);
  $('sceneGridClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  function apriGriglia() {
    closeSceneMenu();
    captureScene(); aggiorna(cur);
    for (const sc of scenes) leggi(sc);
    disegnaGriglia();
    dlg.showModal();
  }
  function disegnaGriglia() {
    const G = $('sceneGrid');
    G.replaceChildren(...scenes.map(sc => {
      const c = document.createElement('div');
      c.className = 'scCard' + (sc === cur ? ' attiva' : '') + (settings.publicScene === sc.id ? ' pubblica' : '');
      c.dataset.id = sc.id;
      const im = document.createElement('img'); im.className = 'sceneMini vuota'; im.alt = ''; im.draggable = false;
      const nm = document.createElement('b'); nm.textContent = sc.name;
      const info = document.createElement('small');
      const n = segnalini(sc).length;
      info.textContent = (n === 1 ? tr('1 segnalino') : tr('{n} segnalini', { n })) + (settings.publicScene === sc.id ? ' · 👁' : '');
      const az = document.createElement('div'); az.className = 'scAz';
      const bt = (t, tit, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.title = tr(tit); b.setAttribute('aria-label', tr(tit) + ' ' + sc.name); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
      az.append(
        bt('⧉', 'Duplica', () => duplica(sc)),
        bt('📌', settings.publicScene === sc.id ? 'I giocatori la vedono già' : 'Mostra ai giocatori', () => { setPublicScene(sc.id); disegnaGriglia(); })
      );
      c.append(im, nm, info, az);
      c.addEventListener('click', () => { if (c._trascinata) return; dlg.close(); if (sc !== cur) switchScene(sc.id); });
      trascinabile(c);
      return c;
    }));
    ridisegnaMiniature();
  }
  function duplica(sc) {
    captureScene();
    const c = JSON.parse(JSON.stringify(sc));
    c.id = uid(); c.name = (sc.name + ' ' + tr('(copia)')).slice(0, 40);
    for (const p of c.photos || []) { p.id = uid(); delete p.owner; }
    scenes.splice(scenes.indexOf(sc) + 1, 0, c);
    const u = mini.get(sc.id); if (u) mini.set(c.id, u);
    renderSceneUI(); scheduleBoardSave(); disegnaGriglia();
    aggiorna(c, true);
  }
  // riordino trascinando (mouse e dito): la carta segue il puntatore, le altre si spostano
  function trascinabile(card) {
    card.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const G = $('sceneGrid'), x0 = e.clientX, y0 = e.clientY;
      let attivo = false;
      card._trascinata = false;
      const muovi = ev => {
        if (!attivo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
        if (!attivo) { attivo = true; card.classList.add('trascino'); card.setPointerCapture(e.pointerId); }
        ev.preventDefault();
        card.style.transform = `translate(${ev.clientX - x0}px, ${ev.clientY - y0}px)`;
        const sotto = [...G.children].find(o => { if (o === card) return false; const r = o.getBoundingClientRect(); return ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom; });
        G.querySelectorAll('.scCard').forEach(o => o.classList.toggle('qui', o === sotto));
        card._sotto = sotto || null;
      };
      const fine = () => {
        removeEventListener('pointermove', muovi); removeEventListener('pointerup', fine); removeEventListener('pointercancel', fine);
        card.classList.remove('trascino'); card.style.transform = '';
        G.querySelectorAll('.qui').forEach(o => o.classList.remove('qui'));
        if (!attivo) return;
        card._trascinata = true; setTimeout(() => { card._trascinata = false; }, 0);
        const sotto = card._sotto; if (!sotto) return;
        const da = scenes.findIndex(s => s.id === card.dataset.id), a = scenes.findIndex(s => s.id === sotto.dataset.id);
        if (da < 0 || a < 0) return;
        const [sc] = scenes.splice(da, 1); scenes.splice(a, 0, sc);
        renderSceneUI(); scheduleBoardSave(); disegnaGriglia();
      };
      addEventListener('pointermove', muovi); addEventListener('pointerup', fine); addEventListener('pointercancel', fine);
    });
  }

  // una scena eliminata: via anche la sua miniatura
  const primaRender = window.renderSceneUI;
  window.renderSceneUI = function () {
    const r = primaRender.apply(this, arguments);
    for (const id of [...mini.keys()]) if (!scenes.some(s => s.id === id)) {
      mini.delete(id); firme.delete(id);
      if (inLinea()) fetch('api/miniatura?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
      else try { localStorage.removeItem('uffa-mini-' + id); } catch {}
    }
    return r;
  };
})();
