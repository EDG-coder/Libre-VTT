// ---------- Importare da un manuale che possiedi (PDF o testo incollato) ----------
// Si legge il testo del PDF (con la posizione di ogni pezzo, così le pagine a due colonne restano in
// ordine), si riconoscono le voci dalla riga che segue il nome:
//   incantesimi  «1st-level evocation» · «Level 1 Evocation (Wizard)» · «Invocazione di 1° livello» · «Livello 1 Invocazione (Mago)»
//   mostri       «Medium Humanoid, Neutral» · «Umanoide Medio, Neutrale»  (+ CA, PF, caratteristiche, azioni…)
//   oggetti      «Wondrous item, rare (requires attunement)» · «Oggetto meraviglioso, raro (richiede sintonia)»
//   talenti      «Origin Feat» · «Talento di Origine» · «Prerequisite: …» · «Prerequisito: …»
// Per condizioni, specie, background, classi e regole si divide il testo ai titoli (righe brevi).
// Si vedono tutte in un'anteprima, si correggono, e si salvano in un pacchetto «uso personale».
// Lingua: il manuale può essere in italiano o in inglese; ogni voce viene messa anche nell'altra lingua.
// I nomi presi dall'SRD si traducono con il compendio; le parole fisse (scuole, danni, taglie, rarità)
// con un glossario; il testo con il traduttore del browser, se c'è (Chrome/Edge recenti): altrimenti
// resta nella lingua del manuale e lo si può tradurre dopo con il file delle traduzioni.
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'voce';

  // ---------- glossario EN ↔ IT per i campi fissi ----------
  const SCUOLE = { abjuration: 'Abiurazione', conjuration: 'Evocazione', divination: 'Divinazione', enchantment: 'Ammaliamento', evocation: 'Invocazione', illusion: 'Illusione', necromancy: 'Necromanzia', transmutation: 'Trasmutazione' };
  const DANNI = { acid: 'Acido', bludgeoning: 'Contundente', cold: 'Freddo', fire: 'Fuoco', force: 'Forza', lightning: 'Fulmine', necrotic: 'Necrotico', piercing: 'Perforante', poison: 'Veleno', psychic: 'Psichico', radiant: 'Radioso', slashing: 'Tagliente', thunder: 'Tuono' };
  const DANNI_IT = { acido: 'Acido', contundenti: 'Contundente', contundente: 'Contundente', freddo: 'Freddo', fuoco: 'Fuoco', forza: 'Forza', fulmine: 'Fulmine', necrotici: 'Necrotico', necrotico: 'Necrotico', perforanti: 'Perforante', perforante: 'Perforante', veleno: 'Veleno', psichici: 'Psichico', psichico: 'Psichico', radiosi: 'Radioso', radioso: 'Radioso', taglienti: 'Tagliente', tagliente: 'Tagliente', tuono: 'Tuono' };
  const TAGLIE = { tiny: 'Minuscola', small: 'Piccola', medium: 'Media', large: 'Grande', huge: 'Enorme', gargantuan: 'Mastodontica' };
  const TAGLIE_IT = { minuscolo: 'Minuscola', minuscola: 'Minuscola', piccolo: 'Piccola', piccola: 'Piccola', medio: 'Media', media: 'Media', grande: 'Grande', enorme: 'Enorme', mastodontico: 'Mastodontica', mastodontica: 'Mastodontica', gargantuesco: 'Mastodontica', gargantuesca: 'Mastodontica', colossale: 'Mastodontica' };
  const TIPI = { aberration: 'Aberrazione', beast: 'Bestia', celestial: 'Celestiale', construct: 'Costrutto', dragon: 'Drago', elemental: 'Elementale', fey: 'Folletto', fiend: 'Immondo', giant: 'Gigante', humanoid: 'Umanoide', monstrosity: 'Mostruosità', ooze: 'Melma', plant: 'Vegetale', undead: 'Non morto', swarm: 'Sciame' };
  const RARITA = { common: 'Comune', uncommon: 'Non comune', rare: 'Raro', 'very rare': 'Molto raro', legendary: 'Leggendario', artifact: 'Artefatto', 'rarity varies': 'Varia' };
  const RARITA_IT = { comune: 'Comune', 'non comune': 'Non comune', raro: 'Raro', rara: 'Raro', 'molto raro': 'Molto raro', 'molto rara': 'Molto raro', leggendario: 'Leggendario', leggendaria: 'Leggendario', artefatto: 'Artefatto', 'rarità variabile': 'Varia' };
  const inv = o => Object.fromEntries(Object.entries(o).map(([a, b]) => [b.toLowerCase(), a]));
  const SCUOLE_EN = inv(SCUOLE);
  const scuolaRe = '(' + [...Object.keys(SCUOLE), ...Object.values(SCUOLE).map(s => s.toLowerCase())].join('|') + ')';
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const nScuola = s => { const k = String(s).toLowerCase(); return SCUOLE[k] || cap(k); };

  // ---------- 1. il testo del PDF, riga per riga ----------
  let pdfjs = null;
  async function righePdf(buf, da, a, avanza) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdfjs.min.js', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs.worker.min.js', location.href).href;
    }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const fine = Math.min(doc.numPages, a || doc.numPages), righe = [];
    for (let n = Math.max(1, da || 1); n <= fine; n++) {
      avanza && avanza(n, fine);
      const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      const pezzi = tc.items.filter(i => i.str && i.str.trim()).map(i => {
        const fs = Math.hypot(i.transform[2], i.transform[3]) || i.height || 8;
        const font = (tc.styles[i.fontName] && tc.styles[i.fontName].fontFamily) || '';
        return { s: i.str, x: i.transform[4], x1: i.transform[4] + i.width, y: vp.height - i.transform[5], fs, bold: /bold|black|heavy|semibold/i.test(i.fontName + ' ' + font) };
      });
      // due colonne? se molti pezzi iniziano a destra della metà e nessuno la attraversa
      const meta = vp.width / 2;
      const attraversa = pezzi.filter(p => p.x < meta - 10 && p.x1 > meta + 10).length;
      const destra = pezzi.filter(p => p.x >= meta - 4).length;
      const colonne = attraversa < pezzi.length * 0.05 && destra > pezzi.length * 0.25 ? 2 : 1;
      for (let c = 0; c < colonne; c++) {
        const qui = pezzi.filter(p => colonne === 1 || (c === 0 ? p.x < meta - 4 : p.x >= meta - 4)).sort((p, q) => p.y - q.y || p.x - q.x);
        let riga = null;
        for (const p of qui) {
          if (riga && Math.abs(p.y - riga.y) < Math.max(2, p.fs * 0.45)) { riga.pezzi.push(p); riga.fs = Math.max(riga.fs, p.fs); continue; }
          riga = { y: p.y, fs: p.fs, pezzi: [p] }; righe.push(riga);
        }
      }
      righe.push({ pagina: n });
    }
    // dalla riga di pezzi al testo; la dimensione «normale» è la più frequente
    const conti = {};
    const out = righe.map(r => {
      if (r.pagina) return { t: '', pagina: r.pagina };
      r.pezzi.sort((p, q) => p.x - q.x);
      let t = '';
      for (let i = 0; i < r.pezzi.length; i++) { const p = r.pezzi[i], q = r.pezzi[i - 1]; t += (q && p.x - q.x1 > p.fs * 0.15 && !/\s$/.test(t) && !/^\s/.test(p.s) ? ' ' : '') + p.s; }
      const fs = Math.round(r.fs); conti[fs] = (conti[fs] || 0) + t.length;
      return { t: t.replace(/\s+/g, ' ').trim(), fs, bold: r.pezzi.every(p => p.bold) };
    });
    const normale = +Object.entries(conti).sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
    for (const r of out) r.titolo = !!r.t && (r.fs > normale * 1.15 || (r.bold && r.t.length < 50 && !/[.:]$/.test(r.t)));
    return out.filter(r => r.t || r.pagina);
  }
  function righeTesto(txt) {
    return String(txt).replace(/\r/g, '').split('\n').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
      .map(t => ({ t, titolo: /^#{1,4}\s/.test(t) || (t.length < 40 && !/[.,:;]$/.test(t) && /^[A-ZÀ-Ý]/.test(t) && t.split(' ').length <= 5) }))
      .map(r => ({ ...r, t: r.t.replace(/^#{1,4}\s+/, '') }));
  }
  // riunisce le parole spezzate a fine riga e i paragrafi
  function unisci(righe) {
    let s = '';
    for (const r of righe) {
      if (r.pagina) continue;
      const t = r.t;
      if (!s) { s = t; continue; }
      if (/[a-zà-ÿ]-$/.test(s)) s = s.slice(0, -1) + t;
      else if (/[.:!?»”]$/.test(s) && (/^[A-ZÀ-Ý•\-–]/.test(t))) s += '\n' + t;
      else s += ' ' + t;
    }
    return s;
  }

  // ---------- 2. le righe che dicono che cos'è una voce ----------
  const ORD = '(\\d)(?:st|nd|rd|th)';
  const TIPOLINEA = [
    // incantesimi
    ['incantesimo', new RegExp(`^${ORD}[- ]level ${scuolaRe}(?: \\(ritual\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), rituale: /ritual/i.test(m[0]), lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} cantrip$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1]), lingua: 'en' })],
    ['incantesimo', new RegExp(`^level (\\d) ${scuolaRe}(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), classi: m[3], lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} cantrip(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1]), classi: m[2], lingua: 'en' })],
    ['incantesimo', new RegExp(`^${scuolaRe} di (\\d)° livello(?: \\(rituale\\))?$`, 'i'), m => ({ livello: +m[2], scuola: nScuola(m[1]), rituale: /rituale/i.test(m[0]), lingua: 'it' })],
    ['incantesimo', new RegExp(`^(?:trucchetto (?:di )?${scuolaRe}|${scuolaRe} \\(?trucchetto\\)?)(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: 0, scuola: nScuola(m[1] || m[2]), classi: m[3], lingua: 'it' })],
    ['incantesimo', new RegExp(`^livello (\\d) ${scuolaRe}(?: \\(([^)]*)\\))?$`, 'i'), m => ({ livello: +m[1], scuola: nScuola(m[2]), classi: m[3], lingua: 'it' })],
    // mostri
    ['mostro', /^(tiny|small|medium|large|huge|gargantuan)(?: or (?:tiny|small|medium|large|huge|gargantuan))? ([a-z ]+?)(?: \(([^)]*)\))?, (.+)$/i, m => ({ taglia: TAGLIE[m[1].toLowerCase()], tipoCreatura: TIPI[m[2].toLowerCase().trim().split(' ').pop()] || cap(m[2].trim()), allineamento: m[4], lingua: 'en' })],
    ['mostro', /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*?) (minuscol[oa]|piccol[oa]|medi[oa]|grande|enorme|mastodontic[oa]|gargantuesc[oa]|colossale)(?: o \w+)?(?: \(([^)]*)\))?, (.+)$/i, m => ({ taglia: TAGLIE_IT[m[2].toLowerCase()], tipoCreatura: cap(m[1].trim()), allineamento: m[4], lingua: 'it' })],
    // oggetti magici
    ['oggetto', /^(wondrous item|weapon|armor|armour|ring|rod|staff|wand|potion|scroll)(?: \(([^)]*)\))?, (common|uncommon|rare|very rare|legendary|artifact|rarity varies)(?: \((requires attunement[^)]*)\))?$/i, m => ({ categoria: cap(m[1]), rarita: RARITA[m[3].toLowerCase()], sintonia: m[4] ? (m[4].replace(/^requires attunement ?/i, '') || true) : undefined, magico: true, lingua: 'en' })],
    ['oggetto', /^(oggetto meraviglioso|arma|armatura|anello|verga|bastone|bacchetta|pozione|pergamena)(?: \(([^)]*)\))?, (comune|non comune|rar[oa]|molto rar[oa]|leggendari[oa]|artefatto|rarità variabile)(?: \((richiede (?:la )?sintonia[^)]*)\))?$/i, m => ({ categoria: cap(m[1]), rarita: RARITA_IT[m[3].toLowerCase()], sintonia: m[4] ? (m[4].replace(/^richiede (la )?sintonia ?/i, '') || true) : undefined, magico: true, lingua: 'it' })],
    // talenti
    ['talento', /^(origin|general|fighting style|epic boon) feat(?: \(prerequisites?: ([^)]*)\))?$/i, m => ({ categoria: cap(m[1]), prerequisiti: m[2], lingua: 'en' })],
    ['talento', /^talento (di origine|generale|(?:di )?stile di combattimento|(?:di )?dono epico)(?: \(prerequisit[oi]: ([^)]*)\))?$/i, m => ({ categoria: cap(m[1].replace(/^di /, '')), prerequisiti: m[2], lingua: 'it' })],
    ['talento', /^prerequisites?: (.+)$/i, m => ({ prerequisiti: m[1], lingua: 'en' })],
    ['talento', /^prerequisit[oi]: (.+)$/i, m => ({ prerequisiti: m[1], lingua: 'it' })]
  ];
  const tipoDi = t => { for (const [tipo, re, f] of TIPOLINEA) { const m = re.exec(t); if (m) return { tipo, ...f(m) }; } return null; };

  // ---------- 3. i campi di ogni tipo ----------
  function campo(testo, nomi) {
    const re = new RegExp(`(?:^|\\n|\\s)(?:${nomi})\\s*:?\\s+([^\\n]+?)(?=\\s+(?:Casting Time|Range|Components|Duration|Tempo di [Ll]ancio|Gittata|Componenti|Durata)\\s*:|\\n|$)`, 'i');
    const m = re.exec(testo); return m ? m[1].trim() : undefined;
  }
  function incantesimo(v, testo) {
    v.tempo = campo(testo, 'Casting Time|Tempo di lancio');
    v.gittata = campo(testo, 'Range|Gittata');
    v.componenti = campo(testo, 'Components|Componenti');
    v.durata = campo(testo, 'Duration|Durata');
    if (v.durata && /concentra/i.test(v.durata)) v.concentrazione = true;
    if (v.tempo && /ritual/i.test(v.tempo)) v.rituale = true;
    // il testo vero comincia dopo «Duration/Durata»
    let corpo = testo.replace(/^(?:(?:Casting Time|Range|Components|Duration|Tempo di lancio|Gittata|Componenti|Durata)\s*:[^\n]*\n|[^\n]{0,50}\n(?=(?:Range|Components|Duration|Gittata|Componenti|Durata)\s*:))*/i, '');
    if (corpo === testo) corpo = testo;
    const sup = /(?:^|\n)\s*(At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade|Ai livelli superiori|Usare uno slot incantesimo di livello superiore|Potenziamento del trucchetto)\.\s*/i.exec(corpo);
    if (sup) { v.superiore = corpo.slice(sup.index + sup[0].length).trim(); corpo = corpo.slice(0, sup.index); }
    const d = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:points of )?(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/i.exec(corpo)
      || /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+danni (?:da )?(\w+)/i.exec(corpo);
    if (d) { v.danni = d[1].replace(/\s+/g, ''); v.tipoDanno = DANNI[d[2].toLowerCase()] || DANNI_IT[d[2].toLowerCase()]; }
    const ts = /(strength|dexterity|constitution|intelligence|wisdom|charisma|forza|destrezza|costituzione|intelligenza|saggezza|carisma) saving throw|tiro salvezza (?:su |di )?(forza|destrezza|costituzione|intelligenza|saggezza|carisma)/i.exec(corpo);
    if (ts) v.ts = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha', forza: 'str', destrezza: 'dex', costituzione: 'con', intelligenza: 'int', saggezza: 'wis', carisma: 'cha' }[(ts[1] || ts[2]).toLowerCase()];
    if (typeof v.classi === 'string') v.classi = v.classi.split(/,\s*/).filter(Boolean);
    v.testo = corpo.trim();
  }
  const SEZIONI_M = [['azioni', /^(actions|azioni)$/i], ['azioniBonus', /^(bonus actions|azioni bonus)$/i], ['reazioni', /^(reactions|reazioni)$/i], ['leggendarie', /^(legendary actions|azioni leggendarie)$/i], ['tratti', /^(traits|tratti)$/i], ['_mitiche', /^(mythic actions|azioni mitiche)$/i], ['_tana', /^(lair actions|azioni della tana)$/i]];
  function voceAzione(p) {
    const m = /^([A-ZÀ-Ý][^.]{0,60}?(?:\([^)]*\))?)\.\s+([\s\S]+)$/.exec(p.trim());
    if (!m) return null;
    const o = { nome: m[1].trim(), testo: m[2].trim() };
    const c = /(?:Attack|Attacco)[^:]*:\s*([+-−]\d+)|Attack Roll:\s*([+-−]\d+)|Tiro per colpire[^:]*:\s*([+-−]\d+)/i.exec(o.testo);
    if (c) o.colpire = +String(c[1] || c[2] || c[3]).replace('−', '-');
    const dd = [...o.testo.matchAll(/\d+\s*\((\d+d\d+(?:\s*[+-−]\s*\d+)?)\)\s+(?:(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage|danni\s+(?:da\s+)?(\w+))/gi)];
    if (dd.length) o.danni = dd.map(x => ({ dadi: x[1].replace(/\s+/g, '').replace('−', '-'), tipo: DANNI[(x[2] || '').toLowerCase()] || DANNI_IT[(x[3] || '').toLowerCase()] || '' }));
    const u = /\((recharge [^)]*|ricarica [^)]*|\d+\/(?:day|giorno)[^)]*)\)/i.exec(o.nome);
    if (u) o.uso = u[1];
    return o;
  }
  function mostro(v, righe) {
    const testo = righe.map(r => r.t).join('\n');
    const prendi = (re) => { const m = re.exec(testo); return m ? m : null; };
    let m;
    if ((m = prendi(/(?:Armor Class|Classe Armatura|\bAC|\bCA)\s+(\d+)(?:\s*\(([^)]*)\))?/i))) { v.ca = +m[1]; if (m[2]) v.caNota = m[2]; }
    if ((m = prendi(/(?:Hit Points|Punti Ferita|\bHP|\bPF)\s+(\d+)(?:\s*\(([^)]*)\))?/i))) { v.pf = +m[1]; if (m[2]) v.dadiPf = m[2].replace(/\s+/g, ''); }
    if ((m = prendi(/(?:Speed|Velocità)\s+([^\n]+)/i))) v.velocita = m[1].replace(/\s+(Initiative|Iniziativa)\b.*$/i, '').trim();
    if ((m = prendi(/(?:Initiative|Iniziativa)\s+([+-−]\d+)/i))) v.iniziativa = +m[1].replace('−', '-');
    // caratteristiche: «18 (+4) 14 (+2) …» sotto «STR DEX CON…», oppure «Str 18 +4 +4» (2024)
    const sei = [...testo.matchAll(/(\d{1,2})\s*\(\s*[+-−]\s*\d+\s*\)/g)].slice(0, 6);
    const ord = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    if (sei.length === 6) v.car = Object.fromEntries(sei.map((x, i) => [ord[i], +x[1]]));
    else {
      const car = {}, ts = {};
      const nomi = { str: 'Str|For', dex: 'Dex|Des', con: 'Con|Cos', int: 'Int', wis: 'Wis|Sag', cha: 'Cha|Car' };
      for (const k of ord) { const x = new RegExp(`\\b(?:${nomi[k]})\\s+(\\d{1,2})\\s+([+-−]\\d+)\\s+([+-−]\\d+)`, 'i').exec(testo); if (x) { car[k] = +x[1]; if (x[2] !== x[3]) ts[k] = +x[3].replace('−', '-'); } }
      if (Object.keys(car).length >= 4) { v.car = car; if (Object.keys(ts).length) v.ts = ts; }
    }
    const linea = re => { const x = re.exec(testo); return x ? x[1].trim() : undefined; };
    const tsL = linea(/(?:Saving Throws|Tiri Salvezza)\s+([^\n]+)/i);
    if (tsL && !v.ts) { const o = {}; for (const x of tsL.matchAll(/(Str|Dex|Con|Int|Wis|Cha|For|Des|Cos|Sag|Car)\w*\s*([+-−]\d+)/gi)) o[{ str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', for: 'str', des: 'dex', cos: 'con', sag: 'wis', car: 'cha' }[x[1].toLowerCase()]] = +x[2].replace('−', '-'); if (Object.keys(o).length) v.ts = o; }
    v.abilitaTesto = linea(/(?:^|\n)(?:Skills|Abilità)\s+([^\n]+)/i);
    v.vulnerabilita = linea(/(?:Damage Vulnerabilities|Vulnerabilities|Vulnerabilità(?: ai danni)?)\s+([^\n]+)/i);
    v.resistenze = linea(/(?:Damage Resistances|Resistances|Resistenze(?: ai danni)?)\s+([^\n]+)/i);
    v.immunita = linea(/(?:Damage Immunities|Immunità ai danni|(?:^|\n)Immunities|(?:^|\n)Immunità)\s+([^\n]+)/i);
    v.immCondizioni = linea(/(?:Condition Immunities|Immunità alle condizioni)\s+([^\n]+)/i);
    v.sensi = linea(/(?:Senses|Sensi)\s+([^\n]+)/i);
    v.lingue = linea(/(?:Languages|Linguaggi|Lingue)\s+([^\n]+)/i);
    if ((m = prendi(/(?:Challenge|\bCR|Sfida|\bGS)\s+(\d+(?:\/\d)?)\s*\(([^)]*)\)/i))) {
      v.gs = m[1];
      const px = /([\d.,]+)\s*(?:XP|PE)|(?:XP|PE)\s*([\d.,]+)/i.exec(m[2]); if (px) v.px = +(px[1] || px[2]).replace(/[.,]/g, '');
      const pb = /(?:PB|BC)\s*\+?(\d+)/i.exec(m[2]); if (pb) v.competenza = +pb[1];
    }
    // tratti e azioni: i paragrafi «Nome. Testo» dopo le statistiche, divisi nelle sezioni
    let sez = 'tratti'; const blocchi = { tratti: [] };
    let inizio = righe.findIndex(r => /^(?:Challenge|CR|Sfida|GS)\s/i.test(r.t) || /^(?:Languages|Linguaggi)\s/i.test(r.t));
    if (inizio < 0) inizio = 0;
    let par = '';
    const chiudi = () => { if (par.trim()) (blocchi[sez] ||= []).push(par.trim()); par = ''; };
    for (const r of righe.slice(inizio + 1)) {
      const s = SEZIONI_M.find(([, re]) => re.test(r.t));
      if (s) { chiudi(); sez = s[0]; continue; }
      if (/^(?:Proficiency Bonus|Bonus di competenza)\b/i.test(r.t)) continue;
      if (/^[A-ZÀ-Ý][^.]{0,60}?(?:\([^)]*\))?\.\s/.test(r.t) && (!par || /[.!?)]$/.test(par.trim()))) { chiudi(); par = r.t; }
      else par = par ? (/[a-zà-ÿ]-$/.test(par) ? par.slice(0, -1) + r.t : par + ' ' + r.t) : r.t;
    }
    chiudi();
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
    const a = /(?:Ability Score Increase|Aumento dei punteggi di caratteristica)\.\s*([^\n]+)/i.exec(testo);
    if (a) v.aumentiTesto = a[1];
  }

  // ---------- 4. dalle righe alle voci ----------
  function trovaVoci(righe, forza) {
    const voci = [];
    const pulite = righe.filter(r => !r.pagina && !/^\d{1,4}$/.test(r.t));   // via i numeri di pagina
    if (forza && !['incantesimo', 'mostro', 'oggetto', 'talento'].includes(forza)) return perTitoli(pulite, forza);
    for (let i = 1; i < pulite.length; i++) {
      const info = tipoDi(pulite[i].t);
      if (!info || (forza && info.tipo !== forza)) continue;
      const nome = pulite[i - 1].t;
      if (nome.length > 60 || /[.:;,]$/.test(nome)) continue;
      voci.push({ i: i - 1, info, nome });
    }
    return voci.map((x, k) => {
      const fine = k + 1 < voci.length ? voci[k + 1].i : pulite.length;
      const corpo = pulite.slice(x.i + 2, fine);
      const v = { tipo: x.info.tipo, nome: x.nome.replace(/\s+/g, ' '), ...x.info };
      const testo = unisci(corpo);
      if (v.tipo === 'incantesimo') {
        // le righe dei campi (Tempo di lancio, Gittata, Componenti, Durata) restano righe a sé
        const CAMPI_R = /^(Casting Time|Range|Components|Duration|Tempo di lancio|Gittata|Componenti|Durata)\s*:/i;
        let k3 = 0; while (k3 < corpo.length && k3 < 8 && (CAMPI_R.test(corpo[k3].t) || (k3 && CAMPI_R.test(corpo[k3 - 1].t) && !/[.]$/.test(corpo[k3 - 1].t) && corpo[k3].t.length < 50 && /^\(|^[a-zà-ÿ]/.test(corpo[k3].t)))) k3++;
        incantesimo(v, corpo.slice(0, k3).map(r => r.t).join('\n') + '\n' + unisci(corpo.slice(k3)));
      }
      else if (v.tipo === 'mostro') mostro(v, corpo);
      else if (v.tipo === 'oggetto') oggetto(v, testo);
      else if (v.tipo === 'talento') talento(v, testo);
      for (const k2 of Object.keys(v)) if (v[k2] === undefined || v[k2] === '') delete v[k2];
      return v;
    });
  }
  function perTitoli(righe, tipo) {
    const voci = []; let cur = null;
    for (const r of righe) {
      if (r.titolo && r.t.length <= 60) { cur = { tipo, nome: r.t, righe: [] }; voci.push(cur); continue; }
      if (cur) cur.righe.push(r);
    }
    return voci.filter(v => v.righe.length).map(v => {
      const testo = unisci(v.righe), o = { tipo, nome: v.nome, testo };
      if (tipo === 'specie' || tipo === 'background' || tipo === 'classe') {
        const tratti = [...testo.matchAll(/(?:^|\n)([A-ZÀ-Ý][^.\n]{1,40})\.\s+([^\n]+)/g)].map(m => ({ nome: m[1].trim(), testo: m[2].trim() }));
        if (tipo === 'specie' && tratti.length) o.tratti = tratti;
        if (tipo === 'classe' && tratti.length) o._privilegi = tratti.map(t => ({ ...t, livello: (/(?:level|livello) (\d+)/i.exec(t.testo) || [])[1] }));
      }
      return o;
    });
  }
  window.compendioManualeLeggi = (txt, tipo) => trovaVoci(righeTesto(txt), tipo);   // per le prove

  // ---------- 5. l'altra lingua ----------
  const dalCompendio = (nome, da) => {
    const voci = (window.COMPENDIO && COMPENDIO.voci) || [], n = String(nome).toLowerCase();
    const v = voci.find(x => (da === 'en' ? x.en : (x.it || x._nomeOrig || x.nome)) && String(da === 'en' ? x.en : (x.it || x._nomeOrig || x.nome)).toLowerCase() === n);
    if (!v) return null;
    return da === 'en' ? (v.it || v._nomeOrig || v.nome) : v.en;
  };
  const nessuno = new Set();                             // coppie di lingue che il browser non ha: non si richiede
  async function traduttore(da, a) {
    if (nessuno.has(da + a)) return null;
    const t = await traduttore1(da, a);
    if (!t) nessuno.add(da + a);
    return t;
  }
  async function traduttore1(da, a) {
    try {
      if (!('Translator' in self)) return null;
      // alcuni browser hanno il traduttore ma non rispondono mai: dopo qualche secondo si va avanti senza
      const entro = (pr, ms) => Promise.race([pr, new Promise(ok => setTimeout(() => ok(null), ms))]);
      const st = await entro(Translator.availability({ sourceLanguage: da, targetLanguage: a }), 4000);
      if (!st || st === 'unavailable') return null;
      return await entro(Translator.create({ sourceLanguage: da, targetLanguage: a }), st === 'available' ? 8000 : 60000);
    } catch { return null; }
  }
  async function traduciTutto(voci, da, avanza) {
    const a = da === 'en' ? 'it' : 'en', t = await traduttore(da, a);
    let fatte = 0;
    const T = async s => { if (!t || !s) return null; try { return await t.translate(s); } catch { return null; } };
    for (const v of voci) {
      avanza && avanza(++fatte, voci.length);
      const altro = dalCompendio(v.nome, da) || await T(v.nome) || '';
      if (da === 'en') { v.en = v.nome; if (altro) v.nome = altro; }
      else if (altro) v.en = altro;
      const testo = v.testo || '';
      const tradotto = await T(testo);
      if (da === 'en') { v.testo = testo; if (tradotto) v.testoIt = tradotto; }
      else { v.testoIt = testo; v.testo = tradotto || testo; }
      for (const k of ['superiore']) if (v[k]) { const x = await T(v[k]); if (x && da === 'en') { v.superioreEn = v[k]; v[k] = x; } }
      for (const k of ['tratti', 'azioni', 'azioniBonus', 'reazioni', 'leggendarie']) {
        for (const o of v[k] || []) {
          const n = await T(o.nome), x = await T(o.testo);
          if (da === 'en') { if (n) { o.en = o.nome; o.nome = n; } if (x) o.testo = x; }
          else if (n) o.en = n;
        }
      }
      v._tradotta = !!t;
    }
    return !!t;
  }

  // ---------- 6. la finestra ----------
  const TIPI_V = [['', 'Riconosci da solo (incantesimi, mostri, oggetti, talenti)'], ['incantesimo', 'Incantesimi'], ['mostro', 'Mostri'], ['oggetto', 'Oggetti magici'], ['talento', 'Talenti'], ['condizione', 'Condizioni (divide ai titoli)'], ['specie', 'Specie (divide ai titoli)'], ['background', 'Background (divide ai titoli)'], ['classe', 'Classi (divide ai titoli)'], ['regola', 'Regole (divide ai titoli)']];
  const NOMI_T = { incantesimo: 'Incantesimo', mostro: 'Mostro', oggetto: 'Oggetto', talento: 'Talento', condizione: 'Condizione', specie: 'Specie', background: 'Background', classe: 'Classe', regola: 'Regola' };
  const riassunto = v => v.tipo === 'incantesimo' ? `${v.livello ? tr('livello {n}', { n: v.livello }) : tr('trucchetto')} · ${v.scuola || ''}${v.tempo ? ' · ' + v.tempo : ''}`
    : v.tipo === 'mostro' ? `${[v.taglia, v.tipoCreatura].filter(Boolean).join(' ')} · CA ${v.ca ?? '?'} · PF ${v.pf ?? '?'} · GS ${v.gs ?? '?'} · ${(v.azioni || []).length} ${tr('azioni')}`
      : v.tipo === 'oggetto' ? `${v.categoria || ''} · ${v.rarita || ''}${v.sintonia ? ' · ' + tr('sintonia') : ''}`
        : (v.testo || '').slice(0, 90);

  window.apriImportaManuale = function () {
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg compMan';
    dlg.innerHTML = `<h3>📖 ${esc(tr('Importa da un manuale che possiedi'))}</h3>
      <p class="note">${esc(tr('Per i manuali che hai comprato (PDF con il testo, non scansioni). Le voci finiscono in un pacchetto «uso personale»: vanno bene per te e il tuo tavolo, ma non vanno condivise pubblicamente.'))}</p>
      <div class="compEdG">
        <label>${esc(tr('Che cosa contiene'))}<select data-k="tipo">${TIPI_V.map(([k, n]) => `<option value="${k}">${esc(tr(n))}</option>`).join('')}</select></label>
        <label>${esc(tr('Lingua del manuale'))}<select data-k="lingua"><option value="">${esc(tr('La riconosco io'))}</option><option value="it">Italiano</option><option value="en">English</option></select></label>
        <label>${esc(tr('Pagine (da–a)'))}<span class="row"><input data-k="da" type="number" min="1" placeholder="1" style="width:70px"> – <input data-k="a" type="number" min="1" placeholder="${esc(tr('fine'))}" style="width:70px"></span></label>
        <label>${esc(tr('Nome del pacchetto'))}<input data-k="nome" placeholder="${esc(tr('es. Manuale del Giocatore'))}"></label>
      </div>
      <label class="check"><input type="checkbox" data-k="trad" checked> ${esc(tr('Metti ogni voce anche nell\'altra lingua (italiano ↔ inglese)'))}</label>
      <p class="note" data-k="tradNota"></p>
      <div class="row compManFonte"><button type="button" class="btn" data-a="pdf">📄 ${esc(tr('Scegli il PDF…'))}</button><button type="button" class="btn ghost" data-a="incolla">📋 ${esc(tr('Incolla il testo…'))}</button></div>
      <textarea data-k="testo" rows="8" hidden placeholder="${esc(tr('Incolla qui il testo copiato dal manuale, poi premi «Leggi il testo».'))}"></textarea>
      <div class="row" data-k="leggiRiga" hidden><button type="button" class="btn" data-a="leggi">${esc(tr('Leggi il testo'))}</button></div>
      <p class="note" data-k="stato"></p>
      <div class="compManLista" data-k="lista"></div>
      <div class="dialogBtns"><button type="button" class="btn ghost" data-a="tutti" hidden>${esc(tr('Seleziona tutti'))}</button><span style="flex:1"></span><button type="button" class="btn ghost" data-a="chiudi">${esc(tr('Chiudi'))}</button><button type="button" class="btn" data-a="salva" hidden>${esc(tr('Salva nel compendio'))}</button></div>`;
    document.body.appendChild(dlg); dlg.showModal();
    dlg.addEventListener('close', () => dlg.remove());
    const $d = k => dlg.querySelector(`[data-k="${k}"]`);
    const stato = t => { $d('stato').textContent = t || ''; };
    let voci = [], lingua = 'en', fileNome = '';
    traduttore('en', 'it').then(t => {
      $d('tradNota').textContent = t ? tr('Il testo lo traduce il traduttore del browser, sul tuo computer: controlla le voci importanti.')
        : tr('Questo browser non ha un traduttore: nomi (quelli dell\'SRD) e campi fissi vanno nell\'altra lingua, il testo resta in quella del manuale. Puoi tradurlo dopo con «Scarica il file da tradurre».');
      if (t && t.destroy) t.destroy();
    });
    const indovinaLingua = righe => {
      const s = righe.slice(0, 400).map(r => r.t).join(' ').toLowerCase();
      const it = (s.match(/\b(il|della|delle|che|una|per|con|sono|dei|gli)\b/g) || []).length, en = (s.match(/\b(the|of|and|to|with|you|your|is|are|this)\b/g) || []).length;
      return it > en ? 'it' : 'en';
    };
    function mostra() {
      $d('lista').innerHTML = voci.length ? voci.map((v, i) => `<details class="compManV" data-i="${i}"><summary><input type="checkbox" data-c="ok" ${v._no ? '' : 'checked'}>
          <select data-c="tipo">${Object.entries(NOMI_T).map(([k, n]) => `<option value="${k}" ${k === v.tipo ? 'selected' : ''}>${esc(tr(n))}</option>`).join('')}</select>
          <input data-c="nome" value="${esc(v.nome)}"> <small>${esc(riassunto(v))}</small></summary>
          <textarea data-c="testo" rows="6">${esc(v.testo || '')}</textarea>
          ${v.tipo === 'mostro' ? `<p class="note">${esc(tr('Azioni lette:'))} ${esc([...(v.tratti || []), ...(v.azioni || []), ...(v.azioniBonus || []), ...(v.reazioni || []), ...(v.leggendarie || [])].map(a => a.nome).join(' · ') || '—')}</p>` : ''}
          <p class="note">${esc(tr('Il resto (per esempio le caratteristiche o le azioni) lo correggi dopo nel compendio, con «Modifica».'))}</p></details>`).join('')
        : `<p class="note">${esc(tr('Non ho trovato voci. Prova a scegliere il tipo a mano (per esempio «Condizioni»), o un intervallo di pagine più preciso.'))}</p>`;
      dlg.querySelector('[data-a=salva]').hidden = !voci.length;
      dlg.querySelector('[data-a=tutti]').hidden = !voci.length;
    }
    dlg.addEventListener('input', e => {
      const box = e.target.closest('.compManV'); if (!box) return;
      const v = voci[+box.dataset.i], c = e.target.dataset.c;
      if (c === 'ok') v._no = !e.target.checked; else if (c) v[c] = e.target.value;
    });
    dlg.addEventListener('change', e => { const box = e.target.closest('.compManV'); if (box && e.target.dataset.c === 'tipo') voci[+box.dataset.i].tipo = e.target.value; });
    async function leggi(righe) {
      lingua = $d('lingua').value || indovinaLingua(righe);
      voci = trovaVoci(righe, $d('tipo').value);
      stato(tr('{n} voci trovate (manuale in {l}). Controlla, togli la spunta a quelle che non vuoi e salva.', { n: voci.length, l: lingua === 'it' ? 'italiano' : 'inglese' }));
      mostra();
    }
    dlg.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'chiudi') return dlg.close();
      if (a === 'tutti') { voci.forEach(v => { v._no = false; }); dlg.querySelectorAll('[data-c=ok]').forEach(x => { x.checked = true; }); return; }
      if (a === 'incolla') { $d('testo').hidden = false; $d('leggiRiga').hidden = false; $d('testo').focus(); return; }
      if (a === 'leggi') { fileNome = fileNome || tr('Testo incollato'); return leggi(righeTesto($d('testo').value)); }
      if (a === 'pdf') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,application/pdf';
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          fileNome = f.name.replace(/\.pdf$/i, '');
          if (!$d('nome').value) $d('nome').value = fileNome;
          try {
            stato(tr('Leggo il PDF…'));
            const righe = await righePdf(await f.arrayBuffer(), +$d('da').value || 1, +$d('a').value || 0, (n, t) => stato(tr('Leggo la pagina {n} di {t}…', { n, t })));
            if (!righe.some(r => r.t)) return stato(tr('In questo PDF non c\'è testo: probabilmente è una scansione. Non lo posso leggere.'));
            await leggi(righe);
          } catch (err) { stato(tr('Non riesco a leggere questo PDF: {e}', { e: err.message })); }
        };
        inp.click(); return;
      }
      if (a === 'salva') {
        const scelte = voci.filter(v => !v._no && v.nome);
        if (!scelte.length) return stato(tr('Scegli almeno una voce.'));
        b.disabled = true;
        try {
          const copie = scelte.map(v => { const c = JSON.parse(JSON.stringify(v)); for (const k of ['_no', 'lingua', 'i', 'info']) delete c[k]; return c; });
          if ($d('trad').checked) {
            const ok = await traduciTutto(copie, lingua, (n, t) => stato(tr('Metto nell\'altra lingua: {n} di {t}…', { n, t })));
            if (!ok) stato(tr('Testo lasciato nella lingua del manuale (il browser non ha un traduttore).'));
          } else if (lingua === 'it') for (const v of copie) { v.testoIt = v.testo; }
          const nomeP = $d('nome').value.trim() || fileNome || tr('Manuale');
          const per = {};
          for (const v of copie) {
            // le voci di classe: i privilegi in 20 livelli, come nell'editor guidato
            if (v._privilegi) { const liv = Array.from({ length: 20 }, (_, i) => ({ livello: i + 1, privilegi: v._privilegi.filter(p => +p.livello === i + 1).map(p => ({ nome: p.nome, testo: p.testo })) })); v.livelli = liv; delete v._privilegi; }
            v.id = v.tipo + ':man-' + slug(nomeP) + '-' + slug(v.en || v.nome);
            v.fonte = nomeP;
            delete v._tradotta;
            (per[v.tipo] ||= []).push(v);
          }
          await compendioSalvaPacchetto({ id: 'manuale-' + slug(nomeP), nome: nomeP, autore: '', usoPersonale: true, fonte: nomeP,
            licenza: tr('Copiato da un manuale che possiedi: solo per uso personale, non va condiviso.') }, per);
          stato('');
          alert(tr('{n} voci salvate nel pacchetto «{p}».', { n: copie.length, p: nomeP }));
          dlg.close();
        } catch (err) { stato(tr('Non sono riuscito a salvarle: {e}', { e: err.message })); b.disabled = false; }
      }
    });
  };
})();
