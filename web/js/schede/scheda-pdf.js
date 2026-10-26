// Importare una scheda da un PDF compilabile (quelli con i campi da riempire, come la scheda
// ufficiale di D&D 5e). Si legge il valore di ogni campo e lo si mette nella scheda Open D&D 5e;
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
  const AREE = new Set(['traits', 'ideals', 'bonds', 'flaws', 'features', 'prof_text1', 'langs1', 'equip', 'faction_text', 'extra', 'notes', 'spells', 'classf', 'racial', 'feats']);

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
    const f = {}, avanzi = [], incantesimi = [];
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
      if (typeof valore === 'boolean') { if (CASELLE[k] && valore) f[CASELLE[k]] = '1'; continue; }
      const v = String(valore || '').trim();
      if (!v) continue;
      if (/^spells\d+$/.test(k)) { incantesimi.push(v); continue; }
      const dove = CAMPI[k];
      if (dove === 'name') { nome = v; continue; }
      if (dove === 'classlevel') {                       // «Guerriero 3» → classe e livello
        const m = /^(.*?)[\s,/]*(\d{1,2})\s*$/.exec(v);
        if (m && m[1]) { f.class = m[1].trim(); f.level = m[2]; } else f.class = v;
        continue;
      }
      if (dove) { metti(dove, v); continue; }
      avanzi.push(`${n}: ${v}`);
    }
    if (incantesimi.length) f.spells = (f.spells ? f.spells + '\n' : '') + incantesimi.join('\n');
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
    // 3. un PDF che non so leggere: chiedo prima di fare qualcosa
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
    b.title = 'Una scheda in PDF: compilabile (come la scheda ufficiale di D&D 5e) o stampata da Roll20';
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
