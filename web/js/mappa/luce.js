// ---------- Illuminazione dinamica ----------
// Chi conduce, nel livello «Luci» (strumento 💡), disegna i muri che fermano la luce, le porte (si
// aprono e si chiudono con un tocco) e le fonti di luce; sceglie la luce dell'ambiente e cosa resta
// di quello che il party ha già visto. Anche un segnalino può portare una luce (menu del segnalino),
// e chi ha la scurovisione sulla scheda vede al buio fin dove arriva.
// Di partenza è spenta: la accende il master, scena per scena. Le zone dove vale si segnano con la
// nebbia di guerra («💡 Zona luce»); fuori dalle zone resta la nebbia di sempre.
// La visuale dei giocatori la calcola il server (luce-calcolo.js) e arriva come poligoni: qui si
// disegna soltanto. Il master, con «Anteprima», vede la stessa cosa calcolata sul suo computer.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const C = window.LUCE_CALCOLO;
  const NS = 'http://www.w3.org/2000/svg';
  const conduco = () => typeof can !== 'function' || can('revealFog');
  const nuovoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stato = { modo: 'muro', r: 4, rf: 4, col: '#ffd27a', anteprima: false, catena: null, presa: null, cursore: null };

  /** I dati della luce della scena di adesso (creati se servono). */
  function luceDi(crea) {
    if (!cur) return null;
    if (!cur.luce && crea) cur.luce = { on: false, ambiente: 'buio', ricordo: 'scuro', muri: [], luci: [] };
    const l = cur.luce;
    if (l) { l.muri = Array.isArray(l.muri) ? l.muri : []; l.luci = Array.isArray(l.luci) ? l.luci : []; }
    return l || null;
  }
  // caselle ↔ piedi o metri, come il righello
  const perCasella = () => (settings.unit === 'm' ? 1.5 : 5);
  const unita = () => (settings.unit === 'm' ? 'm' : 'ft');
  const cella = () => (typeof grid !== 'undefined' && grid.size > 0 ? grid.size : 50);

  // ======================= Quello che si vede: i canvas sulla mappa =======================
  const tela = document.createElement('canvas'); tela.id = 'luceCanvas';             // il buio (sopra i segnalini)
  const tinta = document.createElement('canvas'); tinta.id = 'luceTinta';            // il colore delle luci (sulla mappa)
  const segni = document.createElementNS(NS, 'svg'); segni.id = 'luceSegni';        // muri, porte, luci (per chi conduce)
  segni.setAttribute('overflow', 'visible');
  const aggancia = () => {
    if (tela.parentNode !== world) world.appendChild(tela);
    if (segni.parentNode !== world) world.appendChild(segni);
    if (tinta.parentNode !== stage) stage.appendChild(tinta);
  };
  aggancia();
  const aiuto = document.createElement('canvas');                                    // per una visuale alla volta

  const zonaAttiva = f => !!(f && f.zona && f.zona.indexOf('1') >= 0);
  /** La vista da disegnare: per i giocatori quella del server, per chi conduce solo in anteprima. */
  function vistaOra() {
    const l = cur && cur.luce;
    if (!l || !l.on) return null;
    if (!conduco()) return cur.vista || null;
    return stato.anteprima ? vistaLocale() : null;
  }
  /** La stessa vista del server, calcolata qui (per l'anteprima di chi conduce). */
  function vistaLocale() {
    const l = C.pulisci(luceDi(false));
    if (!l) return null;
    const b = rectOf(board), cs = cella(), occhi = [], luciT = [];
    for (const p of world.querySelectorAll('.photo')) {
      if ((p.dataset.layer || 'tokens') !== 'tokens' || p._shape) continue;
      const r = rectOf(p), x = r.x + r.w / 2, y = r.y + r.h / 2;
      const lt = luceSegnalino(p);
      if (lt && (lt.r > 0 || lt.rf > 0)) luciT.push({ x, y, r: lt.r, rf: lt.rf, col: lt.col || '#ffd27a' });
      if (delParty(p)) {
        const sh = p.dataset.sheet && sheets.find(s => s.id === p.dataset.sheet);
        occhi.push({ x, y, scuro: p.dataset.scuro != null ? +p.dataset.scuro || 0 : C.scurovisione(sh && sh.f, settings.unit) });
      }
    }
    const v = C.vista(l, b, cs, occhi, luciT);
    v.ricordo = l.ricordo;
    return v;
  }
  function delParty(p) {
    if (p.dataset.party === '1') return true;
    if (p.dataset.party === '0') return false;
    if (p.dataset.owner) return true;
    const sh = p.dataset.sheet && sheets.find(s => s.id === p.dataset.sheet);
    return !!(sh && sh.owner);
  }
  const luceSegnalino = p => { try { return p.dataset.luce ? JSON.parse(p.dataset.luce) : null; } catch { return null; } };

  function percorso(ctx, poly) {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i += 2) i ? ctx.lineTo(poly[i], poly[i + 1]) : ctx.moveTo(poly[i], poly[i + 1]);
    ctx.closePath();
  }
  /** Una griglia (0/1) diventa un'immagine piccola: stirata con lo smussamento fa i bordi morbidi. */
  function immagineDi(cols, rows, val) {
    const c = document.createElement('canvas'); c.width = cols; c.height = rows;
    const x = c.getContext('2d'), im = x.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) if (val(i)) im.data[i * 4 + 3] = 255;
    x.putImageData(im, 0, 0);
    return c;
  }

  function disegna() {
    aggancia();
    const v = vistaOra();
    const fog = cur && cur.fog;
    if (!v) { tela.hidden = tinta.hidden = true; return; }
    const b = rectOf(board);
    if (!(b.w > 0 && b.h > 0)) { tela.hidden = tinta.hidden = true; return; }
    const k = Math.min(1.5, 2048 / Math.max(b.w, b.h));
    const W = Math.max(1, Math.ceil(b.w * k)), H = Math.max(1, Math.ceil(b.h * k));
    for (const c of [tela, tinta, aiuto]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    for (const c of [tela, tinta]) Object.assign(c.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    tela.hidden = tinta.hidden = false;
    tela.style.opacity = conduco() ? '.88' : '1';
    const T = [k, 0, 0, k, -b.x * k, -b.y * k];
    const ctx = tela.getContext('2d'), a = aiuto.getContext('2d'), ct = tinta.getContext('2d');
    const cs = cella();

    // 1. tutto buio
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(...T);
    // 2. quello che il party ha già visto: si vede, ma scuro
    if (v.visto && v.ricordo === 'scuro') {
      const g = v.visto, d = C.espandi(g.rle, g.cols * g.rows);
      const im = immagineDi(g.cols, g.rows, i => d[i]);
      // un po' sfumato (quattro copie spostate di mezzo quadretto): niente scalini sul bordo
      a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1; a.clearRect(0, 0, W, H);
      a.setTransform(...T); a.imageSmoothingEnabled = true; a.globalAlpha = 0.3;
      for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) a.drawImage(im, g.x + dx * g.q, g.y + dy * g.q, g.cols * g.q, g.rows * g.q);
      a.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.66;
      ctx.drawImage(aiuto, 0, 0);
      ctx.globalAlpha = 1; ctx.setTransform(...T);
    }
    // 3. per ogni segnalino del party: quello che vede adesso (luce, penombra, luci, scurovisione)
    for (const o of v.occhi) {
      a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, W, H);
      a.setTransform(...T);
      if (v.amb === 'luce' || v.amb === 'penombra') { a.fillStyle = v.amb === 'luce' ? '#fff' : 'rgba(255,255,255,.62)'; percorso(a, o.poly); a.fill(); }
      for (const l of v.luci) {
        const R = l.r + l.rf; if (!(R > 0)) continue;
        a.save(); percorso(a, l.poly); a.clip();
        const g = a.createRadialGradient(l.x, l.y, 0, l.x, l.y, R), q = l.r / R, fine = Math.max(q, 1 - Math.min(0.5, cs * 0.6 / R));
        if (l.r > 0) { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(Math.max(0, q - 0.04), 'rgba(255,255,255,1)'); }
        else g.addColorStop(0, 'rgba(255,255,255,.62)');
        g.addColorStop(Math.min(1, q + 0.04), 'rgba(255,255,255,.62)');
        g.addColorStop(fine, 'rgba(255,255,255,.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        a.fillStyle = g; a.fillRect(l.x - R, l.y - R, R * 2, R * 2);
        a.restore();
      }
      if (o.scuro > 0) {                               // scurovisione: al buio si vede, ma come in penombra
        const g = a.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.scuro);
        g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.85, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        a.fillStyle = g; a.fillRect(o.x - o.scuro, o.y - o.scuro, o.scuro * 2, o.scuro * 2);
      }
      {                                                // il proprio segnalino si vede sempre
        const r = cs * 0.75, g = a.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
        g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(0.6, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        a.fillStyle = g; a.fillRect(o.x - r, o.y - r, r * 2, r * 2);
      }
      a.globalCompositeOperation = 'destination-in'; a.fillStyle = '#fff'; percorso(a, o.poly); a.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(aiuto, 0, 0);
      ctx.setTransform(...T);
    }
    // 4. il colore delle luci, solo dove il party vede
    ct.setTransform(1, 0, 0, 1, 0, 0); ct.globalCompositeOperation = 'source-over'; ct.clearRect(0, 0, W, H); ct.setTransform(...T);
    for (const l of v.luci) {
      const R = l.r + l.rf; if (!(R > 0) || /^#fff/i.test(l.col)) continue;
      ct.save(); percorso(ct, l.poly); ct.clip();
      const g = ct.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
      g.addColorStop(0, l.col + 'b0'); g.addColorStop(0.7, l.col + '55'); g.addColorStop(1, l.col + '00');
      ct.fillStyle = g; ct.fillRect(l.x - R, l.y - R, R * 2, R * 2);
      ct.restore();
    }
    if (v.occhi.length) {
      ct.globalCompositeOperation = 'destination-in'; ct.fillStyle = '#fff'; ct.beginPath();
      for (const o of v.occhi) for (let i = 0; i < o.poly.length; i += 2) i ? ct.lineTo(o.poly[i], o.poly[i + 1]) : ct.moveTo(o.poly[i], o.poly[i + 1]);
      ct.fill('nonzero');
    }
    // 5. fuori dalle zone segnate nella nebbia la luce dinamica non c'è (lì c'è la nebbia di sempre)
    if (zonaAttiva(fog)) {
      const im = immagineDi(fog.cols, fog.rows, i => fog.zona[i] === '1');
      for (const x of [ctx, ct]) {
        x.globalCompositeOperation = 'destination-in'; x.imageSmoothingEnabled = true;
        x.drawImage(im, fog.x, fog.y, fog.cols * fog.cell, fog.rows * fog.cell);
      }
      // la parte del rettangolo fuori dalla griglia della nebbia: niente buio
    }
    ctx.globalCompositeOperation = ct.globalCompositeOperation = 'source-over';
  }

  // ======================= I segni per chi conduce: muri, porte e luci =======================
  function disegnaSegni() {
    aggancia();
    const l = luceDi(false), io = conduco();
    const nelLivello = io && typeof layer !== 'undefined' && layer === 'luce';
    segni.classList.toggle('modifica', nelLivello);
    // le porte: chi conduce le vede tutte; un giocatore solo quelle che gli manda il server (quelle che vede)
    const porte = io ? (l && (l.on || l.solidi) ? l.muri.filter(w => w.porta) : []) : ((l && l.porte) || []);
    if (!nelLivello && !porte.length) { segni.replaceChildren(); segni.hidden = true; return; }
    segni.hidden = false;
    const s = typeof view !== 'undefined' ? view.s : 1, px = v => v / s;           // spessori costanti a schermo
    let h = '';
    if (nelLivello) {
      for (const w of l.muri) {
        if (w.porta) continue;
        h += `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="lMuro" stroke-width="${px(4)}"/>`;
      }
      for (const w of l.muri) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) h += `<circle cx="${x}" cy="${y}" r="${px(4)}" class="lPunto"/>`;
      for (const x of l.luci) {
        const cs = cella(), R1 = x.r * cs, R2 = (x.r + x.rf) * cs;
        h += `<circle cx="${x.x}" cy="${x.y}" r="${R2}" class="lAlone" stroke-width="${px(1.5)}" style="--c:${x.col}"/>`;
        if (R1 > 0) h += `<circle cx="${x.x}" cy="${x.y}" r="${R1}" class="lAlone forte" stroke-width="${px(1.5)}" style="--c:${x.col}"/>`;
        h += `<circle cx="${x.x}" cy="${x.y}" r="${px(11)}" class="lFonte" stroke-width="${px(2)}" style="--c:${x.col}"/>`;
      }
      const c = stato.catena, p = stato.cursore;
      if (c && p) h += `<line x1="${c.x}" y1="${c.y}" x2="${p.x}" y2="${p.y}" class="lAnteprima ${stato.modo === 'porta' ? 'porta' : ''}" stroke-width="${px(3)}" stroke-dasharray="${px(8)} ${px(6)}"/>`;
    }
    // le porte: si vedono (e si aprono) anche fuori dal livello
    for (const w of porte) {
      h += `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" class="lPortaL ${w.aperta ? 'aperta' : ''}" stroke-width="${px(5)}"${w.aperta ? ` stroke-dasharray="${px(6)} ${px(6)}"` : ''}/>`;
      const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      h += `<g class="lPorta" data-id="${w.id}" transform="translate(${mx} ${my}) scale(${px(1)})"><title>${tr(w.aperta ? 'Porta aperta: tocca per chiuderla' : 'Porta chiusa: tocca per aprirla')}</title>
        <circle r="13" class="${w.aperta ? 'aperta' : ''}"/><text y="5" text-anchor="middle">${w.aperta ? '◫' : '▮'}</text></g>`;
    }
    segni.innerHTML = h;
  }
  segni.addEventListener('pointerdown', e => {
    const g = e.target.closest('.lPorta'); if (!g) return;
    e.stopPropagation(); e.preventDefault();
    const l = luceDi(false), id = g.dataset.id, rete = typeof NET !== 'undefined' && NET.on && typeof intent === 'function';
    if (!conduco()) {                                  // un giocatore chiede al server, che controlla che la veda davvero
      const w = l && (l.porte || []).find(x => x.id === id);
      if (w && rete) { w.aperta = !w.aperta; disegnaSegni(); intent('luce.porta', { scene: cur.id, id, aperta: w.aperta }); }
      return;
    }
    const w = l && l.muri.find(x => x.id === id);
    if (!w) return;
    w.aperta = !w.aperta;
    if (rete) intent('luce.porta', { scene: cur.id, id, aperta: w.aperta });
    cambiata();
  });

  // ======================= Disegnare nel livello «Luci» =======================
  window.luceAttiva = () => conduco() && typeof layer !== 'undefined' && layer === 'luce';
  const nelMondo = e => ({ x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s });
  /** Il punto si aggancia a un estremo di un muro vicino, se no (con la griglia agganciata o vicino) a un incrocio della griglia. */
  function agganciaPunto(p, e) {
    const l = luceDi(true), soglia = 12 / view.s;
    let best = null, d0 = soglia;
    for (const w of l.muri) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      const d = Math.hypot(x - p.x, y - p.y); if (d < d0) { d0 = d; best = { x, y }; }
    }
    if (best) return best;
    if (e && e.altKey) return p;
    const b = rectOf(board), cs = cella();
    const gx = b.x + Math.round((p.x - b.x) / cs) * cs, gy = b.y + Math.round((p.y - b.y) / cs) * cs;
    if ((typeof grid !== 'undefined' && grid.snap) || Math.hypot(gx - p.x, gy - p.y) < 10 / view.s) return { x: gx, y: gy };
    return p;
  }
  function distSeg(p, w) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L2));
    return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy));
  }
  /** Cosa c'è sotto il dito/il mouse: una luce, l'estremo di un muro, un muro. */
  function sotto(p) {
    const l = luceDi(true), s = view.s;
    for (const x of l.luci) if (Math.hypot(x.x - p.x, x.y - p.y) * s < 16) return { luce: x };
    const punti = [];
    for (const w of l.muri) for (const k of [1, 2]) if (Math.hypot(w['x' + k] - p.x, w['y' + k] - p.y) * s < 12) punti.push({ w, k });
    if (punti.length) return { punti };
    let best = null, d0 = 10 / s;
    for (const w of l.muri) { const d = distSeg(p, w); if (d < d0) { d0 = d; best = w; } }
    return best ? { muro: best } : null;
  }
  function fineCatena() { stato.catena = null; disegnaSegni(); }

  viewport.addEventListener('pointerdown', e => {
    if (!luceAttiva() || e.button !== 0 || e.target.closest('.lPorta')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const l = luceDi(true), p0 = nelMondo(e);
    if (stato.modo === 'muro' || stato.modo === 'porta') {
      const p = agganciaPunto(p0, e);
      if (!stato.catena) { stato.catena = p; stato.cursore = p; disegnaSegni(); return; }
      const a = stato.catena;
      if (Math.hypot(p.x - a.x, p.y - a.y) * view.s < 4) { fineCatena(); return; }      // due tocchi sullo stesso punto: fine
      l.muri.push({ id: nuovoId(), x1: a.x, y1: a.y, x2: p.x, y2: p.y, porta: stato.modo === 'porta', aperta: false });
      stato.catena = stato.modo === 'porta' ? null : p;
      cambiata();
      return;
    }
    if (stato.modo === 'luce') {
      const q = sotto(p0);
      if (q && q.luce) { stato.presa = { luce: q.luce, id: e.pointerId }; viewport.setPointerCapture(e.pointerId); return; }
      const p = typeof grid !== 'undefined' && grid.snap && typeof cellCenter === 'function' ? cellCenter(p0.x, p0.y) : p0;
      l.luci.push({ id: nuovoId(), x: p.x, y: p.y, r: stato.r, rf: stato.rf, col: stato.col });
      cambiata();
      return;
    }
    if (stato.modo === 'gomma') {
      const q = sotto(p0);
      if (q && q.luce) l.luci = l.luci.filter(x => x !== q.luce);
      else if (q && q.punti) { const via = new Set(q.punti.map(x => x.w)); l.muri = l.muri.filter(w => !via.has(w)); }
      else if (q && q.muro) l.muri = l.muri.filter(w => w !== q.muro);
      else return;
      cambiata();
      return;
    }
    if (stato.modo === 'sposta') {
      const q = sotto(p0);
      if (!q) return;
      stato.presa = { ...q, id: e.pointerId, da: p0, orig: q.muro ? { ...q.muro } : null };
      viewport.setPointerCapture(e.pointerId);
    }
  }, true);
  viewport.addEventListener('pointermove', e => {
    if (!luceAttiva()) return;
    const p0 = nelMondo(e);
    if (stato.catena) { stato.cursore = agganciaPunto(p0, e); disegnaSegni(); }
    const g = stato.presa;
    if (!g || g.id !== e.pointerId) return;
    e.stopImmediatePropagation();
    if (g.luce) { g.luce.x = p0.x; g.luce.y = p0.y; }
    else if (g.punti) { const p = agganciaPunto(p0, e); for (const { w, k } of g.punti) { w['x' + k] = p.x; w['y' + k] = p.y; } }
    else if (g.muro) { const dx = p0.x - g.da.x, dy = p0.y - g.da.y; Object.assign(g.muro, { x1: g.orig.x1 + dx, y1: g.orig.y1 + dy, x2: g.orig.x2 + dx, y2: g.orig.y2 + dy }); }
    disegnaSegni(); if (stato.anteprima) disegna();
  }, true);
  const lascia = e => {
    if (!stato.presa || stato.presa.id !== e.pointerId) return;
    stato.presa = null; cambiata();
  };
  viewport.addEventListener('pointerup', lascia, true);
  viewport.addEventListener('pointercancel', lascia, true);
  viewport.addEventListener('dblclick', e => { if (luceAttiva() && stato.catena) { e.stopImmediatePropagation(); fineCatena(); } }, true);
  addEventListener('keydown', e => {
    if (!luceAttiva() || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if ((e.key === 'Escape' || e.key === 'Enter') && stato.catena) { e.preventDefault(); fineCatena(); }
  });

  /** Qualcosa è cambiato: si ridisegna e si salva (col server acceso, il salvataggio lo manda anche ai giocatori). */
  function cambiata() {
    disegnaSegni(); disegna(); sincronizza();
    if (typeof fogApply === 'function') fogApply();
    scheduleBoardSave();
  }

  // ======================= Lo strumento nel menu =======================
  const ICONA = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
  const box = mk('div', 'tool glass', `<button class="tgrip" type="button" aria-label="${tr('Luci e muri')}" title="${tr('Luci e muri')}">${ICONA}</button>
    <div class="tbody" inert>
      <label class="trow"><input id="luceOn" type="checkbox"> ${tr('Illuminazione dinamica in questa scena')}</label>
      <div class="trow lRiga"><span>${tr('Ambiente')}</span><span class="lSeg" id="luceAmb">
        <button type="button" data-v="luce">☀ ${tr('Luce')}</button><button type="button" data-v="penombra">⛅ ${tr('Penombra')}</button><button type="button" data-v="buio">🌑 ${tr('Buio')}</button></span></div>
      <div class="trow lRiga"><span>${tr('Già visto')}</span><span class="lSeg" id="luceRic">
        <button type="button" data-v="scuro" title="${tr('Quello che il party ha già visto resta, scuro e senza i segnalini degli altri')}">${tr('Resta, scuro')}</button><button type="button" data-v="nero" title="${tr('Si vede solo quello che il party vede adesso')}">${tr('Torna nero')}</button></span></div>
      <label class="trow"><input id="luceCond" type="checkbox"> ${tr('Visione condivisa (tutti vedono quello che vede il party)')}</label>
      <label class="trow"><input id="luceSolidi" type="checkbox"> ${tr('I muri non si attraversano (i giocatori non ci passano)')}</label>
      <label class="trow"><input id="luceVel" type="checkbox"> ${tr('Nelle scene di battaglia il movimento dei giocatori è limitato dalla Velocità della scheda')}</label>
      <div class="trow lModi" id="luceModi">
        <button type="button" data-m="muro" title="${tr('Un clic per ogni angolo; doppio clic, Invio o di nuovo sullo stesso punto per finire')}">🧱 ${tr('Muro')}</button>
        <button type="button" data-m="porta" title="${tr('Due clic: dove comincia e dove finisce la porta')}">🚪 ${tr('Porta')}</button>
        <button type="button" data-m="luce" title="${tr('Un clic per mettere una luce; trascina una luce per spostarla')}">💡 ${tr('Luce')}</button>
        <button type="button" data-m="sposta" title="${tr('Trascina un muro, un suo estremo o una luce')}">✋ ${tr('Sposta')}</button>
        <button type="button" data-m="gomma" title="${tr('Tocca un muro, una porta o una luce per toglierli')}">🧽 ${tr('Gomma')}</button>
      </div>
      <p class="tnote" id="luceTip"></p>
      <div id="luceNuova">
        <label class="trow">${tr('Luce intensa')} <input id="luceR" type="number" min="0" max="200" step="5"> <span class="lU"></span></label>
        <label class="trow">${tr('Luce fioca oltre')} <input id="luceRf" type="number" min="0" max="200" step="5"> <span class="lU"></span></label>
        <label class="trow">${tr('Colore')} <input id="luceCol" type="color"></label>
      </div>
      <label class="trow"><input id="luceAnte" type="checkbox"> ${tr('Anteprima: come la vede il party')}</label>
      <div class="trow"><button id="luceDim" type="button">${tr('Dimentica il già visto')}</button><button id="luceFine" type="button">${tr('Fine muro')}</button></div>
      <p class="tnote">${tr('Le zone dove vale si segnano con la nebbia di guerra («💡 Zona luce»): se non ne segni nessuna vale su tutta la mappa. Luce e scurovisione dei segnalini: menu del segnalino.')}</p>
    </div>`);
  box.id = 'luceBox';
  document.body.appendChild(box);
  const $l = id => document.getElementById(id);
  const TIP = {
    muro: 'Un clic per ogni angolo del muro. Doppio clic, Invio o un altro clic sullo stesso punto per finire. Gli estremi si agganciano ai muri vicini e agli incroci della griglia (Alt: no).',
    porta: 'Due clic: dove comincia e dove finisce la porta. Poi un tocco sul simbolo la apre o la chiude, anche dagli altri livelli.',
    luce: 'Un clic dove vuoi la luce (con le misure qui sotto). Trascina una luce per spostarla.',
    sposta: 'Trascina un estremo (si spostano insieme tutti i muri che ci arrivano), un muro intero o una luce.',
    gomma: 'Tocca un muro, una porta o una luce per toglierli.'
  };
  function sincronizza() {
    const l = luceDi(false);
    $l('luceOn').checked = !!(l && l.on);
    $l('luceCond').checked = !(l && l.condivisa === false);
    $l('luceSolidi').checked = !!(l && l.solidi);
    $l('luceVel').checked = !(l && l.velocita === false);
    box.querySelectorAll('#luceAmb button').forEach(b => b.classList.toggle('on', b.dataset.v === ((l && l.ambiente) || 'buio')));
    box.querySelectorAll('#luceRic button').forEach(b => b.classList.toggle('on', b.dataset.v === ((l && l.ricordo) || 'scuro')));
    box.querySelectorAll('#luceModi button').forEach(b => b.classList.toggle('on', b.dataset.m === stato.modo));
    $l('luceTip').textContent = tr(TIP[stato.modo] || '');
    $l('luceNuova').hidden = stato.modo !== 'luce';
    $l('luceFine').hidden = !(stato.modo === 'muro' || stato.modo === 'porta');
    if (document.activeElement !== $l('luceR')) $l('luceR').value = +(stato.r * perCasella()).toFixed(1);
    if (document.activeElement !== $l('luceRf')) $l('luceRf').value = +(stato.rf * perCasella()).toFixed(1);
    $l('luceR').step = $l('luceRf').step = perCasella();
    $l('luceCol').value = stato.col;
    box.querySelectorAll('.lU').forEach(s => { s.textContent = unita(); });
    $l('luceAnte').checked = stato.anteprima;
    box.classList.toggle('toolOn', luceAttiva());
  }
  $l('luceOn').addEventListener('input', e => { luceDi(true).on = e.target.checked; cambiata(); });
  $l('luceCond').addEventListener('input', e => { luceDi(true).condivisa = e.target.checked; cambiata(); });
  $l('luceSolidi').addEventListener('input', e => { luceDi(true).solidi = e.target.checked; cambiata(); });
  $l('luceVel').addEventListener('input', e => { luceDi(true).velocita = e.target.checked; cambiata(); });
  $l('luceAmb').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { luceDi(true).ambiente = b.dataset.v; cambiata(); } });
  $l('luceRic').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { luceDi(true).ricordo = b.dataset.v; cambiata(); } });
  $l('luceModi').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    stato.modo = b.dataset.m; stato.catena = null;
    if (typeof layer !== 'undefined' && layer !== 'luce') setLayer('luce');
    sincronizza(); disegnaSegni();
  });
  $l('luceR').addEventListener('input', e => { stato.r = Math.max(0, +e.target.value || 0) / perCasella(); });
  $l('luceRf').addEventListener('input', e => { stato.rf = Math.max(0, +e.target.value || 0) / perCasella(); });
  $l('luceCol').addEventListener('input', e => { stato.col = e.target.value; });
  $l('luceAnte').addEventListener('input', e => { stato.anteprima = e.target.checked; disegna(); });
  $l('luceFine').addEventListener('click', fineCatena);
  $l('luceDim').addEventListener('click', () => {
    if (!cur) return;
    if (typeof NET !== 'undefined' && NET.on && typeof intent === 'function') intent('luce.dimentica', { scene: cur.id });
    if (typeof netSay === 'function') netSay(tr('Il party ha dimenticato quello che aveva visto in questa scena.'));
  });
  box.querySelector('.tgrip').addEventListener('click', () => {
    const open = !box.classList.contains('open');
    toggleOpen(box, open);
    if (open) { if (typeof setPen === 'function') setPen(false); if (layer !== 'luce') setLayer('luce'); }
    sincronizza();
  });
  registerTool('luce', box, box.querySelector('.tgrip'), 'Luci e muri');

  // ======================= Il livello «Luci» =======================
  if (typeof setLayer === 'function') {
    const prima = setLayer;
    setLayer = function (l) {                                         // eslint-disable-line no-global-assign
      if (l === 'luce' && !conduco()) l = 'tokens';
      prima.call(this, l);
      viewport.classList.toggle('layer-luce', l === 'luce');
      if (l !== 'luce') stato.catena = null;
      disegnaSegni(); sincronizza();
      if (typeof fogApply === 'function') fogApply();
    };
    const b = document.querySelector('#layerSwitch [data-layer="luce"]');
    if (b) { b.replaceWith(b.cloneNode(true)); document.querySelector('#layerSwitch [data-layer="luce"]').addEventListener('click', () => setLayer('luce')); }
  }

  // ======================= Il menu del segnalino (solo chi conduce) =======================
  if (typeof tokenMenu === 'function') {
    const prima = tokenMenu;
    tokenMenu = function (el) {                                      // eslint-disable-line no-global-assign
      const items = prima.apply(this, arguments);
      if (!conduco() || el._shape || (el.dataset.layer || 'tokens') !== 'tokens') return items;
      const pc = perCasella(), u = unita(), lt = luceSegnalino(el);
      const metti = v => { if (v) el.dataset.luce = JSON.stringify(v); else delete el.dataset.luce; cambiata(); };
      const tipi = [['Candela', 1, 1, '#ffb347'], ['Torcia', 4, 4, '#ffb347'], ['Lanterna', 6, 6, '#ffd27a'], ['Luce (incantesimo)', 4, 4, '#ffffff']];
      const sh = el.dataset.sheet && sheets.find(s => s.id === el.dataset.sheet), scSch = C.scurovisione(sh && sh.f, settings.unit);
      const scuro = el.dataset.scuro;
      const party = delParty(el);
      const voce = {
        label: '💡 ' + tr('Luce e visione'), items: [
          { label: (!lt ? '✓ ' : '') + tr('Nessuna luce'), fn: () => metti(null) },
          ...tipi.map(([n, r, rf, col]) => ({ label: (lt && lt.r === r && lt.rf === rf ? '✓ ' : '') + `${tr(n)} (${r * pc}/${(r + rf) * pc} ${u})`, fn: () => metti({ r, rf, col }) })),
          { label: tr('Luce su misura…'), fn: () => {
            const v = prompt(tr('Luce intensa e fioca oltre, in') + ' ' + u + ' (' + tr('es.') + ' 20 20)', lt ? `${lt.r * pc} ${lt.rf * pc}` : `${4 * pc} ${4 * pc}`);
            if (v == null) return;
            const [a, b] = String(v).split(/[\s,;/]+/).map(x => Math.max(0, parseFloat(String(x).replace(',', '.')) || 0));
            metti(a || b ? { r: (a || 0) / pc, rf: (b || 0) / pc, col: (lt && lt.col) || '#ffd27a' } : null);
          } },
          '-',
          { label: (party ? '✓ ' : '') + tr('Fa parte del party (vede e scopre la mappa)'), fn: () => { el.dataset.party = party ? '0' : '1'; cambiata(); } },
          { label: tr('Scurovisione'), items: [
            { label: (scuro == null ? '✓ ' : '') + tr('Dalla scheda') + (scSch ? ` (${+(scSch * pc).toFixed(1)} ${u})` : ` (${tr('nessuna')})`), fn: () => { delete el.dataset.scuro; cambiata(); } },
            ...[0, 12, 24].map(c => ({ label: (scuro != null && +scuro === c ? '✓ ' : '') + (c ? `${c * pc} ${u}` : tr('Nessuna')), fn: () => { el.dataset.scuro = String(c); cambiata(); } })),
            { label: (scuro != null && ![0, 12, 24].includes(+scuro) ? '✓ ' : '') + tr('Su misura…'), fn: () => {
              const v = prompt(tr('Scurovisione: per esempio 60 ft, 18 m, no'), scuro != null ? `${+(+scuro * pc).toFixed(1)} ${u}` : '');
              if (v == null) return;
              const r = C.leggiDistanza(v, settings.unit);
              if (!r.ok) { alert(tr('Non capisco: scrivi per esempio 60 ft')); return; }
              el.dataset.scuro = String(+r.caselle.toFixed(2)); cambiata();
            } }
          ] }
        ]
      };
      const i = items.lastIndexOf('-');
      items.splice(i >= 0 ? i : items.length, 0, voce);
      return items;
    };
  }

  // dai dati salvati (o arrivati dal server) al segnalino, e ritorno
  if (typeof window.fxDaDati === 'function') {
    const prima = window.fxDaDati;
    window.fxDaDati = function (el, p) {
      prima.apply(this, arguments);
      if (p.luce && typeof p.luce === 'object') el.dataset.luce = JSON.stringify({ r: +p.luce.r || 0, rf: +p.luce.rf || 0, col: p.luce.col }); else delete el.dataset.luce;
      if (p.party === true) el.dataset.party = '1'; else if (p.party === false) el.dataset.party = '0'; else delete el.dataset.party;
      if (p.scuro != null && Number.isFinite(+p.scuro)) el.dataset.scuro = String(+p.scuro); else delete el.dataset.scuro;
    };
  }
  window.luceDatiSegnalino = p => ({
    luce: luceSegnalino(p) || undefined,
    party: p.dataset.party === '1' ? true : p.dataset.party === '0' ? false : undefined,
    scuro: p.dataset.scuro != null ? +p.dataset.scuro : undefined
  });

  // ======================= Quando ridisegnare =======================
  let att = 0;
  const presto = () => { if (att) return; att = requestAnimationFrame(() => { att = 0; disegna(); disegnaSegni(); }); };
  if (typeof showScene === 'function') {
    const prima = showScene;
    showScene = async function () {                                 // eslint-disable-line no-global-assign
      const r = await prima.apply(this, arguments);
      stato.catena = null; aggancia(); disegna(); disegnaSegni(); sincronizza();
      return r;
    };
  }
  if (typeof scheduleBoardSave === 'function') {
    const prima = scheduleBoardSave;
    scheduleBoardSave = function () { const r = prima.apply(this, arguments); if (stato.anteprima || luceAttiva()) presto(); return r; };   // eslint-disable-line no-global-assign
  }
  if (typeof applyView === 'function') {
    const prima = applyView;
    applyView = function () { const r = prima.apply(this, arguments); if (!segni.hidden) presto(); return r; };   // eslint-disable-line no-global-assign
  }
  if (typeof afterBoardLoad === 'function') {
    const prima = afterBoardLoad;
    afterBoardLoad = function () { const r = prima.apply(this, arguments); disegna(); disegnaSegni(); sincronizza(); return r; };   // eslint-disable-line no-global-assign
  }
  window.luceRidisegna = () => { disegna(); disegnaSegni(); };
  sincronizza();
})();
