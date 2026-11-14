// ---------- Una campagna da dare a un altro master (il «modulo») ----------
// «Esporta» non fa più una copia di sicurezza della cartella (per quella basta copiarla, o zipparla a
// mano): fa un file da mandare a un altro master, che la conduce con il suo gruppo. Dentro ci sono
// mappe, segnalini già piazzati, mostri e personaggi del master, musica, sistema e compendio. Restano
// fuori le cose di chi l'ha giocata: codice d'invito e chiavi, i giocatori e i loro personaggi, chat,
// turni, sessione, quello che il gruppo ha già scoperto della nebbia.
//
// Per pesare poco:
//  · del deposito (data/assets) si portano solo i file che il mondo usa ancora;
//  · le copie che si rifanno da sole non si portano: le mappe ridotte per i giocatori (le rifà il
//    master quando conduce) e le miniature delle scene (le rifà il tavolo);
//  · un file uguale a un altro (la stessa mappa in assets/ e nel deposito, o l'immagine di sfondo che
//    viene col programma) si mette una volta sola: all'importazione si rimette al suo posto;
//  · i PNG si ricomprimono senza perdere niente (stessi pixel, via solo testi e date dentro il file);
//  · i JSON si scrivono senza spazi e lo zip comprime al massimo.
//
// All'importazione (completaModulo) si rimettono i file messi una volta sola e si fanno chiavi e codice
// nuovi, solo per chi la importa. Uno zip fatto con le versioni di prima (senza modulo-libre-vtt.json)
// si importa come prima, così com'è.

'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { scrittoreZip, elenca, crc32 } = require('./zip.js');
const MANUALI = require('./manuali-privati.js');

const MANIFESTO = 'modulo-libre-vtt.json';
const FORMATO = 'libre-vtt-modulo';
// Di data/ si porta solo questo (più il deposito, data/assets/). Tutto il resto è di chi l'ha giocata:
// invito.chiave, invito.segreto, identita.chiave, master.chiave, players.json, session.json, chat.json,
// chats.json, server.json, collegamento/, miniature/...
const DATI_DA_PORTARE = new Set(['world.json', 'board.json', 'sheets.json', 'notes.json', 'predefinite.json']);
// i file che chi importa deve avere nuovi, suoi (se per caso ci sono, si buttano)
const SEGRETI = ['invito.chiave', 'invito.segreto', 'identita.chiave', 'master.chiave', 'players.json', 'session.json', 'server.json', 'chat.json', 'chats.json'];

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const leggiJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const HASH = /[a-f0-9]{64}/g;

// ---------- PNG più leggeri, senza perdere niente ----------
const PNG_FIRMA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// i pezzi che cambiano come si vede l'immagine restano; via testi, date, EXIF e simili
const PNG_TIENI = new Set(['IHDR', 'PLTE', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'pHYs', 'IEND']);
const PNG_MAX_GREZZO = 160 * 1024 * 1024;     // una mappa enorme si lascia com'è: non vale minuti di lavoro
/** Lo stesso PNG (stessi pixel), compresso al massimo. Se non si guadagna almeno il 2%, l'originale. */
function pngPiuLeggero(buf) {
  if (buf.length < 2048 || !buf.subarray(0, 8).equals(PNG_FIRMA)) return buf;
  const pezzi = [], idat = [];
  let p = 8, fine = false;
  while (p + 12 <= buf.length) {
    const n = buf.readUInt32BE(p), tipo = buf.toString('latin1', p + 4, p + 8);
    if (p + 12 + n > buf.length) return buf;
    const dati = buf.subarray(p + 8, p + 8 + n);
    if (tipo === 'acTL' || tipo === 'fcTL' || tipo === 'fdAT') return buf;       // un PNG animato si lascia com'è
    if (tipo === 'IDAT') { if (!idat.length) pezzi.push({ tipo }); idat.push(dati); }
    else if (PNG_TIENI.has(tipo)) pezzi.push({ tipo, dati });
    else if (tipo.charCodeAt(0) < 97) return buf;                                // un pezzo «critico» che non conosco
    p += 12 + n;
    if (tipo === 'IEND') { fine = true; break; }
  }
  if (!fine || !idat.length || pezzi[0].tipo !== 'IHDR') return buf;
  const ihdr = pezzi[0].dati, w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4), bit = ihdr[8], colore = ihdr[9];
  const canali = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colore] || 4;
  const grezzo = Math.ceil(w * canali * bit / 8 + 1) * h;
  if (!(grezzo > 0) || grezzo > PNG_MAX_GREZZO) return buf;
  let righe;
  try { righe = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: grezzo + 1024 }); } catch { return buf; }
  const nuovo = zlib.deflateSync(righe, { level: 9, memLevel: 9 });
  const fuori = [PNG_FIRMA];
  for (const c of pezzi) {
    const d = c.tipo === 'IDAT' ? nuovo : c.dati;
    const testa = Buffer.alloc(8); testa.writeUInt32BE(d.length, 0); testa.write(c.tipo, 4, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(d, crc32(testa.subarray(4))) >>> 0, 0);
    fuori.push(testa, d, crc);
  }
  const out = Buffer.concat(fuori);
  return out.length < buf.length * 0.98 ? out : buf;
}

