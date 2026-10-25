// Le schede di Roll20 stampate in PDF (la «stampa» della scheda D&D 5e, in italiano o in inglese).
// Non hanno campi da leggere: si legge il testo con la sua posizione sulla pagina e lo si rimette
// al suo posto nella scheda Open D&D 5e. Le etichette stampate («CLASSE E LIVELLO», «TIRI SALVEZZA»…)
// fanno da punti di riferimento, così le caselle che Roll20 allunga col contenuto non confondono.
// Se le etichette non ci sono, il PDF non è una stampa di Roll20: si restituisce null.
//   pagine = [{ w, h, items: [{ s, x0, y0, x1, y1 }] }]   (coordinate in punti, y dall'alto)
(function (radice) {
  const ETICHETTE = {
    nome: /^(NOME DEL PERSONAGGIO|CHARACTER NAME)$/i,
    classe: /^(CLASSE E LIVELLO|CLASS & LEVEL)$/i,
    storia: /^(STORIA|BACKGROUND)$/i,
    giocatore: /^(NOME GIOCATORE|PLAYER NAME)$/i,
    razza: /^(RAZZA|RACE)$/i,
    allineamento: /^(ALLINEAMENTO|ALIGNMENT)$/i,
    pe: /^(PUNTI ESPERIENZA|EXPERIENCE POINTS)$/i,
    ts: /^(TIRI SALVEZZA|SAVING THROWS)$/i,
    abilita: /^(ABILITÀ|SKILLS)$/i,
    competenza: /^(BONUS DI COMPETENZA|PROFICIENCY BONUS)$/i,
    passiva: /^(SAGGEZZA PASSIVA|PASSIVE WISDOM)/i,
    altre: /^(ALTRE COMPETENZE E LINGUAGGI|OTHER PROFICIENCIES & LANGUAGES)$/i,
    attacchi: /^(ATTACCHI E INCANTESIMI|ATTACKS & SPELLCASTING)$/i,
    equip: /^(EQUIPAGGIAMENTO|EQUIPMENT)$/i,
    tratti: /^(TRATTI CARATTERIALI|PERSONALITY TRAITS)$/i,
    ideali: /^(IDEALI|IDEALS)$/i,
    legami: /^(LEGAMI|BONDS)$/i,
    difetti: /^(DIFETTI|FLAWS)$/i,
    privilegi: /^(PRIVILEGI & TRATTI|FEATURES & TRAITS)$/i,
    pfMax: /^(Punti Ferita Massimi|Hit Point Maximum)$/i,
    temp: /^(PUNTI FERITA TEMPORANEI|TEMPORARY HIT POINTS)$/i,
    attuali: /^(PUNTI FERITA ATTUALI|CURRENT HIT POINTS)$/i,
    dadiVita: /^(HIT DICE|DADI VITA)$/i
  };
  const CARATT = [['str', /^(FORZA|STRENGTH)$/i], ['dex', /^(DESTREZZA|DEXTERITY)$/i], ['con', /^(COSTITUZIONE|CONSTITUTION)$/i],
    ['int', /^(INTELLIGENZA|INTELLIGENCE)$/i], ['wis', /^(SAGGEZZA|WISDOM)$/i], ['cha', /^(CARISMA|CHARISMA)$/i]];
  // abilità: inizio del nome (italiano e inglese) → chiave e caratteristica
  const ABILITA = [
    ['acro', 'dex', /^(Acrobazia|Acrobatics)/i], ['anim', 'wis', /^(Addestrare|Animal)/i], ['arca', 'int', /^(Arcano|Arcana)/i],
    ['athl', 'str', /^(Atletica|Athletics)/i], ['dece', 'cha', /^(Inganno|Deception)/i], ['hist', 'int', /^(Storia|History)/i],
    ['insi', 'wis', /^(Intuizione|Insight)/i], ['inti', 'cha', /^(Intimidire|Intimidation)/i], ['inve', 'int', /^(Indagare|Investigation)/i],
    ['medi', 'wis', /^(Medicina|Medicine)/i], ['natu', 'int', /^(Natura|Nature)/i], ['perception', 'wis', /^(Percezione|Perception)/i],
    ['perf', 'cha', /^(Intrattenere|Performance)/i], ['pers', 'cha', /^(Persuasione|Persuasion)/i], ['reli', 'int', /^(Religione|Religion)/i],
    ['slei', 'dex', /^(Rapidità|Sleight)/i], ['stea', 'dex', /^(Furtività|Stealth)/i], ['surv', 'wis', /^(Sopravvivenza|Survival)/i]
  ];
  const TS = [['str', /^(Forza|Strength)$/i], ['dex', /^(Destrezza|Dexterity)$/i], ['con', /^(Costituzione|Constitution)$/i],
    ['int', /^(Intelligenza|Intelligence)$/i], ['wis', /^(Saggezza|Wisdom)$/i], ['cha', /^(Carisma|Charisma)$/i]];
  const numero = s => { const m = /^[+−-]?\d+$/.exec(String(s).trim().replace('−', '-')); return m ? parseInt(m[0], 10) : null; };
  const pulisci = s => String(s).replace(/\s+/g, ' ').trim();

  // gli elementi di una zona, raggruppati in righe (da sinistra a destra)
  function righe(items, x0, y0, x1, y1) {
    const dentro = items.filter(i => i.x0 >= x0 - 1 && i.x0 < x1 && (i.y0 + i.y1) / 2 >= y0 && (i.y0 + i.y1) / 2 < y1).sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
    const out = [];
    for (const i of dentro) {
      const r = out.find(r => Math.abs(r.y - i.y1) < 3);
      if (r) r.items.push(i); else out.push({ y: i.y1, items: [i] });
    }
    for (const r of out) { r.items.sort((a, b) => a.x0 - b.x0); r.testo = unisci(r.items); r.x = r.items[0].x0; }
    return out.sort((a, b) => a.y - b.y);
  }
  // i pezzi vicini (meno di 1,5 pt) sono la stessa parola: «Tie» «fl» «ing» → «Tiefling»
  function unisci(items) {
    let t = '', prima = null;
    for (const i of items) { t += prima && i.x0 - prima.x1 > 1.5 && !/\s$/.test(t) && !/^\s/.test(i.s) ? ' ' + i.s : i.s; prima = i; }
    return pulisci(t);
  }
  const trova = (items, re, filtro) => items.find(i => re.test(pulisci(i.s)) && (!filtro || filtro(i)));
  const testoZona = (items, x0, y0, x1, y1) => righe(items, x0, y0, x1, y1).map(r => r.testo).join('\n');
  const prosa = t => t.split('\n').join(' ').replace(/\s+/g, ' ').trim();

  function leggi(pagine) {
    if (!Array.isArray(pagine) || !pagine.length) return null;
    const p1 = pagine[0].items, W = pagine[0].w;
    const et = {};
    for (const [k, re] of Object.entries(ETICHETTE)) et[k] = trova(p1, re);
    // abbastanza punti di riferimento? altrimenti non è la stampa di Roll20 che conosciamo
    const chiave = ['nome', 'classe', 'ts', 'abilita', 'attacchi', 'equip'].filter(k => et[k]).length;
    if (chiave < 5) return null;
    const f = {}, avvisi = [];
    const sopra = (lab, x0, x1, alto = 16) => lab ? testoZona(p1, x0, lab.y0 - alto, x1, lab.y0 - 0.5).split('\n').pop() || '' : '';

    // intestazione: il valore sta appena sopra la sua etichetta
    const nome = et.nome ? pulisci(sopra(et.nome, 20, 250, 40)) : '';
    const cl = et.classe ? pulisci(sopra(et.classe, et.classe.x0 - 2, et.classe.x0 + 100)) : '';
    if (cl) {
      const parti = cl.split(/\s*[,/;]\s*/).filter(Boolean), livelli = parti.map(p => /(\d{1,2})\s*$/.exec(p));
      if (parti.length > 1 && livelli.every(Boolean)) { f.class = parti.join(' / '); f.level = String(livelli.reduce((a, m) => a + +m[1], 0)); }
      else { const m = /^(.*?)\s*(\d{1,2})$/.exec(cl); if (m && m[1]) { f.class = m[1]; f.level = m[2]; } else f.class = cl; }
    }
    const coppie = [['bg', et.storia], ['player', et.giocatore], ['race', et.razza], ['align', et.allineamento], ['xp', et.pe]];
    for (const [k, lab] of coppie) { const v = lab ? pulisci(sopra(lab, lab.x0 - 2, lab.x0 + 100)) : ''; if (v) f[k] = v; }

    // caratteristiche: sotto l'etichetta, il modificatore grande e il punteggio piccolo
    const mod = {};
    const labC = CARATT.map(([k, re]) => [k, trova(p1, re, i => i.x0 < 80)]).filter(x => x[1]).sort((a, b) => a[1].y0 - b[1].y0);
    labC.forEach(([k, lab], i) => {
      const fine = labC[i + 1] ? labC[i + 1][1].y0 : lab.y0 + 80;
      const nums = p1.filter(it => it.x0 > 20 && it.x0 < 75 && it.y0 > lab.y0 + 2 && it.y0 < fine && numero(it.s) !== null).sort((a, b) => a.y0 - b.y0);
      if (nums.length >= 2) { mod[k] = numero(nums[0].s); f[k] = String(numero(nums[nums.length - 1].s)); }
      else if (nums.length === 1) f[k] = String(numero(nums[0].s));
    });
    for (const [k] of CARATT) if (mod[k] == null && f[k]) mod[k] = Math.floor((+f[k] - 10) / 2);

    // bonus di competenza (il numero a sinistra dell'etichetta)
    let prof = null;
    if (et.competenza) {
      const n = p1.find(it => numero(it.s) !== null && Math.abs((it.y0 + it.y1) / 2 - (et.competenza.y0 + et.competenza.y1) / 2) < 10 && it.x0 < et.competenza.x0 && it.x0 > et.competenza.x0 - 45);
      if (n) { prof = numero(n.s); f.profb = (prof >= 0 ? '+' : '') + prof; }
    }
    if (prof == null) prof = 2 + Math.floor((Math.max(1, +f.level || 1) - 1) / 4);

    // tiri salvezza e abilità: «numero  Nome»; la competenza si deduce dal numero (il pallino è un disegno)
    const tsZona = et.ts ? righe(p1, 100, et.ts.y0 - 110, 215, et.ts.y0 - 2) : [];
    for (const r of tsZona) {
      const n = numero(r.items[0].s), nome = unisci(r.items.slice(1));
      const k = (TS.find(([, re]) => re.test(nome)) || [])[0];
      if (k && n !== null && mod[k] != null && n - mod[k] >= prof && prof > 0) f['sp_' + k] = '1';
    }
    const abZona = et.abilita && et.ts ? righe(p1, 100, et.ts.y1 + 2, 215, et.abilita.y0 - 1) : [];
    for (const r of abZona) {
      const n = numero(r.items[0].s), nome = unisci(r.items.slice(1));
      const a = ABILITA.find(([, , re]) => re.test(nome));
      if (!a || n === null || mod[a[1]] == null) continue;
      const d = n - mod[a[1]];
      if (prof > 0 && d >= prof * 2) f['ke_' + a[0]] = f['kp_' + a[0]] = '1';
      else if (prof > 0 && d >= prof) f['kp_' + a[0]] = '1';
    }

    // CA, iniziativa, velocità: i tre numeri grandi in alto al centro
    const alto = righe(p1, 215, 115, 400, 150).flatMap(r => r.items);
    const inBox = (x0, x1) => unisci(alto.filter(i => i.x0 >= x0 && i.x0 < x1));
    const ca = inBox(215, 270), ini = inBox(270, 325), vel = inBox(325, 400);
    if (numero(ca) !== null) f.ac = String(numero(ca));
    if (numero(ini) !== null) {
      const extra = numero(ini) - (mod.dex != null ? mod.dex : 0);
      if (extra) f.initb = (extra > 0 ? '+' : '') + extra;          // es. Allerta (+5); di solito niente
    }
    if (vel) f.speed = vel;
    if (et.pfMax) {
      const n = p1.find(it => numero(it.s) !== null && Math.abs(it.y0 - et.pfMax.y0) < 6 && it.x0 > et.pfMax.x1);
      if (n) f.hpmax = String(numero(n.s));
    }
    if (et.attuali) { const v = pulisci(testoZona(p1, 215, et.attuali.y0 - 30, 400, et.attuali.y0 - 1)); if (numero(v) !== null) f.hp = String(numero(v)); }
    // dadi vita: «Total  5» nella casella
    if (et.temp) {
      const n = p1.find(it => numero(it.s) !== null && it.x0 > 225 && it.x0 < 300 && it.y0 > et.temp.y1 + 4 && it.y0 < et.temp.y1 + 40);
      if (n) f.hdt = String(numero(n.s));
    }

    // attacchi: righe tra l'intestazione NOME/ATT e l'etichetta (pagina 1, poi pagina 2)
    const armi = [];
    const leggiArmi = (items, y0, y1) => {
      for (const r of righe(items, 215, y0, 400, y1)) {
        if (/^(NOME|NAME)\b/.test(r.testo)) continue;
        const nomeA = unisci(r.items.filter(i => i.x0 < 282));
        const atk = unisci(r.items.filter(i => i.x0 >= 282 && i.x0 < 315));
        const dan = unisci(r.items.filter(i => i.x0 >= 315));
        if (nomeA) armi.push([nomeA, atk, dan]);
      }
    };
    const intest = trova(p1, /^(NOME|NAME)$/i, i => i.x0 > 210 && i.x0 < 240 && et.attacchi && i.y0 < et.attacchi.y0 && i.y0 > et.attacchi.y0 - 200);
    if (et.attacchi) leggiArmi(p1, (intest ? intest.y1 : et.attacchi.y0 - 110) + 1, et.attacchi.y0 - 1);
    if (pagine[1]) {
      const p2 = pagine[1].items, a2 = trova(p2, ETICHETTE.attacchi, i => i.x0 < 200);
      if (a2) for (const r of righe(p2, 20, 20, 215, a2.y0 - 1)) {
        if (/^(NOME|NAME)\b/.test(r.testo)) continue;
        const nomeA = pulisci(r.items.filter(i => i.x0 < 95).map(i => i.s).join(' '));
        if (nomeA) armi.push([nomeA, pulisci(r.items.filter(i => i.x0 >= 95 && i.x0 < 128).map(i => i.s).join(' ')), pulisci(r.items.filter(i => i.x0 >= 128).map(i => i.s).join(' '))]);
      }
    }
    armi.slice(0, 40).forEach(([n, a, d], i) => {
      f['an' + i] = n.replace(/…$/, '');
      const v = numero(a), cd = /^(?:DC|CD)\s*(\d+)/i.exec(a) || /(?:DC|CD)\s*(\d+)/i.exec(d);
      if (v !== null) f['ab' + i] = String(v);
      else if (cd) f['ab' + i] = 'CD ' + cd[1];
      if (d) f['ad' + i] = d.replace(/…$/, '');
      if (/…/.test(n + d)) avvisi.push(`il nome dell'attacco «${n}» è tagliato nella stampa di Roll20`);
    });

    // monete: i numeri sopra le etichette CP SP EP GP PP
    const COIN = [['mr', /^(CP|MR)$/], ['ma', /^(SP|MA)$/], ['me', /^(EP|ME)$/], ['mo', /^(GP|MO)$/], ['mp', /^(PP|MP)$/]];
    for (const [k, re] of COIN) {
      const lab = trova(p1, re, i => i.x0 > 210 && i.x0 < 410);
      if (!lab) continue;
      const n = p1.find(it => numero(it.s) !== null && it.y1 < lab.y0 && it.y1 > lab.y0 - 22 && it.x0 > lab.x0 - 40 && it.x0 < lab.x1 + 5);
      if (n && numero(n.s)) f[k] = String(numero(n.s));
    }

    // equipaggiamento: sotto le monete fino all'etichetta, e il seguito a pagina 2
    const ogg = [];
    const cp = trova(p1, /^(CP|MR)$/, i => i.x0 > 210 && i.x0 < 410);
    if (et.equip) ogg.push(...righe(p1, 215, (cp ? cp.y1 : et.equip.y0 - 120) + 2, W * 0.67, et.equip.y0 - 1).map(r => r.testo));
    if (pagine[1]) {
      const p2 = pagine[1].items, e2 = trova(p2, ETICHETTE.equip), c2 = trova(p2, /^(CP|MR)$/);
      if (e2) ogg.push(...righe(p2, 215, (c2 ? c2.y1 : 20) + 2, pagine[1].w * 0.67, e2.y0 - 1).map(r => r.testo));
    }
    const oggetti = ogg.filter(t => !/^(CP|SP|EP|GP|PP|MR|MA|ME|MO|MP)(\s|$)/.test(t));
    const resto = [];
    // Roll20 elenca sia la dotazione («Dungeoneer's Pack») sia quello che c'è dentro: il peso si conta una volta sola
    const contenuto = oggetti.some(t => /\b(backpack|zaino|rations|razioni|waterskin|otre|bedroll|giaciglio)\b/i.test(t));
    oggetti.forEach((t, i) => {
      if (i >= 45) { resto.push(t); return; }                       // la scheda Standard ha 45 righe
      f['iv' + i + 'n'] = t;
      const kg = contenuto && /\b(pack|dotazione)\b/i.test(t) ? 0 : pesoOggetto(t);
      if (kg !== null) f['iv' + i + 'w'] = String(kg);
    });
    if (resto.length) f.equip = resto.join('\n');
    const freccia = ogg.map(t => /^(\d+)\s+(Arrows|Frecce|Bolts|Quadrelli|Sling Bullets|Proiettili)/i.exec(t)).find(Boolean);
    if (freccia) { f.am0n = freccia[2]; f.am0q = freccia[1]; }
    const arm = ogg.map(t => /^\d+\s+((Padded|Leather|Studded Leather|Hide|Chain Shirt|Scale Mail|Breastplate|Half Plate|Ring Mail|Chain Mail|Splint|Plate)( Armor)?)$/i.exec(t)).find(Boolean);
    if (arm) f.ar_name = arm[1];

    // colonna di destra: tratti, ideali, legami, difetti, elenco dei privilegi
    const dx0 = W * 0.67, dx1 = W;
    const box = (da, a) => da !== undefined && a ? prosa(testoZona(p1, dx0, da, dx1, a.y0 - 1)) : '';
    const yTop = 110;
    if (et.tratti) f.traits = box(yTop, et.tratti);
    if (et.ideali && et.tratti) f.ideals = box(et.tratti.y1 + 1, et.ideali);
    if (et.legami && et.ideali) f.bonds = box(et.ideali.y1 + 1, et.legami);
    if (et.difetti && et.legami) f.flaws = box(et.legami.y1 + 1, et.difetti);
    const nomiPriv = et.privilegi && et.difetti ? righe(p1, dx0, et.difetti.y1 + 1, dx1, et.privilegi.y0 - 1).map(r => r.testo) : [];
    for (const k of ['traits', 'ideals', 'bonds', 'flaws']) if (!f[k]) delete f[k];

    // altre competenze e linguaggi
    if (et.altre) {
      const da = et.passiva ? et.passiva.y1 + 2 : et.altre.y0 - 70;
      const righeComp = righe(p1, 20, da, 215, et.altre.y0 - 1).map(r => r.testo);
      const altro = [];
      for (const t of righeComp) {
        const m = /^(LINGUAGGI[OA]?|LANGUAGES?)\s*:\s*(.*)$/i.exec(t);
        if (m) { f.langs1 = m[2]; continue; }
        const a = /^(ARMATURA|ARMOR|ARMATURE)\s*:\s*(.*)$/i.exec(t), w = /^(ARMA|ARMI|WEAPONS?)\s*:\s*(.*)$/i.exec(t);
        if (a) { if (/light|legger/i.test(a[2])) f.pa_l = '1'; if (/medium|medi/i.test(a[2])) f.pa_m = '1'; if (/heavy|pesant/i.test(a[2])) f.pa_p = '1'; if (/shield|scud/i.test(a[2])) f.pa_s = '1'; continue; }
        if (w) { if (/simple|sempl/i.test(w[2])) f.pw_s = '1'; if (/martial|guerra/i.test(w[2])) f.pw_g = '1'; continue; }
        altro.push(t);
      }
      if (altro.length) f.prof_text1 = prosa(altro.join(' ')).slice(0, 300);
      const tutto = altro.join(' ');
      if (/armature medie|medium armor/i.test(tutto)) f.pa_m = '1';
      if (/scudi|shields/i.test(tutto)) f.pa_s = '1';
      if (/armi da guerra|martial/i.test(tutto)) f.pw_g = '1';
    }

    // privilegi a uso limitato: le caselle «Totale:» con il nome sotto (pagine 1 e 2)
    const limitati = [];
    for (const pg of pagine.slice(0, 2)) {
      for (const t of pg.items.filter(i => /^(Totale|Total):?$/i.test(pulisci(i.s)) && i.x0 > pg.w * 0.6)) {
        const totN = pg.items.find(it => numero(it.s) !== null && Math.abs(it.y0 - t.y0) < 6 && it.x0 > t.x1 && it.x0 < t.x1 + 60);
        const sotto = righe(pg.items, t.x0 - 20, t.y1 + 1, t.x0 + 70, t.y1 + 48);
        const usati = sotto.find(r => numero(r.testo) !== null);
        const nomeL = sotto.filter(r => numero(r.testo) === null && !/^(Totale|Total)/i.test(r.testo)).map(r => r.testo).join(' ');
        if (nomeL && !limitati.some(l => l.n === nomeL)) limitati.push({ n: nomeL, t: totN ? numero(totN.s) : null, u: usati ? numero(usati.testo) : 0 });
      }
    }
    limitati.slice(0, 6).forEach((l, i) => {
      const lungo = /\bRIP\.?\s*L|riposo lungo|long rest|\bLR\b/i.test(l.n), breve = /\bRIP\.?\s*B|riposo breve|short rest|\bSR\b/i.test(l.n);
      f['lf' + i + 'n'] = l.n.replace(/\s*\b(RIP\.?\s*[LB]\.?)\s*$/i, '').trim();
      if (l.t != null) f['lf' + i + 't'] = String(l.t);
      f['lf' + i + 'u'] = String(l.u || 0);
      if (lungo) f['lf' + i + 'l'] = '1';
      if (breve) f['lf' + i + 'b'] = '1';
    });

    // pagina degli incantesimi: caratteristica, CD, attacco e gli elenchi per livello
    const pInc = pagine.find(p => trova(p.items, /^(SPELLCASTING|INCANTATORE)$/i) && trova(p.items, /^(TRUCCHETTI|CANTRIPS)$/i));
    const nomiInc = [];
    if (pInc) {
      const it = pInc.items, Wp = pInc.w;
      const ab = pulisci(testoZona(it, Wp * 0.45, 30, Wp * 0.62, 60));
      const dc = pulisci(testoZona(it, Wp * 0.62, 30, Wp * 0.8, 60)), atk = pulisci(testoZona(it, Wp * 0.8, 30, Wp, 60));
      if (ab) f.sc_ab = ab.charAt(0) + ab.slice(1).toLowerCase();
      const abK = { sag: 'wis', wis: 'wis', int: 'int', car: 'cha', cha: 'cha', for: 'str', str: 'str', des: 'dex', dex: 'dex', cos: 'con', con: 'con' }[ab.slice(0, 3).toLowerCase()];
      const m = abK && mod[abK] != null ? mod[abK] : null;
      if (numero(dc) !== null && (m === null || numero(dc) !== 8 + prof + m)) f.spcd = String(numero(dc));
      if (numero(atk) !== null && (m === null || numero(atk) !== prof + m)) f.spatk = String(numero(atk));
      const cls = pulisci(testoZona(it, 30, 30, Wp * 0.45, 72)).replace(/SPELLCASTING|CLASS|CLASSE DA INCANTATORE/gi, '').trim();
      if (cls) f.sc_class = cls;
      // tre colonne; in ciascuna si alternano «livello  slot» e i nomi degli incantesimi
      for (const [a, b] of [[0, Wp / 3], [Wp / 3, Wp * 2 / 3], [Wp * 2 / 3, Wp]]) {
        let L = null;
        for (const r of righe(it, a, 100, b, pInc.h)) {
          const h = /^([0-9])\s+(TRUCCHETTI|CANTRIPS|\d+)\b/i.exec(r.testo);
          if (h) { L = +h[1]; if (L > 0) f['sl' + L + 't'] = h[2]; continue; }
          if (L === null || /^(SPELL|LEVEL|SLOTS|TOTAL|EXPENDED|LIVELLO)\b/i.test(r.testo) || /^[A-Z ]+$/.test(r.testo) && r.testo.length > 3 && r.testo === r.testo.toUpperCase() && !/[a-z]/.test(r.testo)) continue;
          const i = quanti(f, L);
          if (i >= 20) continue;
          f[`sp${L}_${i}`] = r.testo;
          nomiInc.push([L, i, r.testo]);
        }
      }
      for (const L of [1, 2, 3, 4, 5, 6, 7, 8, 9]) if (f['sl' + L + 't'] === '0') delete f['sl' + L + 't'];
    }

    // le pagine dopo: descrizioni dei privilegi e degli incantesimi (titolo = un nome già letto)
    const titoliPriv = new Set(nomiPriv), titoliInc = new Map(nomiInc.map(([L, i, n]) => [n, `sp${L}_${i}_d`]));
    const desc = {};
    let cur = null;
    const dopo = pagine.slice(pInc ? pagine.indexOf(pInc) + 1 : 2);
    for (const pg of dopo) {
      for (const [a, b] of [[0, pg.w / 3], [pg.w / 3, pg.w * 2 / 3], [pg.w * 2 / 3, pg.w]]) {
        for (const r of righe(pg.items, a, 0, b, pg.h)) {
          if (ETICHETTE.privilegi.test(r.testo) || /^(INCANTESIMI|SPELLS)$/i.test(r.testo)) continue;
          if (titoliPriv.has(r.testo) || titoliInc.has(r.testo)) { cur = desc[r.testo] = desc[r.testo] || { righe: [], conta: (desc[r.testo] || { conta: 0 }).conta + 1 }; if (cur.righe.length) cur.righe.push('§'); continue; }
          if (cur) cur.righe.push(r.testo);
        }
      }
    }
    const scrivi = righeT => {
      const LAB = /^(Abiurazione|Ammaliamento|Divinazione|Evocazione|Illusione|Invocazione|Necromanzia|Trasmutazione|Abjuration|Enchantment|Divination|Conjuration|Illusion|Evocation|Necromancy|Transmutation|Tempo di lancio:|Portata:|Bersaglio:|Componenti:|Durata:|Casting Time:|Range:|Target:|Components:|Duration:)/;
      const out = []; let par = [];
      const chiudi = () => { if (par.length) { out.push((out.length ? '\n' : '') + par.join(' ').replace(/\s+/g, ' ')); par = []; } };
      for (const r of righeT) {
        if (r === '§') { chiudi(); continue; }
        if (/^(Descrizione|Description):?$/i.test(r)) continue;
        if (LAB.test(r) && !par.length) { out.push(r.replace(/Concentrazione(?=Up)/, 'Concentrazione, ').replace(/Concentration(?=Up)/, 'Concentration, ')); continue; }
        if (/^(A livelli più alti|At Higher Levels):/i.test(r)) { chiudi(); par = [r]; continue; }
        if (!par.length && out.length && LAB.test(out[out.length - 1].trim()) && !/^[A-ZÀ-Ý]/.test(r)) { out[out.length - 1] += ' ' + r; continue; }
        par.push(r);
      }
      chiudi();
      return out.join('\n').trim();
    };
    for (const [n, k] of titoliInc) if (desc[n]) f[k] = scrivi(desc[n].righe);
    // privilegi: ognuno con la sua descrizione (se c'è), uno sotto l'altro
    const visti = new Set();
    const blocchi = nomiPriv.filter(n => !visti.has(n) && visti.add(n)).map(n => desc[n] && desc[n].righe.length ? `${n}\n${scrivi(desc[n].righe)}` : n);
    if (blocchi.length) f.classf = blocchi.join('\n\n');             // «Privilegi di classe» (anche nella scheda Standard)

    for (const k of Object.keys(f)) if (f[k] === '' || f[k] == null) delete f[k];
    if (!f.level) f.level = '1';
    const conta = Object.keys(f).length;
    return { name: (nome || 'Personaggio').slice(0, 40), tpl: 'dnd5e', f, avvisi, campi: conta };
  }
  // peso in kg (1 lb = 0,5 kg, come nei manuali italiani) degli oggetti più comuni del manuale base
  const PESI_LB = {
    'backpack': 5, 'zaino': 5, 'bedroll': 7, 'giaciglio': 7, 'blanket': 3, 'coperta': 3, 'crowbar': 5, 'piede di porco': 5, 'hammer': 3, 'martello': 3,
    'piton': 0.25, 'chiodo da rocciatore': 0.25, 'torch': 1, 'torcia': 1, 'tinderbox': 1, 'acciarino': 1, 'rations': 2, 'razioni': 2, 'waterskin': 5, 'otre': 5,
    'hempen rope': 10, 'corda di canapa': 10, 'silk rope': 5, 'corda di seta': 5, 'rope': 10, 'corda': 10, 'lantern': 2, 'lanterna': 2, 'oil': 1, 'olio': 1,
    'mess kit': 1, 'gavetta': 1, 'common clothes': 3, 'abiti comuni': 3, 'fine clothes': 6, 'abiti pregiati': 6, 'costume': 4, 'traveler\'s clothes': 4, 'vestments': 4, 'paramenti': 4,
    'belt pouch': 1, 'borsa': 1, 'pouch': 1, 'sack': 0.5, 'sacco': 0.5, 'quiver': 1, 'faretra': 1, 'arrows': 0.05, 'frecce': 0.05, 'bolts': 0.075, 'quadrelli': 0.075,
    'holy symbol': 1, 'simbolo sacro': 1, 'prayer wheel': 0, 'stick of incense': 0, 'incenso': 0, 'candle': 0, 'candela': 0, 'book': 5, 'libro': 5, 'spellbook': 3,
    'component pouch': 2, 'borsa per componenti': 2, 'arcane focus': 1, 'druidic focus': 1, 'thieves\' tools': 1, 'arnesi da scasso': 1, 'healer\'s kit': 3, 'kit del guaritore': 3,
    'disguise kit': 3, 'kit per il camuffamento': 3, 'flask': 1, 'fiasca': 1, 'bottle': 2, 'bottiglia': 2, 'potion of healing': 0.5, 'pozione di guarigione': 0.5,
    'explorer\'s pack': 59, 'dotazione da esploratore': 59, 'dungeoneer\'s pack': 61.5, 'dotazione da avventuriero': 61.5, 'priest\'s pack': 24, 'dotazione da sacerdote': 24,
    'scholar\'s pack': 10, 'dotazione da studioso': 10, 'burglar\'s pack': 44.5, 'dotazione da scassinatore': 44.5, 'diplomat\'s pack': 36, 'dotazione da diplomatico': 36,
    'entertainer\'s pack': 38, 'dotazione da intrattenitore': 38,
    'padded armor': 8, 'leather armor': 10, 'armatura di cuoio': 10, 'studded leather armor': 13, 'cuoio borchiato': 13, 'hide armor': 12, 'chain shirt': 20, 'giaco di maglia': 20,
    'scale mail': 45, 'corazza a scaglie': 45, 'breastplate': 20, 'corazza di piastre': 20, 'half plate': 40, 'mezza armatura': 40, 'ring mail': 40, 'chain mail': 55, 'cotta di maglia': 55,
    'splint armor': 60, 'plate armor': 65, 'armatura completa': 65, 'shield': 6, 'scudo': 6,
    'club': 2, 'dagger': 1, 'pugnale': 1, 'greatclub': 10, 'handaxe': 2, 'ascia': 2, 'javelin': 2, 'giavellotto': 2, 'light hammer': 2, 'mace': 4, 'mazza': 4,
    'quarterstaff': 4, 'bastone ferrato': 4, 'sickle': 2, 'spear': 3, 'lancia': 3, 'light crossbow': 5, 'balestra leggera': 5, 'dart': 0.25, 'shortbow': 2, 'arco corto': 2,
    'sling': 0, 'fionda': 0, 'battleaxe': 4, 'ascia da battaglia': 4, 'flail': 2, 'glaive': 6, 'greataxe': 7, 'ascia bipenne': 7, 'greatsword': 6, 'spadone': 6,
    'halberd': 6, 'alabarda': 6, 'lance': 6, 'longsword': 3, 'spada lunga': 3, 'maul': 10, 'maglio': 10, 'morningstar': 4, 'morning star': 4, 'pike': 18, 'picca': 18,
    'rapier': 2, 'stocco': 2, 'scimitar': 3, 'scimitarra': 3, 'shortsword': 2, 'spada corta': 2, 'trident': 4, 'tridente': 4, 'war pick': 2, 'warhammer': 2, 'martello da guerra': 2,
    'whip': 3, 'frusta': 3, 'hand crossbow': 3, 'heavy crossbow': 18, 'longbow': 2, 'arco lungo': 2, 'net': 3, 'rete': 3
  };
  function pesoOggetto(riga) {
    const m = /^(\d+)\s+(.+)$/.exec(String(riga).trim());
    const q = m ? +m[1] : 1, nome = (m ? m[2] : String(riga)).toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
    let lb = PESI_LB[nome];
    if (lb === undefined) { const k = Object.keys(PESI_LB).filter(k => nome.startsWith(k)).sort((a, b) => b.length - a.length)[0]; if (k) lb = PESI_LB[k]; }
    if (lb === undefined || q === 0) return q === 0 ? 0 : null;
    return Math.round(q * lb * 0.5 * 100) / 100;
  }
  function quanti(f, L) { let i = 0; while (f[`sp${L}_${i}`] !== undefined) i++; return i; }

  if (typeof module === 'object' && module.exports) module.exports = { leggi };
  else radice.leggiRoll20 = leggi;
})(typeof window !== 'undefined' ? window : globalThis);
