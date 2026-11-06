// Importare una scheda da un PDF compilabile (quelli con i campi da riempire, come la scheda
// ufficiale della 5ª edizione). Si legge il valore di ogni campo e lo si mette nella scheda Open 5e;
// quello che non si sa dove mettere finisce nelle Note, così non si perde niente.
// I PDF «piatti» (stampati o fotografati) non hanno campi: si avvisa e basta.
(function () {
  const tr = window.tr || (s => s);
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  // nome del campo (normalizzato) → chiave della scheda. Prima la scheda ufficiale inglese, poi nomi italiani comuni.
  const CAMPI = {
    charactername: 'name', characternam: 'name', nomepersonaggio: 'name', nomedelpersonaggio: 'name', personaggio: 'name',
    classlevel: 'classlevel', classeelivello: 'classlevel', classelivello: 'classlevel',
    class: 'class', classe: 'class', level: 'level', livello: 'level',
    background: 'bg', playername: 'player', nomegiocatore: 'player', giocatore: 'player',
    race: 'race', razza: 'race', specie: 'race', alignment: 'align', allineamento: 'align',
    xp: 'xp', experiencepoints: 'xp', puntiesperienza: 'xp', pe: 'xp',
    str: 'str', strength: 'str', for: 'str', forza: 'str',
    dex: 'dex', dexterity: 'dex', des: 'dex', destrezza: 'dex',
    con: 'con', constitution: 'con', cos: 'con', costituzione: 'con',
    int: 'int', intelligence: 'int', intelligenza: 'int',
    wis: 'wis', wisdom: 'wis', sag: 'wis', saggezza: 'wis',
    cha: 'cha', charisma: 'cha', car: 'cha', carisma: 'cha',
    profbonus: 'profb', proficiencybonus: 'profb', bonuscompetenza: 'profb', bonusdicompetenza: 'profb',
    ac: 'ac', armorclass: 'ac', ca: 'ac', classearmatura: 'ac',
    initiative: 'initb', iniziativa: 'initb', speed: 'speed', velocita: 'speed',
    hpmax: 'hpmax', hitpointmaximum: 'hpmax', pfmax: 'hpmax', pfmassimi: 'hpmax', puntiferitamassimi: 'hpmax',
    hpcurrent: 'hp', currenthitpoints: 'hp', pfattuali: 'hp', pf: 'hp',
    hptemp: 'hpt', temporaryhitpoints: 'hpt', pftemporanei: 'hpt',
    hdtotal: 'hdt', hd: 'hd', hitdice: 'hd', dadivita: 'hd',
    personalitytraits: 'traits', trattidellapersonalita: 'traits', tratticaratteriali: 'traits',
    ideals: 'ideals', ideali: 'ideals', bonds: 'bonds', legami: 'bonds', flaws: 'flaws', difetti: 'flaws',
    featuresandtraits: 'features', privilegietratti: 'features', capacitaetratti: 'features',
    proficiencieslang: 'prof_text1', altrecompetenzeelinguaggi: 'prof_text1', linguaggi: 'langs1',
    equipment: 'equip', equipaggiamento: 'equip',
    cp: 'mr', sp: 'ma', ep: 'me', gp: 'mo', pp: 'mp', mr: 'mr', ma: 'ma', me: 'me', mo: 'mo', mp: 'mp',
    age: 'age', eta: 'age', height: 'height', altezza: 'height', weight: 'weight', peso: 'weight',
    eyes: 'eyes', occhi: 'eyes', skin: 'skin', carnagione: 'skin', hair: 'hair', capelli: 'hair',
    allies: 'faction_text', alleatieorganizzazioni: 'faction_text', factionname: 'faction',
    feattraits: 'extra', backstory: 'notes', storiadelpersonaggio: 'notes', treasure: 'equip', tesoro: 'equip',
    spellcastingclass2: 'sc_class', classedaincantatore: 'sc_class', spellcastingability2: 'sc_ab',
    spellsavedc2: 'spcd', spellatkbonus2: 'spatk', attacksspellcasting: 'features',
    wpnname: 'an0', wpn1atkbonus: 'ab0', wpn1damage: 'ad0', wpnname2: 'an1', wpn2atkbonus: 'ab1', wpn2damage: 'ad1',
    wpnname3: 'an2', wpn3atkbonus: 'ab2', wpn3damage: 'ad2'
  };
  // le caselle della scheda ufficiale: tiri salvezza e abilità
  const CASELLE = {
    checkbox11: 'sp_str', checkbox18: 'sp_dex', checkbox19: 'sp_con', checkbox20: 'sp_int', checkbox21: 'sp_wis', checkbox22: 'sp_cha',
    checkbox23: 'kp_acro', checkbox24: 'kp_anim', checkbox25: 'kp_arca', checkbox26: 'kp_athl', checkbox27: 'kp_dece', checkbox28: 'kp_hist',
    checkbox29: 'kp_insi', checkbox30: 'kp_inti', checkbox31: 'kp_inve', checkbox32: 'kp_medi', checkbox33: 'kp_natu', checkbox34: 'kp_perception',
    checkbox35: 'kp_perf', checkbox36: 'kp_pers', checkbox37: 'kp_reli', checkbox38: 'kp_slei', checkbox39: 'kp_stea', checkbox40: 'kp_surv'
  };
  // altri layout trovati in giro (scheda tedesca di ataendler, MorePurpleMoreBetter, D&D Beyond, Roll20, schede
  // italiane fatte in casa): stessi significati, altri nomi
  Object.assign(CAMPI, {
    charakternamepage1: 'name', charaktername: 'name', pcname: 'name', nomepg: 'name', nome: 'name', name: 'name', charname: 'name',
    klasseundstufe: 'classlevel', classandlevels: 'classlevel', classlevels: 'classlevel', classandlevel: 'classlevel',
    spielername: 'player', hintergrund: 'bg', volk: 'race', species: 'race', speciesrace: 'race',
    erfahrungspunkte: 'xp', totalexperience: 'xp', ubungsbonus: 'profb', proficiency: 'profb', competenza: 'profb',
    ges: 'dex', kon: 'con', wei: 'wis', strengthscore: 'str', dexterityscore: 'dex', constitutionscore: 'con',
    intelligencescore: 'int', wisdomscore: 'wis', charismascore: 'cha',
    rustungsklasse: 'ac', armorclassac: 'ac', bewegungsrate: 'speed', walkingspeed: 'speed', speedwalk: 'speed', movimento: 'speed',
    trefferpunktemaximum: 'hpmax', maxhp: 'hpmax', hpmaximum: 'hpmax', maxhitpoints: 'hpmax', puntiferitamax: 'hpmax', pfmassimo: 'hpmax',
    akttrefferpunkte: 'hp', currenthp: 'hp', hp: 'hp', puntiferitaattuali: 'hp', puntiferita: 'hp',
    temptrefferpunkte: 'hpt', temphp: 'hpt', hptemporary: 'hpt', puntiferitatemporanei: 'hpt',
    gesamttw: 'hdt', hitdicetotal: 'hdt', totalhitdice: 'hdt', trefferwurfel: 'hd', dadivitatotali: 'hdt',
    personlichkeitsmerkmale: 'traits', personality: 'traits', ideale: 'ideals', bindungen: 'bonds', makel: 'flaws',
    km: 'mr', sm: 'ma', em: 'me', gm: 'mo', pm: 'mp', copper: 'mr', silver: 'ma', electrum: 'me', gold: 'mo', platinum: 'mp',
    alter: 'age', korpergrosse: 'height', gewicht: 'weight', augenfarbe: 'eyes', hautfarbe: 'skin', haarfarbe: 'hair', gesinnung: 'align',
    hintergrundgeschichte1: 'notes', hintergrundgeschichte2: 'notes', characterbackstory: 'notes', backstory1: 'notes',
    zauberklasse: 'sc_class', attributzauberwirken: 'sc_ab', zauberrettungswurfsg: 'spcd', zauberangriffsbonus: 'spatk',
    spellcastingclass: 'sc_class', spellcastingability: 'sc_ab', spellsavedc: 'spcd', spellattackbonus: 'spatk', spellatkbonus: 'spatk',
    featuresandtraits2: 'features', additionalfeaturestraits: 'features', featurestraits: 'features', classfeatures: 'features',
    proficienciesandlanguages: 'prof_text1', proficienciestraining: 'prof_text1', otherproficiencies: 'prof_text1',
    equipment2: 'equip', inventory: 'equip', allies2: 'faction_text', alliesorganizations: 'faction_text',
    attackscantrips: 'features', actions: 'features'
  });
  // le abilità nelle lingue che si trovano nei PDF: inglese (anche abbreviato), italiano, tedesco
  const NOMI_ABILITA = {
    acro: ['acrobatics', 'acrobazia', 'akrobatik', 'acr'], anim: ['animalhandling', 'animal', 'addestrareanimali', 'mittierenumgehen', 'ani'],
    arca: ['arcana', 'arcano', 'arkanekunde', 'arc'], athl: ['athletics', 'atletica', 'athletik', 'ath'],
    dece: ['deception', 'inganno', 'tauschen', 'dec'], hist: ['history', 'storia', 'geschichte', 'his'],
    insi: ['insight', 'intuizione', 'motiverkennen', 'ins'], inti: ['intimidation', 'intimidire', 'einschuchtern', 'inti'],
    inve: ['investigation', 'indagare', 'nachforschungen', 'inv'], medi: ['medicine', 'medicina', 'heilkunde', 'med'],
    natu: ['nature', 'natura', 'naturkunde', 'nat'], perception: ['perception', 'percezione', 'wahrnehmung', 'perc'],
    perf: ['performance', 'intrattenere', 'auftreten', 'perf'], pers: ['persuasion', 'persuasione', 'uberzeugen', 'pers'],
    reli: ['religion', 'religione', 'rel'], slei: ['sleightofhand', 'rapiditadimano', 'fingerfertigkeit', 'sle'],
    stea: ['stealth', 'furtivita', 'heimlichkeit', 'ste'], surv: ['survival', 'sopravvivenza', 'uberlebenskunst', 'sur']
  };
  const NOMI_CAR = { str: ['strength', 'forza', 'str', 'for'], dex: ['dexterity', 'destrezza', 'dex', 'des', 'ges'], con: ['constitution', 'costituzione', 'con', 'cos', 'kon'],
    int: ['intelligence', 'intelligenza', 'int'], wis: ['wisdom', 'saggezza', 'wis', 'sag', 'wei'], cha: ['charisma', 'carisma', 'cha', 'car'] };
  const abilitaIn = k => {                          // l'abilità nominata all'inizio del nome del campo
    let best = null;
    for (const [id, nomi] of Object.entries(NOMI_ABILITA)) for (const n of nomi) if (k.startsWith(n) && (!best || n.length > best[1])) best = [id, n.length];
    return best && best[0];
  };
  const carIn = k => { for (const [id, nomi] of Object.entries(NOMI_CAR)) for (const n of nomi) if (k.startsWith(n)) return [id, k.slice(n.length)]; return null; };
  const SEGNO = /^(p|e|x|v|si|yes|on|true|1|•|●|■|✓|✔|\*)$/i;
  // Livello degli incantesimi nei campi «Spells 10xx» della scheda ufficiale 2014
  function livelloSpells(suff) {
    if (/^1010\d+$/.test(suff) && suff.length >= 5) { const k = +suff.slice(4); return k <= 6 ? 8 : 9; }
    const n = +suff;
    if (n === 1014 || (n >= 1016 && n <= 1022)) return 0;
    if (n === 1015 || (n >= 1023 && n <= 1033)) return 1;
    const lim = [[1046, 2], [1059, 3], [1072, 4], [1081, 5], [1090, 6], [1099, 7]];
    for (const [m, L] of lim) if (n <= m) return L;
    return null;
  }
  // Campi che non sono nella tabella: si prova a capirli dal nome. true = sistemato (o da ignorare).
  function riconosci(n, k, valore, f, dopo) {
    const raw = String(n);
    let m;
    // caselle incantesimo: scheda ufficiale («SlotsTotal 19…27»), tedesca («ZauberplätzeGesamt1»), generiche («Slots 3 Total»)
    if ((m = /^slotstotal(\d+)$/.exec(k)) && +m[1] >= 19 && +m[1] <= 27) { f['sl' + (m[1] - 18) + 't'] = String(parseInt(valore, 10) || ''); return true; }
    if ((m = /^slotsremaining(\d+)$/.exec(k)) && +m[1] >= 19 && +m[1] <= 27) { dopo.rimasti[m[1] - 18] = parseInt(valore, 10); return true; }
    if ((m = /^zauberplatzegesamt(\d)$/.exec(k)) || (m = /^(?:spell)?slots?(?:level|lvl|liv(?:ello)?)?(\d)(?:total|tot|max|totali)$/.exec(k))) { f['sl' + m[1] + 't'] = String(parseInt(valore, 10) || ''); return true; }
    if ((m = /^zauberplatzeverbraucht(\d)$/.exec(k)) || (m = /^(?:spell)?slots?(?:level|lvl|liv(?:ello)?)?(\d)(?:used|expended|spesi|usati)$/.exec(k))) { f['sl' + m[1] + 'u'] = String(parseInt(valore, 10) || ''); return true; }
    // incantesimi
    if ((m = /^spells\s*(\d+)$/i.exec(raw))) { const L = livelloSpells(m[1]); (dopo.inc[L == null ? 'x' : L] ||= []).push(valore); return true; }
    if (/^zaubertrick\d+$/.test(k) || /^(cantrip|trucchetto)s?\d*$/.test(k)) { (dopo.inc[0] ||= []).push(valore); return true; }
    if ((m = /^zauber(\d)_\d+$/i.exec(raw)) || (m = /^(?:spell|incantesimo)s?(?:level|lvl|liv)?(\d)[_\s-]*\d+$/i.exec(raw.replace(/\s+/g, '')))) { (dopo.inc[+m[1]] ||= []).push(valore); return true; }
    // liste numerate: lingue, strumenti, equipaggiamento, privilegi
    if (/^(sprache|language|lingua|linguaggio)\d+$/.test(k)) { f.langs1 = (f.langs1 ? f.langs1 + ', ' : '') + valore; return true; }
    if (/^(werkzeugundandere|tool|strumento)\d+$/.test(k)) { f.prof_text1 = (f.prof_text1 ? f.prof_text1 + '\n' : '') + valore; return true; }
    if (/^(inventar|equipment|inventory|equip|equipaggiamento|oggetto)\d+$/.test(k)) { f.equip = (f.equip ? f.equip + '\n' : '') + valore; return true; }
    if (/^(inventaranz|inventargew|qty|weight)\d+$/.test(k)) return true;
    if (/^(klassenmerkmale|feature|features|privilegio|privilegi|trait|tratti)\d+$/.test(k)) { f.features = (f.features ? f.features + '\n' : '') + valore; return true; }
    // competenze scritte con una lettera («P», «E», «•») invece che con una casella
    const ab = abilitaIn(k);
    if (ab) {
      const resto = k.slice(k.indexOf(NOMI_ABILITA[ab].find(x => k.startsWith(x))) + NOMI_ABILITA[ab].find(x => k.startsWith(x)).length);
      if (/^(exp|expertise|maestria|e)$/.test(resto)) { if (SEGNO.test(String(valore).trim())) f['ke_' + ab] = '1'; return true; }
      if (/^(prof|proficiency|comp|competenza|p|check|cb)$/.test(resto)) {
        const v = String(valore).trim();
        if (/^e$/i.test(v)) f['ke_' + ab] = '1'; else if (SEGNO.test(v)) f['kp_' + ab] = '1';
        return true;
      }
      if (/^(mod|bonus|total|tot|[a-z]{3})?$/.test(resto) && /^[+-]?\d+$/.test(String(valore).trim())) return true;   // il totale: lo ricalcola la scheda
    }
    const car = carIn(k);
    if (car) {
      const [id, resto] = car, v = String(valore).trim();
      if (/^(prof|stprof|saveprof|tsprof|tscomp|savingthrowprof|rwprof)$/.test(resto)) { if (SEGNO.test(v)) f['sp_' + id] = '1'; return true; }
      if (/^(mod|modifier|modificatore|ts|st|save|rw|savingthrow|tirosalvezza|scoremod|bonus)$/.test(resto) && /^[+-]?\d*$/.test(v)) return true;
      if (/^(score|punteggio|valore|value|stat)?$/.test(resto) && /^\d{1,2}$/.test(v)) { f[id] = v; return true; }
    }
    if ((m = /^(?:st|ts|save|tiro?salvezza)([a-z]+)$/.exec(k)) && carIn(m[1]) && /^[+-]?\d*$/.test(String(valore).trim())) return true;
    // parole chiave dentro nomi più lunghi
    const hpw = /(hp|hitpoint|pf|puntiferita|trefferpunkte|pv)/;
    if (hpw.test(k) && /(max|massim)/.test(k)) { f.hpmax = valore; return true; }
    if (hpw.test(k) && /(temp)/.test(k)) { f.hpt = valore; return true; }
    if (hpw.test(k) && /(current|attual|akt|now)/.test(k)) { f.hp = valore; return true; }
    if (/^(armorclass|classearmatura|ruestungsklasse|rustungsklasse)/.test(k)) { f.ac = valore; return true; }
    if (/^(passive|passiv|percezionepassiva|saggezzapassiva)/.test(k) || /^(deathsave|tsmorte|rwerfolg|rwfehlschlag)/.test(k) || /^(insp|ispirazione)/.test(k)) return true;
    return false;
  }

  const AREE = new Set(['traits', 'ideals', 'bonds', 'flaws', 'features', 'prof_text1', 'langs1', 'equip', 'faction_text', 'extra', 'notes', 'spells', 'known', 'cantrips', 'classf', 'racial', 'feats']);

  let caricata = null;
  function libreria() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    return caricata || (caricata = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'lib/pdf-lib.min.js';
      s.onload = () => window.PDFLib ? ok(window.PDFLib) : no(new Error('pdf-lib'));
      s.onerror = () => { caricata = null; no(new Error(tr('non riesco a caricare il lettore di PDF'))); };
      document.head.appendChild(s);
    }));
  }

  // Da un elenco di campi { nome, valore } (testo o true/false) alla scheda.
  function schedaDaCampi(campi, nomeFile) {
    const f = {}, avanzi = [], incantesimi = [], dopo = { rimasti: {}, inc: {} };
    let nome = '';
    const metti = (k, v) => {
      if (AREE.has(k) && f[k]) f[k] += '\n' + v; else f[k] = v;
    };
    for (const { nome: n, valore } of campi) {
      // «libre_<chiave>» (con «__2», «__3»… se lo stesso spazio continua altrove) va dritto nella scheda
      const diretto = /^libre_([a-z0-9_]+?)(?:__\d+)?$/.exec(String(n));
      if (diretto) {
        if (typeof valore === 'boolean') { if (valore) f[diretto[1]] = '1'; continue; }
        const v = String(valore || '').trim();
        if (v) metti(diretto[1], v);
        continue;
      }
      const k = norm(n);
      if (typeof valore === 'boolean') {
        if (CASELLE[k]) { if (valore) f[CASELLE[k]] = '1'; continue; }
        if (valore) riconosci(n, k, 'x', f, dopo);
        continue;
      }
      const v = String(valore || '').trim();
      if (!v) continue;
      const dove = CAMPI[k];
      if (dove === 'name') { nome = v; continue; }
      if (dove === 'classlevel') {                       // «Guerriero 3» → classe e livello
        const m = /^(.*?)[\s,/]*(\d{1,2})\s*$/.exec(v);
        if (m && m[1]) { f.class = m[1].trim(); f.level = m[2]; } else f.class = v;
        continue;
      }
      if (dove) { metti(dove, v); continue; }
      if (riconosci(n, k, v, f, dopo)) continue;
      avanzi.push(`${n}: ${v}`);
    }
    // caselle rimaste → caselle spese; incantesimi al loro livello
    for (const [L, r] of Object.entries(dopo.rimasti)) { const tot = parseInt(f['sl' + L + 't'], 10); if (tot > 0 && r >= 0) f['sl' + L + 'u'] = String(Math.max(0, tot - r)); }
    for (const [L, lista] of Object.entries(dopo.inc)) {
      const dove = L === '0' ? 'cantrips' : L === 'x' ? 'known' : 'sp' + L;
      f[dove] = (f[dove] ? f[dove] + '\n' : '') + lista.join('\n');
    }
    if (f.spells) { f.known = (f.known ? f.known + '\n' : '') + f.spells; delete f.spells; }
    if (incantesimi.length) f.known = (f.known ? f.known + '\n' : '') + incantesimi.join('\n');
    if (avanzi.length) f.notes = (f.notes ? f.notes + '\n\n' : '') + avanzi.join('\n');
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) if (f[k]) f[k] = String(parseInt(f[k], 10) || f[k]);
    if (!f.level) f.level = '1';
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) if (!f[k]) f[k] = '10';
    return { name: (nome || String(nomeFile || '').replace(/\.pdf$/i, '') || tr('Personaggio')).slice(0, 40), tpl: 'dnd5e', f, avanzi: avanzi.length };
  }
  window.schedaDaCampiPdf = schedaDaCampi;

  async function leggiPdf(buf) {
    const L = await libreria();
    const doc = await L.PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    let campi = [];
    try { campi = doc.getForm().getFields(); } catch { campi = []; }
    return campi.map(c => {
      const nome = c.getName(), tipo = c.constructor && c.constructor.name;
      try {
        if (c instanceof L.PDFCheckBox) return { nome, valore: c.isChecked() };
        if (c instanceof L.PDFTextField) return { nome, valore: c.getText() || '' };
        if (c instanceof L.PDFDropdown || c instanceof L.PDFOptionList) return { nome, valore: (c.getSelected() || []).join(', ') };
        if (c instanceof L.PDFRadioGroup) return { nome, valore: c.getSelected() || '' };
      } catch {}
      return { nome, valore: '', tipo };
    });
  }

  // Il testo delle pagine, con la posizione di ogni pezzo (per le stampe senza campi, es. Roll20)
  let pdfjs = null;
  async function testoPagine(buf) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdfjs.min.js', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs.worker.min.js', location.href).href;
    }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const pagine = [];
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      pagine.push({ w: vp.width, h: vp.height, items: tc.items.filter(i => i.str && i.str.trim()).map(i => {
        const fs = Math.hypot(i.transform[2], i.transform[3]) || i.height || 8;
        return { s: i.str, x0: i.transform[4], x1: i.transform[4] + i.width, y1: vp.height - i.transform[5], y0: vp.height - i.transform[5] - fs };
      }) });
    }
    return pagine;
  }
  // Le etichette delle schede più diffuse (inglese 2014 e 2024, D&D Beyond, italiano, tedesco) e il valore
  // più vicino: un numero per le statistiche, il testo sopra l'etichetta per nome, classe e specie.
  const ETICHETTE = [
    ['str', /^(strength|forza|st[äa]rke|str|for)$/i, 'car'], ['dex', /^(dexterity|destrezza|geschicklichkeit|dex|des)$/i, 'car'],
    ['con', /^(constitution|costituzione|konstitution|con|cos)$/i, 'car'], ['int', /^(intelligence|intelligenza|intelligenz|int)$/i, 'car'],
    ['wis', /^(wisdom|saggezza|weisheit|wis|sag)$/i, 'car'], ['cha', /^(charisma|carisma|cha|car)$/i, 'car'],
    ['ac', /^(armou?r\s*class|classe\s*(d['’]\s*)?armatura|r[üu]stungsklasse|ca|ac)$/i, 'num'],
    ['hpmax', /^(hit\s*point\s*maximum|max(imum)?\s*h(it\s*)?p(oints)?|punti\s*ferita\s*massimi|pf\s*massimi|trefferpunktemaximum)$/i, 'num'],
    ['hp', /^(current\s*hit\s*points|current\s*hp|punti\s*ferita\s*attuali|pf\s*attuali)$/i, 'num'],
    ['speed', /^(speed|velocit[àa]|bewegungsrate)$/i, 'testo'], ['profb', /^(proficiency\s*bonus|bonus\s*(di\s*)?competenza|[üu]bungsbonus)$/i, 'num'],
    ['initb', /^(initiative|iniziativa)$/i, 'num'],
    ['name', /^(character\s*name|nome\s*(del\s*)?personaggio|charaktername)$/i, 'sopra'],
    ['classlevel', /^(class\s*(&|and)?\s*level|classe\s*(e)?\s*livello|klasse\s*und\s*stufe)$/i, 'sopra'],
    ['race', /^(race|species|razza|specie|volk)$/i, 'sopra'], ['bg', /^(background|hintergrund)$/i, 'sopra'],
    ['align', /^(alignment|allineamento|gesinnung)$/i, 'sopra'], ['player', /^(player\s*name|nome\s*(del\s*)?giocatore|spielername)$/i, 'sopra']
  ];
  function leggiEtichette(pagine) {
    const f = {}; let nome = '', n = 0;
    const pulito = s => String(s).replace(/\s+/g, ' ').trim();
    for (const pg of pagine.slice(0, 4)) {
      const it = pg.items.map(i => ({ ...i, t: pulito(i.s), cx: (i.x0 + i.x1) / 2, cy: (i.y0 + i.y1) / 2 }));
      const etich = new Set();
      for (const [k, re, modo] of ETICHETTE) {
        if (f[k] || (k === 'name' && nome)) continue;
        const lab = it.find(i => re.test(i.t)); if (!lab) continue;
        etich.add(lab);
        const vicini = it.filter(i => i !== lab && !ETICHETTE.some(e => e[1].test(i.t)))
          .map(i => ({ i, d: Math.hypot(i.cx - lab.cx, i.cy - lab.cy) })).sort((a, b) => a.d - b.d);
        let v = null;
        if (modo === 'car') v = vicini.find(x => x.d < 70 && /^\d{1,2}$/.test(x.i.t) && +x.i.t >= 1 && +x.i.t <= 30);
        else if (modo === 'num') v = vicini.find(x => x.d < 70 && /^[+-]?\d{1,3}$/.test(x.i.t));
        else if (modo === 'testo') v = vicini.find(x => x.d < 70 && /\d/.test(x.i.t));
        else v = vicini.find(x => x.d < 60 && x.i.cy < lab.cy + 2 && /[a-zà-ÿ]/i.test(x.i.t) && x.i.t.length < 60);
        if (!v) continue;
        const val = v.i.t.replace(/^\+/, k === 'initb' || k === 'profb' ? '' : '');
        if (k === 'name') nome = val;
        else if (k === 'classlevel') { const m = /^(.*?)[\s,/]*(\d{1,2})\s*$/.exec(val); if (m && m[1]) { f.class = m[1].trim(); f.level = m[2]; } else f.class = val; }
        else f[k] = k === 'initb' || k === 'profb' ? String(parseInt(val, 10)) : val;
        n++;
      }
    }
    const car = ['str', 'dex', 'con', 'int', 'wis', 'cha'].filter(k => f[k]).length;
    if (n < 4 || (car < 3 && !(f.ac && f.hpmax))) return null;
    if (!f.level) f.level = '1';
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) if (!f[k]) f[k] = '10';
    return { name: (nome || tr('Personaggio')).slice(0, 40), tpl: 'dnd5e', f, campi: n };
  }
  window.leggiEtichettePdf = leggiEtichette;

  function crea(c, avviso) {
    const s = { id: uid(), icon: null, name: c.name, tpl: c.tpl, f: c.f };
    sheets.push(s); renderSheetList(); scheduleSheets();
    if (typeof onSheetCreated === 'function') onSheetCreated(s);
    $('sheetDialog').close();
    openSheet(s.id);
    if (typeof avvisoScheda === 'function') avvisoScheda(avviso.replace('{nome}', s.name));
  }

  async function importa(file) {
    let buf, campi;
    try { buf = await file.arrayBuffer(); campi = await leggiPdf(buf.slice(0)); }
    catch (e) { alert(tr('Non riesco a leggere questo PDF: {e}', { e: e.message })); return; }
    // 1. un PDF compilabile: si leggono i campi
    if (campi.some(c => c.valore === true || (typeof c.valore === 'string' && c.valore.trim()))) {
      const c = schedaDaCampi(campi, file.name);
      crea(c, c.avanzi ? tr('Scheda «{nome}» importata dal PDF. {n} campi che non so dove mettere sono nelle Note.', { nome: '{nome}', n: c.avanzi })
        : tr('Scheda «{nome}» importata dal PDF.', { nome: '{nome}' }));
      return;
    }
    // 2. una stampa (senza campi): si legge il testo e si prova a riconoscere la scheda di Roll20
    let pagine;
    try { pagine = await testoPagine(buf); }
    catch (e) { alert(tr('Non riesco a leggere questo PDF: {e}', { e: e.message })); return; }
    const testo = pagine.map(p => p.items.map(i => i.s).join(' ')).join('\n').trim();
    if (!testo) {
      alert(tr('In questo PDF non c\'è testo: probabilmente è una foto o una scansione. Non lo posso leggere; la scheda va ricopiata a mano.'));
      return;
    }
    const r = typeof leggiRoll20 === 'function' ? leggiRoll20(pagine) : null;
    if (r) {
      const righe = [tr('Ho riconosciuto una scheda di Roll20 stampata in PDF:'), '',
        `${r.name} · ${[r.f.class, r.f.level && tr('livello {n}', { n: r.f.level })].filter(Boolean).join(' ')}`,
        tr('{n} campi letti (caratteristiche, competenze, attacchi, equipaggiamento, privilegi, incantesimi).', { n: r.campi })];
      if (r.avvisi.length) righe.push('', tr('Da controllare dopo:'), ...r.avvisi.slice(0, 6).map(a => '· ' + a));
      righe.push('', tr('Le competenze sono ricavate dai numeri (i pallini della stampa non si leggono): dai un\'occhiata alla scheda dopo l\'import.'), '', tr('Importo la scheda?'));
      if (!confirm(righe.join('\n'))) return;
      crea(r, tr('Scheda «{nome}» importata dalla stampa di Roll20: controlla che i valori siano giusti.', { nome: '{nome}' }));
      return;
    }
    // 3. una stampa di un'altra scheda (D&D Beyond, ufficiale 2014/2024, schede italiane): si cercano le etichette
    const g = leggiEtichette(pagine);
    if (g) {
      const righe = [tr('Ho letto la stampa cercando le etichette della scheda (Classe Armatura, Punti Ferita, Forza…):'), '',
        `${g.name} · ${tr('{n} valori trovati', { n: g.campi })}`, '', tr('Tutto il testo del PDF va comunque nelle Note, così puoi controllare.'), '', tr('Importo la scheda?')];
      if (confirm(righe.join('\n'))) {
        g.f.notes = testo.slice(0, 30000);
        crea(g, tr('Scheda «{nome}» importata dalla stampa: controlla che i valori siano giusti.', { nome: '{nome}' }));
        return;
      }
    }
    // 4. un PDF che non so leggere: chiedo prima di fare qualcosa
    if (!confirm(tr('Questo PDF non ha campi compilabili e non è una stampa di Roll20 che conosco, quindi non so dove mettere i valori.\n\nPosso creare una scheda vuota con tutto il testo del PDF nelle Note, da sistemare a mano. Vuoi farlo?'))) return;
    crea({ name: String(file.name || '').replace(/\.pdf$/i, '').slice(0, 40) || tr('Personaggio'), tpl: 'dnd5e',
      f: { level: '1', str: '10', dex: '10', con: '10', int: '10', wis: '10', cha: '10', notes: testo.slice(0, 30000) } },
      tr('Scheda «{nome}» creata: il testo del PDF è nelle Note.', { nome: '{nome}' }));
  }

  // il pulsante nella finestra «Nuova scheda», accanto a «Importa da un file»
  const imp = document.getElementById('sheetImport');
  if (imp) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'sheetImportPdf'; b.className = 'btn ghost';
    b.title = 'Una scheda in PDF: compilabile (ufficiale 2014, MorePurpleMoreBetter, schede italiane e tedesche e di altri siti) o stampata (Roll20 e altri)';
    b.textContent = '📄 Da un PDF…';
    imp.after(b);
    b.addEventListener('click', () => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = '.pdf,application/pdf';
      i.onchange = () => { const f = i.files && i.files[0]; if (f) importa(f); };
      i.click();
    });
  }
})();
