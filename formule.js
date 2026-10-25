// ---------- Le formule del sistema di gioco (formule.json) ----------
// Le regole che le schede calcolano (modificatore, competenza, abilità, CD degli incantesimi…)
// stanno in formule.json del sistema della campagna (sistemi/<id>/formule.json), così un altro sistema potrà averne di sue senza toccare il codice.
// Qui c'è un interprete piccolo e sicuro: niente eval, solo numeri, i nomi che la formula
// dichiara in «usa», + - * / tra parentesi e poche funzioni.
// Finché il file non è arrivato (o se manca, o se una formula è scritta male) si usa il calcolo
// scritto nel codice: le schede si comportano esattamente come prima.
(function () {
  const FUNZ = {
    floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs,
    max: (...a) => Math.max(...a), min: (...a) => Math.min(...a)
  };

  // ---- dal testo all'albero ----
  function pezzi(t) {
    const out = [], re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*)|(.))/gy;
    let m;
    while (re.lastIndex < t.length && (m = re.exec(t))) {
      if (m[1] !== undefined) out.push({ n: +m[1] });
      else if (m[2] !== undefined) out.push({ id: m[2] });
      else if (m[3] !== undefined && m[3].trim()) {
        if (!'+-*/(),'.includes(m[3])) throw new Error('carattere non ammesso: ' + m[3]);
        out.push({ op: m[3] });
      }
    }
    return out;
  }
  function analizza(testo, usa) {
    const p = pezzi(String(testo)), nomi = new Set(usa || []);
    let i = 0;
    const vedi = () => p[i], prendi = () => p[i++];
    const atteso = op => { const x = prendi(); if (!x || x.op !== op) throw new Error('manca «' + op + '»'); };
    function primario() {
      const x = prendi();
      if (!x) throw new Error('formula finita troppo presto');
      if (x.n !== undefined) return { k: 'n', v: x.n };
      if (x.op === '(') { const e = somma(); atteso(')'); return e; }
      if (x.op === '-') return { k: 'neg', a: primario() };
      if (x.op === '+') return primario();
      if (x.id !== undefined) {
        if (vedi() && vedi().op === '(') {
          prendi();
          const args = [];
          if (!(vedi() && vedi().op === ')')) { args.push(somma()); while (vedi() && vedi().op === ',') { prendi(); args.push(somma()); } }
          atteso(')');
          if (x.id === 'se') { if (args.length !== 3) throw new Error('se() vuole 3 valori'); return { k: 'se', args }; }
          if (!Object.prototype.hasOwnProperty.call(FUNZ, x.id)) throw new Error('funzione sconosciuta: ' + x.id);
          return { k: 'f', f: x.id, args };
        }
        if (!nomi.has(x.id)) throw new Error('nome non dichiarato in «usa»: ' + x.id);
        return { k: 'v', id: x.id };
      }
      throw new Error('non mi aspettavo «' + (x.op || '') + '»');
    }
    function prodotto() {
      let a = primario();
      while (vedi() && (vedi().op === '*' || vedi().op === '/')) a = { k: prendi().op, a, b: primario() };
      return a;
    }
    function somma() {
      let a = prodotto();
      while (vedi() && (vedi().op === '+' || vedi().op === '-')) a = { k: prendi().op, a, b: prodotto() };
      return a;
    }
    const albero = somma();
    if (i < p.length) throw new Error('avanza qualcosa alla fine della formula');
    return albero;
  }
  function calcola(n, v) {
    switch (n.k) {
      case 'n': return n.v;
      case 'v': { const x = +v[n.id]; return Number.isFinite(x) ? x : 0; }
      case 'neg': return -calcola(n.a, v);
      case '+': return calcola(n.a, v) + calcola(n.b, v);
      case '-': return calcola(n.a, v) - calcola(n.b, v);
      case '*': return calcola(n.a, v) * calcola(n.b, v);
      case '/': { const d = calcola(n.b, v); return d === 0 ? 0 : calcola(n.a, v) / d; }
      case 'se': return calcola(n.args[0], v) ? calcola(n.args[1], v) : calcola(n.args[2], v);
      case 'f': return FUNZ[n.f](...n.args.map(a => calcola(a, v)));
    }
    return 0;
  }

  // ---- le formule caricate ----
  const pronte = new Map();          // nome → albero
  window.FORMULE = {
    sistema: null,
    /** Il valore della formula «nome» con i valori in «v»; se non c'è, quello di «riserva()». */
    usa(nome, v, riserva) {
      const a = pronte.get(nome);
      if (!a) return riserva();
      try { const r = calcola(a, v); return Number.isFinite(r) ? r : riserva(); } catch { return riserva(); }
    },
    caricate: () => [...pronte.keys()],
    analizza, calcola,
    leggi(j) {
      if (!j || j.formato !== 'libre-vtt-formule' || !j.formule) return false;
      pronte.clear();
      for (const [nome, f] of Object.entries(j.formule)) {
        try { pronte.set(nome, analizza(f.formula, f.usa)); }
        catch (e) { console.warn('formule.json · «' + nome + '»: ' + e.message + ' (resta il calcolo di prima)'); }
      }
      this.sistema = j.sistema || null;
      return true;
    }
  };
  // il file lo legge sistema.js (sistema/formule.json, quello della campagna); poi si ricalcolano le schede aperte
  window.FORMULE.ricalcola = () => {
    if (typeof wins !== 'undefined' && typeof recalc === 'function') for (const w of wins.values()) { try { if (w._sheet) recalc(w._body, w._sheet); } catch {} }
  };
})();
