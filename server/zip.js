// ---------- File .zip, senza dipendenze ----------
// Per passare una campagna da un dispositivo all'altro: sul telefono una cartella non si
// può «prendere e copiare» come sul computer, un unico file .zip sì (lo si manda con
// WhatsApp, Telegram, Drive, una chiavetta…). Lo leggono e scrivono tutti i sistemi.
//
//   creaZip(cartella, fileZip, { radice })   → { file, voci, byte }
//   estraiZip(fileZip, cartella)             → { voci, byte }
//
// Solo quello che serve: «store» per le immagini (sono già compresse) e «deflate» per il
// resto, niente ZIP64 (fino a 4 GB, una campagna non ci arriva), nomi in UTF-8.
// Un file da fuori non può scrivere fuori dalla cartella di destinazione («zip slip»).

'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const CRC_TAB = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf, crc = 0) {
  crc = ~crc;
  for (let i = 0; i < buf.length; i++) crc = CRC_TAB[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return ~crc >>> 0;
}

const GIA_COMPRESSI = /\.(webp|png|jpe?g|gif|avif|mp3|ogg|m4a|mp4|webm|zip|gz)$/i;
const LIMITE = 0xfffffffe;                 // oltre servirebbe ZIP64
const SPAZZATURA = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX)(\/|$)|(^|\/)\._|\.tmp$/i;

/** Data e ora nel formato MS-DOS usato dentro gli zip. */
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

/** Tutti i file sotto `dir`, con il percorso relativo (separato da «/»). */
function elenca(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (SPAZZATURA.test(r)) continue;
    if (e.isDirectory()) elenca(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/**
 * Mette tutta la cartella `dir` in `fileZip`. Dentro lo zip i file stanno sotto `radice/`
 * (così chi lo apre a mano trova una cartella sola e non cento file sparsi).
 */
function creaZip(dir, fileZip, { radice = path.basename(dir) } = {}) {
  const pre = radice ? radice.replace(/[\\/]+/g, '_') + '/' : '';
  const voci = elenca(dir);
  const centrale = [];
  const tmp = fileZip + '.part';
  const fd = fs.openSync(tmp, 'w');
  let pos = 0, byte = 0;
  const scrivi = b => { fs.writeSync(fd, b, 0, b.length, pos); pos += b.length; };
  try {
    for (const rel of voci) {
      const pieno = path.join(dir, ...rel.split('/'));
      const dati = fs.readFileSync(pieno);
      const st = fs.statSync(pieno);
      const crc = crc32(dati);
      const comprimi = !GIA_COMPRESSI.test(rel) && dati.length > 64;
      let corpo = comprimi ? zlib.deflateRawSync(dati, { level: 6 }) : dati;
      let metodo = comprimi ? 8 : 0;
      if (comprimi && corpo.length >= dati.length) { corpo = dati; metodo = 0; }   // non conviene
      if (dati.length > LIMITE || pos + corpo.length > LIMITE) throw new Error('La campagna è troppo grande per un file .zip (più di 4 GB).');
      const nome = Buffer.from(pre + rel, 'utf8');
      const { time, date } = dosTime(st.mtime);
      const loc = Buffer.alloc(30);
      loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6);   // UTF-8
      loc.writeUInt16LE(metodo, 8); loc.writeUInt16LE(time, 10); loc.writeUInt16LE(date, 12);
      loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(corpo.length, 18); loc.writeUInt32LE(dati.length, 22);
      loc.writeUInt16LE(nome.length, 26); loc.writeUInt16LE(0, 28);
      const offset = pos;
      scrivi(loc); scrivi(nome); scrivi(corpo);
      byte += dati.length;
      centrale.push({ nome, metodo, time, date, crc, compresso: corpo.length, pieno: dati.length, offset });
    }
    const inizio = pos;
    for (const c of centrale) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(0x031e, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(c.metodo, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14);
      h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.compresso, 20); h.writeUInt32LE(c.pieno, 24);
      h.writeUInt16LE(c.nome.length, 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32); h.writeUInt16LE(0, 34);
      h.writeUInt16LE(0, 36); h.writeUInt32LE((0o100644 << 16) >>> 0, 38); h.writeUInt32LE(c.offset, 42);
      scrivi(h); scrivi(c.nome);
    }
    const fine = Buffer.alloc(22);
    fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(0, 4); fine.writeUInt16LE(0, 6);
    fine.writeUInt16LE(centrale.length, 8); fine.writeUInt16LE(centrale.length, 10);
    fine.writeUInt32LE(pos - inizio, 12); fine.writeUInt32LE(inizio, 16); fine.writeUInt16LE(0, 20);
    if (centrale.length > 0xfffe) throw new Error('Troppi file per un file .zip.');
    scrivi(fine);
  } catch (e) {
    fs.closeSync(fd); try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, fileZip);
  return { file: fileZip, voci: voci.length, byte };
}