// ---------- Il mondo, ripulito per un altro gruppo ----------
/** Chi è master e quali personaggi sono dei giocatori (dal registro dei giocatori e dalle schede). */
function giocatoriDi(roster, liste) {
  const master = new Set(), pg = new Set();
  for (const [t, r] of Object.entries(roster || {})) {
    if (!r || typeof r !== 'object') continue;
    if (r.role === 'master') { master.add(t); continue; }
    for (const [id, v] of Object.entries(r.sheets || {})) if (v === 'rw') pg.add(id);   // la scheda che il master gli ha affidato
  }
  const diGiocatore = t => typeof t === 'string' && !!t && !master.has(t);
  for (const l of liste) for (const s of Array.isArray(l) ? l : []) if (s && diGiocatore(s.owner)) pg.add(s.id);
  return { pg, diGiocatore };
}
/** La nebbia come appena messa: tutto coperto (le zone della luce dinamica restano). */
function nebbiaCoperta(f) {
  if (!f || typeof f !== 'object' || typeof f.cells !== 'string') return f;
  return { ...f, cells: '0'.repeat(f.cells.length) };
}
function pulisciSchede(lista, g, conto) {
  if (!Array.isArray(lista)) return lista;
  return lista.filter(s => {
    if (s && g.pg.has(s.id)) { conto.schede.add(s.id); return false; }
    return true;
  }).map(s => { if (!s || typeof s !== 'object') return s; const o = { ...s }; delete o.owner; return o; });
}
function pulisciScene(scene, g, conto) {
  if (!Array.isArray(scene)) return scene;
  return scene.map(sc => {
    if (!sc || typeof sc !== 'object') return sc;
    const o = { ...sc };
    if (o.bg && typeof o.bg === 'object' && o.bg.gr) { o.bg = { ...o.bg }; delete o.bg.gr; }   // la copia per i giocatori: la rifà il master
    if (Array.isArray(o.photos)) o.photos = o.photos.filter(ph => {
      if (!ph) return false;
      const via = (ph.sheet && g.pg.has(ph.sheet)) || g.diGiocatore(ph.owner);     // i segnalini (e i disegni) dei giocatori
      if (via) conto.segnalini.add(o.id + '|' + ph.id);
      return !via;
    }).map(ph => { if (!ph.owner) return ph; const x = { ...ph }; delete x.owner; return x; });
    if (o.fog) o.fog = nebbiaCoperta(o.fog);
    return o;
  });
}
function pulisciMondo(w, g, conto) {
  if (!w || typeof w !== 'object') return w;
  const o = { ...w };
  o.scenes = pulisciScene(o.scenes, g, conto);
  o.sheets = pulisciSchede(o.sheets, g, conto);
  if (o.fog && typeof o.fog === 'object') o.fog = Object.fromEntries(Object.entries(o.fog).map(([k, f]) => [k, nebbiaCoperta(f)]));
  o.chat = [];
  o.visto = {};                    // quello che il gruppo ha già visto con la luce dinamica
  o.schedeTolte = [];
  delete o.turni;
  if (o.notes && typeof o.notes === 'object') o.notes = { text: '', editable: !!o.notes.editable };
  // il compendio con le voci di un manuale importato resta a chi l'ha importato
  if (o.compendio && MANUALI.jsonConManuale(JSON.stringify(o.compendio))) delete o.compendio;
  return o;
}
function pulisciTavolo(b, g, conto) {
  if (!b || typeof b !== 'object') return b;
  const o = { ...b, scenes: pulisciScene(b.scenes, g, conto) };
  if (o.settings && typeof o.settings === 'object') { o.settings = { ...o.settings }; delete o.settings.turni; }
  return o;
}

// ---------- Esportare ----------
/**
 * Fa il modulo della campagna `dir` in `fileZip`.
 * `programma` è la cartella del programma: i file uguali ai suoi (lo sfondo di benvenuto) non si portano.
 */
