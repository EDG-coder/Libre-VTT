// ---------- Aree degli incantesimi: cono, linea, cerchio, cubo ----------
// Uno strumento del menu a sinistra, accanto al righello. Si trascina dal punto d'origine (di solito
// l'angolo o il centro della casella di chi lancia) verso dove va l'incantesimo: il cono si apre di
// circa 53° (largo, in fondo, quanto è lungo), la linea è larga una casella, il cerchio ha il raggio
// trascinato, il cubo parte con una faccia sull'origine. La misura segue l'unità della mappa (5 ft,
// 1,5 m o 1 miglio per casella) e va a caselle intere. Se si scrive una
// misura fissa (es. 15 ft per un soffio), il trascinamento sceglie solo la direzione.
// Le caselle con il centro dentro l'area si colorano (solo con la griglia a quadrati non ruotata); il cono
// invece prende anche le caselle colpite solo in parte, parte dal centro di una casella (quella di chi
// lancia, che non è colpita) e si misura da lì.
// L'area resta sulla mappa finché non se ne fa un'altra, si preme Esc o «Togli l'area»; gli altri al
// tavolo la vedono col nome di chi l'ha messa (messaggio «area», come il righello: non si salva).
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const FORME = [
    ['cono', 'Cono', '<path d="M4 12l16-7v14z"/>'],
    ['linea', 'Linea', '<rect x="3" y="9.5" width="18" height="5" rx="1"/>'],
    ['cerchio', 'Cerchio', '<circle cx="12" cy="12" r="8"/>'],
    ['cubo', 'Cubo', '<rect x="5" y="5" width="14" height="14" rx="1"/>']
  ];
  const NOME_MISURA = { cono: 'Lunghezza', linea: 'Lunghezza', cerchio: 'Raggio', cubo: 'Lato' };
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const pref = Object.assign({ forma: 'cono', fissa: '' }, ls.get('libre-aree') || {});
  if (!FORME.some(f => f[0] === pref.forma)) pref.forma = 'cono';

  // ---------- il pannello ----------
  const box = mk('div', 'tool glass',
    `<button class="tgrip" type="button" aria-label="Aree degli incantesimi" title="Aree degli incantesimi: cono, linea, cerchio, cubo">${ICON('<path d="M4 12l16-7"/><path d="M4 12l16 7"/><path d="M20 5a14 14 0 010 14"/><circle cx="4" cy="12" r="1.5"/>')}</button>
     <div class="tbody" inert>
       <div class="trow" id="areaForme"></div>
       <label class="trow"><span id="areaNomeMisura">Lunghezza</span> <input id="areaFissa" type="number" min="0" step="any" placeholder="trascina" inputmode="decimal"> <span id="areaUnita"></span></label>
       <div class="tnote">Trascina dal punto d'origine. Con una misura scritta, il trascinamento sceglie solo la direzione. Maiusc: direzioni a scatti di 15°. Esc toglie l'area.</div>
       <div class="trow"><button id="areaTogli" type="button">Togli l'area</button></div>
     </div>`);
  box.id = 'areaBox'; document.body.appendChild(box);
  const grip = box.querySelector('.tgrip'), $a = id => box.querySelector('#' + id);
  for (const [id, nome, ic] of FORME) {
    const b = mk('button', '', `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${ic}</svg><span>${nome}</span>`);
    b.type = 'button'; b.dataset.forma = id;
    b.addEventListener('click', () => { pref.forma = id; salvaPref(); sincronizza(); });
    $a('areaForme').appendChild(b);
  }
  $a('areaFissa').value = pref.fissa;
  $a('areaFissa').addEventListener('input', e => { pref.fissa = e.target.value; salvaPref(); });
  $a('areaFissa').addEventListener('keydown', e => e.stopPropagation());
  $a('areaTogli').addEventListener('click', () => togli());
  function salvaPref() { ls.set('libre-aree', { forma: pref.forma, fissa: pref.fissa }); }
  function sincronizza() {
    for (const b of $a('areaForme').children) b.classList.toggle('on', b.dataset.forma === pref.forma);
    $a('areaNomeMisura').textContent = NOME_MISURA[pref.forma];       // (le traduzioni le fa la pagina da sé)
    const c = unitaCasella();
    $a('areaUnita').textContent = c.u === 'mi' ? 'miglia' : c.u;
  }
  $('unitSel').addEventListener('change', () => { sincronizza(); disegna(); });

  let attivo = false;
  function accendi(on) {
    attivo = on;
    box.classList.toggle('toolOn', on); viewport.classList.toggle('area-on', on);
    if (box.classList.contains('open') !== on) toggleOpen(box, on);
    if (on) { setRuler(false); if (penPanel) setPen(false); if (typeof select === 'function') select(null); sincronizza(); }
    else if (area && area.id !== -1) { area.id = -1; }
  }
  grip.addEventListener('click', () => accendi(!attivo));
  // un solo strumento alla volta: penna e righello spengono le aree
  var _setRuler = setRuler, _setPen = setPen;
  window.setRuler = setRuler = function (on) { if (on && attivo) accendi(false); return _setRuler.apply(this, arguments); };
  window.setPen = setPen = function (on) { if (on && attivo) accendi(false); return _setPen.apply(this, arguments); };
  window.areaAttiva = () => attivo;

  const strumento = registerTool('aree', box, grip, 'Aree degli incantesimi');
  const righello = TOOLS.find(t => t.id === 'ruler');
  if (righello && righello.slot && righello.slot.parentNode === slotsEl) slotsEl.insertBefore(strumento.slot, righello.slot.nextSibling);   // subito sotto il righello

  // ---------- la geometria (nel mondo, in px) ----------
  // a = { forma, o: {x, y}, ang (radianti), l (px) }
  function sagoma(a) {
    const ux = Math.cos(a.ang), uy = Math.sin(a.ang), nx = -uy, ny = ux, o = a.o, l = a.l;
    const pt = (u, n) => ({ x: o.x + ux * u + nx * n, y: o.y + uy * u + ny * n });
    if (a.forma === 'cono') return [o, pt(l, l / 2), pt(l, -l / 2)];
    const w = a.forma === 'linea' ? grid.size : l;
    if (a.forma === 'linea' || a.forma === 'cubo') return [pt(0, w / 2), pt(l, w / 2), pt(l, -w / 2), pt(0, -w / 2)];
    return null;                                                  // il cerchio non è un poligono
  }
  function dentro(p, poli) {
    let s = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      const a = poli[i], b = poli[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) s = !s;
    }
    return s;
  }
  /** Il poligono convesso «poli» copre davvero una parte della casella (angolo in alto a sinistra q, lato s)?
   *  Assi separatori; la casella è ristretta del 4% per lato, così un bordo che la sfiora o passa per un suo
   *  angolo non la conta. */
  function tocca(q, s, poli) {
    const m = s * 0.04, r = [{ x: q.x + m, y: q.y + m }, { x: q.x + s - m, y: q.y + m }, { x: q.x + s - m, y: q.y + s - m }, { x: q.x + m, y: q.y + s - m }];
    const assi = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) assi.push({ x: poli[j].y - poli[i].y, y: poli[i].x - poli[j].x });
    for (const a of assi) {
      let p0 = Infinity, p1 = -Infinity, r0 = Infinity, r1 = -Infinity;
      for (const p of poli) { const v = p.x * a.x + p.y * a.y; if (v < p0) p0 = v; if (v > p1) p1 = v; }
      for (const p of r) { const v = p.x * a.x + p.y * a.y; if (v < r0) r0 = v; if (v > r1) r1 = v; }
      if (p1 <= r0 || r1 <= p0) return false;
    }
    return true;
  }
  /** Le caselle (quadrate) colpite: [{x, y}] angoli in alto a sinistra, nel mondo. Per il cono anche quelle
   *  colpite in parte (non quella da cui parte); per le altre forme quelle con il centro dentro. */
  function caselle(a) {
    if (!(grid.size > 0) || !GRIGLIA_FORME.semplice(grid)) return [];
    const poli = sagoma(a), s = grid.size, eps = s * 0.01;
    const xs = poli ? poli.map(p => p.x) : [a.o.x - a.l, a.o.x + a.l], ys = poli ? poli.map(p => p.y) : [a.o.y - a.l, a.o.y + a.l];
    const c0 = cellOf(Math.min(...xs), Math.min(...ys)), c1 = cellOf(Math.max(...xs), Math.max(...ys));
    if ((c1.i - c0.i + 1) * (c1.j - c0.j + 1) > 6000) return [];
    const out = [];
    for (let i = c0.i; i <= c1.i; i++) for (let j = c0.j; j <= c1.j; j++) {
      const q = cellPos(i, j), c = { x: q.x + s / 2, y: q.y + s / 2 };
      if (a.forma === 'cono') {
        if (Math.abs(c.x - a.o.x) < s / 2 && Math.abs(c.y - a.o.y) < s / 2) continue;   // la casella di chi lancia
        if (tocca(q, s, poli)) out.push(q);
      } else if (poli ? dentro(c, poli) : Math.hypot(c.x - a.o.x, c.y - a.o.y) <= a.l + eps) out.push(q);
    }
    return out;
  }
  const NOMI = { cono: 'Cono', linea: 'Linea', cerchio: 'Cerchio', cubo: 'Cubo' };
  /** Il disegno di un'area per l'SVG sopra la mappa (coordinate dello schermo). Con «nome» è di un altro. */
  function svgDi(a, nome) {
    const k = view.s, S = p => ({ x: p.x * k + view.x, y: p.y * k + view.y });
    const col = nome == null ? '#ff8a3d' : coloreDiNome(nome);
    let svg = '';
    const cs = caselle(a), lato = grid.size * k;
    if (cs.length) svg += `<path d="${cs.map(q => { const p = S(q); return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}h${lato.toFixed(1)}v${lato.toFixed(1)}h${(-lato).toFixed(1)}z`; }).join('')}" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-opacity=".35" stroke-width="1"/>`;
    const poli = sagoma(a), o = S(a.o);
    const forma = poli ? `<polygon points="${poli.map(S).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"`
      : `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${(a.l * k).toFixed(1)}"`;
    svg += `${forma} fill="${col}" fill-opacity=".18" stroke="#000" stroke-opacity=".5" stroke-width="5" stroke-linejoin="round"/>`;
    svg += `${forma} fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
    svg += `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="5" fill="${col}" stroke="#000" stroke-opacity=".6"/>`;
    // la scritta in fondo all'area, dalla parte della direzione
    const fine = S({ x: a.o.x + a.l * Math.cos(a.ang), y: a.o.y + a.l * Math.sin(a.ang) });
    if (a.forma === 'cerchio') svg += `<line x1="${o.x.toFixed(1)}" y1="${o.y.toFixed(1)}" x2="${fine.x.toFixed(1)}" y2="${fine.y.toFixed(1)}" stroke="${col}" stroke-width="2" stroke-dasharray="6 4"/>`;
    const celle = a.l / grid.size;
    if (nome != null) svg += `<text class="chi" x="${(fine.x + 12).toFixed(1)}" y="${(fine.y - 31).toFixed(1)}" style="fill: ${col}">${esc(nome)}</text>`;
    svg += `<text x="${(fine.x + 12).toFixed(1)}" y="${(fine.y - 12).toFixed(1)}">${tr(NOMI[a.forma])} ${misura(celle)}${cs.length ? ' · ' + tr('{n} caselle colpite', { n: cs.length }) : ''}</text>`;
    return svg;
  }

  // ---------- disegno ----------
  const tela = document.createElementNS(SVGNS, 'svg'); tela.id = 'areaSvg'; document.body.appendChild(tela);
  let area = null;                                   // la mia: { forma, o, ang, l, scene, id (puntatore, -1 = posata) }
  const altrui = new Map();                          // id di chi l'ha messa -> { by, scene, forma, o, ang, l }
  const suQuesta = a => !a.scene || !cur || a.scene === cur.id;
  function disegna() {
    let svg = '';
    for (const a of altrui.values()) if (suQuesta(a)) svg += svgDi(a, a.by);
    if (area && suQuesta(area)) svg += svgDi(area);
    tela.innerHTML = svg;
  }
  // segue la mappa quando si sposta o si ingrandisce la vista (e quando si cambia scena)
  applyView = (prev => function () { const r = prev.apply(this, arguments); if (area || altrui.size) disegna(); return r; })(applyView);
  window.applyView = applyView;

  // ---------- il puntatore ----------
  const mondo = e => ({ x: (e.clientX - view.x) / view.s, y: (e.clientY - view.y) / view.s });
  function misuraFissa() {
    const v = parseFloat(String(pref.fissa).replace(',', '.'));
    return v > 0 ? v / unitaCasella().per * grid.size : 0;
  }
  // L'origine va sull'angolo o sul centro di casella più vicino (il centro di chi lancia, o un suo angolo);
  // il cono parte sempre dal centro della casella; con le griglie non quadrate, tutto dal centro.
  function origine(w, forma) {
    if (!(grid.size > 0)) return w;
    if (forma === 'cono' || !GRIGLIA_FORME.semplice(grid)) return cellCentre(w.x, w.y);
    const o = gridOrigin(), m = grid.size / 2;
    return { x: o.x + Math.round((w.x - o.x) / m) * m, y: o.y + Math.round((w.y - o.y) / m) * m };
  }
  function aggiorna(e) {
    const p = mondo(e), dx = p.x - area.o.x, dy = p.y - area.o.y, d = Math.hypot(dx, dy);
    if (d > 2) {
      let ang = Math.atan2(dy, dx);
      if (e.shiftKey) { const passo = Math.PI / 12; ang = Math.round(ang / passo) * passo; }
      area.ang = ang;
    }
    const fissa = misuraFissa();
    if (fissa) area.l = fissa;
    else {
      area.l = Math.max(1, Math.round(d / grid.size)) * grid.size;   // le aree vanno a caselle intere (5 ft, 10 ft…)
    }
    disegna(); manda();
  }
  viewport.addEventListener('pointerdown', e => {
    if (!attivo || e.button !== 0 || (typeof rulerOn !== 'undefined' && rulerOn) || (typeof penOn !== 'undefined' && penOn)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const w = mondo(e);
    area = { forma: pref.forma, o: origine(w, pref.forma), ang: 0, l: grid.size, scene: cur && cur.id, id: e.pointerId };
    aggiorna(e);
    try { viewport.setPointerCapture(e.pointerId); } catch {}
  }, true);
  viewport.addEventListener('pointermove', e => {
    if (!area || e.pointerId !== area.id) return;
    aggiorna(e); e.stopImmediatePropagation();
  }, true);
  const lascia = e => { if (area && e.pointerId === area.id) { area.id = -1; e.stopImmediatePropagation(); manda(); } };
  viewport.addEventListener('pointerup', lascia, true);
  viewport.addEventListener('pointercancel', lascia, true);
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !area || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    togli();
  });
  function togli() { if (!area) return; area = null; disegna(); manda(true); }

  // ---------- in rete: gli altri vedono l'area col nome di chi l'ha messa ----------
  // Come il righello: al più ogni 80 ms, punti nel mondo. Un host che non conosce «area» non la riceve.
  if (typeof NET_SUBITO !== 'undefined') NET_SUBITO.add('area');
  let ultimo = 0, timer = 0, mandata = false;
  function manda(via) {
    clearTimeout(timer);
    if (typeof NET === 'undefined' || !NET.on || !(NET.sa || []).includes('area')) return;
    if (via || !area) { if (mandata) { mandata = false; intent('area', { fine: true }); } return; }
    const parti = () => {
      if (!area) return;
      ultimo = Date.now(); mandata = true;
      intent('area', { scene: area.scene || null, forma: area.forma, o: [Math.round(area.o.x), Math.round(area.o.y)], a: +area.ang.toFixed(4), l: Math.round(area.l) });
    };
    const attesa = 80 - (Date.now() - ultimo);
    if (attesa <= 0) parti(); else timer = setTimeout(parti, attesa);
  }
  window.netAreaAltrui = function (m) {
    const k = String(m.id);
    if (m.fine || !Array.isArray(m.o) || !NOMI[m.forma]) altrui.delete(k);
    else altrui.set(k, { by: String(m.by || '?'), scene: m.scene || null, forma: m.forma, o: { x: +m.o[0] || 0, y: +m.o[1] || 0 }, ang: +m.a || 0, l: Math.max(1, +m.l || 0) });
    disegna();
  };
  // quando si entra (o si rientra) al tavolo si riparte da zero
  // (al rientro: quelle degli altri le rimanda l'host, la mia la si rimanda da qui)
  window.netAreeVia = function () { altrui.clear(); mandata = false; disegna(); if (area) manda(); };

  sincronizza();
})();
