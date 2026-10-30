// ---------- Mappe di Dungeondraft e simili (.dd2vtt, .uvtt, .df2vtt) ----------
// Il formato «Universal VTT» è un JSON con dentro l'immagine della mappa (in base64), la misura di una
// casella in pixel, i muri (line_of_sight: spezzate in caselle), le porte (portals) e le luci.
// Lo si apre come una scena nuova: sfondo, griglia, muri, porte e luci, tutto insieme. Una sola
// modifica, quindi un Cmd/Ctrl+Z la toglie tutta.
//   eUvtt(file)               → è uno di questi file?
//   scenaDaUvtt(file, sc)     → riempie la scena sc (nuova) e restituisce il riassunto da mostrare
(function () {
  const MAX_MURI = 4000, MAX_LUCI = 500;
  window.eUvtt = file => !!file && /\.(dd2vtt|uvtt|df2vtt)$/i.test(file.name || '');

  const nuovoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const numero = v => (Number.isFinite(+v) ? +v : NaN);
  const punto = p => (p && typeof p === 'object' ? { x: numero(p.x), y: numero(p.y) } : { x: NaN, y: NaN });
  // i colori arrivano come «ffRRGGBB» (prima l'opacità) o «#RRGGBB»
  function colore(c) {
    const h = String(c || '').replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{8}$/.test(h)) return '#' + h.slice(2);
    if (/^[0-9a-f]{6}$/.test(h)) return '#' + h;
    return '#ffd27a';
  }
  function immagine(b64) {
    const s = String(b64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (!s) return null;
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const tipo = u[0] === 0x89 && u[1] === 0x50 ? 'image/png'
      : u[0] === 0xff && u[1] === 0xd8 ? 'image/jpeg'
        : u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50 ? 'image/webp' : 'image/png';
    return new Blob([u], { type: tipo });
  }

  window.scenaDaUvtt = async function (file, sc) {
    let d;
    try { d = JSON.parse(await file.text()); } catch { throw new Error(tr('Questo file non si legge: non sembra una mappa .dd2vtt / .uvtt')); }
    const res = d && d.resolution;
    const ppg = numero(res && res.pixels_per_grid);
    if (!res || !(ppg > 0)) throw new Error(tr('Nel file manca la misura delle caselle (pixels_per_grid)'));
    const blob = immagine(d.image);
    if (!blob) throw new Error(tr('Nel file non c\'è l\'immagine della mappa'));
    const o = punto(res.map_origin), ox = Number.isFinite(o.x) ? o.x : 0, oy = Number.isFinite(o.y) ? o.y : 0;
    const nome = String(file.name).replace(/\.[^.]+$/, '');

    // l'immagine passa come tutti gli sfondi (WebP alla risoluzione scelta): se si rimpicciolisce,
    // muri, luci e griglia si rimpiccioliscono con lei
    const rec = await uploadBackground(new File([blob], nome + '.' + blob.type.split('/')[1], { type: blob.type }));
    const bg = await loadBg(rec.url, rec.id);
    if (!bg) throw new Error(tr('Non riesco a leggere questa immagine come sfondo.'));
    const ms = punto(res.map_size), largo = Number.isFinite(ms.x) && ms.x > 0 ? ms.x * ppg : bg.w;
    const k = bg.w / largo, cella = ppg * k;
    const px = p => { const q = punto(p); return { x: (q.x - ox) * cella, y: (q.y - oy) * cella }; };

    const muri = [];
    let tagliati = 0;
    const aggiungi = (a, b, extra) => {
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) <= 0.5) return;
      if (muri.length >= MAX_MURI) { tagliati++; return; }
      muri.push({ id: nuovoId(), x1: +a.x.toFixed(1), y1: +a.y.toFixed(1), x2: +b.x.toFixed(1), y2: +b.y.toFixed(1), ...extra });
    };
    // le porte prima: se i muri sono troppi, quelle almeno ci sono
    let porte = 0;
    for (const p of Array.isArray(d.portals) ? d.portals : []) {
      const b = Array.isArray(p && p.bounds) ? p.bounds : [];
      if (b.length < 2) continue;
      const n = muri.length;
      aggiungi(px(b[0]), px(b[1]), { porta: true, aperta: p.closed === false });
      if (muri.length > n) porte++;
    }
    for (const lista of [d.line_of_sight, d.objects_line_of_sight]) {
      for (const linea of Array.isArray(lista) ? lista : []) {
        if (!Array.isArray(linea)) continue;
        // i punti in fila sulla stessa retta diventano un muro solo (meno muri, stessa ombra)
        const pt = linea.map(px).filter(q => Number.isFinite(q.x) && Number.isFinite(q.y));
        let a = pt[0];
        for (let i = 1; i < pt.length; i++) {
          const b = pt[i], c = pt[i + 1];
          if (c && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0 && Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.5 * Math.hypot(c.x - a.x, c.y - a.y)) continue;
          aggiungi(a, b, {}); a = b;
        }
      }
    }
    const luci = [];
    for (const l of Array.isArray(d.lights) ? d.lights : []) {
      if (luci.length >= MAX_LUCI) break;
      const p = px(l && l.position), r = numero(l && l.range);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !(r > 0)) continue;
      // la portata è in caselle: metà luce intensa, metà fioca
      const meta = Math.min(200, Math.round(r * 5) / 10);
      luci.push({ id: nuovoId(), x: +p.x.toFixed(1), y: +p.y.toFixed(1), r: meta, rf: meta, col: colore(l.color) });
    }

    sc.type = 'map';
    sc.bg = bg;
    sc.board = { x: bg.x, y: bg.y, w: bg.w, h: bg.h };
    sc.grid = { ...sc.grid, show: true, snap: true, size: Math.round(cella * 100) / 100, ox: 0, oy: 0 };
    const env = d.environment || {};
    // con le luci già dipinte nella mappa (baked_lighting) la stanza non è buia
    sc.luce = { on: false, ambiente: env.baked_lighting && !luci.length ? 'luce' : 'buio', ricordo: 'scuro', muri, luci };

    const pezzi = [tr('griglia da {n} px', { n: sc.grid.size })];
    pezzi.push(tr('{n} muri', { n: muri.length - porte }));
    if (porte) pezzi.push(tr('{n} porte', { n: porte }));
    if (luci.length) pezzi.push(tr('{n} luci', { n: luci.length }));
    let testo = tr('Mappa importata: {cosa}.', { cosa: pezzi.join(', ') });
    if (tagliati) testo += ' ' + tr('{n} muri in più sono stati lasciati fuori (massimo {max}).', { n: tagliati, max: MAX_MURI });
    if (muri.length || luci.length) testo += ' ' + tr('Per usarli accendi la luce dinamica in «Visibilità».');
    return testo;
  };
})();
