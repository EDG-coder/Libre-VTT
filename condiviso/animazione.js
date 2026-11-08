// ---------- Un'immagine è animata? (gli stessi controlli sul server e nel browser) ----------
// Si leggono solo le intestazioni, niente si decodifica: GIF con più di un fotogramma, WebP con il
// segno dell'animazione (blocco VP8X), PNG animato (APNG: blocco acTL prima delle immagini).
// Serve agli sfondi animati delle scene (web/js/mappa/sfondo-animato.js e l'elenco degli assets di server/server.js).
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.ANIMAZIONE = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));
  function gifAnimata(b) {
    if (b.length < 13 || ascii(b, 0, 3) !== 'GIF') return false;
    let i = 13, quadri = 0;
    if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));                  // tavolozza globale
    const salta = () => { while (i < b.length && b[i]) i += b[i] + 1; i++; };   // i sotto-blocchi fino allo 0
    while (i < b.length) {
      const t = b[i++];
      if (t === 0x21) { i++; salta(); }                                    // estensione
      else if (t === 0x2C) {                                               // un fotogramma
        if (++quadri > 1) return true;
        const f = b[i + 8]; i += 9;
        if (f & 0x80) i += 3 * (1 << ((f & 7) + 1));                       // tavolozza locale
        i++; salta();                                                      // dimensione del codice LZW, poi i dati
      } else break;                                                        // 0x3B = fine (o file rotto)
    }
    return false;
  }
  const webpAnimata = b => b.length >= 21 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && ascii(b, 12, 4) === 'VP8X' && !!(b[20] & 0x02);
  function pngAnimata(b) {
    if (b.length < 16 || b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG') return false;
    for (let i = 8; i + 8 <= b.length;) {
      const n = (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0, tipo = ascii(b, i + 4, 4);
      if (tipo === 'acTL') return true;                                    // APNG: il blocco viene prima delle immagini
      if (tipo === 'IDAT') return false;
      i += 12 + n;
    }
    return false;
  }

  /** b: Uint8Array (o Buffer) con il file, o almeno il suo inizio */
  const animata = b => gifAnimata(b) || webpAnimata(b) || pngAnimata(b);
  return { animata, gifAnimata, webpAnimata, pngAnimata };
});
