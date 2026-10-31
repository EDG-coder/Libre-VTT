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
    return String(css)
      .replace(/@import[^;]*;?/gi, '')
      .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, q, u) => /^#[\w.:-]+$/.test(u.trim()) || RIF_BUONO.test(u.trim()) ? m : 'none')
      .replace(/expression\s*\(|javascript:|-moz-binding|behavior\s*:/gi, '');
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

  function pulisci(testo) {
    testo = String(testo || '');
    if (testo.length > MAX_BYTE) return { errore: 'SVG troppo grande (massimo 8 MB)' };
    // dichiarazioni, commenti e istruzioni non servono a disegnare (e le entità XML sono un rischio)
    testo = testo.replace(/^﻿/, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, '');
    const pezzi = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=\/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
    const out = [], pila = [], veri = [];   // pila: nomi in minuscolo (per i confronti); veri: come scritti (XML distingue maiuscole)
    let via = 0, elementi = 0, radice = null, m;
    while ((m = pezzi.exec(testo))) {
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
