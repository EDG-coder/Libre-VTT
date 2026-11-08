// ---------- SVG puliti (gli stessi conti sul server e nel browser) ----------
// Un SVG è un documento, non solo un'immagine: può contenere script, pagine HTML (foreignObject),
// gestori come onload e richiami a file di altri siti. Prima di tenerne uno (sfondo, segnalino, o
// arrivato da un giocatore) lo si riscrive tenendo solo gli elementi e gli attributi da disegno:
//   pulisci(testo) → { svg, w, h } oppure { errore }
// Gli elementi sconosciuti spariscono (il loro contenuto resta, se non è pericoloso); i collegamenti
// valgono solo dentro il file (#id) o verso immagini incorporate (data:image/png|jpeg|gif|webp).
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.SVG_PULITO = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_BYTE = 8 * 1024 * 1024, MAX_ELEMENTI = 60000;
  const BUONI = new Set(('svg g defs symbol use title desc metadata path rect circle ellipse line polyline polygon text tspan textPath ' +
    'linearGradient radialGradient stop pattern clipPath mask marker image style switch a view ' +
    'filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap ' +
    'feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode ' +
    'feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence').split(' ').map(s => s.toLowerCase()));
  // questi si tolgono con tutto quello che hanno dentro
  const VIA = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'handler', 'listener', 'animate', 'set', 'animatemotion', 'animatetransform', 'discard']);
  const RIF_BUONO = /^(#[\w.:-]*|data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*)$/i;
  const esc = s => String(s).replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /** I richiami dentro uno stile: url(#id) va bene, il resto (file esterni, @import) no. */
  function stilePulito(css) {
    let r = urlPuliti(String(css).replace(/@import[^;]*;?/gi, ''));
    // si ripete finché non cambia più: «javajavascript:script:» tolto una volta sola ridiventerebbe «javascript:»
    // (al massimo qualche giro, poi lo stile si butta tutto: un annidamento lungo non deve costare il quadrato del testo)
    for (let giro = 0, prima = null; prima !== r; giro++) {
      if (giro > 4) return '';
      prima = r; r = r.replace(/expression\s*\(|javascript:|-moz-binding|behavior\s*:/gi, '');
    }
    return r;
  }
  /** Ogni url(…) che non punta dentro il file diventa «none». A mano e in un solo passaggio: con l'espressione regolare di prima
   *  («url\(\s*(['"]?)(.*?)\1\s*\)») un «url(» ripetuto senza chiusura costava il quadrato della lunghezza. */
  function urlPuliti(t) {
    const basso = t.toLowerCase();
    let out = '', i = 0, noParen = false, nl = -1;
    const isSp = c => c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0xfeff || (c >= 0x2000 && c <= 0x200a) || c === 0x1680 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0x2028 || c === 0x2029;
    const aCapo = c => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
    // la fine della riga che comincia in p (il «.» dell'espressione di prima non attraversa gli a capo)
    const fineRiga = p => { if (nl < p) { nl = p; while (nl < t.length && !aCapo(t.charCodeAt(nl))) nl++; } return nl; };
    for (;;) {
      const j = basso.indexOf('url(', i);
      if (j < 0) break;
      let p = j + 4;
      while (p < t.length && isSp(t.charCodeAt(p))) p++;
      const q = t[p] === '"' || t[p] === "'" ? t[p] : '';
      let fine = -1, dentro = '';
      if (q) {
        const k = t.indexOf(q, p + 1);
        if (k >= 0 && k < fineRiga(p)) { let r = k + 1; while (r < t.length && isSp(t.charCodeAt(r))) r++; if (t[r] === ')') { fine = r + 1; dentro = t.slice(p + 1, k); } }
      }
      if (fine < 0 && !noParen) {
        const k = t.indexOf(')', p);
        if (k < 0) noParen = true;
        else { let e = k; while (e > p && isSp(t.charCodeAt(e - 1))) e--; if (e <= fineRiga(p)) { fine = k + 1; dentro = t.slice(p, e); } }   // il contenuto sta su una riga; dopo ci possono essere spazi e a capo
      }
      if (fine < 0) { out += t.slice(i, j + 4); i = j + 4; continue; }
      const u = dentro.trim();
      out += t.slice(i, j) + (/^#[\w.:-]+$/.test(u) || RIF_BUONO.test(u) ? t.slice(j, fine) : 'none');
      i = fine;
    }
    return out + t.slice(i);
  }
  function attributi(testo) {
    const out = [];
    const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m;
    while ((m = re.exec(testo))) {
      const nome = m[1], v = m[2] ?? m[3] ?? m[4] ?? '';
      const n = nome.toLowerCase();
      if (n.startsWith('on')) continue;                                   // onload, onclick…
      if (/^(xmlns(:\w+)?|xml:space|xml:lang)$/.test(n)) { out.push([nome, v]); continue; }
      if (n.includes(':') && !/^xlink:(href|title)$/.test(n)) continue;   // altri spazi dei nomi (sodipodi, inkscape…)
      const dec = v.replace(/&#(x?)([0-9a-f]+);?/gi, (_, x, d) => String.fromCharCode(parseInt(d, x ? 16 : 10))).replace(/[\s\u0000-\u001f]/g, '');
      if (/javascript:|vbscript:|data:text|data:application/i.test(dec)) continue;
      if (n === 'href' || n === 'xlink:href' || n === 'src') { if (!RIF_BUONO.test(v.trim())) continue; }
      if (n === 'style') { out.push([nome, stilePulito(v)]); continue; }
      if (/^(fill|stroke|filter|clip-path|mask|marker-start|marker-mid|marker-end)$/.test(n) && /url\(/i.test(v)) { out.push([nome, stilePulito(v)]); continue; }
      out.push([nome, v]);
    }
    return out;
  }

  /**
   * Toglie dichiarazioni «<?…?>», commenti «<!--…-->» e DOCTYPE (con le sue entità), in un solo passaggio.
   * Prima erano espressioni regolari: su un testo fatto apposta (un «<!DOCTYPE[» ripetuto, senza chiusura) il
   * tempo cresceva col cubo della lunghezza e 20 KB fermavano il server per secondi. Qui ogni pezzo si
   * cerca con indexOf e, se la chiusura non esiste, non esiste nemmeno più avanti: non si cerca due volte.
   */
  function senzaDichiarazioni(t) {
    const out = [];
    let i = 0, noPI = false, noCom = false, noDoc = false;
    const MAI = 1 << 30;
    while (i < t.length) {
      const j = t.indexOf('<', i);
      if (j < 0) { out.push(t.slice(i)); break; }
      if (j > i) out.push(t.slice(i, j));
      let fine = -1;
      if (!noPI && t.startsWith('<?', j)) {
        const k = t.indexOf('?>', j + 2);
        if (k < 0) noPI = true; else fine = k + 2;
      } else if (!noCom && t.startsWith('<!--', j)) {
        const k = t.indexOf('-->', j + 4);
        if (k < 0) noCom = true; else fine = k + 3;
      } else if (!noDoc && t.substr(j, 9).toUpperCase() === '<!DOCTYPE') {
        // fino al «>» che chiude, saltando le parentesi quadre (le entità) se ci sono
        let k = t.indexOf('>', j + 9);
        const q = t.indexOf('[', j + 9);
        if (q >= 0 && (k < 0 || q < k)) { const c = t.indexOf(']', q + 1); k = c < 0 ? -1 : t.indexOf('>', c + 1); }
        if (k < 0) noDoc = true; else fine = k + 1;
      }
      if (fine >= 0) i = fine; else { out.push('<'); i = j + 1; }
    }
    return out.join('');
  }

  // ---------- Il lettore dei pezzi (CDATA, tag, testo): a mano, senza espressioni regolari ----------
  // Una espressione regolare per i tag (con gli attributi dentro) su un tag mai chiuso («<svg a="1" <svg a="1" …»)
  // provava tutte le strade possibili: 12 KB bastavano per fermare il server per ore. Qui si legge una volta sola;
  // e il lavoro buttato via per i tag che non si chiudono ha un tetto (proporzionale al file): oltre, il file si rifiuta.
  const spazio = c => c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0xfeff || c === 0x2028 || c === 0x2029 || (c >= 0x2000 && c <= 0x200a) || c === 0x1680 || c === 0x202f || c === 0x205f || c === 0x3000;
  const LETTERA = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  const NOME = c => LETTERA(c) || (c >= 48 && c <= 57) || c === 95 || c === 58 || c === 46 || c === 45;
  /** Dopo il nome di un tag, da i: gli attributi e la chiusura. → { att, solo, fine } oppure { scansione } se non si chiude. */
  function codaTag(t, i, st) {
    const L = t.length;
    let p = i;
    for (;;) {
      let q = p;
      while (q < L && spazio(t.charCodeAt(q))) q++;
      if (q >= L) return { scansione: q - i };
      const c = t.charCodeAt(q);
      if (c === 62) return { att: t.slice(i, p), solo: false, fine: q + 1 };                          // >
      if (c === 47) return t.charCodeAt(q + 1) === 62 ? { att: t.slice(i, p), solo: true, fine: q + 2 } : { scansione: q - i };   // />
      if (q === p) return { scansione: q - i };                                                      // un attributo vuole uno spazio prima
      let r = q;
      while (r < L) { const d = t.charCodeAt(r); if (spazio(d) || d === 61 || d === 47 || d === 62) break; r++; }
      if (r === q) return { scansione: q - i };                                                      // «=» senza nome
      let u = r;
      while (u < L && spazio(t.charCodeAt(u))) u++;
      if (t.charCodeAt(u) !== 61) { p = r; continue; }                                               // attributo senza valore
      u++;
      while (u < L && spazio(t.charCodeAt(u))) u++;
      const v = t.charCodeAt(u);
      let k = -1;
      if (v === 34 || v === 39) {
        // tra virgolette; se non si chiudono, o subito dopo non c'è uno spazio o la fine del tag, vale come valore senza virgolette (come faceva prima)
        const c = t.indexOf(v === 34 ? '"' : "'", u + 1);
        if (c >= 0) { const d = t.charCodeAt(c + 1); if (c + 1 >= L || spazio(d) || d === 62 || (d === 47 && t.charCodeAt(c + 2) === 62)) k = c + 1; }
      }
      if (k < 0) {
        k = u;
        while (k < L) { const d = t.charCodeAt(k); if (spazio(d) || d === 62) break; k++; }
        if (k === u) return { scansione: u - i };
      }
      p = k;
    }
  }
  /** Il pezzo che comincia in i, come lo dava l'espressione regolare: m[1] CDATA, m[2] «/», m[3] nome, m[4] attributi, m[5] «/», m[6] testo, m[7] «<». */
  function pezzo(t, i, st) {
    if (t.charCodeAt(i) !== 60) {
      let j = t.indexOf('<', i); if (j < 0) j = t.length;
      return { m: [null, null, null, null, null, null, t.slice(i, j), null], fine: j };
    }
    if (!st.noCdata && t.startsWith('<![CDATA[', i)) {
      const k = t.indexOf(']]>', i + 9);
      if (k < 0) st.noCdata = true; else return { m: [null, t.slice(i + 9, k), null, null, null, null, null, null], fine: k + 3 };
    }
    let a = i + 1;
    const chiude = t.charCodeAt(a) === 47;
    if (chiude) a++;
    if (LETTERA(t.charCodeAt(a))) {
      let b = a + 1;
      while (b < t.length && NOME(t.charCodeAt(b))) b++;
      const r = codaTag(t, b, st);
      if (r.fine != null) return { m: [null, null, chiude ? '/' : '', t.slice(a, b), r.att, r.solo ? '/' : '', null, null], fine: r.fine };
      st.spreco += r.scansione + 1;
      if (st.spreco > st.tetto) return { troppo: true };
    }
    return { m: [null, null, null, null, null, null, null, '<'], fine: i + 1 };
  }

  function pulisci(testo) {
    testo = String(testo || '');
    if (testo.length > MAX_BYTE) return { errore: 'SVG troppo grande (massimo 8 MB)' };
    // dichiarazioni, commenti e istruzioni non servono a disegnare (e le entità XML sono un rischio)
    testo = senzaDichiarazioni(testo.replace(/^﻿/, ''));
    const st = { noCdata: false, spreco: 0, tetto: 4 * testo.length + 100000 };
    const out = [], pila = [], veri = [];   // pila: nomi in minuscolo (per i confronti); veri: come scritti (XML distingue maiuscole)
    let via = 0, elementi = 0, radice = null, m, pos = 0;
    while (pos < testo.length) {
      const z = pezzo(testo, pos, st);
      if (z.troppo) return { errore: 'SVG non valido (tag che non si chiudono)' };
      m = z.m; pos = z.fine;
      if (m[1] != null) { if (!via && pila[pila.length - 1] === 'style') out.push(esc(stilePulito(m[1]))); else if (!via) out.push(esc(m[1])); continue; }
      if (m[6] != null) { if (!via) out.push(pila[pila.length - 1] === 'style' ? stilePulito(m[6]) : m[6]); continue; }
      if (m[7] != null) { if (!via) out.push('&lt;'); continue; }
      const chiude = m[2] === '/', nome = m[3], n = nome.toLowerCase().replace(/^svg:/, ''), solo = m[5] === '/';
      if (chiude) {
        const i = Math.max(pila.lastIndexOf(n), pila.lastIndexOf('?' + n));
        if (i < 0) continue;
        while (pila.length > i) {
          const t = pila.pop(), v = veri.pop();
          if (VIA.has(t)) via--;
          else if (!via && BUONI.has(t)) out.push(`</${v}>`);
        }
        continue;
      }
      if (++elementi > MAX_ELEMENTI) return { errore: 'SVG troppo complicato (più di ' + MAX_ELEMENTI + ' elementi)' };
      if (via || VIA.has(n)) { if (!solo) { pila.push(n); veri.push(n); if (VIA.has(n)) via++; } continue; }
      if (!BUONI.has(n)) { if (!solo) { pila.push('?' + n); veri.push(n); } continue; }      // sconosciuto: via il tag, resta il contenuto
      let at = attributi(m[4] || '');
      if (n === 'svg' && !radice) {
        radice = {};
        for (const [k, v] of at) radice[k.toLowerCase()] = v;
        if (!radice.xmlns) at.push(['xmlns', 'http://www.w3.org/2000/svg']);
        // senza larghezza e altezza l'immagine non ha misure: si prendono dal viewBox
        const vb = String(radice.viewbox || '').trim().split(/[\s,]+/).map(Number);
        const misura = v => /^\s*[\d.]+\s*(px)?\s*$/.test(v || '') ? parseFloat(v) : 0;
        let w = misura(radice.width), h = misura(radice.height);
        if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
          if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = h * vb[2] / vb[3]; else h = w * vb[3] / vb[2];
          at = at.filter(([k]) => !/^(width|height)$/i.test(k)).concat([['width', String(w)], ['height', String(h)]]);
        }
        radice.w = w; radice.h = h;
        if (at.some(([k]) => /^xlink:/.test(k)) || /xlink:/.test(testo)) if (!radice['xmlns:xlink']) at.push(['xmlns:xlink', 'http://www.w3.org/1999/xlink']);
      }
      out.push('<' + nome.replace(/^svg:/, '') + at.map(([k, v]) => ` ${k}="${esc(v)}"`).join('') + (solo ? '/>' : '>'));
      if (!solo) { pila.push(n); veri.push(nome.replace(/^svg:/, '')); }
    }
    while (pila.length) { const t = pila.pop(), v = veri.pop(); if (!t.startsWith('?') && !VIA.has(t) && !via) out.push(`</${v}>`); else if (VIA.has(t)) via--; }
    if (!radice) return { errore: 'Questo file non sembra un SVG' };
    return { svg: out.join(''), w: radice.w || 0, h: radice.h || 0 };
  }

  return { pulisci, MAX_BYTE, MAX_ELEMENTI };
});
