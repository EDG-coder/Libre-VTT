// ---------- Dadi 3D: l'animazione dei dadi che rotolano e si fermano sul risultato ----------
// Solo scena: il risultato lo ha già deciso il generatore di sempre (in rete il server) e arriva dentro al
// messaggio del tiro (rolls). Qui si disegnano dadi che rotolano e si fermano con la faccia giusta in vista;
// non si tira niente e non si manda niente in rete. Niente librerie: poliedri disegnati a mano su un canvas
// (proiezione ortogonale, facce piatte, un solo canvas sopra al tavolo che non prende i clic).
// d4, d6, d8, d10, d12, d20 e d100 (due d10) hanno la loro forma; gli altri dadi (d3, d7…) sono un d20 con i numeri
// che servono. Rispetta «movimento ridotto» (i dadi compaiono già fermi), è invisibile ai lettori di schermo
// (il risultato resta nella chat e nel riquadro in alto, che li leggono già) e si spegne dal vassoio dei dadi.
(function () {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const PREF = 'libre-dadi3d';
  const leggiPref = () => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } };
  const scriviPref = p => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch {} };
  const pref = Object.assign({ miei: false, altri: true }, leggiPref());

  // ---------- geometria ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /** Dai soli vertici di un solido convesso ricava le facce (i vertici sullo stesso piano), in ordine attorno al centro. */
  function facce(vs) {
    const out = [], visti = new Set();
    const n = vs.length, EPS = 1e-5;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      let nr = cross(sub(vs[j], vs[i]), sub(vs[k], vs[i]));
      if (len(nr) < 1e-9) continue;
      nr = norm(nr);
      let su = 0, sotto = 0;
      for (let q = 0; q < n; q++) { const d = dot(nr, sub(vs[q], vs[i])); if (d > EPS) su++; else if (d < -EPS) sotto++; }
      if (su && sotto) continue;
      if (su) nr = [-nr[0], -nr[1], -nr[2]];                       // la normale punta fuori
      const d0 = dot(nr, vs[i]);
      const idx = []; for (let q = 0; q < n; q++) if (Math.abs(dot(nr, vs[q]) - d0) < EPS) idx.push(q);
      const chiave = idx.join(',');
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      const c = [0, 0, 0]; for (const q of idx) { c[0] += vs[q][0]; c[1] += vs[q][1]; c[2] += vs[q][2]; }
      c[0] /= idx.length; c[1] /= idx.length; c[2] /= idx.length;
      // su = il vertice più lontano dal centro della faccia (la punta di un triangolo, la cima di un aquilone)
      let lontano = idx[0]; for (const q of idx) if (len(sub(vs[q], c)) > len(sub(vs[lontano], c)) + 1e-6) lontano = q;
      let u0 = norm(sub(vs[lontano], c));
      // un quadrato (la faccia del d6) ha il numero dritto, non sulla punta
      if (idx.length === 4 && idx.every(q => Math.abs(len(sub(vs[q], c)) - len(sub(vs[idx[0]], c))) < 1e-4)) {
        const a = vs[idx[0]], b = vs[idx.slice(1).sort((x, y) => len(sub(vs[x], a)) - len(sub(vs[y], a)))[0]];     // un vertice vicino: l'altra estremità di un lato
        const m = [(a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1], (a[2] + b[2]) / 2 - c[2]];
        if (len(m) > 1e-6) u0 = norm(m);
      }
      const r0 = cross(u0, nr);
      const ang = q => Math.atan2(dot(sub(vs[q], c), u0), dot(sub(vs[q], c), r0));
      idx.sort((a, b) => ang(a) - ang(b));
      // la faccia vista da fuori deve girare in senso antiorario nel piano (r, u)
      let inr = Infinity;
      for (let a = 0; a < idx.length; a++) {
        const p = vs[idx[a]], q = vs[idx[(a + 1) % idx.length]];
        const e = norm(sub(q, p)), w = sub(c, p);
        inr = Math.min(inr, len(sub(w, [e[0] * dot(w, e), e[1] * dot(w, e), e[2] * dot(w, e)])));
      }
      out.push({ n: nr, c, u: u0, r: r0, v: idx.map(q => vs[q]), inr });
    }
    return out;
  }
  const perm = (a, f) => { const o = []; for (const x of a) for (const y of f(x)) o.push(y); return o; };
  const segni = [-1, 1];
  const FORME = {
    4: () => [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    6: () => perm(segni, x => perm(segni, y => segni.map(z => [x, y, z]))),
    8: () => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    12: () => {
      const v = [], a = 1 / PHI;
      for (const x of segni) for (const y of segni) for (const z of segni) v.push([x, y, z]);
      for (const y of segni) for (const z of segni) { v.push([0, y * a, z * PHI]); v.push([y * a, z * PHI, 0]); v.push([z * PHI, 0, y * a]); }
      return v;
    },
    20: () => {
      const v = [];
      for (const y of segni) for (const z of segni) { v.push([0, y, z * PHI]); v.push([y, z * PHI, 0]); v.push([z * PHI, 0, y]); }
      return v;
    },
    10: () => {                                                     // trapezoedro pentagonale: 10 facce a aquilone
      const c = Math.cos(Math.PI / 5), a = 0.11, h = a * (1 + c) / (1 - c), v = [[0, 0, h], [0, 0, -h]];
      for (let k = 0; k < 10; k++) { const t = k * Math.PI / 5; v.push([Math.cos(t), Math.sin(t), k % 2 ? -a : a]); }
      return v;
    },
  };
  const cache = {};
  function forma(n) {
    if (cache[n]) return cache[n];
    const vs = FORME[n]();
    const R = Math.max(...vs.map(len));
    const fs = facce(vs.map(v => [v[0] / R, v[1] / R, v[2] / R]));
    // facce opposte (un dado ben fatto ha somme uguali sui lati opposti)
    const op = fs.map((f, i) => fs.findIndex((g, j) => j !== i && dot(f.n, g.n) < -0.999));
    return (cache[n] = { fs, op });
  }
  /** Un'etichetta per faccia; le facce opposte hanno somma costante. */
  function etichette(sagoma, valori) {
    const { fs, op } = sagoma, out = new Array(fs.length).fill(''), N = fs.length;
    let k = 0;
    for (let i = 0; i < N; i++) {
      if (out[i] !== '') continue;
      if (op[i] < 0) { out[i] = valori[i]; continue; }
      out[i] = valori[k]; out[op[i]] = valori[N - 1 - k]; k++;
    }
    return out;
  }
  const seq = (da, a) => { const o = []; for (let i = da; i <= a; i++) o.push(String(i)); return o; };

  // ---------- un dado: forma, etichette, faccia da portare davanti ----------
  const COLORI = { 4: [96, 189, 99], 6: [212, 78, 78], 8: [82, 142, 230], 10: [150, 104, 220], 12: [225, 160, 56], 20: [92, 70, 150], 100: [150, 104, 220], 0: [70, 70, 90] };
  function nuovoDado(facceN, valore) {
    let tipo = [4, 6, 8, 10, 12, 20].includes(facceN) ? facceN : (facceN === 100 ? 100 : 0);
    let sagoma, lab, bersaglio, extra = null, colore;
    const rnd = n => 1 + Math.floor(Math.random() * n);
    if (tipo === 100) {                                              // due d10: decine e unità
      const dec = Math.floor(valore / 10) % 10, uni = valore % 10;
      sagoma = forma(10);
      lab = etichette(sagoma, seq(0, 9));
      bersaglio = lab.indexOf(String(uni));
      extra = { sagoma, lab: etichette(sagoma, seq(0, 9).map(x => (x === '0' ? '00' : x + '0'))), bersaglio: null };
      extra.bersaglio = extra.lab.indexOf(dec === 0 ? '00' : dec + '0');
      colore = COLORI[100];
    } else if (tipo) {
      sagoma = forma(tipo);
      lab = etichette(sagoma, tipo === 10 ? seq(1, 10) : seq(1, tipo));
      bersaglio = lab.indexOf(String(valore));
      colore = COLORI[tipo];
    } else {                                                         // un dado che non c'è nel set: un d20 con i numeri giusti
      sagoma = forma(20);
      lab = sagoma.fs.map(() => String(rnd(Math.max(2, Math.min(facceN, 999)))));
      bersaglio = Math.floor(Math.random() * lab.length);
      lab[bersaglio] = String(valore);
      colore = COLORI[0];
    }
    if (bersaglio < 0) bersaglio = 0;
    const mk = (s, l, b, ofs) => ({ sagoma: s, lab: l, bersaglio: b, colore, ofs });
    const corpi = [mk(sagoma, lab, bersaglio, 0)];
    if (extra) corpi.push(mk(extra.sagoma, extra.lab, extra.bersaglio, 1));
    return corpi;
  }

  // ---------- matrici 3x3 ----------
  const mul = (A, B) => { const C = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
  const ap = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  function asse(a, t) {
    const [x, y, z] = a, c = Math.cos(t), s = Math.sin(t), k = 1 - c;
    return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
  }
  /** Rotazione che porta la faccia verso chi guarda, con il numero dritto. */
  const verso = f => [f.r[0], f.r[1], f.r[2], f.u[0], f.u[1], f.u[2], f.n[0], f.n[1], f.n[2]];

  // ---------- la scena ----------
  const prefersMoto = () => { try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };
  let canvas = null, ctx = null, coda = [], corrente = null, raf = 0;
  const TEMPO_VOLO = 1250, TENUTA = 1700, DISSOLVENZA = 350;

  function dimensioni() {
    const w = innerWidth, h = innerHeight;
    return { w, h, dpr: Math.min(2, devicePixelRatio || 1) };
  }
  function preparaCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'dadi3dCanvas'; canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);
    adatta();
  }
  function adatta() {
    if (!canvas) return;
    const { w, h, dpr } = dimensioni();
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  addEventListener('resize', adatta);

  /** Prepara l'animazione di un tiro: i dadi (al massimo 12), dove si fermano, da dove partono. */
  function scena(msg) {
    const { w, h } = dimensioni();
    const rolls = (msg.rolls || []).slice(0, 12);
    const drop = new Set(msg.drop || []);
    const corpi = [];
    rolls.forEach((v, i) => {
      const cs = nuovoDado(msg.sides || (msg.fc && msg.fc[i]) || indovina(Math.abs(v)), Math.abs(v));
      corpi.push({ i, cs, scartato: drop.has(i) });
    });
    const n = corpi.length;
    const S = Math.max(30, Math.min(62, Math.min(w / (Math.min(n, 4) * 3.0 + 0.5), h / 6)));   // raggio del dado in px
    const perRiga = Math.max(1, Math.min(n, Math.floor((w * 0.92) / (S * 2.6))));
    const righe = Math.ceil(n / perRiga);
    const moto = prefersMoto();
    corpi.forEach((d, k) => {
      const riga = Math.floor(k / perRiga), inRiga = Math.min(perRiga, n - riga * perRiga), col = k % perRiga;
      d.x = w / 2 + (col - (inRiga - 1) / 2) * S * 2.6;
      d.y = h * 0.42 + (riga - (righe - 1) / 2) * S * 2.5;
      d.S = S;
      d.ritardo = moto ? k * 70 + Math.random() * 60 : 0;
      d.da = { x: (Math.random() < .5 ? -1 : 1) * (w * 0.5 + S * 2) + w / 2, y: d.y - h * (0.15 + Math.random() * 0.2) };
      d.asseR = norm([Math.random() - .5, Math.random() - .5, Math.random() - .5 + 0.2]);
      d.giri = (2.2 + Math.random() * 1.6) * (Math.random() < .5 ? -1 : 1) * Math.PI * 2;
      d.rimbalzi = 2 + Math.floor(Math.random() * 2);
      d.parti = d.cs.map(c => ({ c, fin: verso(c.sagoma.fs[c.bersaglio]) }));
    });
    let fine = corpi.reduce((m, d) => Math.max(m, d.ritardo), 0) + (moto ? TEMPO_VOLO : 0), fisica = false;
    if (moto && !leggera()) { const nf = simula(corpi, S, w, h); fisica = true; fine = nf * 1000 / 60; }
    return { corpi, moto, fisica, fine, durata: fine + TENUTA + DISSOLVENZA, t0: 0, msg };
  }

  // ---------- la fisica (grafica normale): i dadi si lanciano, rimbalzano a caso e si scontrano ----------
  // Si simula tutto prima (cerchi che si urtano, attrito, rimbalzi in altezza con piccoli calci casuali) e poi si
  // riproduce il percorso. Il dado però finisce sempre sulla faccia già decisa: negli ultimi istanti, quando va
  // piano, l'orientamento si assesta su quella faccia.
  const transp = M => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
  function inAsse(M) {                                              // asse e angolo di una rotazione
    const c = Math.max(-1, Math.min(1, (M[0] + M[4] + M[8] - 1) / 2)), a = Math.acos(c);
    const v = [M[7] - M[5], M[2] - M[6], M[3] - M[1]], l = len(v);
    return l < 1e-6 ? { a: 0, v: [0, 0, 1] } : { a, v: [v[0] / l, v[1] / l, v[2] / l] };
  }
  const R_ = (a, b) => a + Math.random() * (b - a);
  function simula(corpi, S, w, h) {
    const FPS = 60, SUB = 2, dt = 1 / (FPS * SUB), G = 3200;
    const xmin = Math.max(w * 0.1, 76), xmax = w - Math.max(w * 0.06, 14);
    let ymin = h * 0.2, ymax = h * 0.68;
    const D = corpi.map((d, k) => {
      const r = S * (d.cs.length > 1 ? 1.45 : 1.0);
      const lato = Math.random() < .5 ? -1 : 1;
      const x0 = lato < 0 ? xmin - r * 2.5 : xmax + r * 2.5, y0 = R_(ymin, ymax);
      const dir = Math.atan2((ymin + ymax) / 2 - y0 + R_(-90, 90), (xmin + xmax) / 2 - x0 + R_(-w * .15, w * .15));
      const sp = R_(900, 1500) * Math.min(1.2, w / 900 + 0.3);
      return { r, x: x0, y: y0, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, hz: R_(60, 160), vz: R_(150, 420), e: R_(.38, .62),
        R: asse(norm([R_(-1, 1), R_(-1, 1), R_(-1, 1)]), R_(0, 6.28)), wf: [R_(-9, 9), R_(-9, 9), R_(-9, 9)],
        t0: k * 0.07 + R_(0, 0.06), dentro: false, fr: [] };
    });
    const maxT = 2.7; let nf = 0;
    for (let st = 0; st < maxT * FPS * SUB; st++) {
      const t = st * dt;
      for (const q of D) {
        if (t < q.t0) continue;
        q.vz -= G * dt; q.hz += q.vz * dt;
        if (q.hz <= 0) {
          q.hz = 0;
          if (Math.abs(q.vz) > 70) {                                   // rimbalzo: un calcio a caso in avanti e di lato, e un giro
            q.vz = -q.vz * q.e;
            const sp = Math.hypot(q.vx, q.vy);
            q.vx += R_(-1, 1) * (90 + sp * .28); q.vy += R_(-1, 1) * (90 + sp * .28);
            q.wf = [R_(-1, 1) * 11, R_(-1, 1) * 11, R_(-1, 1) * 11];
          } else q.vz = 0;
        }
        const aria = q.hz > 0;
        const k = aria ? 0.25 : 1.5 + 2.6 * t + (t > 2.1 ? 12 : 0);
        const f = Math.exp(-k * dt); q.vx *= f; q.vy *= f;
        q.x += q.vx * dt; q.y += q.vy * dt;
        // pareti (solo dopo essere entrati nel tavolo)
        if (!q.dentro && q.x > xmin + q.r && q.x < xmax - q.r) q.dentro = true;
        if (q.dentro) {
          if (q.x < xmin + q.r) { q.x = xmin + q.r; q.vx = Math.abs(q.vx) * .62; q.vy += R_(-1, 1) * 60; }
          if (q.x > xmax - q.r) { q.x = xmax - q.r; q.vx = -Math.abs(q.vx) * .62; q.vy += R_(-1, 1) * 60; }
        }
        if (q.y < ymin + q.r) { q.y = ymin + q.r; q.vy = Math.abs(q.vy) * .62; q.vx += R_(-1, 1) * 60; }
        if (q.y > ymax - q.r) { q.y = ymax - q.r; q.vy = -Math.abs(q.vy) * .62; q.vx += R_(-1, 1) * 60; }
      }
      // scontri fra dadi: cerchi uguali, urto quasi elastico, un po' di giro a caso
      for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) {
        const a = D[i], b = D[j];
        if (st * dt < a.t0 || st * dt < b.t0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1e-3, min = a.r + b.r;
        if (dist >= min) continue;
        const nx = dx / dist, ny = dy / dist, ov = (min - dist) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.78) * rv / 2;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
          if (-rv > 120) { a.wf = [R_(-1, 1) * 10, R_(-1, 1) * 10, R_(-1, 1) * 10]; b.wf = [R_(-1, 1) * 10, R_(-1, 1) * 10, R_(-1, 1) * 10]; a.vz += 120; b.vz += 120; a.hz += 1; b.hz += 1; }
        }
      }
      // rotazione: rotola in base a come si muove, più un giro libero che si smorza
      for (const q of D) {
        if (st * dt < q.t0) continue;
        const sp = Math.hypot(q.vx, q.vy);
        if (sp > 1) { q.R = mul(asse([q.vy / sp, q.vx / sp, 0], sp / q.r * dt * (q.hz > 0 ? .4 : 1)), q.R); }
        const wl = len(q.wf);
        if (wl > 1e-3) { q.R = mul(asse([q.wf[0] / wl, q.wf[1] / wl, q.wf[2] / wl], wl * dt), q.R); const g = Math.exp(-2.4 * dt); q.wf = [q.wf[0] * g, q.wf[1] * g, q.wf[2] * g]; }
      }
      if (st % SUB === SUB - 1) {
        nf++;
        for (const q of D) q.fr.push({ x: q.x, y: q.y, hz: q.hz, R: q.R, on: st * dt >= q.t0 });
        // finito quando tutti sono entrati e fermi
        if (nf > 20 && D.every(q => st * dt >= q.t0 && q.hz === 0 && Math.hypot(q.vx, q.vy) < 6)) break;
      }
    }
    corpi.forEach((d, k) => {
      const q = D[k], fr = q.fr;
      let sf = fr.length - 1;
      while (sf > 0 && Math.hypot(fr[sf].x - fr[sf - 1].x, fr[sf].y - fr[sf - 1].y) < 0.15 && fr[sf].hz === 0) sf--;
      sf = Math.min(fr.length - 1, sf + 1);
      d.fr = fr; d.sf = sf; d.r = q.r;
      d.f0 = Math.max(1, Math.floor(sf * 0.5));
      d.corr = d.parti.map(pt => inAsse(mul(pt.fin, transp(fr[sf].R))));
    });
    return nf;
  }
  const indovina = v => [4, 6, 8, 10, 12, 20].find(s => s >= v) || 100;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const leggera = () => document.documentElement.classList.contains('graficaLeggera');

  function disegnaFisica(d, t, alfa) {
    const f = Math.min(d.fr.length - 1, Math.floor(t * 0.06));       // 60 immagini al secondo
    const fr = d.fr[f];
    if (!fr.on) return;
    const sm = x => x * x * (3 - 2 * x);
    const wgt = f >= d.sf ? 1 : f <= d.f0 ? 0 : sm((f - d.f0) / (d.sf - d.f0));
    const alto = fr.hz, sc0 = d.S * (1 + alto / 480);
    ctx.save();
    ctx.globalAlpha = alfa * (0.42 - Math.min(0.25, alto / 900));
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(fr.x + d.S * 0.1 + alto * 0.1, fr.y + d.S * 0.92, d.S * (0.95 + alto / 700), d.S * 0.28, 0, 0, 7); ctx.fill();
    ctx.restore();
    const n = d.parti.length;
    d.parti.forEach((pt, q) => {
      const c = d.corr[q];
      const M = mul(asse(c.v, c.a * wgt), f >= d.sf ? d.fr[d.sf].R : fr.R);
      const ox = n > 1 ? (q ? -1 : 1) * d.S * 0.62 : 0;
      disegnaCorpo(pt.c, n > 1 ? mul(M, [1, 0, 0, 0, 1, 0, 0, 0, 1]) : M, fr.x + ox, fr.y - alto, n > 1 ? sc0 * 0.82 : sc0, d.scartato && f >= d.sf ? alfa * 0.4 : alfa);
    });
  }
  function disegnaDado(d, t, alfa) {
    if (corrente.fisica) return disegnaFisica(d, t, alfa);
    const { w } = dimensioni();
    void w;
    const lt = d.parti.length ? Math.max(0, Math.min(1, (t - d.ritardo) / TEMPO_VOLO)) : 1;
    const moto = corrente.moto;
    const p = moto ? lt : 1;
    const e = ease(p);
    const x = d.da.x + (d.x - d.da.x) * e;
    const rimb = moto ? Math.abs(Math.sin(p * Math.PI * d.rimbalzi)) * (1 - p) * d.S * 2.2 : 0;
    const y = d.da.y + (d.y - d.da.y) * e - rimb;
    const th = moto ? d.giri * Math.pow(1 - p, 2) : 0;
    const Rt = asse(d.asseR, th);
    const nDadi = d.parti.length;
    // ombra sul tavolo
    ctx.save();
    ctx.globalAlpha = alfa * (moto ? 0.25 + 0.2 * p : 0.4);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x + d.S * 0.12, d.y + d.S * 0.95 + (y - d.y) * 0.05, d.S * (0.95 - rimb / (d.S * 9)), d.S * 0.28, 0, 0, 7); ctx.fill();
    ctx.restore();
    d.parti.forEach((pt, q) => {
      const ox = nDadi > 1 ? (q ? -1 : 1) * d.S * 0.62 : 0;
      const sc = nDadi > 1 ? d.S * 0.82 : d.S;
      const M = mul(Rt, pt.fin);
      // il d100: l'unità resta a fianco, le decine arrivano con una rotazione diversa
      const M2 = nDadi > 1 && q ? mul(asse(norm([d.asseR[1], d.asseR[2], d.asseR[0]]), th * 0.8), pt.fin) : M;
      disegnaCorpo(pt.c, M2, x + ox, y, sc, d.scartato && lt >= 1 ? alfa * 0.4 : alfa);
    });
  }
  function disegnaCorpo(c, M, cx, cy, S, alfa) {
    const L = norm([-0.35, 0.55, 0.75]), [r0, g0, b0] = c.colore;
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineJoin = 'round';
    c.sagoma.fs.forEach((f, i) => {
      const nr = ap(M, f.n);
      if (nr[2] <= 0.015) return;                                    // faccia girata dall'altra parte
      const luce = 0.5 + 0.5 * Math.max(0, dot(nr, L));
      const fill = `rgb(${Math.round(r0 * luce + 25)},${Math.round(g0 * luce + 25)},${Math.round(b0 * luce + 25)})`;
      ctx.beginPath();
      f.v.forEach((v, k) => { const q = ap(M, v); const px = cx + q[0] * S, py = cy - q[1] * S; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = `rgba(0,0,0,.55)`; ctx.lineWidth = Math.max(1, S * 0.03); ctx.stroke();
      // numero, disteso sulla faccia
      const ce = ap(M, f.c), ru = ap(M, f.r), uu = ap(M, f.u);
      const txt = c.lab[i], FS = 100;
      const dim = f.inr * (txt.length >= 3 ? 0.9 : txt.length === 2 ? 1.15 : 1.5);
      const k2 = S * dim / FS;
      ctx.save();
      ctx.translate(cx + ce[0] * S, cy - ce[1] * S);
      ctx.transform(ru[0] * k2, -ru[1] * k2, -uu[0] * k2, uu[1] * k2, 0, 0);
      ctx.font = `700 ${FS}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = FS * 0.09; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(txt, 0, FS * 0.04);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, 0, FS * 0.04);
      if (txt === '6' || txt === '9' || txt === '60' || txt === '90') {            // il puntino che distingue 6 e 9
        ctx.fillRect(-FS * (txt.length === 1 ? 0.2 : 0.55), FS * 0.52, FS * (txt.length === 1 ? 0.4 : 1.1), FS * 0.07);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  function giro(ts) {
    raf = 0;
    if (!corrente) return;
    if (!corrente.t0) corrente.t0 = ts;
    const t = ts - corrente.t0;
    const { w, h, dpr } = dimensioni();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const resto = corrente.durata - t;
    const alfa = resto < DISSOLVENZA ? Math.max(0, resto / DISSOLVENZA) : 1;
    for (const d of corrente.corpi) disegnaDado(d, t, alfa);
    if (t >= corrente.durata) { fineScena(); return; }
    raf = requestAnimationFrame(giro);
  }
  function fineScena() {
    corrente = null;
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    if (coda.length) { avvia(coda.shift()); return; }
    if (canvas) { canvas.remove(); canvas = null; ctx = null; }
  }
  function avvia(msg) {
    preparaCanvas();
    corrente = scena(msg);
    if (coda.length) corrente.durata = Math.min(corrente.durata, corrente.fine + 700 + DISSOLVENZA);   // c'è altro in coda: tenuta più corta
    if (!raf) raf = requestAnimationFrame(giro);
  }

  const Dadi3D = {
    pref,
    /** Mostra i dadi di un messaggio di tiro (con rolls). proprio: l'ha tirato questo dispositivo. */
    mostra(msg, proprio) {
      try {
        if (!msg || msg.kind !== 'roll' || msg.hidden || !msg.d3 || !Array.isArray(msg.rolls) || !msg.rolls.length) return false;
        if (!proprio && !pref.altri) return false;
        if (document.hidden) return false;
        if (coda.length >= 3) coda.shift();
        if (corrente) coda.push(msg); else avvia(msg);
        return true;
      } catch (e) { return false; }
    },
    /** Quanto ci mette il primo dado a fermarsi (il riquadro con il totale aspetta un po'). */
    ritardo(msg) {
      if (!msg || !msg.d3 || !prefersMoto()) return 0;
      if (!leggera()) return 1900;                       // con la fisica i dadi si fermano dopo un paio di secondi
      return Math.min(TEMPO_VOLO + 70 * Math.min(11, (msg.rolls || []).length) , 2000);
    },
    imposta(chiave, valore) { pref[chiave] = !!valore; scriviPref(pref); },
    // per le prove: geometria e disegno di un solo dado, senza animazione
    _prova: { forma, nuovoDado, scena },
  };
  window.Dadi3D = Dadi3D;
})();
