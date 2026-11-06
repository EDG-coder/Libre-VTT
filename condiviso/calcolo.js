// ---------- La calcolatrice della chat (gli stessi conti sul server e nel browser) ----------
// Chi scrive in chat un calcolo che finisce con «=» e niente dopo («2+2=», «(15+3)*2 =», «7,5/2=») riceve
// subito sotto un messaggio col risultato. Niente eval né Function: un piccolo lettore che conosce solo
// numeri, + − × ÷ ^, parentesi e il meno davanti. Tutto il resto (lettere, dadi, testo) non è un calcolo
// e il messaggio resta un messaggio normale.
(function (radice, fabbrica) {
  const m = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = m; else radice.CALCOLO = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LUNGO = 200;      // caratteri dell'espressione
  const MAX_PEZZI = 120;      // numeri e segni
  const MAX_FONDO = 20;       // parentesi una dentro l'altra (e meno davanti di fila)

  // I segni che si accettano, ciascuno col suo significato: × e x per «per», ÷ e : per «diviso».
  const SEGNI = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', 'x': '*', 'X': '*', '·': '*', '/': '/', '÷': '/', ':': '/', '^': '^', '(': '(', ')': ')' };

  /** Divide l'espressione in numeri e segni; null se c'è qualcosa che non è un calcolo. */
  function pezzi(s) {
    const out = [];
    let i = 0, virgola = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (/[0-9.,]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.,]/.test(s[j])) j++;
        const t = s.slice(i, j);
        if (t.includes(',')) virgola = true;
        // un solo separatore dei decimali, punto o virgola: «1.000,5» o «1,2,3» non si indovinano
        if ((t.match(/[.,]/g) || []).length > 1 || !/[0-9]/.test(t)) return null;
        out.push({ n: Number(t.replace(',', '.')) });
        i = j;
        continue;
      }
      const g = SEGNI[ch];
      if (!g) return null;
      out.push({ s: g });
      i++;
      if (out.length > MAX_PEZZI) return null;
    }
    return { lista: out, virgola };
  }

  /** Legge e fa il conto, con le precedenze di sempre. Lancia un errore se non torna. */
  function conta(lista) {
    let p = 0;
    const vedi = () => lista[p], segno = s => lista[p] && lista[p].s === s;
    function somma(f) {
      let v = prodotto(f);
      while (segno('+') || segno('-')) { const s = lista[p++].s; const b = prodotto(f); v = s === '+' ? v + b : v - b; }
      return v;
    }
    function prodotto(f) {
      let v = meno(f);
      while (segno('*') || segno('/')) {
        const s = lista[p++].s; const b = meno(f);
        if (s === '/' && b === 0) throw new Error('zero');
        v = s === '*' ? v * b : v / b;
      }
      return v;
    }
    function meno(f) {
      if (f > MAX_FONDO) throw new Error('fondo');
      if (segno('-')) { p++; return -meno(f + 1); }
      if (segno('+')) { p++; return meno(f + 1); }
      return potenza(f);
    }
    function potenza(f) {
      const b = base(f);
      if (segno('^')) { p++; return Math.pow(b, meno(f + 1)); }   // 2^3^2 = 2^9, come si scrive a mano
      return b;
    }
    function base(f) {
      const t = vedi();
      if (!t) throw new Error('fine');
      if (t.n != null) { p++; return t.n; }
      if (t.s === '(') {
        if (f > MAX_FONDO) throw new Error('fondo');
        p++;
        const v = somma(f + 1);
        if (!segno(')')) throw new Error('parentesi');
        p++;
        return v;
      }
      throw new Error('segno');
    }
    const v = somma(0);
    if (p !== lista.length) throw new Error('avanzo');
    return v;
  }

  /** Il numero da mostrare: 15 cifre al più (così 0,1+0,2 fa 0,3), con la virgola se l'aveva usata chi scrive. */
  function scrivi(v, virgola) {
    let t = String(Number(v.toPrecision(15)));
    if (t === '-0') t = '0';
    if (virgola) t = t.replace('.', ',');
    return t;
  }

  /**
   * Il messaggio è un calcolo da fare? Restituisce null se non lo è (testo normale), altrimenti
   * { expr, risultato } oppure { expr, errore } (per esempio diviso zero).
   */
  function calcola(testo) {
    const t = String(testo == null ? '' : testo).trim();
    if (!t.endsWith('=') || t.length > MAX_LUNGO + 1) return null;
    const expr = t.slice(0, -1).trim();
    if (!expr || expr.includes('=')) return null;
    const pz = pezzi(expr);
    if (!pz || !pz.lista.length) return null;
    // ci vuole almeno un'operazione tra due numeri: «5=» o «-3=» non sono calcoli
    const numeri = pz.lista.filter(x => x.n != null).length;
    if (numeri < 2 || !pz.lista.some(x => x.s && x.s !== '(' && x.s !== ')')) return null;
    let v;
    try { v = conta(pz.lista); }
    catch (e) {
      if (e.message === 'zero') return { expr, errore: 'non si può dividere per zero' };
      return null;                                   // scritto male: non è un calcolo, resta un messaggio
    }
    if (Number.isNaN(v)) return { expr, errore: 'non ha un risultato' };
    if (!Number.isFinite(v)) return { expr, errore: 'il risultato è troppo grande' };
    return { expr, risultato: scrivi(v, pz.virgola) };
  }

  return { calcola };
});
