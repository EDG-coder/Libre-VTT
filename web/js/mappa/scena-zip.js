// ---------- 📦 Esportare e importare una scena (.libre-scena.zip) ----------
// Lo zip contiene scena.json (la scena intera: sfondo, rettangolo, griglia, segnalini, forme, disegni,
// nebbia, luci, muri, porte, vista), schede.json (le schede collegate ai segnalini, complete) e
// immagini/ (ogni immagine usata, con il nome originale e l'impronta SHA-256).
// Si fa tutto nel browser: funziona da soli, nel browser senza server e in partita (per il master).
// Importata, la scena non dipende più dallo zip: le immagini vanno negli assets della campagna
// (cartella «Scene importate»; un'immagine identica già importata non si duplica), le schede ricevono
// id nuovi (o si usa quella che c'è con lo stesso nome), scena e segnalini id nuovi.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const FORMATO = 'libre-vtt-scena', VERSIONE = 1, MAX = 300 * 1024 * 1024;
  const CARTELLA = 'Scene importate';

  // ---------- zip minimo: scrittura senza compressione, lettura anche compressa (deflate) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  function scriviZip(files) {                                  // files: [{ nome, dati: Uint8Array }]
    const parti = [], centrale = []; let off = 0;
    for (const f of files) {
      const nome = enc.encode(f.nome), c = crc32(f.dati), n = f.dati.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);   // UTF-8
      h.setUint32(14, c, true); h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, nome.length, true);
      parti.push(new Uint8Array(h.buffer), nome, f.dati);
      const d = new DataView(new ArrayBuffer(46));
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true);
      d.setUint32(16, c, true); d.setUint32(20, n, true); d.setUint32(24, n, true); d.setUint16(28, nome.length, true); d.setUint32(42, off, true);
      centrale.push(new Uint8Array(d.buffer), nome);
      off += 30 + nome.length + n;
    }
    const lc = centrale.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, lc, true); e.setUint32(16, off, true);
    return new Blob([...parti, ...centrale, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  async function inflate(b) {
    if (typeof DecompressionStream !== 'function') throw new Error(tr('Questo browser non sa aprire gli zip compressi.'));
    return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  async function leggiZip(buf) {
    const u = new Uint8Array(buf), v = new DataView(buf); let e = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error(tr('Il file non è uno zip valido.'));
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    const out = new Map();
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error(tr('Il file non è uno zip valido.'));
      const metodo = v.getUint16(p + 10, true), comp = v.getUint32(p + 20, true), ln = v.getUint16(p + 28, true), lx = v.getUint16(p + 30, true), lk = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const nome = dec.decode(u.subarray(p + 46, p + 46 + ln));
      p += 46 + ln + lx + lk;
      if (nome.endsWith('/')) continue;
      if (nome.includes('..') || nome.startsWith('/') || nome.includes('\\')) continue;   // mai fuori dallo zip
      const inizio = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
      const raw = u.subarray(inizio, inizio + comp);
      out.set(nome, metodo === 0 ? raw : metodo === 8 ? await inflate(raw) : null);
    }
    return out;
  }

  // ---------- esportare ----------
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const pulisciNome = s => String(s || 'immagine').replace(/[\\/:*?"<>|#%]+/g, '_').replace(/^\.+/, '').slice(0, 40) || 'immagine';
  const ESTENSIONI = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/webm': '.webm' };

  async function esportaScena(sc) {
    if (sc === cur) captureScene();
    const copia = JSON.parse(JSON.stringify(sc));
    const files = [], perUrl = new Map();
    // un'immagine usata dalla scena: la si scarica (dalla campagna o dal deposito della partita) e la si mette in immagini/
    async function immagine(o, nomeBase) {
      if (!o || !o.url) return null;
      const url = resolveUrl(o) || (String(o.url).startsWith('data:') ? o.url : null);
      if (!url) return null;
      if (perUrl.has(url)) return perUrl.get(url);
      let blob;
      try { const r = await fetch(url); if (!r.ok) throw 0; blob = await r.blob(); } catch { perUrl.set(url, null); return null; }
      const dati = new Uint8Array(await blob.arrayBuffer()), h = hex(await crypto.subtle.digest('SHA-256', dati));
      const orig = decodeURIComponent(String(o.url).split('/').pop().split('?')[0] || '');
      const ext = (/\.[a-z0-9]{2,5}$/i.exec(orig) || [])[0] || ESTENSIONI[blob.type] || '.webp';
      const nome = 'immagini/' + h.slice(0, 12) + '-' + pulisciNome((/^gs:|^data:/.test(orig) || !orig ? nomeBase : orig.replace(/\.[^.]+$/, ''))) + ext.toLowerCase();
      if (!files.some(f => f.nome === nome)) files.push({ nome, dati, sha256: h });
      perUrl.set(url, nome);
      return nome;
    }
    const comeZip = (o, nome) => { if (!nome) return null; const r = { ...o, url: 'zip:' + nome }; delete r.gid; delete r.aid; return r; };
    if (copia.bg) copia.bg = comeZip(copia.bg, await immagine(copia.bg, 'sfondo')) || null;
    const foto = [];
    for (const p of copia.photos || []) {
      if (p.shape) { foto.push(p); continue; }
      const n = await immagine(p, p.name || 'segnalino');
      if (n) foto.push(comeZip(p, n));
    }
    copia.photos = foto;
    delete copia.cartella;
    // le schede collegate ai segnalini, con la loro icona
    const ids = new Set(foto.map(p => p.sheet).filter(Boolean)), schede = [];
    for (const s of sheets.filter(x => ids.has(x.id))) {
      const c = JSON.parse(JSON.stringify({ id: s.id, name: s.name, tpl: s.tpl, icon: s.icon || null, f: s.f || {}, avanzate: s.avanzate || undefined }));
      if (c.icon && c.icon.url) c.icon = comeZip(c.icon, await immagine(c.icon, s.name)) || null;
      schede.push(c);
    }
    const sistema = typeof SISTEMA !== 'undefined' && SISTEMA.dati ? { id: SISTEMA.dati.id || '', nome: SISTEMA.dati.nome || '' } : null;
    const testa = { formato: FORMATO, versione: VERSIONE, creata: new Date().toISOString(), app: 'LIBRE VTT', sistema, immagini: files.map(f => ({ file: f.nome, sha256: f.sha256 })), scena: copia };
    const zip = scriviZip([
      { nome: 'scena.json', dati: enc.encode(JSON.stringify(testa, null, 1)) },
      { nome: 'schede.json', dati: enc.encode(JSON.stringify(schede, null, 1)) },
      ...files
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip); a.download = pulisciNome(sc.name) + '.libre-scena.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return { immagini: files.length, schede: schede.length };
  }

  // ---------- importare ----------
  const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
  async function importaScena(file) {
    if (file.size > MAX) throw new Error(tr('Lo zip supera i 300 MB.'));
    const z = await leggiZip(await file.arrayBuffer());
    const sj = z.get('scena.json');
    if (!sj) throw new Error(tr('Nello zip manca scena.json: non è una scena di LIBRE VTT.'));
    let testa; try { testa = JSON.parse(dec.decode(sj)); } catch { throw new Error(tr('scena.json non si legge.')); }
    if (testa.formato !== FORMATO || !testa.scena) throw new Error(tr('Non è una scena di LIBRE VTT.'));
    let schede = []; try { schede = JSON.parse(dec.decode(z.get('schede.json') || enc.encode('[]'))); } catch {}
    if (!Array.isArray(schede)) schede = [];
    const sis = typeof SISTEMA !== 'undefined' && SISTEMA.dati ? SISTEMA.dati.id || '' : '';
    if (testa.sistema && testa.sistema.id && sis && testa.sistema.id !== sis)
      alert(tr('La scena viene da una campagna con un altro sistema di gioco ({s}): le schede potrebbero mostrare campi diversi.', { s: testa.sistema.nome || testa.sistema.id }));

    // le immagini, negli assets della campagna (una già importata uguale si riusa)
    try { await store.addFolder(CARTELLA); } catch { /* c'è già */ }
    let elenco; try { elenco = await store.list(); } catch { elenco = data; }
    const cartella = (elenco.folders || []).find(f => f.name === CARTELLA || f.name === CARTELLA.replace(/ /g, '_'));
    const nomeCartella = cartella ? cartella.name : CARTELLA;
    const fatte = new Map();
    async function rifDa(o) {
      if (!o || !String(o.url || '').startsWith('zip:')) return o;
      const nome = o.url.slice(4);
      if (!fatte.has(nome)) fatte.set(nome, (async () => {
        const dati = z.get(nome);
        if (!dati || !/^immagini\/[^/]+$/.test(nome)) return null;
        const base = nome.slice(9), ext = (/\.[a-z0-9]+$/i.exec(base) || [''])[0].toLowerCase();
        if (!MIME[ext]) return null;                                   // solo immagini (e i video degli sfondi animati)
        const gia = (elenco.items || []).find(i => i.folder === nomeCartella && i.name === base);
        if (gia) return { url: gia.url, aid: gia.id };
        let blob = new Blob([dati], { type: MIME[ext] });
        if (ext === '.svg') blob = await comeSvg(new File([blob], base, { type: 'image/svg+xml' }));   // la stessa pulizia dei caricamenti
        const rec = await store.add(base, nomeCartella, blob);
        return { url: rec.url, aid: rec.id };
      })());
      const r = await fatte.get(nome);
      if (!r) return null;
      const out = { ...o, url: r.url };
      delete out.gid; delete out.aid;
      if (store === localStore) out.aid = r.aid;
      return out;
    }
    // le schede: id nuovi; con lo stesso nome di una che c'è già si sceglie
    const mappaSchede = new Map();
    for (const s of schede) {
      if (!s || !s.id || !s.name) continue;
      const uguale = sheets.find(x => x.name.trim().toLowerCase() === String(s.name).trim().toLowerCase());
      if (uguale && confirm(tr('Nella campagna c\'è già una scheda «{n}». OK: usa quella che c\'è. Annulla: crea una copia.', { n: s.name }))) { mappaSchede.set(s.id, uguale.id); continue; }
      const nuova = { id: uid(), name: String(s.name).slice(0, 40), tpl: s.tpl || 'standard', icon: s.icon ? await rifDa(s.icon) : null, f: s.f && typeof s.f === 'object' ? s.f : {} };
      if (s.avanzate && typeof s.avanzate === 'object') nuova.avanzate = s.avanzate;
      sheets.push(nuova);
      if (typeof onSheetCreated === 'function') onSheetCreated(nuova);
      mappaSchede.set(s.id, nuova.id);
    }
    if (mappaSchede.size) { renderSheetList(); scheduleSheets(); }
    // la scena, con id nuovi e i riferimenti riscritti
    const sc = JSON.parse(JSON.stringify(testa.scena));
    sc.id = uid(); delete sc.cartella;
    sc.name = String(sc.name || file.name.replace(/\.libre-scena\.zip$|\.zip$/i, '')).slice(0, 40);
    if (scenes.some(s => s.name === sc.name)) sc.name = (sc.name.slice(0, 34) + ' (2)');
    sc.bg = sc.bg ? await rifDa(sc.bg) : null;
    const foto = [];
    for (const p of sc.photos || []) {
      const q = p.shape ? { ...p } : await rifDa(p);
      if (!q) continue;
      q.id = uid(); delete q.owner;
      if (q.sheet) { if (mappaSchede.has(q.sheet)) q.sheet = mappaSchede.get(q.sheet); else delete q.sheet; }
      foto.push(q);
    }
    sc.photos = foto;
    sc.board = sc.board || { ...DEFAULT_RECT };
    sc.grid = sc.grid || { ...settings.gridDefault };
    sc.type = sc.type === 'cinematic' ? 'cinematic' : 'map';
    scenes.push(sc);
    await reload();
    await showScene(sc);
    scheduleBoardSave();
    return { sc, schede: mappaSchede.size, immagini: fatte.size };
  }
  window.esportaScena = esportaScena;
  window.importaScena = importaScena;

  // ---------- i pulsanti ----------
  // nella finestra «Nuova scena»
  const dlgBtns = document.querySelector('#sceneForm .dialogBtns');
  if (dlgBtns) {
    dlgBtns.insertAdjacentHTML('afterbegin', `<button type="button" id="sceneZipIn" class="btn ghost" title="${tr('Una scena esportata da un\'altra campagna (.libre-scena.zip)')}">${tr('📦 Importa una scena (.zip)')}</button><span style="flex:1"></span><input id="sceneZipFile" type="file" accept=".zip,application/zip" hidden>`);
    $('sceneZipIn').addEventListener('click', () => $('sceneZipFile').click());
    $('sceneZipFile').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      $('sceneDialog').close();
      setStatus(tr('📦 Importo la scena…'));
      try { const r = await importaScena(f); setStatus(tr('📦 Scena «{n}» importata: {i} immagini, {s} schede.', { n: r.sc.name, i: r.immagini, s: r.schede })); }
      catch (err) { setStatus('❌ ' + err.message); alert(err.message); }
    });
  }
  // nel menu del clic destro sulla scena
  if (typeof sceneRowMenu === 'function') {
    const prima = sceneRowMenu;
    window.sceneRowMenu = sceneRowMenu = function (row) {          // eslint-disable-line no-global-assign
      const items = prima(row);
      const sc = !row.dataset.cartella && scenes.find(s => s.id === row.dataset.id);
      if (!items || !sc || (typeof isMaster === 'function' && !isMaster())) return items;
      const i = items.indexOf('-');
      const voce = { label: '📦 Esporta la scena…', fn: async () => {
        setStatus(tr('📦 Preparo lo zip della scena…'));
        try { const r = await esportaScena(sc); setStatus(tr('📦 Scena esportata: {i} immagini, {s} schede.', { i: r.immagini, s: r.schede })); }
        catch (err) { setStatus('❌ ' + err.message); }
      } };
      if (i >= 0) items.splice(i, 0, voce); else items.push(voce);
      return items;
    };
  }
})();