/** Il percorso dentro lo zip, reso sicuro: niente assoluti, niente «..», niente lettere di disco. */
function percorsoSicuro(nome) {
  const parti = String(nome).replace(/\\/g, '/').split('/').filter(p => p && p !== '.');
  if (!parti.length || parti.some(p => p === '..' || /^[a-z]:$/i.test(p) || /[\u0000-\u001f]/.test(p))) return null;
  return parti;
}

/**
 * Estrae `fileZip` dentro `dest` (che deve già esistere o verrà creata).
 * Salta la spazzatura dei sistemi (__MACOSX, .DS_Store…). Errore se lo zip è rovinato.
 */
function estraiZip(fileZip, dest, { maxByte = 4 * 1024 * 1024 * 1024, maxVoci = 50000 } = {}) {
  const fd = fs.openSync(fileZip, 'r');
  try {
    const dim = fs.fstatSync(fd).size;
    const leggi = (pos, n) => { const b = Buffer.alloc(n); const r = fs.readSync(fd, b, 0, n, pos); return r === n ? b : b.subarray(0, r); };
    // la «fine della directory centrale» sta negli ultimi 22 byte (più un eventuale commento)
    const coda = leggi(Math.max(0, dim - 65557), Math.min(dim, 65557));
    let e = -1;
    for (let i = coda.length - 22; i >= 0; i--) if (coda.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Questo file non è uno .zip valido.');
    const n = coda.readUInt16LE(e + 10), lung = coda.readUInt32LE(e + 12), off = coda.readUInt32LE(e + 16);
    if (n === 0xffff || off === 0xffffffff) throw new Error('Questo .zip è troppo grande (ZIP64): non lo so aprire.');
    if (n > maxVoci) throw new Error('Questo .zip contiene troppi file.');
    const dir = leggi(off, lung);
    fs.mkdirSync(dest, { recursive: true });
    const base = path.resolve(dest);
    let p = 0, voci = 0, byte = 0;
    for (let k = 0; k < n; k++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== 0x02014b50) throw new Error('Lo .zip è rovinato.');
      const flag = dir.readUInt16LE(p + 8), metodo = dir.readUInt16LE(p + 10), crc = dir.readUInt32LE(p + 16);
      const compresso = dir.readUInt32LE(p + 20), pieno = dir.readUInt32LE(p + 24);
      const ln = dir.readUInt16LE(p + 28), lx = dir.readUInt16LE(p + 30), lc = dir.readUInt16LE(p + 32);
      const locale = dir.readUInt32LE(p + 42);
      const grezzo = dir.subarray(p + 46, p + 46 + ln);
      const nome = (flag & 0x0800) ? grezzo.toString('utf8') : grezzo.toString('latin1');
      p += 46 + ln + lx + lc;
      if (flag & 1) throw new Error('Lo .zip è protetto da password: non lo so aprire.');
      const parti = percorsoSicuro(nome);
      if (!parti || SPAZZATURA.test(parti.join('/'))) continue;
      const finale = path.join(base, ...parti);
      if (finale !== base && !finale.startsWith(base + path.sep)) continue;
      if (nome.endsWith('/')) { fs.mkdirSync(finale, { recursive: true }); continue; }
      if ((byte += pieno) > maxByte) throw new Error('Il contenuto dello .zip è troppo grande.');
      const lh = leggi(locale, 30);
      if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Lo .zip è rovinato.');
      const dati = leggi(locale + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28), compresso);
      let out;
      if (metodo === 0) out = dati;
      else if (metodo === 8) out = zlib.inflateRawSync(dati);
      else throw new Error(`«${nome}» usa una compressione che non conosco.`);
      if (out.length !== pieno || crc32(out) !== crc) throw new Error(`«${nome}» nello .zip è rovinato.`);
      fs.mkdirSync(path.dirname(finale), { recursive: true });
      fs.writeFileSync(finale, out);
      voci++;
    }
    return { voci, byte };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { creaZip, estraiZip, crc32 };
