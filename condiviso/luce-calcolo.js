// ---------- Illuminazione dinamica: i conti (gli stessi sul server e nel browser del master) ----------
// La scena ha  sc.luce = { on, ambiente: 'luce'|'penombra'|'buio', ricordo: 'scuro'|'nero',
//                          muri: [{ id, x1, y1, x2, y2, porta, aperta }], luci: [{ id, x, y, r, rf, col }] }
// Le distanze delle luci (r = luce intensa, rf = luce fioca oltre quella intensa) sono in caselle;
// tutto il resto in unità della mappa. La visuale è un poligono esatto (i suoi vertici, [x, y, x, y…]):
// la calcola il server e la manda ai giocatori, che non ricevono mai muri e luci della scena.
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.LUCE_CALCOLO = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-4;
  const num = (v, d = 0) => { const k = +v; return Number.isFinite(k) ? k : d; };
  const arrot = v => Math.round(v * 10) / 10;

  /** Quello che arriva dal master, ripulito: numeri veri, colori validi, liste non infinite. */
  function pulisci(l) {
    if (!l || typeof l !== 'object') return null;
    const s = (v, n) => String(v == null ? '' : v).slice(0, n);
    const col = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : '#ffd27a';
    return {
      on: !!l.on,
      ambiente: ['luce', 'penombra', 'buio'].includes(l.ambiente) ? l.ambiente : 'buio',
      ricordo: l.ricordo === 'nero' ? 'nero' : 'scuro',
      solidi: !!l.solidi,                          // i muri (e le porte chiuse) fermano i segnalini dei giocatori
      condivisa: l.condivisa !== false,            // tutti vedono quello che vede il party (o ognuno il suo)
      muri: (Array.isArray(l.muri) ? l.muri : []).slice(0, 4000).map(w => ({
        id: s(w.id, 40), x1: num(w.x1), y1: num(w.y1), x2: num(w.x2), y2: num(w.y2), porta: !!w.porta, aperta: !!w.aperta
      })).filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.5),
      luci: (Array.isArray(l.luci) ? l.luci : []).slice(0, 500).map(x => ({
        id: s(x.id, 40), x: num(x.x), y: num(x.y), r: Math.max(0, Math.min(200, num(x.r, 4))), rf: Math.max(0, Math.min(200, num(x.rf, 4))), col: col(x.col)
      }))
    };
  }

  /** I segmenti che fermano la vista: i muri, le porte chiuse e il bordo della mappa. */
  function segmenti(luce, b) {
    const out = [];
    for (const w of (luce && luce.muri) || []) if (!(w.porta && w.aperta)) out.push([w.x1, w.y1, w.x2, w.y2]);
    if (b) {
      const { x, y, w, h } = b;
      out.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
    }
    return out;
  }

  /** Dove il raggio (ox,oy)+t·(dx,dy) incontra il segmento: t, oppure Infinity. */
  function incrocio(ox, oy, dx, dy, s) {
    const sx = s[2] - s[0], sy = s[3] - s[1];
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-12) return Infinity;
    const qx = s[0] - ox, qy = s[1] - oy;
    const t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
    return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
  }

  function piuVicino(segs, ox, oy, dx, dy) {
    let t = Infinity;
    for (const s of segs) { const k = incrocio(ox, oy, dx, dy, s); if (k < t) t = k; }
    return t;
  }
  // ---------- Indice a blocchi dei muri (per le mappe con tanti muri) ----------
  // Una griglia di blocchi quadrati: ogni muro sta nei blocchi che il suo rettangolo tocca. Un raggio
  // attraversa i blocchi in ordine (come si traccia una linea su una griglia) e si ferma al primo blocco
  // dove ha già trovato il muro più vicino. L'indice si fa una volta per elenco di muri.
  const indici = new WeakMap();
  function indiceDi(segs) {
    let ix = indici.get(segs);
    if (ix) return ix;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of segs) { x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]); }
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0);
    const lato = Math.max(24, Math.min(600, Math.sqrt(W * H * 3 / segs.length)));
    const cols = Math.max(1, Math.ceil(W / lato) + 1), rows = Math.max(1, Math.ceil(H / lato) + 1);
    const celle = Array.from({ length: cols * rows }, () => []);
    segs.forEach((s, i) => {
      const c0 = Math.floor((Math.min(s[0], s[2]) - x0) / lato), c1 = Math.floor((Math.max(s[0], s[2]) - x0) / lato);
      const r0 = Math.floor((Math.min(s[1], s[3]) - y0) / lato), r1 = Math.floor((Math.max(s[1], s[3]) - y0) / lato);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) celle[r * cols + c].push(i);
    });
    ix = { segs, x0, y0, lato, cols, rows, celle, visto: new Uint32Array(segs.length), giro: 0 };
    indici.set(segs, ix);
    return ix;
  }
  function primoIncrocio(ix, ox, oy, dx, dy) {
    const { segs, x0, y0, lato, cols, rows, celle, visto } = ix;
    const giro = ++ix.giro;
    if (giro > 4e9) { visto.fill(0); ix.giro = 1; }
    // il punto di partenza dentro la griglia (se è fuori, si entra dal bordo)
    let t0 = 0;
    const fx = (ox - x0) / lato, fy = (oy - y0) / lato;
    if (fx < 0 || fy < 0 || fx >= cols || fy >= rows) {
      let te = 0, tu = Infinity;
      for (const [o, d, n] of [[fx, dx / lato, cols], [fy, dy / lato, rows]]) {
        if (Math.abs(d) < 1e-12) { if (o < 0 || o >= n) return Infinity; continue; }
        const a = (0 - o) / d, b = (n - o) / d;
        te = Math.max(te, Math.min(a, b)); tu = Math.min(tu, Math.max(a, b));
      }
      if (te > tu) return Infinity;
      t0 = te + 1e-9;
    }
    let cx = Math.floor(fx + dx / lato * t0), cy = Math.floor(fy + dy / lato * t0);
    cx = Math.min(cols - 1, Math.max(0, cx)); cy = Math.min(rows - 1, Math.max(0, cy));
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const ddx = Math.abs(dx) < 1e-12 ? Infinity : lato / Math.abs(dx), ddy = Math.abs(dy) < 1e-12 ? Infinity : lato / Math.abs(dy);
    let tx = Math.abs(dx) < 1e-12 ? Infinity : ((cx + (dx > 0 ? 1 : 0)) * lato + x0 - ox) / dx;
    let ty = Math.abs(dy) < 1e-12 ? Infinity : ((cy + (dy > 0 ? 1 : 0)) * lato + y0 - oy) / dy;
    let migliore = Infinity;
    for (let passi = 0; passi < cols + rows + 2; passi++) {
      for (const i of celle[cy * cols + cx]) {
        if (visto[i] === giro) continue;
        visto[i] = giro;
        const k = incrocio(ox, oy, dx, dy, segs[i]);
        if (k < migliore) migliore = k;
      }
      const uscita = Math.min(tx, ty);
      if (migliore <= uscita) return migliore;
      if (tx < ty) { cx += sx; tx += ddx; } else { cy += sy; ty += ddy; }
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) break;
    }
    return migliore;
  }

  /**
   * Il poligono di quello che si vede da (ox, oy): un raggio verso ogni estremo di ogni segmento
   * (e appena a destra e a sinistra), fermato dal segmento più vicino. Con «raggio» si guarda solo
   * dentro un quadrato attorno al punto (per le luci: tutto quello che c'è oltre non conta).
   */
  function visuale(ox, oy, segs, raggio) {
    let usati = segs;
    if (raggio > 0) {
      const x0 = ox - raggio, x1 = ox + raggio, y0 = oy - raggio, y1 = oy + raggio;
      usati = segs.filter(s => !(Math.max(s[0], s[2]) < x0 || Math.min(s[0], s[2]) > x1 || Math.max(s[1], s[3]) < y0 || Math.min(s[1], s[3]) > y1));
      usati.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
    }
    // con tanti muri, ogni raggio guarda solo i blocchi che attraversa (indice a griglia), non tutti i muri
    const indice = usati.length > 48 ? indiceDi(usati) : null;
    const angoli = [];
    for (const s of usati) for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
      const a = Math.atan2(py - oy, px - ox);
      angoli.push(a - EPS, a, a + EPS);
    }
    angoli.sort((a, b) => a - b);
    const pts = [];
    let ultimo = null;
    for (const a of angoli) {
      if (ultimo !== null && a - ultimo < 1e-7) continue;
      ultimo = a;
      const dx = Math.cos(a), dy = Math.sin(a);
      const t = indice ? primoIncrocio(indice, ox, oy, dx, dy) : piuVicino(usati, ox, oy, dx, dy);
      if (t === Infinity) continue;
      pts.push(arrot(ox + dx * t), arrot(oy + dy * t));
    }
    return semplifica(pts);
  }
  /** Toglie i punti che stanno in linea con i vicini (sono tanti, e non servono). */
  function semplifica(q) {
    const p = [];                                   // prima via i doppioni uno dopo l'altro
    for (let i = 0; i < q.length; i += 2) {
      const k = p.length;
      if (k && Math.abs(p[k - 2] - q[i]) < 0.15 && Math.abs(p[k - 1] - q[i + 1]) < 0.15) continue;
      p.push(q[i], q[i + 1]);
    }
    while (p.length > 6 && Math.abs(p[0] - p[p.length - 2]) < 0.15 && Math.abs(p[1] - p[p.length - 1]) < 0.15) p.length -= 2;
    const n = p.length / 2;
    if (n < 4) return p;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n;
      const ax = p[a * 2], ay = p[a * 2 + 1], bx = p[i * 2], by = p[i * 2 + 1], cx = p[c * 2], cy = p[c * 2 + 1];
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(cross) > 0.05 * Math.hypot(cx - ax, cy - ay)) out.push(bx, by);
    }
    return out.length >= 6 ? out : p;
  }

  function dentro(poly, x, y) {
    let on = false;
    for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) {
      const xi = poly[i * 2], yi = poly[i * 2 + 1], xj = poly[j * 2], yj = poly[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) on = !on;
    }
    return on;
  }

  /**
   * Una distanza scritta come viene: «60», «60 ft», «18 m», «scurovisione 120», «12 caselle», «no».
   * Senza unità vale quella della campagna (unita: 'ft' o 'm', come il righello). → { caselle, ok }
   * (ok = false se non si capisce: chi scrive vede un avviso sotto il campo).
   */
  function leggiDistanza(testo, unita) {
    const t = String(testo == null ? '' : testo).trim().toLowerCase();
    if (!t || /^(no|nessuna|niente|none|-|—|0)$/.test(t)) return { caselle: 0, ok: true };
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(m\b|mt\b|metri|metres?|meters?|ft\b|feet|foot|piedi|'|caselle|quadretti|squares?)?/);
    if (!m) return { caselle: 0, ok: false };
    const v = parseFloat(m[1].replace(',', '.'));
    const u = m[2] ? (/^(m|mt|metri|metre|meter)/.test(m[2]) ? 'm' : /^(caselle|quadretti|square)/.test(m[2]) ? 'c' : 'ft') : (unita === 'm' ? 'm' : 'ft');
    const caselle = u === 'c' ? v : u === 'm' ? v / 1.5 : v / 5;
    return { caselle: Math.max(0, Math.min(200, caselle)), ok: true };
  }

  /**
   * Scurovisione dalla scheda, in caselle (0 = niente). Prima il campo «Scurovisione» (scuroV), poi le
   * parole «scurovisione / darkvision» in Visione, tratti e sensi (anche i mostri importati), poi la
   * vecchia casella (= 60 ft).
   */
  function scurovisione(f, unita) {
    if (!f || typeof f !== 'object') return 0;
    if (f.scuroV != null && String(f.scuroV).trim() !== '') return leggiDistanza(f.scuroV, unita).caselle;
    const testi = [f.vision, f.racial, f.traits, f.features, f.sensi].filter(Boolean).map(String);
    for (const t of testi) {
      const m = t.match(/(?:scurovisione|darkvision|vista\s+nel\s+buio)[^\d\n]{0,12}(\d+(?:[.,]\d+)?\s*(?:m\b|metri|ft\b|feet|piedi|')?)/i);
      if (m) return leggiDistanza(m[1], /m\b|metri/i.test(m[1]) ? 'm' : 'ft').caselle;
    }
    return f.darkv === true || f.darkv === 'true' || f.darkv === 1 || f.darkv === '1' ? 12 : 0;     // 60 ft
  }

  /**
   * La vista del party: per ogni segnalino del party (occhi = [{x, y, scuro}], scuro in caselle)
   * il suo poligono; per ogni luce (anche quelle portate dai segnalini) il suo poligono, ma solo se
   * può illuminare qualcosa che il party vede.
   */
  function vista(luce, board, cella, occhi, luciSegnalini) {
    const segs = segmenti(luce, board);
    const cs = cella > 0 ? cella : 50;
    const out = { amb: luce.ambiente, occhi: [], luci: [] };
    for (const o of occhi) {
      const poly = visuale(o.x, o.y, segs);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]); }
      out.occhi.push({ x: arrot(o.x), y: arrot(o.y), scuro: arrot((o.scuro || 0) * cs), poly, box: [x0, y0, x1, y1] });
    }
    const tutte = [...(luce.luci || []), ...(luciSegnalini || [])];
    for (const l of tutte) {
      const R = (l.r + l.rf) * cs;
      if (!(R > 0)) continue;
      const utile = out.occhi.some(o => l.x + R >= o.box[0] && l.x - R <= o.box[2] && l.y + R >= o.box[1] && l.y - R <= o.box[3]);
      if (!utile) continue;
      out.luci.push({ x: arrot(l.x), y: arrot(l.y), r: arrot(l.r * cs), rf: arrot(l.rf * cs), col: l.col, poly: visuale(l.x, l.y, segs, R + 1) });
    }
    return out;
  }

  /** Un punto della mappa si vede? (sta nella visuale di qualcuno, ed è illuminato o c'è la scurovisione) */
  function visibile(v, x, y) {
    for (const o of v.occhi) {
      if (!dentro(o.poly, x, y)) continue;
      if (v.amb !== 'buio') return true;
      if (o.scuro > 0 && Math.hypot(x - o.x, y - o.y) <= o.scuro) return true;
      for (const l of v.luci) if (Math.hypot(x - l.x, y - l.y) <= l.r + l.rf && dentro(l.poly, x, y)) return true;
    }
    return false;
  }

  // ---------- Il «già visto»: una griglia fine sopra la mappa (4 quadretti per casella) ----------
  /** Colora nella griglia (Uint8Array) i quadretti il cui centro sta nel poligono: per righe, senza provare punto per punto. */
  function riempi(g, poly, val, circ) {
    const { x, y, q, cols, rows, d } = g, n = poly.length / 2;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { y0 = Math.min(y0, poly[i * 2 + 1]); y1 = Math.max(y1, poly[i * 2 + 1]); }
    const r0 = Math.max(0, Math.floor((y0 - y) / q)), r1 = Math.min(rows - 1, Math.ceil((y1 - y) / q));
    for (let r = r0; r <= r1; r++) {
      const cy = y + (r + 0.5) * q, xs = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i * 2 + 1], yj = poly[j * 2 + 1];
        if ((yi > cy) !== (yj > cy)) xs.push(poly[i * 2] + (cy - yi) * (poly[j * 2] - poly[i * 2]) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x) / q - 0.5)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x) / q - 0.5));
        for (let c = c0; c <= c1; c++) {
          if (circ && Math.hypot(x + (c + 0.5) * q - circ[0], cy - circ[1]) > circ[2]) continue;
          d[r * cols + c] = val;
        }
      }
    }
  }
  function griglia(board, cella) {
    const q = Math.max(4, (cella > 0 ? cella : 50) / 4);
    const cols = Math.max(1, Math.min(1200, Math.ceil(board.w / q))), rows = Math.max(1, Math.min(1200, Math.ceil(board.h / q)));
    return { x: board.x, y: board.y, q, cols, rows, d: new Uint8Array(cols * rows) };
  }
  /** Aggiunge al «già visto» quello che il party vede adesso. */
  function segnaVisto(g, v) {
    const t = griglia({ x: g.x, y: g.y, w: g.cols * g.q, h: g.rows * g.q }, g.q * 4);
    for (const o of v.occhi) {
      if (v.amb !== 'buio') { riempi(t, o.poly, 1); continue; }
      const tmp = { ...t, d: new Uint8Array(t.d.length) };
      if (o.scuro > 0) riempi(tmp, o.poly, 1, [o.x, o.y, o.scuro]);
      for (const l of v.luci) riempi(tmp, l.poly, 1, [l.x, l.y, l.r + l.rf]);
      // solo quello che sta anche nella visuale di questo segnalino
      const vis = { ...t, d: new Uint8Array(t.d.length) };
      riempi(vis, o.poly, 1);
      for (let i = 0; i < t.d.length; i++) if (tmp.d[i] && vis.d[i]) t.d[i] = 1;
    }
    let cambiato = false;
    for (let i = 0; i < g.d.length; i++) if (t.d[i] && !g.d[i]) { g.d[i] = 1; cambiato = true; }
    return cambiato;
  }
  /** Griglia → testo corto: le lunghezze delle file di 0 e di 1, alternate, partendo dagli 0. */
  function comprimi(d) {
    const out = []; let cur = 0, n = 0;
    for (let i = 0; i < d.length; i++) { const v = d[i] ? 1 : 0; if (v === cur) n++; else { out.push(n); cur = v; n = 1; } }
    out.push(n);
    return out.join('.');
  }
  function espandi(s, len) {
    const d = new Uint8Array(len); let i = 0, v = 0;
    for (const k of String(s || '').split('.')) { const n = +k || 0; if (v) d.fill(1, i, Math.min(len, i + n)); i += n; v ^= 1; }
    return d;
  }

  /** Il tratto da (ax,ay) a (bx,by) attraversa un muro o una porta chiusa? */
  /** Il tratto da (ax,ay) a (bx,by) taglia il muro w? */
  function taglia(w, ax, ay, bx, by) {
    const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
    const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
    return t > 1e-6 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Il percorso più breve sulla griglia da (ax,ay) a (bx,by), girando attorno a muri e porte chiuse (le porte
   * aperte si passano). Si va anche in diagonale, e ogni passo vale una casella (la regola base del 5e).
   * max: oltre quante caselle non serve cercare. → { caselle, punti: [x, y, …] } oppure null (non ci si arriva).
   */
  /** Il rettangolo su cui contare le caselle: quello di gioco, allargato perché le caselle partano
   *  dall'origine della griglia (spostata di grid.ox, grid.oy per combaciare con quella della mappa). */
  function rettangoloGriglia(board, grid) {
    const b = board || { x: 0, y: 0, w: 1000, h: 1000 }, cs = grid && +grid.size > 0 ? +grid.size : 50;
    const ox = ((((grid && +grid.ox) || 0) % cs) + cs) % cs, oy = ((((grid && +grid.oy) || 0) % cs) + cs) % cs;
    if (!ox && !oy) return b;
    return { x: b.x + ox - (ox ? cs : 0), y: b.y + oy - (oy ? cs : 0), w: b.w + (ox ? cs : 0), h: b.h + (oy ? cs : 0) };
  }
  function percorso(luce, board, cella, ax, ay, bx, by, max) {
    const cs = cella > 0 ? cella : 50, lim = max >= 0 ? max : Infinity;
    const muri = ((luce && luce.muri) || []).filter(w => !(w.porta && w.aperta));
    const b = board || { x: 0, y: 0, w: 1000, h: 1000 };
    const cols = Math.max(1, Math.ceil(b.w / cs)), rows = Math.max(1, Math.ceil(b.h / cs));
    const fuori = (x, y) => x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h;
    const cheb = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / cs;
    if (fuori(ax, ay) || fuori(bx, by) || cols * rows > 250000) {          // fuori dalla griglia: la linea retta
      // (anche qui conta il massimo: altrimenti bastava portarlo fuori dalla mappa per andare lontano quanto si vuole)
      return muri.some(w => taglia(w, ax, ay, bx, by)) || Math.round(cheb) > lim ? null : { caselle: Math.round(cheb), punti: [ax, ay, bx, by] };
    }
    const cella0 = (x, y) => [Math.min(cols - 1, Math.floor((x - b.x) / cs)), Math.min(rows - 1, Math.floor((y - b.y) / cs))];
    const [c0, r0] = cella0(ax, ay), [c1, r1] = cella0(bx, by);
    if (c0 === c1 && r0 === r1) return muri.some(w => taglia(w, ax, ay, bx, by)) ? null : { caselle: 0, punti: [ax, ay, bx, by] };
    // i muri divisi per casella (ognuno in quelle che il suo rettangolo tocca)
    const perCella = new Map();
    for (const w of muri) {
      const x0 = Math.floor((Math.min(w.x1, w.x2) - b.x) / cs) - 1, x1 = Math.floor((Math.max(w.x1, w.x2) - b.x) / cs) + 1;
      const y0 = Math.floor((Math.min(w.y1, w.y2) - b.y) / cs) - 1, y1 = Math.floor((Math.max(w.y1, w.y2) - b.y) / cs) + 1;
      for (let r = Math.max(0, y0); r <= Math.min(rows - 1, y1); r++) for (let c = Math.max(0, x0); c <= Math.min(cols - 1, x1); c++) {
        const k = r * cols + c; (perCella.get(k) || perCella.set(k, []).get(k)).push(w);
      }
    }
    const centro = (c, r) => [b.x + (c + 0.5) * cs, b.y + (r + 0.5) * cs];
    const bloccato = (c, r, c2, r2, pa, pb) => {
      const [x1, y1] = pa || centro(c, r), [x2, y2] = pb || centro(c2, r2);
      for (const k of new Set([r * cols + c, r2 * cols + c2, r * cols + c2, r2 * cols + c])) for (const w of perCella.get(k) || []) if (taglia(w, x1, y1, x2, y2)) return true;
      return false;
    };
    // dal punto vero di partenza al centro della sua casella (e così all'arrivo): anche lì non si passa un muro
    if (bloccato(c0, r0, c0, r0, [ax, ay], centro(c0, r0)) || bloccato(c1, r1, c1, r1, centro(c1, r1), [bx, by])) return null;
    const N = cols * rows, g = new Float64Array(N).fill(Infinity), da = new Int32Array(N).fill(-1), chiuso = new Uint8Array(N);
    const h = k => Math.max(Math.abs((k % cols) - c1), Math.abs(Math.floor(k / cols) - r1));
    const coda = [];                                                        // mucchio binario su f = g + h
    const metti = (k, f) => { coda.push([f, k]); let i = coda.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (coda[p][0] <= coda[i][0]) break; [coda[p], coda[i]] = [coda[i], coda[p]]; i = p; } };
    const togli = () => { const top = coda[0], last = coda.pop(); if (coda.length) { coda[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < coda.length && coda[l][0] < coda[m][0]) m = l; if (r < coda.length && coda[r][0] < coda[m][0]) m = r; if (m === i) break; [coda[m], coda[i]] = [coda[i], coda[m]]; i = m; } } return top; };
    const s0 = r0 * cols + c0, s1 = r1 * cols + c1;
    g[s0] = 0; metti(s0, h(s0));
    while (coda.length) {
      const [, k] = togli();
      if (chiuso[k]) continue;
      chiuso[k] = 1;
      if (k === s1) break;
      if (g[k] + h(k) > lim) break;                                         // oltre il massimo: inutile continuare
      const c = k % cols, r = Math.floor(k / cols);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const cn = c + dx, rn = r + dy;
        if (cn < 0 || rn < 0 || cn >= cols || rn >= rows) continue;
        const kn = rn * cols + cn;
        if (chiuso[kn] || g[k] + 1 >= g[kn]) continue;
        if (bloccato(c, r, cn, rn)) continue;
        g[kn] = g[k] + 1; da[kn] = k; metti(kn, g[kn] + h(kn));
      }
    }
    if (!Number.isFinite(g[s1]) || g[s1] > lim) return null;
    const punti = [bx, by];
    for (let k = da[s1]; k >= 0 && k !== s0; k = da[k]) { const [x, y] = centro(k % cols, Math.floor(k / cols)); punti.unshift(x, y); }
    punti.unshift(ax, ay);
    return { caselle: g[s1], punti };
  }

  function attraversa(luce, ax, ay, bx, by) {
    for (const w of (luce && luce.muri) || []) {
      if (w.porta && w.aperta) continue;
      const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
      if (Math.abs(d) < 1e-9) continue;
      const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
      const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
      if (t > 1e-6 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }

  return { leggiDistanza, percorso, rettangoloGriglia, attraversa, pulisci, segmenti, visuale, dentro, scurovisione, vista, visibile, griglia, riempi, segnaVisto, comprimi, espandi };
});
