// ---------- Il tipo di danno scritto dopo la formula ----------
// «1d8+3 tuono» tira 1d8+3 e scrive «tuono» nell'etichetta; «2d6+3 tagliente + 1d6 fuoco» tira le due
// formule e fa un solo messaggio con il totale di ciascun tipo («8 tagliente + 3 fuoco»), perché
// resistenze e vulnerabilità valgono per tipo. Vale ovunque si tiri: casella dei danni della scheda,
// [[…]] nei testi, /r in chat. Il server riceve sempre e solo formule pulite (la sua grammatica non
// cambia); per più tipi riceve l'elenco delle formule e fa un messaggio solo.
// Sta tra net.js (che manda i tiri al server) e tiri-scheda.js (che sceglie pubblico/privato).
(function () {
  'use strict';
  const LETTERA = 'A-Za-zÀ-ÖØ-öø-ÿ';
  // i pezzi del testo, con la loro posizione (per riprendere la descrizione esattamente com'è scritta)
  const PEZZO = new RegExp([
    '(\\d*[dD]\\d+(?:[kK][hHlL]\\d+)?)(?![' + LETTERA + '\\d])',   // 1 dado (anche con la D maiuscola)
    '(\\d+)(?![' + LETTERA + '\\d])',                              // 2 numero
    '([+\\-−–](?=\\s*\\d))',                                        // 3 segno davanti a un numero o a un dado
    '([,;])',                                                       // 4 separatore
    '(\\([^)]*\\)?|\\[[^\\]]*\\]?)',                                // 5 parentesi: sempre descrizione
    '([' + LETTERA + '][\\w' + LETTERA + "'’.]*)",                  // 6 parola
    '(\\S)'                                                         // 7 altra punteggiatura (/ — - …)
  ].join('|'), 'g');
  const SENZA_PAROLE = new RegExp('[' + LETTERA + ']{2}');

  /** Testo → [{ expr, tipo }], oppure null se non ci sono parole (formula normale) o non si capisce.
   *  «1D10+3 perforanti» · «1d10+3 contundenti/perforanti» · «1d10+3 perforanti +1» (il +1 va nella formula)
   *  «1d10+3 Perforanti — spada» · «1d10+3 perforanti (versatile 1d12)» (le parentesi sono descrizione)
   *  «2d6+3 tagliente + 1d6 fuoco» (due formule, un totale per tipo). */
  function scomponi(testo) {
    const s = String(testo || '');
    if (!SENZA_PAROLE.test(s.replace(/\([^)]*\)?|\[[^\]]*\]?/g, ' xx ').replace(/\d*d\d+(?:k[hl]\d+)?/gi, ''))) return null;   // nessuna parola: tiro normale
    const T = [];
    for (const m of s.matchAll(PEZZO)) {
      const k = m[1] ? 'dado' : m[2] ? 'num' : m[3] ? 'segno' : m[4] ? 'sep' : m[5] ? 'par' : m[6] ? 'parola' : 'altro';
      T.push({ k, t: m[0], a: m.index, b: m.index + m[0].length });
    }
    const termine = x => x && (x.k === 'dado' || x.k === 'num');
    // dopo un segno (o un separatore) nella descrizione: altri termini e poi parole = un'altra formula;
    // termini e poi la fine (o solo parentesi e punteggiatura) = un bonus della formula di prima
    const guarda = i => {
      let j = i, termini = 0;
      while (j < T.length && (termine(T[j]) || (T[j].k === 'segno' && termine(T[j + 1])))) { if (termine(T[j])) termini++; j++; }
      return { fine: j, termini, parole: !!T[j] && T[j].k === 'parola' };
    };
    const gruppi = [];
    let g = null, inDesc = false, segno = '';
    const nuovo = () => { g = { expr: '', da: -1, a: -1 }; gruppi.push(g); inDesc = false; segno = ''; };
    const desc = x => { if (g.da < 0) g.da = x.a; g.a = x.b; inDesc = true; };
    const aggiungi = x => { const meno = /^[-−–]$/.test(segno); g.expr += (g.expr ? (meno ? '-' : '+') : (meno ? '-' : '')) + x.t.toLowerCase(); segno = ''; };
    for (let i = 0; i < T.length; i++) {
      const x = T[i];
      if (!g) nuovo();
      if (!inDesc) {
        if (termine(x)) { aggiungi(x); continue; }
        if (x.k === 'segno') { segno = x.t; continue; }
        if (x.k === 'sep') { if (g.expr) nuovo(); continue; }
        if (!g.expr) { if (x.k === 'parola') return null; continue; }   // una parola prima della formula: non si capisce
        segno = ''; desc(x); continue;
      }
      // nella descrizione
      if ((x.k === 'segno' || x.k === 'sep') && termine(T[i + 1])) {
        const v = guarda(i + 1);
        if (v.parole) { nuovo(); if (x.k === 'segno') segno = x.t; continue; }   // «+ 1d6 fuoco»: un'altra formula
        if (x.k === 'segno') {                                           // «perforanti +1»: bonus della formula
          segno = x.t;
          for (let j = i + 1; j < v.fine; j++) { if (T[j].k === 'segno') segno = T[j].t; else aggiungi(T[j]); }
          i = v.fine - 1; continue;
        }
      }
      desc(x);
    }
    const out = gruppi.filter(x => x.expr || x.da >= 0).map(x => ({ expr: x.expr, tipo: x.da >= 0 ? s.slice(x.da, x.a).replace(/^[\s,;:·—–+-]+|[\s,;:·—–+-]+$/g, '') : '' }));
    if (!out.length || out.some(x => !x.expr || typeof parseExpr !== 'function' || !parseExpr(x.expr))) return null;
    if (!out.some(x => x.tipo)) return null;
    return out;
  }
  window.scomponiTiro = scomponi;

  const etichetta = (label, expr, tipo) => (label || String(expr).replace(/\s+/g, '')) + (tipo ? ' · ' + tipo : '');

  const prima = rollExpr;
  rollExpr = function (expr, label) {                                   // eslint-disable-line no-global-assign
    const parti = scomponi(expr);
    if (!parti) return prima.apply(this, arguments);
    if (parti.length === 1) return prima.call(this, parti[0].expr, label ? etichetta(label, '', parti[0].tipo) : parti[0].expr + ' · ' + parti[0].tipo);
    // più tipi: un messaggio solo
    const lab = label || parti.map(p => p.expr + ' ' + p.tipo).join(' + ');
    const d = diceApply(parti[0].expr);
    if (typeof NET !== 'undefined' && NET.on) {
      if (NET.retrying || NET.hostDown) return prima.call(this, parti[0].expr, lab);   // lo stesso avviso di sempre
      if (!can('roll')) { netSay('Non puoi tirare i dadi.', 'warn'); return true; }
      intent('roll', { expr: parti[0].expr, parti: parti.map(p => ({ expr: p.expr, tipo: p.tipo })), label: lab, secret: d.secret, cieco: d.cieco });
      if (typeof diceLast !== 'undefined') diceLast.textContent = 'Tiro mandato al server…';
      return true;
    }
    const m = unisci(parti.map(p => ({ tipo: p.tipo, ...parseExpr(p.expr) })), lab);
    if (d.secret) m.secret = true;
    if (d.cieco) m.cieco = true;
    addChat(m);
    if (typeof diceShowLast === 'function') diceShowLast(m);
    return m;
  };

  /** Più tiri, uno per tipo → un messaggio solo (lo stesso che fa il server). */
  function unisci(tiri, label) {
    const rolls = [], drop = [];
    let mod = 0, total = 0, sides = null;
    for (const t of tiri) {
      const base = rolls.length;
      rolls.push(...t.rolls);
      for (const i of t.drop || []) drop.push(base + i);
      mod += t.mod || 0; total += t.total;
      sides = sides === null ? t.sides : sides === t.sides ? sides : 0;
    }
    const m = { kind: 'roll', label, rolls, mod, total, sides: sides || 0, parti: tiri.map(t => ({ tipo: t.tipo, total: t.total })) };
    if (drop.length) m.drop = drop;
    return m;
  }
  window.unisciTiriPerTipo = unisci;
})();
