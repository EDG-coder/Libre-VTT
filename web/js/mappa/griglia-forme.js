// ---------- Forma delle caselle della griglia ----------
// La griglia può essere fatta di quadrati (com'era), triangoli, esagoni, e delle sole altre forme che
// riempiono il piano senza buchi: pentagoni «del Cairo», ottagoni con quadratini, dodecagoni con
// triangolini. Tutto può ruotare (grid.rot, in gradi) attorno all'origine della griglia.
//   grid.forma  3 | 4 | 5 | 6 | 8 | 12   (manca = 4, i quadrati)
//   grid.rot    gradi, 0-359             (manca = 0)
// Ogni forma è un reticolo (due vettori a, b) e un «motivo» di caselle che si ripete. Le misure sono in
// caselle (1 = grid.size): nella casella principale sta un cerchio largo una casella, così un
// segnalino «grande una casella» ci sta dentro. Le caselle piccole (i quadratini fra gli ottagoni, i triangolini fra i
// dodecagoni) si disegnano ma i segnalini non ci si agganciano.
// I quadrati non ruotati restano quelli di sempre (disegnati con lo sfondo CSS, aggancio agli angoli).
(function () {
  'use strict';
  const R3 = Math.sqrt(3);
  const poli = (cx, cy, r, n, a0) => Array.from({ length: n }, (_, k) => {
    const a = (a0 + k * 360 / n) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const centro = v => [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
  const cella = (v, main = true) => ({ c: centro(v), v, main });

  const FORME = {
    4: () => ({ a: [1, 0], b: [0, 1], celle: [cella([[0, 0], [1, 0], [1, 1], [0, 1]])] }),
    // triangoli: due per ogni cella del reticolo (uno in su, uno in giù); lato √3, così un cerchio
    // largo una casella ci sta dentro
    3: () => {
      const L = R3, h = L * R3 / 2;
      return { a: [L, 0], b: [L / 2, h], celle: [cella([[0, 0], [L, 0], [L / 2, h]]), cella([[L, 0], [1.5 * L, h], [L / 2, h]])] };
    },
    // esagoni con i lati piatti in alto e in basso, larghi 1 da lato a lato
    6: () => {
      const t = 1 / R3;
      return { a: [1.5 * t, 0.5], b: [0, 1], celle: [cella(poli(t, 0.5, t, 6, 0))] };
    },
    // pentagoni del Cairo: sui lati di un reticolo quadrato (passo u); al centro di ogni quadrato un
    // segmentino, orizzontale e verticale a scacchiera. d = lato corto, così quattro lati sono uguali.
    5: () => {
      const u = Math.SQRT2, d = (-2 + Math.sqrt(28)) / 6, e = d / 2;
      const seg = (i, j) => ((i + j) % 2 === 0
        ? [[i + 0.5 - e, j + 0.5], [i + 0.5 + e, j + 0.5]]            // orizzontale: da sinistra a destra
        : [[i + 0.5, j + 0.5 - e], [i + 0.5, j + 0.5 + e]]);          // verticale: dall'alto in basso
      const out = [];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        // lato orizzontale da (i,j) a (i+1,j): il quadrato sopra (j-1) e quello sotto (j)
        const sopra = seg(i, j - 1), sotto = seg(i, j), oSopra = (i + j - 1 + 2) % 2 === 0;
        if (oSopra) out.push([[i, j], ...sopra, [i + 1, j], sotto[0]]);            // sopra orizzontale, sotto verticale (punta in alto)
        else out.push([[i, j], sopra[1], [i + 1, j], ...sotto.slice().reverse()]);
        // lato verticale da (i,j) a (i,j+1): il quadrato a sinistra (i-1) e quello a destra (i)
        const sx = seg(i - 1, j), dx = seg(i, j), oSx = (i - 1 + j + 2) % 2 === 0;
        if (!oSx) out.push([[i, j], ...sx, [i, j + 1], dx[0]]);                    // a sinistra verticale, a destra orizzontale
        else out.push([[i, j], sx[1], [i, j + 1], ...dx.slice().reverse()]);
      }
      return { a: [2 * u, 0], b: [0, 2 * u], celle: out.map(v => cella(v.map(p => [p[0] * u, p[1] * u]))) };
    },
    // ottagoni larghi 1 e, negli spazi, quadratini girati di 45°
    8: () => {
      const t = Math.SQRT2 - 1, r = t / (2 * Math.sin(Math.PI / 8)), q = t / Math.SQRT2;
      return { a: [1, 0], b: [0, 1], celle: [cella(poli(0.5, 0.5, r, 8, 22.5)), cella([[q, 0], [0, q], [-q, 0], [0, -q]], false)] };
    },
    // dodecagoni larghi 1 e, negli spazi, triangolini
    12: () => {
      const t = Math.tan(Math.PI / 12), r = t / (2 * Math.sin(Math.PI / 12)), rt = t / R3;
      return { a: [1, 0], b: [0.5, R3 / 2], celle: [
        cella(poli(0, 0, r, 12, 15)),
        cella(poli(0.5, R3 / 6, rt, 3, 30), false),
        cella(poli(1, R3 / 3, rt, 3, 90), false)
      ] };
    }
  };
  const FORMA_NOMI = [[4, 'Quadrati'], [6, 'Esagoni'], [3, 'Triangoli'], [5, 'Pentagoni (Cairo)'], [8, 'Ottagoni e quadratini'], [12, 'Dodecagoni e triangolini']];
  const cache = new Map();
  const formaDi = g => FORME[+g.forma] ? +g.forma : 4;
  const rotDi = g => { const r = +g.rot; return Number.isFinite(r) ? ((r % 360) + 360) % 360 : 0; };
  /** I quadrati di sempre: niente forma, niente rotazione. */
  const semplice = g => formaDi(g) === 4 && rotDi(g) === 0;

  /** Il motivo della griglia in coordinate del mondo (origine, rotazione e misura comprese). */
  function motivo(g, o) {
    const f = formaDi(g), rot = rotDi(g), s = +g.size || 50;
    const k = f + '|' + rot + '|' + s;
    let m = cache.get(k);
    if (!m) {
      const base = FORME[f](), ca = Math.cos(rot * Math.PI / 180), sa = Math.sin(rot * Math.PI / 180);
      const T = p => [s * (p[0] * ca - p[1] * sa), s * (p[0] * sa + p[1] * ca)];
      m = { a: T(base.a), b: T(base.b), celle: base.celle.map(c => ({ c: T(c.c), v: c.v.map(T), main: c.main })) };
      // per passare da un punto alle coordinate del reticolo
      const det = m.a[0] * m.b[1] - m.a[1] * m.b[0];
      m.inv = [m.b[1] / det, -m.b[0] / det, -m.a[1] / det, m.a[0] / det];
      if (cache.size > 40) cache.clear();
      cache.set(k, m);
    }
    return { ...m, o };
  }
  const nelReticolo = (m, x, y) => {
    const dx = x - m.o.x, dy = y - m.o.y;
    return [m.inv[0] * dx + m.inv[1] * dy, m.inv[2] * dx + m.inv[3] * dy];
  };
  function dentro(v, x, y) {
    let si = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      if ((v[i][1] > y) !== (v[j][1] > y) && x < (v[j][0] - v[i][0]) * (y - v[i][1]) / (v[j][1] - v[i][1]) + v[i][0]) si = !si;
    }
    return si;
  }
  /** La casella (principale) sotto il punto: { x, y } del suo centro. Se il punto cade in una casella
   *  piccola, la principale più vicina. */
  function centroCella(g, o, x, y) {
    const m = motivo(g, o), [fi, fj] = nelReticolo(m, x, y), i0 = Math.floor(fi), j0 = Math.floor(fj);
    let meglio = null, dm = Infinity;
    for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) {
      const ox = m.o.x + i * m.a[0] + j * m.b[0], oy = m.o.y + i * m.a[1] + j * m.b[1];
      for (const c of m.celle) {
        if (!c.main) continue;
        const cx = ox + c.c[0], cy = oy + c.c[1];
        if (dentro(c.v, x - ox, y - oy)) return { x: cx, y: cy };
        const dd = (cx - x) ** 2 + (cy - y) ** 2;
        if (dd < dm) { dm = dd; meglio = { x: cx, y: cy }; }
      }
    }
    return meglio || { x, y };
  }
  /** Disegna le linee della griglia su un canvas che copre lo schermo da (sx, sy), largo w × h. */
  function disegna(ctx, g, o, view, sx, sy, w, h, colore, scuro) {
    const m = motivo(g, o);
    // i quattro angoli dello schermo nel reticolo: si disegnano solo le celle che servono
    const ang = [[sx, sy], [sx + w, sy], [sx, sy + h], [sx + w, sy + h]].map(([px, py]) => nelReticolo(m, (px - view.x) / view.s, (py - view.y) / view.s));
    const imin = Math.floor(Math.min(...ang.map(p => p[0]))) - 1, imax = Math.ceil(Math.max(...ang.map(p => p[0]))) + 1;
    const jmin = Math.floor(Math.min(...ang.map(p => p[1]))) - 1, jmax = Math.ceil(Math.max(...ang.map(p => p[1]))) + 1;
    if ((imax - imin) * (jmax - jmin) * m.celle.length > 60000) return false;     // caselle microscopiche: non si disegna
    ctx.beginPath();
    for (let i = imin; i <= imax; i++) for (let j = jmin; j <= jmax; j++) {
      const ox = m.o.x + i * m.a[0] + j * m.b[0], oy = m.o.y + i * m.a[1] + j * m.b[1];
      for (const c of m.celle) {
        c.v.forEach((p, k) => {
          const X = (ox + p[0]) * view.s + view.x - sx, Y = (oy + p[1]) * view.s + view.y - sy;
          if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        });
        ctx.closePath();
      }
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = scuro; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = colore; ctx.lineWidth = 1; ctx.stroke();
    return true;
  }
  window.GRIGLIA_FORME = { semplice, centroCella, disegna, motivo, formaDi, rotDi, FORMA_NOMI, FORME };
})();
