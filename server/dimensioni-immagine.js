'use strict';
/**
 * Legge larghezza e altezza di un'immagine dall'intestazione, senza decodificarla (niente dipendenze).
 * Il formato si riconosce dai primi byte, non dal tipo dichiarato da chi carica.
 * Formati: PNG, JPEG, WebP (VP8, VP8L, VP8X), GIF, BMP. Restituisce { w, h } oppure null se non si capisce.
 */
function dimensioniImmagine(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 10) return null;
  try {
    // PNG: firma di 8 byte, poi il pezzo IHDR con larghezza e altezza (32 bit, big endian)
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a && buf.toString('latin1', 12, 16) === 'IHDR') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // GIF: «GIF87a» / «GIF89a», poi larghezza e altezza (16 bit, little endian)
    if (buf.toString('latin1', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    // BMP: «BM», poi l'intestazione DIB con larghezza e altezza (32 bit con segno: l'altezza può essere negativa)
    if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
      if (buf.readUInt32LE(14) === 12) return { w: buf.readUInt16LE(18), h: buf.readUInt16LE(20) };
      return { w: Math.abs(buf.readInt32LE(18)), h: Math.abs(buf.readInt32LE(22)) };
    }
    // WebP: «RIFF» .... «WEBP», poi il primo pezzo dice il tipo
    if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
      const tipo = buf.toString('latin1', 12, 16);
      if (tipo === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (tipo === 'VP8L' && buf[20] === 0x2f) {
        const b = buf.readUInt32LE(21);
        return { w: 1 + (b & 0x3fff), h: 1 + ((b >>> 14) & 0x3fff) };
      }
      if (tipo === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      return null;
    }
    // JPEG: si scorrono i segmenti fino al primo SOFn, che contiene altezza e larghezza (16 bit, big endian)
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const mk = buf[i + 1];
        if (mk === 0xff) { i++; continue; }                                  // byte di riempimento
        if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }   // segnaposto senza lunghezza
        if (mk === 0xd9 || mk === 0xda) return null;                         // fine immagine o inizio dei dati prima di un SOF
        const len = buf.readUInt16BE(i + 2);
        if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        if (len < 2) return null;
        i += 2 + len;
      }
      return null;
    }
  } catch { return null; }
  return null;
}

module.exports = { dimensioniImmagine };