function esportaModulo(dir, fileZip, { radice = '', programma = null } = {}) {
  const D = path.join(dir, 'data');
  const conto = { schede: new Set(), segnalini: new Set(), doppioni: 0, risparmiati: 0, depositoVia: 0 };
  const roster = leggiJson(path.join(D, 'players.json')) || {};
  const mondo = leggiJson(path.join(D, 'world.json'));
  const tavolo = leggiJson(path.join(D, 'board.json'));
  const schede = leggiJson(path.join(D, 'sheets.json'));
  const g = giocatoriDi(roster, [mondo && mondo.sheets, schede]);

  // i JSON di data/, già ripuliti (testo senza spazi)
  const json = new Map();
  if (mondo) json.set('data/world.json', JSON.stringify(pulisciMondo(mondo, g, conto)));
  if (tavolo) json.set('data/board.json', JSON.stringify(pulisciTavolo(tavolo, g, conto)));
  if (schede) json.set('data/sheets.json', JSON.stringify(pulisciSchede(schede, g, conto)));
  const note = leggiJson(path.join(D, 'notes.json'));
  if (note) {                     // le note del master restano; quelle del gruppo erano del gruppo
    if (note.gruppo && typeof note.gruppo === 'object') note.gruppo = { text: '', editable: !!note.gruppo.editable };
    json.set('data/notes.json', JSON.stringify(note));
  }
  const predef = leggiJson(path.join(D, 'predefinite.json'));
  if (predef) json.set('data/predefinite.json', JSON.stringify(predef));
  const meta = leggiJson(path.join(dir, 'campagna.json')) || {};
  delete meta.invito;             // il codice è di chi la conduceva
  json.set('campagna.json', JSON.stringify(meta));

  // gli altri file della campagna (fuori da data/): immagini, sistema, compendio...
  const manuali = MANUALI.manualiNellaCampagna(dir);
  const altri = elenca(dir).filter(rel => {
    if (rel === 'campagna.json' || rel === MANIFESTO) return false;
    if (rel.startsWith('data/')) return false;
    if (/^sistema-precedente-/.test(rel)) return false;                       // le copie di sicurezza dei sistemi cambiati
    if (rel.split('/').some(p => p.startsWith('.'))) return false;            // cartelle e file nascosti (.cestino, .importo-…)
    if (manuali.some(id => rel.startsWith('compendio/' + id + '/'))) return false;
    return true;
  });
  // i JSON del sistema e del compendio possono citare file del deposito: si guardano anche quelli
  const testiCitano = [...json.values()];
  for (const rel of altri) if (/\.json$/i.test(rel)) { try { testiCitano.push(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8')); } catch {} }

  // il deposito: solo i file citati, senza le copie per i giocatori (non più citate) e senza i manuali
  const indice = leggiJson(path.join(D, 'assets.json')) || {};
  const citati = new Set();
  for (const t of testiCitano) for (const h of t.match(HASH) || []) citati.add(h);
  const deposito = [];
  for (const [h, info] of Object.entries(indice)) {
    const f = info && /^[a-f0-9]{64}$/.test(h) ? path.join(D, 'assets', h + (info.ext || '')) : null;
    if (!f || !citati.has(h) || !fs.existsSync(f)) { conto.depositoVia++; continue; }
    deposito.push({ h, info, f });
  }

  // i file del programma (lo sfondo di benvenuto): uguali, non si portano
  const delProgramma = new Map();
  if (programma) {
    const base = path.join(programma, 'assets');
    try { for (const rel of elenca(base)) delProgramma.set(sha(fs.readFileSync(path.join(base, ...rel.split('/')))), 'assets/' + rel); } catch {}
  }

  const man = { formato: FORMATO, versione: 1, creato: new Date().toISOString(), copie: {}, dalProgramma: {} };
  const visti = new Map();                       // impronta del contenuto → dove sta nello zip
  const z = scrittoreZip(fileZip, { radice, livello: 9 });
  try {
    const metti = (rel, dati, quando) => {
      const k = sha(dati);
      if (delProgramma.has(k)) { man.dalProgramma[rel] = delProgramma.get(k); conto.doppioni++; conto.risparmiati += dati.length; return; }
      if (visti.has(k)) { man.copie[rel] = visti.get(k); conto.doppioni++; conto.risparmiati += dati.length; return; }
      visti.set(k, rel);
      z.aggiungi(rel, dati, quando);
    };
    const leggiFile = f => { const dati = fs.readFileSync(f); let quando; try { quando = fs.statSync(f).mtime; } catch {} return { dati, quando }; };
    // 1. il deposito (un PNG ricompresso cambia impronta, quindi nome: lo si cambia anche dove è citato)
    const rinomina = new Map(), nuovoIndice = {};
    for (const { h, info, f } of deposito) {
      let { dati, quando } = leggiFile(f);
      if (info.ext === '.json' && MANUALI.jsonConManuale(dati.toString('utf8'))) continue;
      let hh = h;
      if (info.ext === '.png') {
        const leggero = pngPiuLeggero(dati);
        if (leggero !== dati) { conto.risparmiati += dati.length - leggero.length; dati = leggero; hh = sha(dati); if (hh !== h) rinomina.set(h, hh); }
      }
      nuovoIndice[hh] = { ...info, bytes: dati.length };
      metti('data/assets/' + hh + (info.ext || ''), dati, quando);
    }
    // 2. gli altri file della campagna
    const cambia = t => { for (const [a, b] of rinomina) t = t.split(a).join(b); return t; };
    for (const rel of altri) {
      let { dati, quando } = leggiFile(path.join(dir, ...rel.split('/')));
      if (/\.png$/i.test(rel)) { const l = pngPiuLeggero(dati); conto.risparmiati += dati.length - l.length; dati = l; }
      else if (/\.json$/i.test(rel)) {        // senza spazi (se è JSON davvero)
        try { const t = cambia(JSON.stringify(JSON.parse(dati.toString('utf8')))); if (t.length < dati.length || rinomina.size) dati = Buffer.from(t, 'utf8'); } catch {}
      }
      metti(rel, dati, quando);
    }
    // 3. i JSON della campagna, con i nomi nuovi dei file del deposito
    for (const [rel, t] of json) z.aggiungi(rel, Buffer.from(cambia(t), 'utf8'));
    z.aggiungi('data/assets.json', Buffer.from(JSON.stringify(nuovoIndice), 'utf8'));
    z.aggiungi(MANIFESTO, Buffer.from(JSON.stringify(man), 'utf8'));
  } catch (e) { z.annulla(); throw e; }
  const r = z.chiudi();
  return { ...r, personaggiTolti: conto.schede.size, segnaliniTolti: conto.segnalini.size, doppioni: conto.doppioni, risparmiati: conto.risparmiati, depositoTolti: conto.depositoVia };
}

// ---------- Importare ----------
const scriviSegreto = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, { mode: 0o600 }); try { fs.chmodSync(f, 0o600); } catch {} };
/** Dentro `base`, il percorso relativo `rel` (con «/»), se non esce da lì. */
function dentro(base, rel) {
  const parti = String(rel || '').split('/').filter(p => p && p !== '.');
  if (!parti.length || parti.some(p => p === '..' || /[\u0000-\u001f]|^[a-z]:$/i.test(p))) return null;
  const f = path.resolve(base, ...parti);
  return f.startsWith(path.resolve(base) + path.sep) ? f : null;
}
/**
 * Se `dir` è un modulo appena arrivato (c'è modulo-libre-vtt.json), lo finisce: rimette i file che nello
 * zip c'erano una volta sola e fa chiavi e codice nuovi, solo per chi l'ha importato. Poi toglie il
 * manifesto: la campagna è sua. Si può chiamare a ogni apertura: senza manifesto non fa niente.
 */
function completaModulo(dir, { programma = null } = {}) {
  const fm = path.join(dir, MANIFESTO);
  const man = leggiJson(fm);
  if (!man || man.formato !== FORMATO) return false;
  let rimessi = 0;
  const copia = (da, a) => {
    if (!da || !a || fs.existsSync(a) || !fs.existsSync(da)) return;
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.copyFileSync(da, a); rimessi++;
  };
  for (const [rel, src] of Object.entries(man.copie || {})) copia(dentro(dir, src), dentro(dir, rel));
  if (programma) for (const [rel, src] of Object.entries(man.dalProgramma || {})) copia(dentro(programma, src), dentro(dir, rel));
  // le chiavi di chi l'ha fatta non ci sono (e se ci fossero, via): codice d'invito, parola e firma nuovi
  const D = path.join(dir, 'data');
  fs.mkdirSync(D, { recursive: true });
  for (const n of SEGRETI) { try { fs.rmSync(path.join(D, n), { force: true }); } catch {} }
  for (const n of ['collegamento', 'miniature']) { try { fs.rmSync(path.join(D, n), { recursive: true, force: true }); } catch {} }
  scriviSegreto(path.join(D, 'invito.chiave'), crypto.randomBytes(32).toString('hex'));
  scriviSegreto(path.join(D, 'invito.segreto'), crypto.randomBytes(16).toString('hex'));
  scriviSegreto(path.join(D, 'identita.chiave'), crypto.randomBytes(32).toString('hex'));
  // campagna.json di nuovo leggibile a occhio, con la data dell'arrivo
  const fc = path.join(dir, 'campagna.json'), meta = leggiJson(fc);
  if (meta) { delete meta.invito; meta.importata = new Date().toISOString(); fs.writeFileSync(fc, JSON.stringify(meta, null, 2)); }
  fs.rmSync(fm, { force: true });
  return { rimessi };
}

module.exports = { esportaModulo, completaModulo, pngPiuLeggero, MANIFESTO };
