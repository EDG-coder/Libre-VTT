// ---------- L'anello di attesa (lo stesso disegno sul tavolo, nel pannello e nella schermata iniziale) ----------
// Un arco viola che si allunga e si accorcia, un arco interno che gira al contrario, un alone che respira,
// una testa luminosa e il d20 del logo al centro. Tutto disegnato a mano in canvas: niente immagini, gira
// uguale su computer, tablet e telefono, anche senza connessione. Con «riduci movimento» attivo l'anello
// resta fermo (un solo fotogramma).
// Uso: LibreAttesa.anello(contenitore, lato) oppure LibreAttesa.attesa(contenitore, testo, lato): restituiscono { stop() }.
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.LibreAttesa = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- costanti (le stesse del Rust) ----------
  const CICLO = 1.6;          // un ciclo dell'arco, in secondi
  const ALLUNGO = 260;        // quanto si allunga l'arco al massimo, in gradi
  const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const ACCENTO = [0.486, 0.361, 1.0];   // #7c5cff, come --accent
  const CHIARO = hex(0xc9bcff);          // il colore chiaro della punta
  const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const mescola = (a, b, t) => { t = Math.min(1, Math.max(0, t)); return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t); };
  const gradi = d => d * Math.PI / 180;

  // accelera e frena (curva a S), su 0..1
  function morbido(x) {
    x = Math.min(1, Math.max(0, x));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  // dove sta l'arco al tempo t (secondi): [inizio, ampiezza] in gradi, 0 = destra, senso orario
  function arco(t) {
    const giri = Math.floor(t / CICLO);
    const p = (t / CICLO) - giri;
    const testa = ALLUNGO * morbido(p * 2);
    const coda = ALLUNGO * morbido(p * 2 - 1);
    const base = t * 220 + giri * ALLUNGO;
    const ampiezza = Math.max(testa - coda, 10);
    return [((base + coda) % 360) - 90, ampiezza];
  }

  // ---------- il disegno di un fotogramma ----------
  function disegna(ctx, W, H, t) {
    const cx = W / 2, cy = H / 2;
    const lato = Math.min(W, H);
    const r = lato / 2 * 0.62;
    const sp = Math.max(lato * 0.075, 3);
    ctx.clearRect(0, 0, W, H);

    function tratto(raggio, a0, ampiezza, colore, larghezza, cap) {
      ctx.beginPath();
      ctx.arc(cx, cy, raggio, gradi(a0), gradi(a0 + ampiezza));
      ctx.strokeStyle = colore;
      ctx.lineWidth = larghezza;
      ctx.lineCap = cap || 'butt';
      ctx.stroke();
    }

    // l'alone che respira (un respiro ogni 2,4 s)
    const respiro = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 2.4);
    const alone = lato / 2 * (0.86 + 0.1 * respiro);
    const va = 0.16 + 0.14 * respiro;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, alone);
    g.addColorStop(0, rgba(ACCENTO, va));
    g.addColorStop(0.55, rgba(ACCENTO, va));
    g.addColorStop(1, rgba(ACCENTO, 0));
    ctx.beginPath(); ctx.arc(cx, cy, alone, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();

    // la pista: un anello appena visibile
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = sp; ctx.stroke();

    // l'arco interno, sottile, che gira al contrario e più lento
    const ri = r * 0.6;
    const gira = -(t * 140) % 360;
    for (let k = 0; k < 2; k++) {
      tratto(ri, gira + k * 180, 70, 'rgba(217,209,255,0.35)', Math.max(sp * 0.4, 1.5), 'round');
    }

    // l'arco principale: sfuma dal viola alla punta chiara, in 14 pezzi
    const [inizio, ampiezza] = arco(t);
    const pezzi = 14;
    for (let i = 0; i < pezzi; i++) {
      const a = i / pezzi;
      const c = mescola(ACCENTO, CHIARO, a);
      tratto(r, inizio + ampiezza * a, ampiezza / pezzi + 0.6, rgba(c, 0.45 + 0.55 * a), sp, 'round');
    }

    // la testa: un punto luminoso con un piccolo alone
    const fine = gradi(inizio + ampiezza);
    const hx = cx + r * Math.cos(fine), hy = cy + r * Math.sin(fine);
    const h = sp * 1.6;
    const gh = ctx.createRadialGradient(hx, hy, 0, hx, hy, h);
    gh.addColorStop(0, 'rgba(255,255,255,0.55)');
    gh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(hx, hy, h, 0, Math.PI * 2); ctx.fillStyle = gh; ctx.fill();
    const p = sp * 0.32;
    ctx.beginPath(); ctx.arc(hx, hy, p, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    // al centro il d20 del logo, che respira piano
    dado(ctx, cx, cy, r * 0.62 * (1 + 0.04 * respiro), 0.75 + 0.25 * respiro);
  }

  // il d20 del logo: le stesse linee di ic_dadi.svg (un quadrato di 24, centro 12,12)
  function dado(ctx, cx, cy, mezzo, opacita) {
    const k = mezzo / 10;
    const P = (x, y) => [cx + (x - 12) * k, cy + (y - 12) * k];
    const colore = `rgba(237,232,255,${opacita})`;
    ctx.lineWidth = Math.max(k * 1.5, 1.4);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = colore;

    const linea = (a, b) => { const [x1, y1] = P(a[0], a[1]), [x2, y2] = P(b[0], b[1]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const poligono = pts => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };

    const esagono = [[12, 2], [20.66, 7], [20.66, 17], [12, 22], [3.34, 17], [3.34, 7]];
    poligono(esagono);
    ctx.fillStyle = rgba(ACCENTO, 0.22 * 1);
    ctx.fill();
    ctx.stroke();
    poligono([[12, 7.2], [18, 17], [6, 17]]); ctx.stroke();
    [
      [[12, 7.2], [12, 2]], [[12, 7.2], [3.34, 7]], [[12, 7.2], [20.66, 7]],
      [[18, 17], [20.66, 7]], [[18, 17], [20.66, 17]], [[18, 17], [12, 22]],
      [[6, 17], [3.34, 7]], [[6, 17], [3.34, 17]], [[6, 17], [12, 22]]
    ].forEach(([a, b]) => linea(a, b));
  }

  // ---------- montaggio: un anello che gira dentro un contenitore ----------
  const fermo = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

  // lo stile: si aggiunge da solo, una volta, così le pagine non devono caricare altro
  function stile() {
    if (typeof document === 'undefined' || document.getElementById('libreAttesaStile')) return;
    const s = document.createElement('style');
    s.id = 'libreAttesaStile';
    s.textContent = '.anelloAttesa{position:relative;display:inline-block;flex:none;line-height:0}' +
      '.anelloAttesa canvas{display:block;width:100%;height:100%}' +
      '.attesaBox{display:flex;flex-direction:column;align-items:center;gap:14px}' +
      '.attesaBox .attesaTesto{font-size:13.5px;color:var(--muted,#9aa3b5);text-align:center}';
    document.head.appendChild(s);
  }

  // lato: ingombro in px. Si ferma da solo quando il contenitore esce dalla pagina.
  function anello(host, lato) {
    stile();
    const wrap = document.createElement('div');
    wrap.className = 'anelloAttesa';
    wrap.setAttribute('role', 'presentation');
    wrap.style.width = lato + 'px'; wrap.style.height = lato + 'px';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(lato * dpr); canvas.height = Math.round(lato * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fermo()) { disegna(ctx, lato, lato, 0.4); return { stop() { wrap.remove(); } }; }
    const inizio = performance.now();
    let finito = false, id = 0;
    function passo(now) {
      if (finito) return;
      if (!wrap.isConnected) { finito = true; return; }
      disegna(ctx, lato, lato, (now - inizio) / 1000);
      id = requestAnimationFrame(passo);
    }
    id = requestAnimationFrame(passo);
    return { stop() { finito = true; cancelAnimationFrame(id); wrap.remove(); } };
  }

  // l'anello con una scritta sotto (la scritta passa da tr() se c'è)
  function attesa(host, testo, lato) {
    stile();
    const box = document.createElement('div');
    box.className = 'attesaBox';
    box.setAttribute('role', 'status');
    host.appendChild(box);
    const a = anello(box, lato || 104);
    const t = document.createElement('div');
    t.className = 'attesaTesto';
    t.textContent = testo ? (typeof tr === 'function' ? tr(testo) : testo) : '';
    if (testo) box.appendChild(t);
    return { stop() { a.stop(); box.remove(); } };
  }

  return { arco, disegna, anello, attesa };
});
