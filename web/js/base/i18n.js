// Traduzioni. Il programma è scritto in italiano: la chiave di ogni frase è la frase italiana stessa
// (come fa gettext), e i file lingua-xx.js dicono come si dice nelle altre lingue. Se una frase manca
// si mostra l'italiano, così niente resta mai vuoto.
//   t('Salva')                         → «Save»
//   t('Scheda di {nome}', {nome: 'Ada'}) → «Ada's sheet»
// Le pagine si traducono da sole: i testi e gli attributi (title, placeholder, aria-label, alt)
// vengono cambiati appena compaiono, e si rimettono in italiano se si torna all'italiano. Per
// lasciare stare una parte (la chat, i nomi scritti dai giocatori) basta data-noi18n.
(function () {
  const LINGUE = { it: 'Italiano', en: 'English' };           // ogni lingua scritta nella lingua stessa
  const DIZ = window.LIBRE_LINGUE = window.LIBRE_LINGUE || {};
  const CHIAVE = 'libre-lingua';
  const ATTR = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip'];
  const SALTA = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG']);

  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } },
               set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const daBrowser = () => /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  const valida = l => LINGUE[l] ? l : null;

  // La lingua arriva (in ordine) dall'indirizzo (?lang=, la passa la finestra di avvio), da quella
  // salvata, dal sistema. scelta = false finché la persona non l'ha mai scelta davvero.
  let lingua, scelta;
  {
    const q = new URLSearchParams(location.search).get('lang');
    if (valida(q)) { lingua = q; scelta = true; ls.set(CHIAVE, q); }
    else if (valida(ls.get(CHIAVE))) { lingua = ls.get(CHIAVE); scelta = true; }
    else { lingua = daBrowser(); scelta = false; }
  }

  // Le frasi con {segnaposto} diventano espressioni regolari, per riconoscerle anche già composte.
  const modelli = {};
  function modelliDi(l) {
    if (modelli[l]) return modelli[l];
    const out = [];
    for (const [k, v] of Object.entries(DIZ[l] || {})) {
      if (!k.includes('{')) continue;
      const nomi = [];
      const re = k.replace(/\s+/g, ' ').trim().replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}|\{(\w+)\}/g, (_, a, b) => { nomi.push(a || b); return '([\\s\\S]+?)'; });
      try { out.push({ re: new RegExp('^' + re + '$'), nomi, v }); } catch {}
    }
    out.sort((a, b) => b.re.source.length - a.re.source.length);   // prima i più specifici
    return (modelli[l] = out);
  }
  const riempi = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m) : s;

  // Le chiavi con a capo o spazi doppi si confrontano «normalizzate».
  const norm = {};
  function normali(l) {
    if (norm[l]) return norm[l];
    const m = new Map();
    for (const [k, v] of Object.entries(DIZ[l] || {})) { const nk = k.replace(/\s+/g, ' ').trim(); if (nk !== k) m.set(nk, v); }
    return (norm[l] = m);
  }
  let profondita = 0;
  function tradotto(x) { try { return t(x); } finally { profondita--; } }
  // Traduce una frase intera (già composta o con le sue variabili).
  function t(testo, vars) {
    if (testo == null) return '';
    testo = String(testo);
    if (lingua === 'it' || !DIZ[lingua]) return riempi(testo, vars);
    const orig = testo;
    testo = testo.replace(/\s+/g, ' ');                // a capo, spazi doppi e &nbsp; dell'HTML contano come uno spazio
    const d = DIZ[lingua], n = normali(lingua);
    if (Object.prototype.hasOwnProperty.call(d, testo)) return riempi(d[testo], vars);
    if (n.has(testo)) return riempi(n.get(testo), vars);
    if (vars) return riempi(testo, vars);
    for (const m of modelliDi(lingua)) {
      const r = m.re.exec(testo);
      if (!r) continue;
      const val = {};
      m.nomi.forEach((k, i) => { val[k] = profondita < 3 ? (profondita++, tradotto(r[i + 1])) : r[i + 1]; });   // anche i pezzi si traducono
      return riempi(m.v, val);
    }
    return orig;
  }
  // Come t, ma lascia gli spazi intorno com'erano (i nodi di testo dell'HTML ne sono pieni).
  function tSpazi(s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    if (!m[2]) return s;
    const r = t(m[2]);
    return r === m[2] ? s : m[1] + r + m[3];
  }

  // --- la pagina ---
  const TESTO = new WeakMap();      // nodo di testo → { it: originale, fatto: ciò che abbiamo scritto }
  const ATTRS = new WeakMap();      // elemento → { attributo: { it, fatto } }
  const fuori = el => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (SALTA.has(e.nodeName) || e.hasAttribute('data-noi18n') || e.isContentEditable) return true; } return false; };

  function nodoTesto(n) {
    const st = TESTO.get(n);
    let it = n.data;
    if (st && n.data === st.fatto) it = st.it;           // l'abbiamo scritto noi: l'originale è quello salvato
    if (!it.trim() || fuori(n.parentNode)) return;
    const nuovo = lingua === 'it' ? it : tSpazi(it);
    if (nuovo === it && !st) return;
    TESTO.set(n, { it, fatto: nuovo });
    if (n.data !== nuovo) n.data = nuovo;
  }
  function attributi(el) {
    if (fuori(el.nodeName === 'TEXTAREA' ? el.parentNode : el)) return;   // di un'area di testo si traduce il suggerimento, non il contenuto
    let st = ATTRS.get(el);
    for (const a of ATTR) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), s = st && st[a];
      const it = s && cur === s.fatto ? s.it : cur;
      const nuovo = lingua === 'it' ? it : tSpazi(it);
      if (nuovo === it && !s) continue;
      if (!st) ATTRS.set(el, st = {});
      st[a] = { it, fatto: nuovo };
      if (cur !== nuovo) el.setAttribute(a, nuovo);
    }
    // i pulsanti <input type=button> hanno il testo nel valore
    if (el.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      const s = st && st.value, it = s && el.value === s.fatto ? s.it : el.value;
      const nuovo = lingua === 'it' ? it : t(it);
      if (nuovo !== it || s) { if (!st) ATTRS.set(el, st = {}); st.value = { it, fatto: nuovo }; el.value = nuovo; }
    }
  }
  function albero(radice) {
    if (!radice) return;
    if (radice.nodeType === 3) return nodoTesto(radice);
    if (radice.nodeType !== 1 && radice.nodeType !== 9 && radice.nodeType !== 11) return;
    if (radice.nodeType === 1) { if (radice.nodeName === 'TEXTAREA') return attributi(radice); if (fuori(radice)) return; attributi(radice); }
    const w = document.createTreeWalker(radice, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.nodeName === 'TEXTAREA') { attributi(n); return NodeFilter.FILTER_REJECT; }
        return SALTA.has(n.nodeName) || n.hasAttribute('data-noi18n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? nodoTesto(n) : attributi(n);
  }
  let titolo = null;
  function pagina() {
    if (titolo === null || (document.title !== titolo.fatto)) titolo = { it: document.title, fatto: document.title };
    titolo.fatto = lingua === 'it' ? titolo.it : t(titolo.it);
    if (document.title !== titolo.fatto) document.title = titolo.fatto;
    document.documentElement.lang = lingua;
    albero(document.body);
  }

  // Tutto ciò che compare dopo (finestre, messaggi, elenchi) si traduce appena arriva.
  let osservatore = null, inCorso = false;
  function osserva() {
    if (osservatore || !document.body) return;
    osservatore = new MutationObserver(lista => {
      if (inCorso || (lingua === 'it' && !haTradotto)) return;
      inCorso = true;
      try {
        for (const m of lista) {
          if (m.type === 'childList') m.addedNodes.forEach(albero);
          else if (m.type === 'characterData') nodoTesto(m.target);
          else if (m.type === 'attributes' && m.target.nodeType === 1) attributi(m.target);
        }
      } finally { inCorso = false; }
    });
    osservatore.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTR, 'value'] });
    new MutationObserver(() => { if (!inCorso && lingua !== 'it') { inCorso = true; try { pagina(); } finally { inCorso = false; } } })
      .observe(document.querySelector('title') || document.head, { childList: true, characterData: true, subtree: true });
  }
  let haTradotto = lingua !== 'it';

  function imposta(l, salva = true) {
    l = valida(l); if (!l) return;
    const cambia = l !== lingua;
    lingua = l; scelta = true; if (l !== 'it') haTradotto = true;
    if (salva) ls.set(CHIAVE, l);
    delete modelli[l]; delete norm[l];
    inCorso = true; try { pagina(); } finally { inCorso = false; }
    if (cambia) dispatchEvent(new CustomEvent('lingua', { detail: l }));
  }

  // alert/confirm/prompt: le frasi vengono tradotte senza toccare chi le chiama.
  for (const f of ['alert', 'confirm', 'prompt']) {
    const orig = window[f];
    if (typeof orig !== 'function') continue;
    window[f] = function (msg, ...resto) { return orig.call(window, msg == null ? msg : t(String(msg)), ...resto); };
  }

  function avvia() {
    inCorso = true; try { if (lingua !== 'it') pagina(); else document.documentElement.lang = 'it'; } finally { inCorso = false; }
    osserva();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();

  window.tr = t;
  window.LIBRE_I18N = {
    t, imposta, lingue: LINGUE, traduci: albero,
    get lingua() { return lingua; },
    get scelta() { return scelta; },
    daBrowser
  };
})();
