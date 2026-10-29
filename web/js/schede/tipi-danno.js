// ---------- Il tipo di danno scritto dopo la formula ----------
// «1d8+3 tuono» tira 1d8+3 e scrive «tuono» nell'etichetta; «2d6+3 tagliente + 1d6 fuoco» tira le due
// formule e fa un solo messaggio con il totale di ciascun tipo («8 tagliente + 3 fuoco»), perché
// resistenze e vulnerabilità valgono per tipo. Vale ovunque si tiri: casella dei danni della scheda,
// [[…]] nei testi, /r in chat. Il server riceve sempre e solo formule pulite (la sua grammatica non
// cambia); per più tipi riceve l'elenco delle formule e fa un messaggio solo.
// Sta tra net.js (che manda i tiri al server) e tiri-scheda.js (che sceglie pubblico/privato).
(function () {
  'use strict';
  const DADO = /^(\d*d\d+(?:k[hl]\d+)?|\d+)$/i;

  /** Testo → [{ expr, tipo }], oppure null se non ci sono parole (formula normale) o non si capisce. */
  function scomponi(testo) {
    const s = String(testo || '').replace(/[−–]/g, '-').trim();
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]{2}/.test(s.replace(/\d*d\d+(?:k[hl]\d+)?/gi, ''))) return null;   // nessuna parola: tiro normale
    const pezzi = s.match(/\d*d\d+(?:k[hl]\d+)?(?![\wÀ-ÖØ-öø-ÿ])|\d+(?![\wÀ-ÖØ-öø-ÿ])|[+-]|[,;]|[A-Za-zÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ'’.-]*|\S/g) || [];
    const gruppi = [];
    let g = null, segno = '';
    const nuovo = () => { g = { expr: '', parole: [] }; gruppi.push(g); };
    for (const p of pezzi) {
      if (p === '+' || p === '-') {
        if (g && g.parole.length) { nuovo(); }                         // dopo un tipo comincia un'altra formula
        segno = p; continue;
      }
      if (p === ',' || p === ';') { nuovo(); segno = ''; continue; }
      if (DADO.test(p)) {
        if (!g || g.parole.length) nuovo();
        g.expr += (g.expr ? (segno || '+') : (segno === '-' ? '-' : '')) + p.toLowerCase();
        segno = ''; continue;
      }
      if (/^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(p)) { if (!g) nuovo(); g.parole.push(p); continue; }
      if (/^[()[\]·:]$/.test(p)) continue;                              // parentesi e simili: si ignorano
      return null;                                                      // qualcosa che non si capisce
    }
    const out = gruppi.filter(x => x.expr || x.parole.length).map(x => ({ expr: x.expr, tipo: x.parole.join(' ') }));
    if (!out.length || out.some(x => !x.expr || typeof parseExpr !== 'function' || !parseExpr(x.expr))) return null;
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
      intent('roll', { expr: parti[0].expr, parti: parti.map(p => ({ expr: p.expr, tipo: p.tipo })), label: lab, secret: d.secret });
      if (typeof diceLast !== 'undefined') diceLast.textContent = 'Tiro mandato al server…';
      return true;
    }
    const m = unisci(parti.map(p => ({ tipo: p.tipo, ...parseExpr(p.expr) })), lab);
    if (d.secret) m.secret = true;
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
