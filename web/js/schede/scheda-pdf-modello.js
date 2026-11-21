// ---------- La scheda in PDF: esportare e reimportare ----------
// Una scheda (di un giocatore o di un mostro) si salva in un PDF a tre pagine, compilabile, fatto sul
// modello «web/modelli/scheda-5e.pdf» (Base · Bio · Incantesimi). Nello spazio «Aspetto del personaggio»
// c'è il segnalino della scheda. Il PDF si può aprire, completare e stampare con qualunque lettore, e si
// reimporta nel VTT («Nuova scheda» → «Da un PDF…»): torna la stessa scheda, con il segnalino.
//
// Come torna tutto uguale: dentro il PDF, nei dati del documento («LibreVTT»), si tiene una copia della
// scheda (compressa) e di quello che si è scritto nei campi. Reimportando, un campo che nel PDF è rimasto
// com'era lascia valere la copia (così non si perde niente di ciò che il PDF non può contenere, come le
// descrizioni degli incantesimi); un campo che hai cambiato nel PDF vince sulla copia. Un PDF fatto sullo
// stesso modello ma senza la copia (compilato a mano, o dalla scheda originale) si legge solo dai campi.
//
// I nomi dei campi del PDF vengono dal modello e a volte sono ingannevoli (il numero grande di «Forza» sta
// nel campo «STRmod», il bonus nel campo «STR»): le tabelle qui sotto dicono dove va ogni cosa.
// Si appoggia a scheda-pdf.js (libreria pdf-lib), sheets.js (i calcoli), sheet-file.js (immagini).
(function () {
  const tr = window.tr || (s => s);
  const MODELLO = 'modelli/scheda-5e.pdf';
  const norm = n => String(n).replace(/\s+/g, ' ').trim();          // «Wpn3 Damage » e «Wpn3 Damage» sono lo stesso campo

  // ---------- Tabelle: campo del PDF ↔ chiave della scheda ----------
  // testo scritto così com'è
  const TESTO = {
    ClassLevel: 'class', Background: 'level', PlayerName: 'player', Race: 'race', Alignment: 'bg', XP: 'align', Nex_XP: 'sex',
    MadnessLvl: 'madness', AC: 'ac', AC_Temp: 'actemp',
    STRmod: 'str', DEXmod: 'dex', CONmod: 'con', INTmod: 'int', WISmod: 'wis', CHAmod: 'cha',
    Exhaustion: 'fatigue', Speed: 'speed', Vision: 'vision', HPCurrent: 'hp', HPMax: 'hpmax', HPTemp: 'hpt',
    HD: 'hd', HDTotal: 'hdt', HDLeft: 'hdu', HD2: 'hd2', HDTotal2: 'hdt2', HDLeft2: 'hdu2',
    Testo2: 'racial', Testo3: 'classf', Talenti1: 'feats',
    Armor: 'ar_name', ArmorAC: 'ar_ca', ArmorDex: 'ar_dexmax', ArmorStr: 'ar_for', Shield: 'ar_shield',
    'WEAPONStype 1': 'pw_other', 'WEAPONStype 2': 'prof_text1',
    'TOOLS 1': 'tools1', 'TOOLS 2': 'tools2', 'TOOLS 3': 'tools3', 'Languages 1': 'langs1', 'Languages 2': 'langs2',
    CP: 'mr', SP: 'ma', EP: 'me', GP: 'mo', PP: 'mp',
    AGE: 'age', HEIGHT: 'height', WEIGHT: 'weight', EYES: 'eyes', SKIN: 'skin', HAIR: 'hair',
    SymbolNAME: 'faction', Fazione: 'faction_text', 'Tratti car': 'traits', Ideali1: 'ideals', LEgami1: 'bonds', DIfetti1: 'flaws',
    Nemici1: 'enemies', AppearanceText: 'look', Testo6: 'extra',
    'Spellcasting Class 2': 'sc_class', 'SpellcastingAbility 2': 'sc_ab', 'SpellSaveDC 21': 'spcd', 'SpellAtkBonus 21': 'spatk'
  };
  // caselle
  const CASELLE = {
    insp1: 'insp1', insp2: 'insp2', insp3: 'insp3', insp4: 'insp4',
    STRprof: 'sp_str', DEXprof: 'sp_dex', CONprof: 'sp_con', INTprof: 'sp_int', WISprof: 'sp_wis', CHAprof: 'sp_cha',
    ArmorLight: 'pa_l', ArmorMed: 'pa_m', ArmorHea: 'pa_p', Shields: 'pa_s', WpnSim: 'pw_s', WpnMar: 'pw_g', 'WpnOth 1': 'pw_a',
    StealthDisv: 'ar_dis',
    'Check Box 120000': 'ds1', 'Check Box 13': 'ds2', 'Check Box 14': 'ds3', 'Check Box 15': 'df1', 'Check Box 16': 'df2', 'Check Box 17': 'df3'
  };
  // le abilità: sigla nel PDF → chiave (competenza: «…P», maestria: «…PE»; il valore calcolato: la sigla)
  const ABILITA = { ACRO: 'acro', ANIM: 'anim', ARC: 'arca', ATH: 'athl', STLTH: 'stea', INV: 'inve', DEC: 'dece', INTI: 'inti', PERF: 'perf',
    INS: 'insi', MED: 'medi', NAT: 'natu', PERC: 'perception', PERS: 'pers', REL: 'reli', SLE: 'slei', SURV: 'surv', HIST: 'hist' };
  for (const [sg, k] of Object.entries(ABILITA)) { CASELLE[sg + 'P'] = 'kp_' + k; CASELLE[sg + 'PE'] = 'ke_' + k; }
  const CAR = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };
  const NOMI_TS = { str: 'ST Strength', dex: 'ST Dexterity', con: 'ST Constitution', int: 'ST Intelligence', wis: 'ST Wisdom', cha: 'ST Charisma' };
  // righe numerate (attacchi, privilegi limitati, consumabili, munizioni, oggetti magici)
  for (let i = 0; i < 6; i++) {
    const n = i + 1;
    TESTO['Wpn Name' + (n === 1 ? '' : ' ' + n)] = 'an' + i; TESTO['Wpn' + n + ' AtkBonus'] = 'ab' + i; TESTO['Wpn' + n + ' Damage'] = 'ad' + i;
    TESTO['Limited Feat ' + n] = 'lf' + i + 'n'; TESTO['FeatTot ' + n] = 'lf' + i + 't'; TESTO['FeatLeft ' + n] = 'lf' + i + 'u';
    CASELLE['RecoverySR ' + n] = 'lf' + i + 'b'; CASELLE['RecoveryLR ' + n] = 'lf' + i + 'l'; CASELLE['RecoveryDN ' + n] = 'lf' + i + 'a';
    TESTO['Consum ' + n] = 'cn' + i + 'n'; TESTO['ConsumLeft ' + n] = 'cn' + i + 'u';
  }
  for (let i = 0; i < 3; i++) { TESTO['Ammo ' + (i + 1)] = 'am' + i + 'n'; TESTO['AmmoLeft ' + (i + 1)] = 'am' + i + 'q'; TESTO['AttunedMagic ' + (i + 1)] = 'mi' + i; }
  // gli incantesimi: caselle per livello (1…9) di «slot totali» e «spesi»
  const SLOT = { 1: '19', 2: '20', 3: '21', 4: '22', 5: '23', 6: '24', 7: '25', 8: '191', 9: '27' };
  const SLOT_SPESI = { 1: '19', 2: '20', 3: '21', 4: '22', 5: '23', 6: '24', 7: '25', 8: '26', 9: '27' };
  for (let L = 1; L <= 9; L++) { TESTO['SlotsTotal ' + SLOT[L]] = 'sl' + L + 't'; TESTO['SlotsRemaining ' + SLOT_SPESI[L]] = 'sl' + L + 'u'; }

  // i nomi con spazi doppi o finali (come «SpellSaveDC  21») si cercano sempre normalizzati
  for (const tab of [TESTO, CASELLE]) for (const k of Object.keys(tab)) { const n = norm(k); if (n !== k) { tab[n] = tab[k]; delete tab[k]; } }

  // l'inventario e gli incantesimi: i campi si ritrovano dalla posizione (i nomi sono confusi)
  const BLOCCHI = [   // livello, colonna (x min, x max), riga (y min, y max)
    [0, 0, 150, 520, 660], [1, 0, 150, 260, 470], [2, 0, 150, 30, 230],
    [3, 150, 390, 440, 660], [4, 150, 390, 200, 410], [5, 150, 390, 30, 175],
    [6, 390, 600, 500, 660], [7, 390, 600, 330, 470], [8, 390, 600, 180, 300], [9, 390, 600, 30, 150]
  ];
  function posizioni(doc, L) {                       // nome → { p, x, y, w, h }
    const out = new Map();
    doc.getPages().forEach((pg, pi) => {
      const an = pg.node.Annots();
      for (let k = 0; an && k < an.size(); k++) {
        const d = an.lookup(k, L.PDFDict), T = d.lookup(L.PDFName.of('T'));
        const r = d.lookup(L.PDFName.of('Rect'), L.PDFArray);
        if (!T || !r) continue;
        const x0 = r.lookup(0, L.PDFNumber).asNumber(), y0 = r.lookup(1, L.PDFNumber).asNumber(), x1 = r.lookup(2, L.PDFNumber).asNumber(), y1 = r.lookup(3, L.PDFNumber).asNumber();
        out.set(norm(T.decodeText()), { p: pi + 1, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      }
    });
    return out;
  }
  // { inv: [{ nome, peso }], inc: { 0: [{ riga, casella }], … } } dei campi, nell'ordine della pagina
  function struttura(doc, L, campi) {
    const pos = posizioni(doc, L);
    const di = n => pos.get(norm(n));
    const nomi = [...campi.keys()];
    const inv = [];
    const col = (xNome, xPeso) => {
      const nomiCol = nomi.filter(n => { const q = di(n); return q && q.p === 2 && /^eq\d+$/.test(n) && Math.abs(q.x - xNome) < 4; }).sort((a, b) => di(b).y - di(a).y);
      const pesiCol = nomi.filter(n => { const q = di(n); return q && q.p === 2 && /^Peso\d+$/.test(n) && Math.abs(q.x - xPeso) < 4; }).sort((a, b) => di(b).y - di(a).y);
      return nomiCol.map((n, i) => ({ nome: n, peso: pesiCol[i] }));
    };
    inv.push(...col(213, 374), ...col(390, 551));
    const inc = {};
    for (const [lv, x0, x1, y0, y1] of BLOCCHI) {
      const dentro = n => { const q = di(n); return q && q.p === 3 && q.x + q.w / 2 >= x0 && q.x + q.w / 2 < x1 && q.y >= y0 && q.y < y1; };
      const righe = nomi.filter(n => dentro(n) && campi.get(n).tipo === 'testo' && di(n).w >= 100 && !/^Slots|^Spell/.test(n)).sort((a, b) => di(b).y - di(a).y);
      const caselle = nomi.filter(n => dentro(n) && campi.get(n).tipo === 'casella').sort((a, b) => di(b).y - di(a).y);
      inc[lv] = righe.map((n, i) => ({ riga: n, casella: lv ? caselle[i] : null }));
    }
    return { inv, inc };
  }

  // ---------- I campi di un PDF ----------
  // nome normalizzato → { campo, tipo: 'testo'|'casella'|'altro', nomeVero }
  function campiDi(L, doc) {
    const m = new Map();
    let elenco = [];
    try { elenco = doc.getForm().getFields(); } catch { elenco = []; }
    for (const c of elenco) {
      const tipo = c instanceof L.PDFTextField ? 'testo' : c instanceof L.PDFCheckBox ? 'casella' : 'altro';
      m.set(norm(c.getName()), { campo: c, tipo });
    }
    return m;
  }
  const èModello = campi => campi.has('Testo3') && campi.has('Limited Feat 1') && campi.has('STRmod') && campi.has('Wpn Name');

  // ---------- Dalla scheda ai valori dei campi ----------
  const sgn = n => (n >= 0 ? '+' : '-') + Math.abs(n);
  const num = v => parseInt(v, 10) || 0;
  const SOSTITUZIONI = { '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '×': 'x', '÷': '/', '≤': '<=', '≥': '>=', '•': '·', '→': '->', ' ': ' ', '\t': ' ' };
  function pulito(font, t) {
    const ok = new Set(font.getCharacterSet());
    let out = '';
    for (const ch of String(t ?? '').replace(/\r/g, '')) {
      const c = SOSTITUZIONI[ch] ?? ch;
      for (const x of c) out += x === '\n' || ok.has(x.codePointAt(0)) ? x : '';
    }
    return out;
  }

  function valoriDa(s, str) {
    const f = s.f || {}, t = {}, c = {};
    const put = (campo, v) => { if (v !== undefined && v !== null && String(v) !== '') t[campo] = String(v); };
    t.CharacterName = s.name || '';
    for (const [campo, k] of Object.entries(TESTO)) {
      if (['spcd', 'spatk'].includes(k)) continue;
      if (k === 'vision' || k === 'prof_text1' || k === 'extra') continue;
      put(campo, f[k]);
    }
    // numeri che la scheda calcola
    put('Initiative', sgn(calcValue(s, 'init')));
    put('ProfBonus', sgn(calcValue(s, 'prof')));
    for (const [sg, k] of Object.entries(CAR)) { put(sg, sgn(calcValue(s, 'mod:' + k))); put(NOMI_TS[k], sgn(calcValue(s, 'save:' + k))); }
    for (const [sg, k] of Object.entries(ABILITA)) put(sg, sgn(calcValue(s, 'skill:' + k)));
    put('Passive', calcValue(s, 'pp'));
    const cd = cdIncantesimi(s), at = atkIncantesimi(s);
    const cdT = !vuotoF(f.spcd) ? f.spcd : cd, atT = !vuotoF(f.spatk) ? f.spatk : (at == null ? '' : sgn(at));
    put('SpellSaveDC 21', cdT); put('SpellAtkBonus 21', atT); put('SpellSaveDC 2', cdT); put('SpellAtkBonus 2', atT);
    put('PesoTrasportabile', calcValue(s, 'wsum')); put('PesoMassimo', calcValue(s, 'wmax'));
    // scurovisione e visione sono un campo solo; le altre competenze e i linguaggi se ne vanno nelle righe che ci sono
    put('Vision', [f.vision, f.scuroV && tr('scurovisione') + ' ' + f.scuroV].filter(Boolean).join(' · '));
    put('WEAPONStype 2', [f.prof_text1, f.prof_text2].filter(Boolean).join('; '));
    for (const [campo, k] of Object.entries(CASELLE)) c[campo] = !!f[k] && f[k] !== '0';
    // inventario
    const { inv, inc } = str;
    inv.forEach((r, i) => { put(r.nome, f['iv' + i + 'n']); if (r.peso) put(r.peso, f['iv' + i + 'w']); });
    const oltre = [];
    for (let i = inv.length; i < 200; i++) if (f['iv' + i + 'n']) oltre.push(f['iv' + i + 'n'] + (f['iv' + i + 'w'] ? ' (' + f['iv' + i + 'w'] + ' kg)' : '')); else if (i > inv.length + 5) break;
    // incantesimi: se ne avanzano, vanno in fondo ai «Tratti e privilegi aggiuntivi»
    const avanzi = [];
    for (let L = 0; L <= 9; L++) {
      const righe = inc[L] || [];
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const nm = f['sp' + L + '_' + i];
        if (!nm) { if (i >= righe.length) break; continue; }
        if (i < righe.length) { put(righe[i].riga, nm); if (righe[i].casella) c[righe[i].casella] = !!f['spk_' + L + '_' + i] && f['spk_' + L + '_' + i] !== '0'; }
        else avanzi.push((L ? tr('Liv. {n}', { n: L }) : tr('Trucchetto')) + ': ' + nm);
        n++;
      }
      void n;
    }
    const extra = [f.extra, f.xp && tr('Punti esperienza') + ': ' + f.xp, f.equip && tr('Equipaggiamento') + ':\n' + f.equip, f.features && f.features, f.notes && f.notes,
      f.spells && f.spells, oltre.length && tr('Altri oggetti') + ':\n' + oltre.join('\n'), avanzi.length && tr('Altri incantesimi') + ':\n' + avanzi.join('\n')].filter(Boolean).join('\n\n');
    put('Testo6', extra);
    return { t, c };
  }

  // ---------- Il segnalino ----------
  async function immagineScheda(s) {
    let url = null;
    try { if (s.icon && typeof immagineDentro === 'function') url = await immagineDentro(s.icon, 256); } catch {}
    if (!url) url = typeof makeIcon === 'function' ? makeIcon(s) : null;
    return url;
  }
  async function pngDa(url, lato = 256) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const k = Math.min(1, lato / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  // la copia nei dati del PDF
  const aBase64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const daBase64 = b => Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
  async function comprimi(testo) {
    const dati = new TextEncoder().encode(testo);
    if (typeof CompressionStream !== 'function') return 'j1:' + aBase64(dati);
    const cs = new Blob([dati]).stream().pipeThrough(new CompressionStream('gzip'));
    return 'g1:' + aBase64(new Uint8Array(await new Response(cs).arrayBuffer()));
  }
  async function decomprimi(stringa) {
    const m = /^([gj])1:(.*)$/s.exec(stringa || '');
    if (!m) return null;
    const dati = daBase64(m[2]);
    if (m[1] === 'j') return new TextDecoder().decode(dati);
    const ds = new Blob([dati]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder().decode(await new Response(ds).arrayBuffer());
  }

  // La misura delle lettere: i campi del modello hanno la misura «automatica», che per una riga sola guarda
  // solo l'altezza (una velocità lunga esce dalla casella) e per più righe è troppo grande: la si sceglie qui.
  function misuraLettere(font, testo, w, h, piùRighe) {
    const lar = w - 4, alt = h - 3, a1 = font.heightAtSize(1) || 1.2;
    if (!piùRighe) {
      const tw = font.widthOfTextAtSize(String(testo).split('\n')[0] || ' ', 1) || 1;
      return Math.max(4.5, Math.min(22, alt / a1, lar / tw));
    }
    for (let z = 11; z > 4.5; z -= 0.5) {
      let righe = 0;
      for (const par of String(testo).split('\n')) {
        let riga = '';
        const parole = par.split(' ');
        if (!par) righe++;
        for (const pa of parole) {
          const prova = riga ? riga + ' ' + pa : pa;
          if (font.widthOfTextAtSize(prova, z) <= lar) riga = prova;
          else { if (riga) righe++; riga = pa; while (font.widthOfTextAtSize(riga, z) > lar && riga.length > 1) { righe++; riga = riga.slice(Math.max(1, Math.floor(riga.length * lar / font.widthOfTextAtSize(riga, z)))); } }
        }
        if (riga) righe++;
      }
      if (righe * z * a1 <= alt) return z;
    }
    return 4.5;
  }

  // ---------- Esportare ----------
  async function creaPdf(s) {
    const L = await window.libreriaPdf();
    const r = await fetch(MODELLO);
    if (!r.ok) throw new Error(tr('non trovo il modello del PDF'));
    const doc = await L.PDFDocument.load(await r.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    const campi = campiDi(L, doc), str = struttura(doc, L, campi);
    const { t, c } = valoriDa(s, str);
    const ex = {};
    for (const [nome, v] of Object.entries(t)) {
      const e = campi.get(nome);
      if (!e || e.tipo !== 'testo') continue;
      const testo = pulito(font, v);
      try {
        const r = e.campo.acroField.getWidgets()[0].getRectangle();
        e.campo.setText(testo);
        e.campo.setFontSize(misuraLettere(font, testo, r.width, r.height, e.campo.isMultiline()));
        e.campo.updateAppearances(font);                       // solo i campi di testo: le caselle restano com'erano nel modello
        ex[nome] = testo;
      } catch {}
    }
    for (const [nome, on] of Object.entries(c)) {
      const e = campi.get(nome);
      if (!e || e.tipo !== 'casella') continue;
      try { if (on) { e.campo.check(); ex[nome] = true; } else e.campo.uncheck(); } catch {}
    }
    // il segnalino nello spazio «Aspetto del personaggio» (il campo immagine della pagina 2)
    const url = await immagineScheda(s);
    if (url) {
      try {
        const png = await doc.embedPng(await pngDa(url, 256));
        const b = doc.getForm().getButton('Image1_af_image');
        b.setImage(png, L.ImageAlignment.Center);
      } catch (e) { console.warn('segnalino nel PDF:', e); }
    }
    // la copia della scheda (senza le immagini grandi: c'è il segnalino)
    const fc = { ...s.f }; delete fc.img_portrait; delete fc.img_portrait_aid; delete fc.img_symbol; delete fc.img_symbol_aid;
    const copia = JSON.stringify({ v: 1, nome: s.name, tpl: s.tpl, f: fc, ex, icona: url && url.length < 400000 ? url : null });
    doc.getInfoDict().set(L.PDFName.of('LibreVTT'), L.PDFString.of(await comprimi(copia)));
    doc.setTitle(s.name || tr('Personaggio')); doc.setCreator('Libre VTT'); doc.setProducer('Libre VTT');
    return doc.save({ updateFieldAppearances: false });
  }
  const nomePdf = s => (String(s.name || 'Personaggio').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Personaggio') + '.pdf';
  async function esportaSchedaPdf(s) {
    const byte = await creaPdf(s), nome = nomePdf(s);
    const blob = new Blob([byte], { type: 'application/pdf' });
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const h = await showSaveFilePicker({ suggestedName: nome, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close();
        avvisoScheda(tr('Scheda «{nome}» salvata in «{file}».', { nome: s.name, file: h.name }));
        return;
      } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    avvisoScheda(tr('Scheda «{nome}» salvata nei download come «{file}».', { nome: s.name, file: nome }));
  }

  // ---------- Reimportare ----------
  /** Se il PDF è fatto sul modello: la scheda { name, tpl, f, icon, avanzi }; altrimenti null. */
  async function leggiModello(buf, nomeFile) {
    const L = await window.libreriaPdf();
    const doc = await L.PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const campi = campiDi(L, doc);
    let copia = null;
    try {
      const v = doc.getInfoDict().lookup(L.PDFName.of('LibreVTT'));
      const testo = v && await decomprimi(v.asString ? v.asString() : String(v));
      if (testo) copia = JSON.parse(testo);
    } catch { copia = null; }
    if (!èModello(campi) && !copia) return null;
    const str = struttura(doc, L, campi);
    const leggi = nome => {
      const e = campi.get(nome);
      if (!e) return undefined;
      try { return e.tipo === 'testo' ? (e.campo.getText() || '') : e.tipo === 'casella' ? e.campo.isChecked() : undefined; } catch { return undefined; }
    };
    const ex = (copia && copia.ex) || {};
    const f = copia && copia.f && typeof copia.f === 'object' ? { ...copia.f } : {};
    // un campo cambia la scheda solo se non è com'era quando il PDF è stato fatto
    const cambiato = (nome, v) => !copia || (typeof v === 'boolean' ? (!!ex[nome] !== v) : ((ex[nome] || '') !== v));
    const mette = (k, v) => { if (v === '' || v === false) delete f[k]; else f[k] = v === true ? '1' : v; };
    for (const [campo, k] of Object.entries(TESTO)) {
      if (k === 'vision' || k === 'prof_text1' || k === 'extra') {                          // campi che raccolgono più cose: se li hai cambiati, vale quello che hai scritto
        const v = leggi(campo);
        if (v !== undefined && cambiato(campo, v)) mette(k === 'extra' ? 'extra' : k, v);
        continue;
      }
      if (campo === 'SpellSaveDC 21' || campo === 'SpellAtkBonus 21') {
        const v = leggi(campo);
        if (v === undefined || !cambiato(campo, v)) continue;
        if (campo.includes('Save')) mette('spcd', String(parseInt(v, 10) || '')); else mette('spatk', String(parseInt(v, 10) || ''));
        continue;
      }
      const v = leggi(campo);
      if (v !== undefined && cambiato(campo, v)) mette(k, k === 'level' ? String(parseInt(v, 10) || v) : v);
    }
    for (const [campo, k] of Object.entries(CASELLE)) {
      const v = leggi(campo);
      if (v !== undefined && cambiato(campo, v)) mette(k, v);
    }
    str.inv.forEach((r, i) => {
      const n = leggi(r.nome); if (n !== undefined && cambiato(r.nome, n)) mette('iv' + i + 'n', n);
      const w = r.peso && leggi(r.peso); if (w !== undefined && r.peso && cambiato(r.peso, w)) mette('iv' + i + 'w', w);
    });
    for (let L = 0; L <= 9; L++) (str.inc[L] || []).forEach((r, i) => {
      const n = leggi(r.riga); if (n !== undefined && cambiato(r.riga, n)) mette('sp' + L + '_' + i, n);
      if (r.casella) { const p = leggi(r.casella); if (p !== undefined && cambiato(r.casella, p)) mette('spk_' + L + '_' + i, p); }
    });
    if (!copia) {                                                    // un PDF senza la copia: i valori che mancano si mettono come in una scheda nuova
      for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) f[k] = String(parseInt(f[k], 10) || 10);
      if (!f.level) f.level = '1';
    }
    const nome = String(leggi('CharacterName') || (copia && copia.nome) || String(nomeFile || '').replace(/\.pdf$/i, '') || tr('Personaggio')).slice(0, 40);
    const tpl = copia && ['standard', 'dnd5e', 'simple'].includes(copia.tpl) ? copia.tpl : 'dnd5e';
    // il segnalino: vale anche come immagine dello spazio «Aspetto del personaggio»
    const icona = copia && typeof copia.icona === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(copia.icona) && copia.icona.length < 4e6 ? copia.icona : null;
    return { name: nome, tpl, f, icon: icona ? { url: icona } : null, ritratto: icona };
  }

  window.esportaSchedaPdf = esportaSchedaPdf;
  window.leggiModelloPdf = leggiModello;
  window.schedaPdfModello = { TESTO, CASELLE, struttura, campiDi, creaPdf };
})();
