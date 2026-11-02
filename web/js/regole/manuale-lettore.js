// ---------- Il lettore dei manuali: da un PDF (o testo) alle voci del compendio ----------
// Lo usa «Importa da un manuale che possiedi» (compendio-manuale.js) e lo script da terminale
// sviluppo/strumenti/manuale-a-json/. Prende le righe del manuale, le ripulisce dagli errori tipici dei PDF
// passati in OCR (titoli «A c id S p l a s h», parole spezzate «W hen», «o f», «6 th-level»: si
// ricuciono con le parole del manuale stesso, dell'SRD (manuale-srd.js) e di un dizionario inglese
// (manuale-parole.js)), poi riconosce le voci e prepara il pacchetto { pacchetto, voci }.
// Riconosce da solo, in tutto il manuale:
//   incantesimi  dalla riga «1st-level evocation» / «Conjuration cantrip» (anche in italiano)
//   mostri       dalla riga «Medium beast, unaligned» (+ CA, PF, caratteristiche, tratti, azioni)
//   oggetti      dalla riga «Wondrous item, rare (requires attunement)»
//   talenti      dalla riga «Prerequisite: …» o da «…you gain the following benefits»
//   suppliche    i talenti con prerequisito da warlock («Pact of…», «eldritch blast», «Nth level»)
//   specie       dal titolo «Dwarf Traits» (+ sottospecie con «Ability Score Increase»)
//   classi       dalla riga «Hit Dice: 1d12 per barbarian level» (+ privilegi per livello, sottoclassi)
//   background   dalla riga «Skill Proficiencies: …» (+ «Feature: …»)
//   condizioni   dai titoli con il nome di una condizione seguiti da un elenco puntato
// Il codice delle voci (incantesimi, mostri, oggetti, talenti) viene dal lettore della 3.7.6.
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.ManualeParser = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'voce';
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const chiaveNome = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase();

  // ---------- glossario EN ↔ IT (come nel VTT) ----------
  const SCUOLE = { abjuration: 'Abiurazione', conjuration: 'Evocazione', divination: 'Divinazione', enchantment: 'Ammaliamento', evocation: 'Invocazione', illusion: 'Illusione', necromancy: 'Necromanzia', transmutation: 'Trasmutazione' };
  const DANNI = { acid: 'Acido', bludgeoning: 'Contundente', cold: 'Freddo', fire: 'Fuoco', force: 'Forza', lightning: 'Fulmine', necrotic: 'Necrotico', piercing: 'Perforante', poison: 'Veleno', psychic: 'Psichico', radiant: 'Radioso', slashing: 'Tagliente', thunder: 'Tuono' };
  const DANNI_IT = { acido: 'Acido', contundenti: 'Contundente', contundente: 'Contundente', freddo: 'Freddo', fuoco: 'Fuoco', forza: 'Forza', fulmine: 'Fulmine', necrotici: 'Necrotico', necrotico: 'Necrotico', perforanti: 'Perforante', perforante: 'Perforante', veleno: 'Veleno', psichici: 'Psichico', psichico: 'Psichico', radiosi: 'Radioso', radioso: 'Radioso', taglienti: 'Tagliente', tagliente: 'Tagliente', tuono: 'Tuono' };
  const TAGLIE = { tiny: 'Minuscola', small: 'Piccola', medium: 'Media', large: 'Grande', huge: 'Enorme', gargantuan: 'Mastodontica' };
  const TAGLIE_IT = { minuscolo: 'Minuscola', minuscola: 'Minuscola', piccolo: 'Piccola', piccola: 'Piccola', medio: 'Media', media: 'Media', grande: 'Grande', enorme: 'Enorme', mastodontico: 'Mastodontica', mastodontica: 'Mastodontica', gargantuesco: 'Mastodontica', gargantuesca: 'Mastodontica', colossale: 'Mastodontica' };
  const TIPI = { aberration: 'Aberrazione', beast: 'Bestia', celestial: 'Celestiale', construct: 'Costrutto', dragon: 'Drago', elemental: 'Elementale', fey: 'Folletto', fiend: 'Immondo', giant: 'Gigante', humanoid: 'Umanoide', monstrosity: 'Mostruosità', ooze: 'Melma', plant: 'Vegetale', undead: 'Non morto', swarm: 'Sciame' };
  const RARITA = { common: 'Comune', uncommon: 'Non comune', rare: 'Raro', 'very rare': 'Molto raro', legendary: 'Leggendario', artifact: 'Artefatto', 'rarity varies': 'Varia' };
  const RARITA_IT = { comune: 'Comune', 'non comune': 'Non comune', raro: 'Raro', rara: 'Raro', 'molto raro': 'Molto raro', 'molto rara': 'Molto raro', leggendario: 'Leggendario', leggendaria: 'Leggendario', artefatto: 'Artefatto', 'rarità variabile': 'Varia' };
  const CAR = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha', forza: 'str', destrezza: 'dex', costituzione: 'con', intelligenza: 'int', saggezza: 'wis', carisma: 'cha' };
  const ABILITA = { acrobatics: 'acro', 'animal handling': 'anim', arcana: 'arca', athletics: 'athl', deception: 'dece', history: 'hist', insight: 'insi', intimidation: 'inti', investigation: 'inve', medicine: 'medi', nature: 'natu', perception: 'perception', performance: 'perf', persuasion: 'pers', religion: 'reli', 'sleight of hand': 'slei', stealth: 'stea', survival: 'surv' };
  const CLASSI_IT = { barbarian: 'Barbaro', bard: 'Bardo', cleric: 'Chierico', druid: 'Druido', fighter: 'Guerriero', monk: 'Monaco', paladin: 'Paladino', ranger: 'Ranger', rogue: 'Ladro', sorcerer: 'Stregone', warlock: 'Warlock', wizard: 'Mago' };
  const scuolaRe = '(' + [...Object.keys(SCUOLE), ...Object.values(SCUOLE).map(s => s.toLowerCase())].join('|') + ')';
  const nScuola = s => { const k = String(s).toLowerCase(); return SCUOLE[k] || cap(k); };
  const BONUS_COMP = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

  // ---------- 1a. righe dal PDF (con pdf.js), come nel VTT + via intestazioni e piè di pagina ----------
  async function righeDaPdf(pdfjs, buf, opz = {}) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const fine = Math.min(doc.numPages, opz.a || doc.numPages), righe = [];
    for (let n = Math.max(1, opz.da || 1); n <= fine; n++) {
      opz.avanza && opz.avanza(n, fine);
      const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      // gli spazi sono a volte pezzi a sé: non contano per le colonne ma dicono dove finisce una parola
      const spazi = tc.items.filter(i => i.str && !i.str.trim() && i.width > 0).map(i => ({ x: i.transform[4], y: vp.height - i.transform[5] }));
      const pezzi = tc.items.filter(i => i.str && i.str.trim()).map(i => {
        const fs = Math.hypot(i.transform[2], i.transform[3]) || i.height || 8;
        const font = (tc.styles[i.fontName] && tc.styles[i.fontName].fontFamily) || '';
        return { s: i.str, x: i.transform[4], x1: i.transform[4] + i.width, y: vp.height - i.transform[5], fs, bold: /bold|black|heavy|semibold/i.test(i.fontName + ' ' + font) };
      });
      for (const sp of spazi) { const p = pezzi.find(q => Math.abs(q.y - sp.y) < 2 && Math.abs(q.x1 - sp.x) < 2); if (p) p.spazioDopo = true; }
      // due colonne? si cerca lo spazio vuoto verticale più largo nella parte centrale del testo
      // (nelle scansioni i margini cambiano da pagina a pagina, quindi non è per forza a metà foglio)
      let meta = vp.width / 2, colonne = 1;
      if (pezzi.length > 20) {
        const x0 = Math.min(...pezzi.map(p => p.x)), x1 = Math.max(...pezzi.map(p => p.x1)), largo = Math.ceil(x1 - x0);
        const cop = new Array(largo + 1).fill(0);
        for (const p of pezzi) for (let x = Math.max(0, Math.floor(p.x - x0)); x <= Math.min(largo, Math.ceil(p.x1 - x0)); x++) cop[x]++;
        const soglia = Math.max(1, pezzi.length * 0.04);
        let best = null, ini = -1;
        for (let x = Math.floor(largo * 0.3); x <= Math.ceil(largo * 0.7) + 1; x++) {
          if (x <= largo * 0.7 && cop[x] <= soglia) { if (ini < 0) ini = x; }
          else if (ini >= 0) { if (!best || x - ini > best[1] - best[0]) best = [ini, x]; ini = -1; }
        }
        if (best && best[1] - best[0] >= 5) {
          const m = x0 + (best[0] + best[1]) / 2;
          const sx = pezzi.filter(p => p.x < m).length, dx = pezzi.length - sx;
          if (sx > pezzi.length * 0.15 && dx > pezzi.length * 0.15) { meta = m; colonne = 2; }
        }
      }
      const qui = [];
      for (let c = 0; c < colonne; c++) {
        // i pezzi che attraversano la metà (titoli larghi) vanno nella colonna di sinistra
        const col = pezzi.filter(p => colonne === 1 || (c === 0 ? p.x < meta : p.x >= meta)).sort((p, q) => p.y - q.y || p.x - q.x);
        let riga = null;
        for (const p of col) {
          if (riga && Math.abs(p.y - riga.y) < Math.max(2, p.fs * 0.45)) { riga.pezzi.push(p); riga.fs = Math.max(riga.fs, p.fs); continue; }
          riga = { y: p.y, fs: p.fs, pezzi: [p], pagina: n }; qui.push(riga);
        }
      }
      righe.push(...qui, { pagina: n, fine: true });
    }
    const conti = {};
    const out = righe.map(r => {
      if (r.fine) return { t: '', pagina: r.pagina, finePagina: true };
      r.pezzi.sort((p, q) => p.x - q.x);
      let t = '';
      for (let i = 0; i < r.pezzi.length; i++) { const p = r.pezzi[i], q = r.pezzi[i - 1]; t += (q && (p.x - q.x1 > p.fs * 0.15 || q.spazioDopo) && !/\s$/.test(t) && !/^\s/.test(p.s) ? ' ' : '') + p.s; }
      const fs = Math.round(r.fs); conti[fs] = (conti[fs] || 0) + t.length;
      return { t: t.replace(/\s+/g, ' ').trim(), fs, bold: r.pezzi.every(p => p.bold), pagina: r.pagina, y: r.y };
    });
    const normale = +Object.entries(conti).sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
    for (const r of out) r.titolo = !!r.t && (r.fs > normale * 1.15 || (r.bold && r.t.length < 50 && !/[.:]$/.test(r.t)));
    // intestazioni e piè di pagina: le righe uguali (numeri a parte) che tornano su molte pagine
    const quante = {}, norm = t => t.replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase();
    for (const r of out) if (r.t) { const k = norm(r.t); (quante[k] ||= new Set()).add(r.pagina); }
    const pagine = new Set(out.map(r => r.pagina)).size;
    // (solo le prime e le ultime due righe di ogni pagina: «Casting Time: 1 action» torna spesso ma è testo)
    const bordo = new Set();
    for (const n of new Set(out.map(r => r.pagina))) {
      const qui = out.filter(r => r.pagina === n && r.t).sort((a, b) => a.y - b.y);
      for (const r of [...qui.slice(0, 2), ...qui.slice(-2)]) bordo.add(r);
    }
    return out.filter(r => r.finePagina || (r.t && !(bordo.has(r) && pagine >= 6 && quante[norm(r.t)].size >= Math.max(4, pagine * 0.25) && r.t.length < 60)));
  }

  // ---------- 1b. righe da un testo (copiato dal PDF o estratto con un altro programma) ----------
  function righeDaTesto(txt) {
    const out = []; let pagina = 1;
    for (const blocco of String(txt).replace(/\r/g, '').split('\f')) {
      for (const l of blocco.split('\n')) { const t = l.replace(/\s+/g, ' ').trim(); if (t) out.push({ t, pagina, titolo: /^#{1,4}\s/.test(t) }); }
      out.push({ t: '', pagina, finePagina: true }); pagina++;
    }
    for (const r of out) r.t = r.t.replace(/^#{1,4}\s+/, '');
    return out;
  }

  // ---------- 2. pulizia degli errori di OCR ----------
  // parole corte «vere»: servono per capire quando «a t» o «o f» sono pezzi di una parola
  const CORTE = new Set(('a an as at be by do go he if in is it me my no of on or so to up us we ft ' +
    'and are but can did for had has her him his how its may not now off one our out own per see she the too two use was way who why you all any ' +
    'few new old set try end act add age ago aid air arm art ask bad bag bat bed big bit box boy cap cat cut day die dig dog dry due ear eat egg eye ' +
    'fan far fey fit fly fog fur gap gas gem get god hat hit hot ice ill imp ink inn jaw key kin lay leg let lid lie log lot low mad man map mat men ' +
    'mix mud net nor nut oak oil opt orc owl pay pen pet pit pot put ran rat raw ray red rib rod rot row rub run sad saw say sea sew shy sit six sky ' +
    'son spy sun ten tie tin tip toe ton top toy war wax web wet win wit yes yet elf dm pc str dex con int wis cha bow axe ten own via let yew').split(' '));
  let FREQ = null, PAROLE = [], DIZ = new Set();                                   // le frequenze dell'ultimo manuale letto
  const STOP = new Set('of the and to in on at by for with from or'.split(' '));
  const isLettere = s => /^[A-Za-zÀ-ÿ’']+$/.test(s);
  // una riga «spaziata»: quasi tutti pezzi di 1-2 lettere (titoli in maiuscoletto passati in OCR)
  function spaziata(t) {
    if (/\d|,/.test(t) || /^[A-Z][a-z]+(?: [A-Z]?[a-z]+)?:/.test(t)) return false;
    const tok = t.replace(/[:(),/]/g, ' ').split(' ').filter(Boolean);
    if (tok.join('').length > 40 || /^[a-z(]/.test(t) || /[).;,]$/.test(t)) return false;                 // i titoli sono brevi; una riga di testo giustificato no
    if (tok.length < 2 || !tok.every(x => isLettere(x) || /^[’'&-]+$/.test(x))) return false;
    const corti = tok.filter(x => x.replace(/[’']/g, '').length <= 2).length;
    const singole = tok.filter(x => x.length === 1 && !/^[aAI]$/.test(x)).length;
    if (tok.length === 2) return tok.every(x => x.length <= 3) && singole >= 1;
    return corti / tok.length >= 0.6 && singole >= 1;
  }
  function frequenze(righe) {
    const f = Object.create(null);
    for (const r of righe) if (r.t && !spaziata(r.t)) for (const w of r.t.split(/[^A-Za-zÀ-ÿ’']+/)) if (w) { const k = w.toLowerCase().replace(/[’'](s|t|d|ll|re|ve|m)?$/, ''); if (k) f[k] = (f[k] || 0) + 1; }
    // le parole dell'SRD contano come parole vere anche se nel manuale compaiono solo spezzate
    for (const w of PAROLE) f[w] = (f[w] || 0) + 5;
    return f;
  }
  const nota = (f, w) => { const k = w.toLowerCase(); return k.length <= 3 ? CORTE.has(k) : (f[k] || 0) >= 3; };
  // spezza «armorof» in «armor of» se tutti i pezzi sono parole note e il tutto no
  function segmenta(chunk, f) {
    const k = chunk.toLowerCase(); if (nota(f, k) || (f[k] || 0) >= 1 || k.length < 5) return null;
    const n = k.length, best = new Array(n + 1).fill(null); best[0] = { c: 0, p: [] };
    for (let i = 1; i <= n; i++) for (let j = Math.max(0, i - 20); j < i; j++) {
      if (!best[j]) continue; const w = k.slice(j, i); if (!nota(f, w) || (w.length < 2 && w !== 'a')) continue;
      const c = best[j].c + 1 + 1 / Math.log2((CORTE.has(w) ? 500 : (f[w] || 0)) + 2); if (!best[i] || c < best[i].c) best[i] = { c, p: [...best[j].p, w] };
    }
    return best[n] && best[n].p.length > 1 ? best[n].p : null;
  }
  function ricomponiSpaziata(t, f, diz) {
    const fine = /:$/.test(t) ? ':' : '';
    const s = t.replace(/:$/, '').trim();
    const d = diz.get(chiaveNome(s)); if (d) return d + fine;
    // una parola nuova comincia con una maiuscola (o dopo una parentesi / due punti)
    const parole = []; let cur = '';
    for (const tok of s.split(' ')) {
      if (cur && (/^[A-ZÀ-Ý(]/.test(tok) || /[:)/]$/.test(cur))) { parole.push(cur); cur = tok; }
      else cur += tok;
    }
    if (cur) parole.push(cur);
    const out = [];
    for (const p of parole) {
      const m = /^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ]+)(.*)$/.exec(p);
      const seg = m && !m[3] ? segmenta(m[2], f) : null;
      let seg2 = seg;
      if (!seg2 && m && !m[3] && !nota(f, m[2])) { const x = /^(.{3,}?)(of|the|and|with|from)$/i.exec(m[2]); if (x) seg2 = [x[1].toLowerCase(), x[2].toLowerCase()]; }
      if (seg2 && !seg) { out.push(m[1] + m[2].slice(0, seg2[0].length)); out.push(seg2[1]); continue; }
      if (seg) { out.push(m[1] + m[2][0] + seg[0].slice(1)); for (const w of seg.slice(1)) out.push(w); }
      else out.push(p);
    }
    const r = unisciPezzi(out.join(' '), f);
    return (diz.get(chiaveNome(r)) || r) + fine;
  }
  function unisciPezzi(t, f) {
    const tok = t.split(' '), out = [];
    for (let i = 0; i < tok.length;) {
      let preso = 0;
      for (let k = Math.min(5, tok.length - i); k >= 2 && !preso; k--) {
        const parti = tok.slice(i, i + k).map((x, j, a) => j === a.length - 1 ? x.replace(/[.,;:!?)”"]+$/, '').replace(/[’'](s|t|d|ll|re|ve)?$/, '').replace(/-.*$/, '') : x);
        const prima = parti[0].replace(/^[(“"‘]/, '');
        const nude = [prima, ...parti.slice(1)];
        if (!nude.every(x => x && isLettere(x))) continue;
        const unita = nude.join(''), fu = f[unita.toLowerCase()] || 0;
        // con il dizionario: la parola unita è vera e almeno un pezzo non lo è → si unisce
        // (a meno che il pezzo dopo formi una parola vera con quello che segue: «the m ason» → «the mason»)
        if (DIZ.size && DIZ.has(unita.toLowerCase()) && nude.some(x => !DIZ.has(x.toLowerCase()) && !CORTE.has(x.toLowerCase()))) {
          let alt = false;
          if (DIZ.has(prima.toLowerCase()) || CORTE.has(prima.toLowerCase()))
            for (let k2 = 2; k2 <= Math.min(5, tok.length - i - 1) && !alt; k2++) {
              const a = tok.slice(i + 1, i + 1 + k2).map(x => x.replace(/[.,;:!?)”"]+$/, '').replace(/[’'](s|t|d|ll|re|ve|m)?$/, '').replace(/-.*$/, ''));
              if (a.every(isLettere) && DIZ.has(a.join('').toLowerCase()) && a.some(x => !DIZ.has(x.toLowerCase()))) alt = true;
            }
          if (!alt) { out.push(tok.slice(i, i + k).join('')); preso = k; continue; }
        }
        const suffisso = k === 2 && nude[0].length >= 3 && nota(f, nude[0]) && !nota(f, nude[1]) && /^(ing|ings|ed|es|er|ers|est|ly|tion|tions|ions?|ment|ments|ness|able|ible|al|ance|ence|ous|ive|ity|ful|less|ward)$/i.test(nude[1]);
        const serve = suffisso || nude.some(x => x.length === 1 && !/^[aAI]$/.test(x)) ? 1 : 2;
        if (fu < serve && !suffisso && !(unita.length <= 3 && CORTE.has(unita.toLowerCase()))) continue;
        if (nude.every(x => nota(f, x))) continue;
        if (nude.some(x => x.length >= 4 && !STOP.has(x.toLowerCase())) && (nude.some(x => x.length >= 3 && STOP.has(x.toLowerCase())) ? fu < 10 : nude.some(x => STOP.has(x.toLowerCase())) && fu < 3)) continue;
        // non unire «Melee W» con la parola dopo se il pezzo noto è lungo e la parola unita è rara
        if (fu < 3 && !suffisso && nude.some(x => x.length >= 4 && nota(f, x))) continue;
        // «per m onk»: se il primo pezzo è una parola vera e il secondo si unisce meglio con quello dopo, si lascia
        if (nota(f, prima) && i + k < tok.length + 1) {
          let meglio = 0;
          for (let k2 = 2; k2 <= Math.min(5, tok.length - i - 1); k2++) {
            const alt = tok.slice(i + 1, i + 1 + k2).map(x => x.replace(/[.,;:!?)”"]+$/, '').replace(/[’'](s|t|d|ll|re|ve)?$/, '').replace(/-.*$/, ''));
            if (alt.every(isLettere)) meglio = Math.max(meglio, f[alt.join('').toLowerCase()] || 0);
          }
          if (meglio > fu || (meglio >= 2 && !nota(f, nude[1]))) continue;
        }
        out.push(tok.slice(i, i + k).join('').replace(/^(.*?)$/, x => x));
        preso = k;
      }
      // ultimo tentativo con il dizionario: «colum n of» → «column of», «sh orin g» → «shoring»,
      // «su ccessfu lone» → «successful one»: si uniscono i pezzi e si ridividono in parole vere
      if (!preso && DIZ.size > 5000) {
        const vera = x => { const k = x.toLowerCase(); return DIZ.has(k) || CORTE.has(k); };
        const pulito = x => x.replace(/^[(“"‘]/, '').replace(/[.,;:!?)”"]+$/, '').replace(/[’'](s|t|d|ll|re|ve|m)$/, '');
        for (let k = Math.min(5, tok.length - i); k >= 2 && !preso; k--) {
          const pezzi = tok.slice(i, i + k), nude = pezzi.map(pulito);
          if (!nude.every(x => /^[A-Za-z]+$/.test(x)) || nude.every(vera)) continue;
          if (vera(nude[0]) && vera(nude[1])) continue;                // il pezzo rotto deve essere all'inizio
          if (pezzi.slice(0, -1).some((x, j) => !/^[A-Za-z]+$/.test(j ? x : x.replace(/^[(“"‘]/, '')))) continue;   // niente punteggiatura in mezzo
          const seg = dividi(nude.join(''));
          if (!seg || seg.length >= k) continue;                      // deve venire con meno pezzi di prima
          let j = 0; const conMaiuscole = seg.map(w => { const o = nude.join('').slice(j, j + w.length); j += w.length; return o; });
          const testa = (/^[(“"‘]/.exec(pezzi[0]) || [''])[0], coda = (/(?:[’'](?:s|t|d|ll|re|ve|m))?[.,;:!?)”"]*$/.exec(pezzi[k - 1]) || [''])[0];
          out.push(testa + conMaiuscole.join(' ') + coda); preso = k;
        }
      }
      if (!preso) { out.push(tok[i]); i++; } else i += preso;
    }
    return out.join(' ');
  }
  // divide «successfulone» in parole del dizionario (meno parole possibile, niente lettere sole tranne a/I)
  function dividi(parola) {
    const k = parola.toLowerCase(), n = k.length; if (n < 4 || n > 40) return null;
    const best = new Array(n + 1).fill(null); best[0] = [];
    for (let i = 1; i <= n; i++) for (let j = Math.max(0, i - 24); j < i; j++) {
      if (!best[j]) continue; const w = k.slice(j, i);
      if (!(DIZ.has(w) || CORTE.has(w)) || (w.length === 1 && w !== 'a' && w !== 'i')) continue;
      if (!best[i] || best[j].length + 1 < best[i].length) best[i] = [...best[j], w];
    }
    return best[n];
  }
  function pulisci(righe, dizNomi) {
    for (const r of righe) if (r.t) {
      r.t = r.t.replace(/\s*_{3,}.*$/, '').replace(/\s*(?:\.\s?){4,}\s*\d*\s*$/, '').replace(/�/g, '')
        .replace(/(\d) (st|nd|rd|th)\b/g, '$1$2').replace(/([A-Za-z])- ([A-Z])/g, '$1-$2').replace(/([A-Za-z]) ([’'](?:s|t|d|ll|re|ve|m)\b)/g, '$1$2').replace(/\bA ?t ?H ?igher ?L ?evels\b/g, 'At Higher Levels').replace(/\bCasting ?T ?im ?e\b/g, 'Casting Time').replace(/\b(\d{1,2}) d ?(\d{1,3})\b/g, '$1d$2').replace(/\b(\d+)d (\d+)\b/g, '$1d$2').replace(/\b(\d+) d(\d+)\b/g, '$1d$2')
        .replace(/\bCO N\b/g, 'CON').replace(/\bW IS\b/g, 'WIS').replace(/\bIN T\b/g, 'INT').replace(/\bST R\b/g, 'STR').replace(/\bD EX\b/g, 'DEX').replace(/\bC HA\b/g, 'CHA').trim();
    }
    // le parole fisse delle righe di tipo, anche se l'OCR le spezza («necrom ancy», «can trip»)
    const FISSE = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation', 'cantrip', 'ritual', 'Components', 'Duration', 'Range', 'Prerequisite'];
    const reFisse = FISSE.map(w => [new RegExp('\\b' + w.split('').join(' ?') + '\\b', 'gi'), w]);
    for (const r of righe) if (r.t && r.t.length < 80) for (const [re, w] of reFisse) r.t = r.t.replace(re, m => m[0] === m[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase());
    // le righe dell'indice analitico («Unarmored Defense, 164») non sono testo
    righe = righe.filter(r => !r.t || !/^[A-Z][^.:]{1,50}, \d{1,3}(?:-\d{0,3})?(?:, \d{1,3}(?:-\d{0,3})?)*$/.test(r.t));
    const f = frequenze(righe); FREQ = f;
    // dizionario dei nomi: quelli dell'SRD + le righe brevi «normali» del manuale (es. gli elenchi di incantesimi)
    const diz = new Map();
    for (const r of righe) if (r.t && r.t.length <= 45 && !spaziata(r.t) && /^[A-Z]/.test(r.t) && !/[.,;]$/.test(r.t) && r.t.split(' ').length <= 6 && r.t.split(' ').every(w => w.length >= 2 || /^[a-zA-Z&]$/.test(w))) {
      const k = chiaveNome(r.t); if (k.length >= 4 && !diz.has(k)) diz.set(k, unisciPezzi(r.t, f));
    }
    for (const n of dizNomi || []) diz.set(chiaveNome(n), n);
    for (const r of righe) {
      if (!r.t) continue;
      if (spaziata(r.t)) { r.t = ricomponiSpaziata(r.t, f, diz).replace(/([A-Za-z])- ([A-Z])/g, '$1-$2'); r.titolo = true; r.spaziata = true; }
      else r.t = unisciPezzi(unisciPezzi(r.t, f), f);          // due giri: «follo w ing» → «follow ing» → «following»
    }
    return righe.filter(r => r.finePagina || (r.t && !/^\d{1,4}$/.test(r.t)));
  }

  // riunisce le parole spezzate a fine riga e i paragrafi
  function unisci(righe) {
    let s = '';
    for (const r of righe) {
      if (r.finePagina || !r.t) continue;
      const t = r.t;
      if (!s) { s = t; continue; }
      if (/[a-zà-ÿ]-$/.test(s) && /^[a-zà-ÿ]/.test(t)) s = s.slice(0, -1) + t;
      else if ((/[.:!?»”]$/.test(s) && /^[A-ZÀ-Ý•\-–]/.test(t)) || /^[•\-–]\s/.test(t) || r.titolo) s += '\n' + t;
      else s += ' ' + t;
    }
    // i pezzi spezzati tra una riga e l'altra («m» a fine riga, «akes» all'inizio della dopo)
    if (FREQ) s = s.split('\n').map(l => unisciPezzi(l, FREQ)).join('\n');
    return s.replace(/^•\s*/gm, '- ');
  }

  // ---------- 3. le righe che dicono che cos'è una voce (dal VTT) ----------
  const ORD = '(\\d)(?:st|nd|rd|th)';
  const TIPOLINEA = [
    ['incantesimo', new RegExp(`^${ORD}[- ]level ${scuolaRe}(?: \\(ritual\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), rituale: /ritual/i.test(m[0]) || undefined, lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} cantrip$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1]), lingua: 'en' })],
    ['incantesimo', new RegExp(`^level (\\d) ${scuolaRe}(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), classi: m[3], lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} cantrip(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1]), classi: m[2], lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} di (\\d)° livello(?: \\(rituale\\))?$`, 'i'), m => ({ livello: +m[2], scuola: nScuola(m[1]), rituale: /rituale/i.test(m[0]) || undefined, lingua: 'it' })],
    ['incantesimo', new RegExp(`^(?:trucchetto (?:di )?${scuolaRe}|${scuolaRe} \\(?trucchetto\\)?)(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1] || m[2]), classi: m[3], lingua: 'it' })],
    ['incantesimo', new RegExp(`^livello (\\d) ${scuolaRe}(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), classi: m[3], lingua: 'it' })],
    // mostri: il tipo è una parola sola (o due, «swarm of tiny beasts» a parte), così una frase normale non passa
    ['mostro', /^(tiny|small|medium|large|huge|gargantuan)(?: or (?:tiny|small|medium|large|huge|gargantuan))? ([a-z][a-z ]{1,30}?)(?: \(([^)]*)\))?, ((?:lawful|neutral|chaotic|unaligned|any|typically)[a-z -]*)$/i, m => ({ taglia: TAGLIE[m[1].toLowerCase()], tipoCreatura: TIPI[m[2].toLowerCase().replace(/ /g, '')] || TIPI[m[2].toLowerCase().split(' ')[0]] || (/^f\s?e\s?n\s?d$/i.test(m[2]) ? 'Immondo' : cap(m[2])), sottotipo: m[3], allineamento: m[4], lingua: 'en' })],
    ['mostro', /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{2,25}?) (minuscol[oa]|piccol[oa]|medi[oa]|grande|enorme|mastodontic[oa]|gargantuesc[oa]|colossale)(?: o \w+)?(?: \(([^)]*)\))?, ([a-zà-ÿ -]+)$/i, m => ({ taglia: TAGLIE_IT[m[2].toLowerCase()], tipoCreatura: cap(m[1].trim()), allineamento: m[4], lingua: 'it' })],
    ['oggetto', /^(wondrous item|weapon|armor|armour|ring|rod|staff|wand|potion|scroll)(?: \(([^)]*)\))?, (common|uncommon|rare|very rare|legendary|artifact|rarity varies)(?: \((requires attunement[^)]*)\))?$/i, m => ({ categoria: cap(m[1]), rarita: RARITA[m[3].toLowerCase()], sintonia: m[4] ? (m[4].replace(/^requires attunement ?/i, '') || true) : undefined, magico: true, lingua: 'en' })],
    ['oggetto', /^(oggetto meraviglioso|arma|armatura|anello|verga|bastone|bacchetta|pozione|pergamena)(?: \(([^)]*)\))?, (comune|non comune|rar[oa]|molto rar[oa]|leggendari[oa]|artefatto|rarità variabile)(?: \((richiede (?:la )?sintonia[^)]*)\))?$/i, m => ({ categoria: cap(m[1]), rarita: RARITA_IT[m[3].toLowerCase()], sintonia: m[4] ? (m[4].replace(/^richiede (la )?sintonia ?/i, '') || true) : undefined, magico: true, lingua: 'it' })],
    ['talento', /^(origin|general|fighting style|epic boon) feat(?: \(prerequisites?: ([^)]*)\))?$/i, m => ({ categoria: cap(m[1]), prerequisiti: m[2], lingua: 'en' })],
    ['talento', /^talento (di origine|generale|(?:di )?stile di combattimento|(?:di )?dono epico)(?: \(prerequisit[oi]: ([^)]*)\))?$/i, m => ({ categoria: cap(m[1].replace(/^di /, '')), prerequisiti: m[2], lingua: 'it' })],
    ['talento', /^prerequisites?: (.+)$/i, m => ({ prerequisiti: m[1], lingua: 'en' })],
    ['talento', /^prerequisit[oi]: (.+)$/i, m => ({ prerequisiti: m[1], lingua: 'it' })]
  ];
  const tipoDi = t => { for (const [tipo, re, f] of TIPOLINEA) { const m = re.exec(t); if (m) return { tipo, ...f(m) }; } return null; };
  const nomeBuono = r => r && r.t && r.t.length <= 60 && !/[.;,]$/.test(r.t) && /^[A-ZÀ-Ý0-9]/.test(r.t) && !/^(Casting Time|Range|Components|Duration|Prerequisite)/i.test(r.t);

  // ---------- 3b. i blocchi dei mostri, da qualunque manuale ----------
  // Lo schema è sempre lo stesso: [nome] · «Large dragon, chaotic evil» · Armor Class · Hit Points · Speed ·
  // le sei caratteristiche · … · Challenge · tratti · ACTIONS … Si parte dalla riga della Classe Armatura (la più
  // sicura anche nelle scansioni), si cerca sopra la riga del tipo (accettando gli errori dell'OCR: «11uge»,
  // «La~ge», «neutr.al», «ohaotic») e il nome; il blocco finisce al mostro dopo o al primo titolo dopo «Challenge».
  const RIGA_CA_RE = /^\W{0,3}(?:Armor Class|Classe Armatura|AC|CA)\s+\d/i;
  const RIGA_CA = { test: t => RIGA_CA_RE.test(String(t).replace(/(\w)[.,'’~]+(?=\w)/g, '$1')) };
  const SUFF_TAGLIA = [['argantuan', 'gargantuan'], ['edium', 'medium'], ['mall', 'small'], ['arge', 'large'], ['iny', 'tiny'], ['uge', 'huge']];
  const ALLINEAMENTO = /(lawful|chaotic|aotic|awful|neutral|neutr|unaligned|any\b|evil|good|typically)/i;
  function tipoMostroOcr(t) {
    const info = tipoDi(t); if (info && info.tipo === 'mostro') return info;
    const c = String(t).replace(/(\w)[.~'"`’,]+(?=\w)/g, '$1').replace(/[^A-Za-z(), \-]/g, ' ').replace(/\s+/g, ' ').trim();
    const m = /^(\S*?)(argantuan|edium|mall|arge|iny|uge)\b(?: or \w+)? ([A-Za-z ]{3,30}?)\s*(?:\(([^)]*)\))?\s*,+\s*(.{3,40})$/i.exec(c);
    if (!m || m[1].length > 3 || !ALLINEAMENTO.test(m[5])) return null;
    const taglia = SUFF_TAGLIA.find(([k]) => k === m[2].toLowerCase())[1];
    const tc = m[3].toLowerCase().replace(/\s+/g, ' ').trim();
    const chiave = Object.keys(TIPI).find(k => tc.replace(/ /g, '').includes(k) || (tc.length >= 4 && k.endsWith(tc.slice(-4))));
    if (!chiave && !/swarm/.test(tc)) return null;
    return { tipo: 'mostro', taglia: TAGLIE[taglia], tipoCreatura: TIPI[chiave] || cap(tc), sottotipo: m[4], allineamento: m[5].replace(/^ohaotic/i, 'chaotic').trim(), lingua: 'en' };
  }
  const SEZIONE_MOSTRO = t => SEZIONI_M.some(([, re]) => re.test(String(t).trim().replace(/[^A-Za-z ]/g, '').trim()));
  // un titolo: riga corta, quasi tutta maiuscola (nelle scansioni i nomi dei mostri sono in maiuscoletto)
  const maiuscola = t => { const l = String(t).replace(/[^A-Za-zÀ-ÿ]/g, ''); if (l.length < 3 || t.length > 42 || /[.,;:]$/.test(t.trim())) return false; return l.replace(/[^A-ZÀ-Ý]/g, '').length / l.length >= 0.75; };
  const nomeMostroBuono = t => { t = String(t || '').trim(); const l = t.replace(/[^A-Za-z]/g, ''); if (/,/.test(t) && ALLINEAMENTO.test(t)) return false; if (/^\W*(tiny|small|medium|large|huge|gargantuan)\b/i.test(t) && /(beast|unalig|humanoid|monstrosity|undead|dragon|fiend|aberration|construct|elemental|fey|giant|ooze|plant|celestial)/i.test(t) && t.split(/\s+/).length > 2) return false; if (/^(of|a|an|the|is|and|in|to|for|but|or)\b/i.test(t) || t.split(/\s+/).length > 5 || /(regional effects|lair actions|a monster's lair|variant)/i.test(t)) return false; return l.length >= 3 && t.length <= 40 && l.length / t.replace(/\s/g, '').length > 0.8 && !/[.,;:]$/.test(t) && !/^(Armor|Hit Points|Speed|STR|DEX|CON|INT|WIS|CHA|Challenge|Senses|Languages|Skills|Saving|Damage|Condition)\b/i.test(t) && !SEZIONE_MOSTRO(t) && /^[A-ZÀ-Ý]/.test(t) && !/^VARIANT/i.test(t); };
  // un nome letto male dall'OCR («GrANT APE», «DusTMEPHIT», «Perytqn», «Yug0loths»): si rimette a posto con i nomi
  // dell'SRD (fino a 2 lettere diverse) e con il dizionario, parola per parola
  const distanza = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  function nomeOcr(t) {
    t = String(t).trim().replace(/\s+/g, ' ');
    const origOcr = t.split(' ');
    const l = t.replace(/[^A-Za-z]/g, '');
    if (l.length && l.replace(/[^A-Z]/g, '').length / l.length >= 0.55) t = t.toUpperCase().replace(/(?<=[A-Z])0|0(?=[A-Z])/g, 'O').replace(/(?<=[A-Z])1(?=[A-Z])/g, 'I');
    const k = t.toLowerCase().replace(/[^a-z ()\-]/g, '').replace(/\s+/g, ' ').trim();
    if (/^ore\b/.test(k) && NOMI_SRD.has(k.replace(/^ore/, 'orc'))) return k.replace(/^ore/, 'orc');
    if (NOMI_SRD.has(k)) return k;
    if (k.length >= 5) { let best = null, bd = 3; for (const n of NOMI_SRD) { if (Math.abs(n.length - k.length) > 2) continue; const d = distanza(k, n); if (d < bd) { bd = d; best = n; } } if (best && bd <= (k.length >= 8 ? 2 : 1)) return best; }
    // parola per parola, solo dove l'OCR ha lasciato tracce (maiuscole e minuscole mescolate, cifre, simboli)
    const sporca = o => /[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[0-9|~]/.test(o) || (/^[A-Z][a-z]/.test(o) && /[A-Z]/.test(o.slice(2)));
    return k.split(' ').map((w, i) => {
      if (!w || DIZ.has(w) || w.length < 3 || /[()\-]/.test(w) || !sporca(origOcr[i] || '')) return w;
      const pezzi = dividi(w); if (pezzi && pezzi.length <= 3 && pezzi.every(x => x.length >= 3)) return pezzi.join(' ');
      let best = w, bf = 0; for (const c of DIZ) { if (Math.abs(c.length - w.length) > 1 || c[0] !== w[0] && c.slice(-2) !== w.slice(-2)) continue; if (distanza(w, c) === 1) { const f = (FREQ && FREQ[c]) || 1; if (f > bf) { bf = f; best = c; } } }
      return best;
    }).join(' ');
  }
  const titoloNome = t => /^[^a-z]+$/.test(t) ? t.toLowerCase().replace(/(^|[\s(\-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Of|The|And|In)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase()) : t;
  function inziMostri(R) {
    const out = [];
    for (let i = 0; i < R.length; i++) {
      if (!RIGA_CA.test(R[i].t)) continue;
      // la Classe Armatura di un mostro ha i Punti Ferita subito dopo
      if (!R.slice(i + 1, i + 4).some(r => /(?:Hit Points|Punti Ferita|\bHP|\bPF)\s+\d/i.test(r.t)) && !/(?:Hit Points|\bHP|\bPF)\s+\d/i.test(R[i].t)) continue;
      let k = -1, info = null;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) { const x = tipoMostroOcr(R[j].t); if (x) { k = j; info = x; break; } }
      const top = k >= 0 ? k : i;
      let nome = '', iNome = top;
      for (let j = top - 1; j >= Math.max(0, top - 2); j--) { if (nomeMostroBuono(R[j].t)) { nome = R[j].t.trim(); iNome = j; break; } if (/\w{3}/.test(R[j].t) && !/^\W*$/.test(R[j].t) && R[j].t.length > 6) break; }
      let titolo = '';                                   // il titolo della sezione, poco sopra (es. «CARRION CRAWLER» prima del racconto)
      for (let j = top - 1; j >= Math.max(0, top - 80); j--) if (maiuscola(R[j].t) && nomeMostroBuono(R[j].t)) { titolo = R[j].t.trim(); break; }
      out.push({ i: iNome, corpo: (k >= 0 ? k : i - 1) + 1, tipo: 'mostro', info: info || { tipo: 'mostro', lingua: 'en' }, nome, titolo, mostroCa: i });
    }
    return out;
  }
  // l'impronta di un mostro dell'SRD (dadi dei PF + sfida): dà il nome anche quando l'OCR l'ha perso
  let IMPRONTE = {}, NOMI_SRD = new Set();
  const impronta = v => v.dadiPf && v.gs ? String(v.dadiPf).replace(/\s+/g, '').toLowerCase() + '|' + v.gs : '';
  function nomeDalTesto(v) {
    const conta = {};
    for (const o of [...(v.tratti || []), ...(v.azioni || []), ...(v.leggendarie || [])]) for (const m of String(o.testo || '').matchAll(/\b[Tt]he ([a-z][a-z\-]{2,20}(?: [a-z][a-z\-]{2,20})?)(?:'s|’s)?\s+(?:has|can|makes|uses|magically|is|attacks|regains|takes|casts|targets|exhales|emits|deals|teleports|becomes|gains|knows|must|loses|moves|swallows|fires|breathes)\b/g)) conta[m[1]] = (conta[m[1]] || 0) + 1;
    const best = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 2 && !/^(target|targeted creature|creature|attack|monster|dragon's|first|second|same)$/.test(best[0]) ? best[0] : '';
  }

  // ---------- 4. i campi di ogni tipo (dal VTT, con le correzioni) ----------
  function campo(testo, nomi) {
    const re = new RegExp(`(?:^|\\n|\\s)(?:${nomi})\\s*:?\\s+([^\\n]+?)(?=\\s+(?:Casting Time|Range|Components|Duration|Tempo di [Ll]ancio|Gittata|Componenti|Durata)\\s*:|\\n|$)`, 'i');
    const m = re.exec(testo); return m ? m[1].trim() : undefined;
  }
  function incantesimo(v, corpo) {
    const CAMPI_R = /^(Casting Time|Range|Components|Duration|Tempo di lancio|Gittata|Componenti|Durata)\s*:/i;
    // le righe dei campi restano righe a sé; «Components: … (a tiny bell and a piece of / fine silver wire)» continua
    let k = 0; const campi = [];
    while (k < corpo.length && k < 10) {
      if (CAMPI_R.test(corpo[k].t)) { campi.push(corpo[k].t); k++; continue; }
      if (campi.length && campi.length < 4 && !/\)$|^Duration/i.test(campi[campi.length - 1]) && (/\([^)]*$/.test(campi[campi.length - 1]) || /^[a-z]/.test(corpo[k].t)) && corpo[k].t.length < 70) { campi[campi.length - 1] += ' ' + corpo[k].t; k++; continue; }
      break;
    }
    const testoCampi = campi.join('\n');
    v.tempo = campo(testoCampi, 'Casting Time|Tempo di lancio');
    v.gittata = campo(testoCampi, 'Range|Gittata');
    v.componenti = campo(testoCampi, 'Components|Componenti');
    v.durata = campo(testoCampi, 'Duration|Durata');
    if (v.durata && /concentra/i.test(v.durata)) v.concentrazione = true;
    if (v.tempo && /ritual/i.test(v.tempo)) v.rituale = true;
    let testo = unisci(corpo.slice(k));
    // «Duration: Special» seguito dal testo sulla stessa riga
    if (v.durata && v.durata.length > 40) { const m = /^(Special|Instantaneous|Permanent|Until dispelled(?: or triggered)?|Concentration, up to \d+ \w+|\d+ \w+)\s+(.*)$/i.exec(v.durata); if (m) { v.durata = m[1]; testo = m[2] + '\n' + testo; } }
    const sup = /(?:^|\n|\s)(At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade|Ai livelli superiori|Usare uno slot incantesimo di livello superiore|Potenziamento del trucchetto)\.\s*/i.exec(testo);
    if (sup) { v.superiore = testo.slice(sup.index + sup[0].length).trim(); testo = testo.slice(0, sup.index); }
    const d = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:points of )?(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/i.exec(testo)
      || /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+danni (?:da )?(\w+)/i.exec(testo);
    if (d) { v.danni = d[1].replace(/\s+/g, ''); v.tipoDanno = DANNI[d[2].toLowerCase()] || DANNI_IT[d[2].toLowerCase()]; }
    const ts = /(strength|dexterity|constitution|intelligence|wisdom|charisma|forza|destrezza|costituzione|intelligenza|saggezza|carisma) saving throw|tiro salvezza (?:su |di )?(forza|destrezza|costituzione|intelligenza|saggezza|carisma)/i.exec(testo);
    if (ts) v.ts = CAR[(ts[1] || ts[2]).toLowerCase()];
    if (/spell attack/i.test(testo)) v.attacco = /ranged spell attack/i.test(testo) ? 'distanza' : 'mischia';
    if (typeof v.classi === 'string') v.classi = v.classi.split(/,\s*/).filter(Boolean);
    v.testo = testo.trim();
  }
  const SEZIONI_M = [['azioni', /^(actions|azioni)$/i], ['azioniBonus', /^(bonus actions|azioni bonus)$/i], ['reazioni', /^(reactions|reazioni)$/i], ['leggendarie', /^(legendary actions|azioni leggendarie)$/i], ['tratti', /^(traits|tratti)$/i], ['_mitiche', /^(mythic actions|azioni mitiche)$/i], ['_tana', /^(lair actions|azioni della tana)$/i]];
  function voceAzione(p) {
    const m = /^([A-ZÀ-Ý][^.]{0,60}?(?:\([^)]*\))?)\.\s+([\s\S]+)$/.exec(p.trim());
    if (!m) return null;
    const o = { nome: m[1].trim(), testo: m[2].trim() };
    const c = /(?:Attack|Attacco)[^:]*:\s*([+\-−])\s*(\d+)|Tiro per colpire[^:]*:\s*([+\-−])\s*(\d+)/i.exec(o.testo);
    if (c) o.colpire = +((c[1] || c[3]).replace('−', '-') + (c[2] || c[4]));
    const dd = [...o.testo.matchAll(/\d+\s*\((\d+d\d+(?:\s*[+\-−]\s*\d+)?)\)\s+(?:(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage|danni\s+(?:da\s+)?(\w+))/gi)];
    if (dd.length) o.danni = dd.map(x => ({ dadi: x[1].replace(/\s+/g, '').replace('−', '-'), tipo: DANNI[(x[2] || '').toLowerCase()] || DANNI_IT[(x[3] || '').toLowerCase()] || '' }));
    else { const d1 = /Hit:\s*(\d+)\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/i.exec(o.testo); if (d1) o.danni = [{ dadi: d1[1], tipo: DANNI[d1[2].toLowerCase()] }]; }
    const u = /\((recharge[^)]*|ricarica [^)]*|\d+\/(?:day|giorno)[^)]*)\)/i.exec(o.nome);
    if (u) o.uso = u[1];
    return o;
  }
  function nominaMostro(v, x) {
    let cand0 = (IMPRONTE[impronta(v)] || []).filter(c => c[1] === v.ca);
    if (v.car) cand0 = cand0.filter(c => !c[2] || c[2] === ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => v.car[k]).join(' '));
    const srd = cand0.length === 1 ? cand0[0][0] : '', dalTesto = nomeDalTesto(v), cand = x.nome;
    const noto = n => n && NOMI_SRD.has(n.toLowerCase());
    let nome = cand || srd || dalTesto || x.titolo || '';
    if (!nome) { nome = 'Mostro senza nome'; (v._dubbi ||= []).push('nome non trovato'); }
    if (nome && nome !== cand && nome !== srd) (v._dubbi ||= []).push(nome === dalTesto ? 'nome preso dal testo: controllalo' : 'nome preso dal titolo della sezione: controllalo');
    if (nome && nome !== srd && !/^Mostro senza nome$/.test(nome)) nome = nomeOcr(nome);
    v.nome = titoloNome(nome.replace(/^the /i, '')).replace(/(^|[\s(\-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/ (Of|The|And|In) /g, w => w.toLowerCase());
    delete v._testoTutto;
  }
  // gli errori tipici dell'OCR nei numeri dei blocchi: «Armor Class 1 5», «ld6», «ldlO», «S ft.», «(+1 )»
  const cifre = x => x.replace(/[lIi|]/g, '1').replace(/[O]/g, '0').replace(/S/g, '5');
  // i dadi letti male dall'OCR: «Sd6» «lld8» «l3d12» «lOdlO» «5a6» «7d10+i1»
  const dadiOcr = t => String(t).replace(/(^|[\s(])([0-9lIiSO|]{1,3})\s?[da]\s?([0-9lIiSO|]{1,3})(?=\s*[+\-−)]|\s*$|\s)/g, (m, a, n, f) => /\d/.test(n + f) || /^[lIS]/.test(n) ? a + cifre(n) + 'd' + cifre(f) : m)
    .replace(/(\d+d\d+\s*[+\-−]\s*)([0-9lIiSO]{1,3})(?=\))/g, (m, a, b) => a + cifre(b));
  const numeriOcr = t => dadiOcr(String(t))
    .replace(/^(\W{0,3}(?:Armor Class|Hit Points|Classe Armatura|Punti Ferita)\s+)([12])\s(\d)\b/i, '$1$2$3')
    .replace(/\b[lI]\s?d\s?(\d)/g, '1d$1').replace(/(\d)d([lI])([0O])\b/g, '$1d1$3').replace(/(\d)d1O\b/g, '$1d10').replace(/(\d)d2O\b/g, '$1d20')
    .replace(/\(\s*([+\-−–])\s*(\d+)\s*\)/g, '($1$2)').replace(/\b(reach|range|Speed)\s+S\s?ft/gi, '$1 5 ft').replace(/\bHit:\s*S\s\(/g, 'Hit: 5 (')
    .replace(/\{/g, '(').replace(/(\d)ft\b/g, '$1 ft');
  function mostro(v, righe) {
    righe = righe.map(r => ({ ...r, t: numeriOcr(r.t) }));
    const testo = righe.map(r => r.t).join('\n');
    v._testoTutto = testo;
    const prendi = re => re.exec(testo);
    let m;
    if ((m = prendi(/(?:Armor Class|Classe Armatura|\bAC|\bCA)\s+(\d+)(?:\s*\(([^)]*)\))?/i))) { v.ca = +m[1]; if (m[2]) v.caNota = m[2]; }
    if ((m = prendi(/(?:Hit Points|Punti Ferita|\bHP|\bPF)\s+(\d+)(?:\s*\(([^)]*)\))?/i))) { v.pf = +m[1]; if (m[2]) v.dadiPf = m[2].replace(/\s+/g, ''); }
    if ((m = prendi(/(?:Speed|Velocità)\s+([^\n]+)/i))) v.velocita = m[1].replace(/\s+(Initiative|Iniziativa)\b.*$/i, '').trim();
    if ((m = prendi(/(?:Initiative|Iniziativa)\s+([+\-−]\d+)/i))) v.iniziativa = +m[1].replace('−', '-');
    const sei = [...testo.matchAll(/(\d{1,2})\s*\(\s*[+\-−–]\s*\d+\s*\)/g)].slice(0, 6);
    const ord = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (sei.length === 6) v.car = Object.fromEntries(sei.map((x, i) => [ord[i], +x[1]]));
    else if ((() => { const c = {}; for (const k of ord) { const x = new RegExp(`(?:^|\\n)${k.toUpperCase()}\\s*\\n\\s*(\\d{1,2})\\s*[,(]`).exec(testo); if (x) c[k] = +x[1]; } if (Object.keys(c).length === 6) { v.car = c; return true; } })()) ;
    else {
      const car = {}, ts = {};
      const nomi = { str: 'Str|For', dex: 'Dex|Des', con: 'Con|Cos', int: 'Int', wis: 'Wis|Sag', cha: 'Cha|Car' };
      for (const k of ord) { const x = new RegExp(`\\b(?:${nomi[k]})\\s+(\\d{1,2})\\s+([+\\-−]\\d+)\\s+([+\\-−]\\d+)`, 'i').exec(testo); if (x) { car[k] = +x[1]; if (x[2] !== x[3]) ts[k] = +x[3].replace('−', '-'); } }
      if (Object.keys(car).length >= 4) { v.car = car; if (Object.keys(ts).length) v.ts = ts; }
    }
    const linea = re => { const x = re.exec(testo); return x ? x[1].trim() : undefined; };
    const tsL = linea(/(?:Saving Throws|Tiri Salvezza)\s+([^\n]+)/i);
    if (tsL && !v.ts) { const o = {}; for (const x of tsL.matchAll(/(Str|Dex|Con|Int|Wis|Cha|For|Des|Cos|Sag|Car)\w*\s*([+\-−]\d+)/gi)) o[{ str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', for: 'str', des: 'dex', cos: 'con', sag: 'wis', car: 'cha' }[x[1].toLowerCase()]] = +x[2].replace('−', '-'); if (Object.keys(o).length) v.ts = o; }
    const ab = linea(/(?:^|\n)(?:Skills|Abilità)\s+([^\n]+)/i);
    if (ab) { const o = {}; for (const x of ab.matchAll(/([A-Za-z ]+?)\s*([+\-−]\d+)/g)) { const k = x[1].trim().toLowerCase(); o[ABILITA[k] ? cap(k) : x[1].trim()] = +x[2].replace('−', '-'); } if (Object.keys(o).length) v.abilita = o; else v.abilitaTesto = ab; }
    v.vulnerabilita = linea(/(?:Damage Vulnerabilities|Vulnerabilità(?: ai danni)?)\s+([^\n]+)/i);
    v.resistenze = linea(/(?:Damage Resistances|Resistenze(?: ai danni)?)\s+([^\n]+)/i);
    v.immunita = linea(/(?:Damage Immunities|Immunità ai danni)\s+([^\n]+)/i);
    v.immCondizioni = linea(/(?:Condition Immunities|Immunità alle condizioni)\s+([^\n]+)/i);
    v.sensi = linea(/(?:Senses|Sensi)\s+([^\n]+)/i);
    v.lingue = linea(/(?:Languages|Linguaggi|Lingue)\s+([^\n]+)/i);
    if ((m = prendi(/(?:Challenge|\bCR|Sfida|\bGS)\s+(\d+(?:\/\d)?)\s*\(([^)]*)\)/i))) {
      v.gs = m[1];
      const px = /(\d[\d., ]*)\s*(?:XP|PE)|(?:XP|PE)\s*(\d[\d., ]*)/i.exec(m[2]); if (px) v.px = +(px[1] || px[2]).replace(/[., ]/g, '');
      const pb = /(?:PB|BC)\s*\+?(\d+)/i.exec(m[2]); if (pb) v.competenza = +pb[1];
    }
    if (v.gs && !v.competenza) { const g = v.gs.includes("/") ? 0 : +v.gs; v.competenza = g < 5 ? 2 : g < 9 ? 3 : g < 13 ? 4 : g < 17 ? 5 : g < 21 ? 6 : g < 25 ? 7 : g < 29 ? 8 : 9; }
    let sez = 'tratti'; const blocchi = { tratti: [] };
    let inizio = righe.findIndex(r => /^(?:Languages.*?|Linguaggi.*?)?(?:Challenge|CR|Sfida|GS)\s*\d/i.test(r.t));
    if (inizio < 0) inizio = righe.findIndex(r => /^(?:Languages|Linguaggi)\s/i.test(r.t));
    let par = '';
    const chiudi = () => { if (par.trim()) (blocchi[sez] ||= []).push(par.trim()); par = ''; };
    for (const r of righe.slice(inizio + 1)) {
      const s = SEZIONI_M.find(([, re]) => re.test(r.t));
      if (s) { chiudi(); sez = s[0]; continue; }
      if (/^(?:Proficiency Bonus|Bonus di competenza)\b/i.test(r.t)) continue;
      // le righe del blocco che l'OCR mette in mezzo alle azioni (colonne lette nell'ordine sbagliato)
      if (/^(?:STR|DEX|CON|INT|WIS|CHA|FOR|DES|COS|SAG|CAR)$/i.test(r.t.trim()) || /^\d{1,2}\s*[,(]\s*[+\-−–]?\s*\d+\s*\)?$/.test(r.t.trim()) || /^(?:Saving Throws|Skills|Damage (?:Vulnerabilities|Resistances|Immunities)|Condition Immunities|Senses|Languages|Challenge)\b/i.test(r.t)) continue;
      if (/^[A-ZÀ-Ý][^.]{0,60}?(?:\([^)]*\))?\.\s/.test(r.t) && (!par || /[.!?)]$/.test(par.trim()))) { chiudi(); par = r.t; }
      else par = par ? (/[a-zà-ÿ]-$/.test(par) ? par.slice(0, -1) + r.t : par + ' ' + r.t) : r.t;
    }
    chiudi();
    // l'OCR a volte perde il titolo «ACTIONS»: le azioni cominciano dal primo Multiattack o attacco
    if (!blocchi.azioni && blocchi.tratti.length) {
      const a = blocchi.tratti.findIndex(p => /^(Multiattack|Multiattacco)\b/i.test(p) || /(Weapon|Spell) Attack\s*:|Attacco (con arma|con incantesimo)/i.test(p));
      if (a >= 0) blocchi.azioni = blocchi.tratti.splice(a);
    }
    for (const [k, lista] of Object.entries(blocchi)) {
      if (k.startsWith('_')) { v.testo = [v.testo, lista.join('\n\n')].filter(Boolean).join('\n\n'); continue; }
      const voci = lista.map(voceAzione).filter(Boolean);
      if (voci.length) v[k] = voci;
    }
  }
  function oggetto(v, testo) {
    v.testo = testo.trim();
    const d = /(\d+d\d+)\s+(?:points of )?(\w+) damage|(\d+d\d+)\s+danni (?:da )?(\w+)/i.exec(testo);
    if (/weapon|arma/i.test(v.categoria || '') && d) { v.arma = true; v.danno = d[1] || d[3]; v.tipoDanno = DANNI[(d[2] || '').toLowerCase()] || DANNI_IT[(d[4] || '').toLowerCase()]; }
    const b = /\+(\d) bonus to attack and damage|\+(\d) ai tiri per colpire e per i danni/i.exec(testo);
    if (b) v.bonus = +(b[1] || b[2]);
  }
  function talento(v, testo) {
    v.testo = testo.trim();
    const a = /(?:Increase your|Aumenta (?:il tuo punteggio di|di 1 il punteggio di))\s+([^\n]+?) (?:score )?by 1/i.exec(testo);
    if (a) v.aumentiTesto = a[1];
    if (v.prerequisiti && /pact of|eldritch blast|warlock|^\d+(st|nd|rd|th) level$|patto|deflagrazione occulta/i.test(v.prerequisiti)) v.categoria = 'Supplica occulta';
  }
  // paragrafi «Nome. Testo» di un blocco di righe
  function paragrafi(righe) {
    const out = []; let cur = null;
    for (const r of righe) {
      if (r.finePagina || !r.t) continue;
      const m = /^([A-ZÀ-Ý][A-Za-zÀ-ÿ’' ,()\-/]{1,50}?)\.\s+(.*)$/.exec(r.t);
      if (m && !/^(The|A|An|You|Your|If|When|While|At|As|In|On|This|It|Each|For|Once|Il|La|Lo|Un|Una|Se|Quando)$/.test(m[1].split(' ')[0]) && (!cur || /[.!?)”]$/.test(cur.righe[cur.righe.length - 1].t))) { cur = { nome: m[1].trim(), righe: [{ t: m[2] }] }; out.push(cur); continue; }
      if (cur) cur.righe.push(r); else { cur = { nome: '', righe: [r] }; out.push(cur); }
    }
    return out.map(p => ({ nome: p.nome, testo: unisci(p.righe).trim() })).filter(p => p.testo);
  }

  // ---------- 5. specie, classi, background, condizioni ----------
  function specie(nome, righe) {
    const v = { tipo: 'specie', nome, tratti: [], lingua: 'en' };
    const sotto = []; let cur = v, base = [];
    for (let i = 0; i < righe.length; i++) {
      const r = righe[i];
      if (r.titolo && righe.slice(i + 1, i + 8).some(x => /^Ability Score Increase\./i.test(x.t))) { cur = { nome: r.t, righe: [] }; sotto.push(cur); continue; }
      (cur === v ? base : cur.righe).push(r);
    }
    const leggi = (o, rr) => {
      const intro = [];
      for (const p of paragrafi(rr)) {
        if (!p.nome) { intro.push(p.testo); continue; }
        const t = p.testo;
        if (/^Ability Score Increase$/i.test(p.nome)) {
          o.aumenti = [...t.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d)/gi)].map(m => ({ car: CAR[m[1].toLowerCase()], bonus: +m[2] }));
          if (/ability scores each increase by 1/i.test(t)) o.aumenti = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(car => ({ car, bonus: 1 }));
          o.aumentiTesto = t; continue;
        }
        if (/^Size$/i.test(p.nome)) { const m = /size is (Tiny|Small|Medium|Large)/i.exec(t); if (m) o.taglia = TAGLIE[m[1].toLowerCase()]; (o._testo ||= []).push('Size. ' + t); continue; }
        if (/^Speed$/i.test(p.nome)) { const m = /walking speed is (\d+)/i.exec(t); if (m) o.velocita = +m[1]; }
        if (/^Languages$/i.test(p.nome)) o.lingue = [...t.matchAll(/\b(Common|Dwarvish|Elvish|Giant|Gnomish|Goblin|Halfling|Orc|Abyssal|Celestial|Draconic|Deep Speech|Infernal|Primordial|Sylvan|Undercommon)\b/g)].map(m => m[1]).filter((x, i, a) => a.indexOf(x) === i);
        if (/^(Age|Alignment)$/i.test(p.nome)) { (o._testo ||= []).push(p.nome + '. ' + t); continue; }
        if (/^(Speed|Languages|Subrace)$/i.test(p.nome)) { (o._testo ||= []).push(p.nome + '. ' + t); continue; }
        if (/^Darkvision$/i.test(p.nome)) o.scurovisione = true;
        (o.tratti ||= []).push({ nome: p.nome, testo: t });
      }
      o.testo = [...intro, ...(o._testo || [])].join('\n\n'); delete o._testo;
    };
    leggi(v, base);
    if (sotto.length) v.sottospecie = sotto.map(s => { const o = { id: slug(s.nome), nome: s.nome, tratti: [] }; leggi(o, s.righe); return o; });
    return v;
  }
  const FAMIGLIE = /^(Primal Paths|Bard Colleges|Divine Domains?|Druid Circles|Martial Archetypes|Monastic Traditions|Sacred Oaths|Ranger Archetypes|Roguish Archetypes|Sorcerous Origins|Otherworldly Patrons|Arcane Traditions)$/i;
  const livelloDi = t => { const m = /(?:at|starting at|beginning at|when you reach|by|until|once you reach)\s+(\d+)(?:st|nd|rd|th) level/i.exec(t) || /\b(\d+)(?:st|nd|rd|th) level\b/i.exec(t); return m ? +m[1] : null; };
  function classe(nomeEn, righe) {
    const v = { tipo: 'classe', nome: cap(nomeEn), lingua: 'en', competenze: [] };
    const testo = righe.map(r => r.t).join('\n');
    let m;
    if ((m = /Hit Dice:\s*1d(\d+)/i.exec(testo))) v.dadoVita = +m[1];
    if ((m = /Saving Throws:\s*([^\n]+)/i.exec(testo))) v.ts = [...m[1].matchAll(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/gi)].map(x => CAR[x[0].toLowerCase()]);
    for (const k of ['Armor', 'Weapons', 'Tools']) { const x = new RegExp(`^${k}:\\s*([^\\n]+)`, 'im').exec(testo); if (x && !/^none/i.test(x[1])) v.competenze.push(...x[1].split(/,\s*/).map(s => s.trim()).filter(Boolean)); }
    if ((m = /^Skills:\s*([\s\S]+?)(?=\n[A-Z][a-z]+:|\nEquipment|\n[A-Z][a-z]+ [A-Z])/m.exec(testo))) {
      const t = m[1].replace(/\n/g, ' ').trim(), n = /Choose (any )?(two|three|four)/i.exec(t);
      v.sceltaAbilita = [{ quante: n ? { two: 2, three: 3, four: 4 }[n[2].toLowerCase()] : 2, testo: t, tra: /any/i.test(n && n[1] || '') ? Object.values(ABILITA) : Object.entries(ABILITA).filter(([k]) => new RegExp('\\b' + k + '\\b', 'i').test(t)).map(([, id]) => id) }];
    }
    if ((m = /^Equipment\b[\s\S]*?\n([\s\S]+?)(?=\n[A-Z][^\n]{0,40}\n)/m.exec(testo))) v.equipaggiamento = m[1].split('\n').filter(l => /^[•\-–(]/.test(l) || /^\(a\)/.test(l)).map(l => l.replace(/^[•\-–]\s*/, '')).join('\n') || undefined;
    // privilegi: i titoli dopo l'equipaggiamento; dopo il titolo della famiglia di sottoclassi, le sottoclassi
    const inizio = Math.max(0, righe.findIndex(r => /^Equipment\b/i.test(r.t)));
    const blocchi = []; let cur = null;
    for (const r of righe.slice(inizio + 1)) {
      if (r.titolo && r.t.length <= 50 && !/^(Hit Points|Proficiencies|Equipment|Class Features|Quick Build)$/i.test(r.t) && !/^The \w+ Table$/i.test(r.t)) { cur = { nome: r.t, righe: [] }; blocchi.push(cur); continue; }
      if (cur) cur.righe.push(r);
    }
    const privilegi = [], sottoclassi = []; let famiglia = null, sc = null, liv = 1;
    for (let i = 0; i < blocchi.length; i++) {
      const b = blocchi[i], t = unisci(b.righe).trim();
      if (FAMIGLIE.test(b.nome)) { famiglia = b.nome; sc = null; continue; }
      if (famiglia && !livelloDi(t) && blocchi[i + 1] && livelloDi(unisci(blocchi[i + 1].righe))) { sc = { tipo: 'sottoclasse', nome: b.nome, famiglia, classe: v.nome, testo: t, privilegi: [], lingua: 'en' }; sottoclassi.push(sc); continue; }
      const l = livelloDi(t); if (l && l <= 20) liv = l;
      if (!t) continue;
      if (sc) sc.privilegi.push({ livello: liv, nome: b.nome, testo: t });
      else privilegi.push({ livello: liv, nome: b.nome, testo: t });
    }
    v.livelli = Array.from({ length: 20 }, (_, i) => ({ livello: i + 1, competenza: BONUS_COMP[i], privilegi: privilegi.filter(p => p.livello === i + 1).map(p => ({ nome: p.nome, testo: p.testo })) }));
    if (sottoclassi.length) v.sottoclassi = sottoclassi.map(s => s.nome);
    return [v, ...sottoclassi];
  }
  function background(nome, righe) {
    const v = { tipo: 'background', nome, lingua: 'en', abilita: [], competenze: [], caratteristiche: [] };
    const testo = righe.map(r => r.t).join('\n');
    let m;
    if ((m = /Skill Proficiencies:\s*([^\n]+)/i.exec(testo))) { v.abilita = Object.entries(ABILITA).filter(([k]) => new RegExp('\\b' + k + '\\b', 'i').test(m[1])).map(([, id]) => id); v.competenze.push(...m[1].split(/,\s*/).map(s => 'Skill: ' + s.trim())); }
    if ((m = /Tool Proficiencies:\s*([^\n]+)/i.exec(testo))) v.competenze.push(...m[1].split(/,\s*/).map(s => 'Tool: ' + s.trim()));
    if ((m = /Languages:\s*([^\n]+)/i.exec(testo))) v.lingueTesto = m[1].trim();
    const ie = righe.findIndex(r => /^Equipment:/i.test(r.t)), fe = righe.findIndex(r => /^Feature:/i.test(r.t));
    if (ie >= 0) v.equipaggiamento = unisci(righe.slice(ie, fe > ie ? fe : ie + 4)).replace(/^Equipment:\s*/i, '').trim();
    if (fe >= 0) {
      let fine = righe.findIndex((r, i) => i > fe && r.titolo); if (fine < 0) fine = righe.length;
      v.privilegio = { nome: righe[fe].t.replace(/^Feature:\s*/i, ''), testo: unisci(righe.slice(fe + 1, fine)).trim() };
    }
    const prima = righe.findIndex(r => /^Skill Proficiencies:/i.test(r.t));
    v.testo = unisci(righe.slice(0, Math.max(0, prima))).trim();
    return v;
  }

  // ---------- 6. dalle righe alle voci ----------
  // modo: '' = tutto da solo; altrimenti un tipo («talento», «specie», «regola»…) per un intervallo di pagine
  function trovaVoci(righe, modo, diz) {
    const R = righe.filter(r => !r.finePagina);
    const inizi = [];                                          // { i (prima riga), fine?, tipo, fai(righe) }
    const condizioni = new Set((diz && diz.condizioni) || []), benefici = [];
    if (!modo || ['incantesimo', 'mostro', 'oggetto', 'talento'].includes(modo)) {
      for (let i = 1; i < R.length; i++) {
        const info = tipoDi(R[i].t);
        if (!info || (modo && info.tipo !== modo) || info.tipo === 'mostro') continue;
        if (!nomeBuono(R[i - 1])) continue;
        inizi.push({ i: i - 1, corpo: i + 1, tipo: info.tipo, info, nome: R[i - 1].t });
      }
    }
    if (!modo || modo === 'mostro') inizi.push(...inziMostri(R));
    if (!modo || modo === 'talento') {
      // talenti senza prerequisito: un titolo seguito da «…gain the following benefits», vicino ad altri talenti
      // con prerequisito (così «Rage» del barbaro, che ha la stessa frase, resta fuori)
      for (let i = 0; i < R.length - 2; i++) {
        if (!R[i].spaziata && !R[i].titolo) continue;
        if (inizi.some(x => x.i === i)) continue;
        if (!nomeBuono(R[i]) || /Traits$|Names$/i.test(R[i].t)) continue;
        const dopo = R.slice(i + 1, i + 4).map(r => r.t).join(' ');
        if (/following benefits|i seguenti benefici/i.test(dopo) && !/^Prerequisite/i.test(R[i + 1].t)) benefici.push({ i, corpo: i + 1, tipo: 'talento', info: { tipo: 'talento', lingua: 'en' }, nome: R[i].t });
      }
    }
    if (!modo || modo === 'talento') {
      const veri = inizi.filter(x => x.tipo === 'talento' && x.info.prerequisiti && !/pact of|eldritch blast|warlock|^\d+(st|nd|rd|th) level/i.test(x.info.prerequisiti)).map(x => x.i);
      for (const b of benefici) if (modo || veri.some(i => Math.abs(i - b.i) < 300)) inizi.push(b);
    }
    if (!modo || modo === 'specie') for (let i = 0; i < R.length; i++) { const m = /^(.{3,30}) Traits$/.exec(R[i].t); if (m && R[i].titolo && R.slice(i + 1, i + 12).some(r => /^Ability Score Increase\./i.test(r.t))) inizi.push({ i, corpo: i + 1, tipo: 'specie', nome: m[1], blocco: true }); }
    if (!modo || modo === 'classe') for (let i = 0; i < R.length; i++) {
      const m = /Hit Dice:\s*1d\d+ per (\w+) level/i.exec(R[i].t); if (!m) continue;
      // la classe comincia al titolo «Class Features» poco sopra
      let j = i; for (let k = i; k >= Math.max(0, i - 8); k--) if (/Class Features$/i.test(R[k].t)) { j = k; break; }
      inizi.push({ i: j, corpo: j + 1, tipo: 'classe', nome: m[1], blocco: true });
    }
    if (!modo || modo === 'background') for (let i = 0; i < R.length; i++) {
      if (!/^Skill Proficiencies:/i.test(R[i].t)) continue;
      let j = -1; for (let k = i - 1; k >= Math.max(0, i - 40); k--) if (R[k].titolo && nomeBuono(R[k]) && !/^Variant|:/.test(R[k].t) && R[k].t.split(' ').length <= 4) { j = k; break; }
      // «OUT LAND ER» (maiuscole spezzate) → «Outlander»
      const nomeB = j >= 0 && /^[A-Z ]+$/.test(R[j].t) ? cap(R[j].t.replace(/\s+/g, '').toLowerCase()) : j >= 0 && R[j].t;
      if (j >= 0) inizi.push({ i: j, corpo: j + 1, tipo: 'background', nome: nomeB, blocco: true });
    }
    if (!modo || modo === 'condizione') for (let i = 0; i < R.length - 1; i++) {
      if (!R[i].titolo || !condizioni.has(R[i].t.toLowerCase())) continue;
      if (/^[•\-–]|^A[n]? \w+ creature|^Some special abilities/i.test(R[i + 1].t)) inizi.push({ i, corpo: i + 1, tipo: 'condizione', nome: R[i].t });
    }
    if (modo && !['incantesimo', 'mostro', 'oggetto', 'talento', 'specie', 'classe', 'background', 'condizione'].includes(modo)) {
      for (let i = 0; i < R.length; i++) if (R[i].titolo && R[i].t.length <= 60) inizi.push({ i, corpo: i + 1, tipo: modo, nome: R[i].t });
    }
    inizi.sort((a, b) => a.i - b.i);
    const visti = new Set(), voci = [];
    // dove finisce il corpo: alla voce dopo, a un titolo di capitolo o (per le voci brevi) al primo titolo spaziato
    const capitolo = r => /^(Chapter|Appendix|Capitolo|Appendice)\s+\w+/i.test(r.t) || /^Part \d+$/i.test(r.t);
    for (let k = 0; k < inizi.length; k++) {
      const x = inizi[k]; if (visti.has(x.i)) continue; visti.add(x.i);
      let fine = R.length;
      for (const y of inizi.slice(k + 1)) if (y.i > x.i && (!x.blocco || y.tipo === x.tipo || !['talento', 'condizione'].includes(y.tipo) || x.tipo !== 'classe')) { fine = y.i; break; }
      for (let j = x.corpo; j < fine; j++) {
        if (capitolo(R[j])) { fine = j; break; }
        if (x.tipo === 'mostro' && j > x.corpo && R.slice(x.corpo, j).some(r => /^\W{0,2}(?:Challenge|Sfida|CR|GS)\s+\d/i.test(r.t)) && ((maiuscola(R[j].t) && nomeMostroBuono(R[j].t) && !/^(ACTIONS|REACTIONS|LEGENDARY|LAIR|BONUS)/i.test(R[j].t.replace(/[^A-Za-z ]/g, "").trim())) || RIGA_CA.test(R[j].t) || tipoMostroOcr(R[j].t))) { fine = j; break; }
        if (!x.blocco && x.tipo !== 'mostro' && R[j].spaziata && j > x.corpo && !SEZIONI_M.some(([, re]) => re.test(R[j].t))) { fine = j; break; }
        if (x.tipo === 'specie' && R[j].titolo && !R.slice(j + 1, j + 8).some(r => /^Ability Score Increase\./i.test(r.t)) && !/^[A-Z][^.]{0,40}\.\s/.test(R[j].t)) { fine = j; break; }
        if (x.tipo === 'classe' && k + 1 < inizi.length) {
          // la classe dopo comincia dal suo titolo grande (es. «Bard»), prima del «Class Features»
          const dopo = inizi.slice(k + 1).find(y => y.tipo === 'classe');
          if (dopo && R[j].titolo && R[j].t.toLowerCase() === dopo.nome.toLowerCase()) { fine = j; break; }
        }
        if (x.tipo === 'background' && R[j].titolo && /^(Suggested Characteristics|Variant)/i.test(R[j].t)) {
          // le tabelle di tratti/ideali restano fuori; si va avanti fino al background dopo
          const prossimo = inizi.slice(k + 1).find(y => y.tipo === 'background'); fine = Math.min(prossimo ? prossimo.i : R.length, fine);
          const corpo = R.slice(x.corpo, j); voci.push(background(x.nome, corpo)); x._fatto = true; break;
        }
      }
      if (x._fatto) continue;
      const corpo = R.slice(x.corpo, fine);
      if (x.tipo === 'specie') { voci.push(specie(x.nome, corpo)); continue; }
      if (x.tipo === 'classe') { voci.push(...classe(x.nome, R.slice(x.i, fine))); continue; }
      if (x.tipo === 'background') { voci.push(background(x.nome, corpo)); continue; }
      const v = { tipo: x.tipo, nome: x.nome, ...(x.info || {}) };
      if (v.tipo === 'incantesimo') incantesimo(v, corpo);
      else if (v.tipo === 'mostro') { if (x.mostroCa === undefined && !corpo.some(r => RIGA_CA.test(r.t))) continue; mostro(v, corpo); nominaMostro(v, x); v._grezzo = R.slice(x.i, fine).map(r => r.t).join('\n'); }
      else if (v.tipo === 'oggetto') oggetto(v, unisci(corpo));
      else if (v.tipo === 'talento') talento(v, unisci(x.corpo > x.i + 1 ? corpo : corpo));
      else v.testo = unisci(corpo).trim();
      voci.push(v);
    }
    for (const v of voci) for (const k of Object.keys(v)) if (v[k] === undefined || v[k] === '' || (Array.isArray(v[k]) && !v[k].length && !['competenze', 'abilita', 'caratteristiche', 'tratti'].includes(k))) delete v[k];
    return voci;
  }

  // elenchi «Bard Spells» → le classi di ogni incantesimo
  function classiDagliElenchi(righe) {
    const out = new Map(); let cl = null, ultimo = -1;
    for (const r of righe) {
      if (r.finePagina) continue;
      const m = /^(Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard) Spells\b/i.exec(r.t);
      if (m) { cl = CLASSI_IT[m[1].toLowerCase()]; ultimo = -1; continue; }
      if (/^Spell Descriptions$/i.test(r.t)) { cl = null; continue; }
      // «Cantrips (0 Level)», «1st Level»…: se il livello torna indietro senza un titolo, l'elenco è di un'altra classe
      const lv = /^Cantrips/i.test(r.t) ? 0 : (/^(\d)(?:st|nd|rd|th) Level$/i.exec(r.t) || [])[1];
      if (lv !== undefined) { if (+lv <= ultimo) cl = null; ultimo = +lv; continue; }
      if (!cl || r.t.length > 40) continue;
      const k = chiaveNome(r.t); if (!out.has(k)) out.set(k, new Set()); out.get(k).add(cl);
    }
    return out;
  }

  // ---------- 6b. il controllo dei numeri ----------
  // Ogni voce che non torna riceve «_dubbi» (cosa controllare): l'anteprima la segna, e l'IA locale (se c'è) può
  // provare a correggerla. Nessuna correzione è automatica: un numero inventato è peggio di un numero segnato.
  const PX_GS = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
  function mediaDadi(d) { const m = /^(\d+)d(\d+)(?:([+\-−])(\d+))?$/.exec(String(d || '').replace(/\s+/g, '')); if (!m) return null; return Math.floor(+m[1] * (+m[2] + 1) / 2) + (m[3] ? (m[3] === '+' ? 1 : -1) * +m[4] : 0); }
  function controlla(v) {
    const d = [];
    if (v.tipo === 'mostro') {
      if (!v.ca || v.ca < 5 || v.ca > 25) d.push('Classe Armatura ' + (v.ca ?? 'mancante'));
      if (!v.pf) d.push('Punti Ferita mancanti');
      else if (v.dadiPf) { const m = mediaDadi(v.dadiPf); if (m === null) d.push('dadi dei PF illeggibili: ' + v.dadiPf); else if (Math.abs(m - v.pf) > 1) d.push(`PF ${v.pf} non tornano con ${v.dadiPf} (media ${m})`); }
      if (!v.car) d.push('caratteristiche mancanti');
      else if (Object.values(v.car).some(x => !(x >= 1 && x <= 30))) d.push('caratteristiche fuori scala');
      if (!v.gs) d.push('grado di sfida mancante');
      else if (v.px && PX_GS[v.gs] && PX_GS[v.gs] !== v.px && !(+v.gs >= 20)) d.push(`sfida ${v.gs} con ${v.px} PE`);
      if (!(v.azioni || []).length && !(v.tratti || []).length) d.push('nessuna azione letta');
      if ((v.azioni || []).length + (v.tratti || []).length > 16) d.push('troppe azioni: forse ha preso anche il mostro dopo');
      for (const a of v.azioni || []) if (/(Weapon|Spell) Attack\s*:/i.test(a.testo) && a.colpire === undefined) { d.push(`«${a.nome}»: bonus per colpire illeggibile`); break; }
    } else if (v.tipo === 'incantesimo') {
      if (!(v.livello >= 0 && v.livello <= 9)) d.push('livello');
      if (!v.scuola) d.push('scuola');
      for (const [k, n] of [['tempo', 'tempo di lancio'], ['gittata', 'gittata'], ['componenti', 'componenti'], ['durata', 'durata']]) if (!v[k]) d.push(n + ' mancante');
      if (!v.testo || v.testo.length < 20) d.push('testo mancante');
    } else if (!v.testo && !v.livelli && !v.tratti && !v.privilegi) d.push('testo mancante');
    if (d.length) v._dubbi = [...new Set([...(v._dubbi || []), ...d])];
    return v;
  }

  // ---------- 7. tutto insieme ----------
  // opz: { srd (dizionario srd-nomi.js), modo, lingua, nome (del pacchetto) }
  function leggi(righe, opz = {}) {
    const srd = opz.srd || {};
    const nomiNoti = [...Object.keys(srd.nomi || {}), ...(srd.extra || [])];
    PAROLE = srd.parole ? srd.parole.split(' ') : [];
    IMPRONTE = srd.impronte || {}; NOMI_SRD = new Set(Object.keys((srd.perTipo && srd.perTipo.mostro) || {}));
    DIZ = new Set([...PAROLE, ...(opz.parole ? String(opz.parole).split(' ') : [])].filter(w => w.length >= 2));
    const pulite = pulisci(righe, nomiNoti);
    const voci = trovaVoci(pulite, opz.modo || '', { condizioni: Object.keys((srd.perTipo && srd.perTipo.condizione) || {}) });
    const elenchi = classiDagliElenchi(pulite);
    for (const v of voci) {
      if (v.tipo === 'incantesimo' && !v.classi) {
        const c = (srd.classi && srd.classi[v.nome.toLowerCase()] && new Set(srd.classi[v.nome.toLowerCase()])) || elenchi.get(chiaveNome(v.nome));
        if (c) v.classi = [...c];
      }
    }
    for (const v of voci) controlla(v);
    return { voci, righe: pulite };
  }
  // nomi in italiano dove l'SRD li ha, poi il pacchetto per il VTT
  function pacchetto(voci, opz = {}) {
    const srd = opz.srd || {}, nomeP = opz.nome || 'Manuale', lingua = opz.lingua || 'en';
    const it = (tipo, n) => { const t = srd.perTipo && srd.perTipo[tipo]; return t && t[String(n).toLowerCase()]; };
    const per = {}, usati = new Set();
    for (const v0 of voci) {
      if (v0._no) continue;
      const v = JSON.parse(JSON.stringify(v0));
      delete v.lingua; delete v._no; delete v._dubbi; delete v._grezzo; delete v._ia;
      if (lingua === 'en') {
        v.en = v.nome; const n = it(v.tipo, v.nome); if (n) v.nome = n;
        for (const k of ['tratti', 'azioni', 'azioniBonus', 'reazioni', 'leggendarie']) for (const o of v[k] || []) { const n2 = srd.tratti && srd.tratti[o.nome.toLowerCase()]; if (n2) { o.en = o.nome; o.nome = n2; } }
        for (const l of v.livelli || []) for (const o of l.privilegi) { const n2 = srd.tratti && srd.tratti[o.nome.toLowerCase()]; if (n2) { o.en = o.nome; o.nome = n2; } }
        for (const o of v.privilegi || []) { const n2 = srd.tratti && srd.tratti[o.nome.toLowerCase()]; if (n2) { o.en = o.nome; o.nome = n2; } }
        if (v.tipo === 'sottoclasse' && v.classe) { const c = CLASSI_IT[v.classe.toLowerCase()]; if (c) v.classe = c; }
        if (v.lingue && Array.isArray(v.lingue)) v.lingue = v.lingue.map(l => ({ Common: 'Comune', Dwarvish: 'Nanico', Elvish: 'Elfico', Giant: 'Gigante', Gnomish: 'Gnomesco', Goblin: 'Goblin', Halfling: 'Halfling', Orc: 'Orchesco', Draconic: 'Draconico', Infernal: 'Infernale' }[l] || l));
      } else v.testoIt = v.testo;
      let id = v.tipo + ':man-' + slug(nomeP) + '-' + slug(v.en || v.nome), n = 2;
      while (usati.has(id)) id = id.replace(/-\d+$/, '') + '-' + n++;
      usati.add(id); v.id = id; v.fonte = nomeP;
      (per[v.tipo] ||= []).push(v);
    }
    return {
      pacchetto: { id: 'manuale-' + slug(nomeP), nome: nomeP, autore: '', usoPersonale: true, fonte: nomeP, licenza: 'Copiato da un manuale che possiedi: solo per uso personale, non va condiviso.' },
      voci: per
    };
  }
  return { righeDaPdf, righeDaTesto, pulisci, trovaVoci, leggi, pacchetto, controlla, mediaDadi, _spaziata: spaziata };
});
