// ---------- ＋ Nuova voce: moduli guidati per ogni tipo del compendio ----------
// Ogni tipo ha esattamente i campi che usano la creazione guidata, le schede e il compendio, con una
// spiegazione e un esempio. Il modulo legge una voce (anche una di base, per farne una copia) e la
// riscrive nello stesso formato dei pacchetti (vedi sviluppo/strumenti/srd/converti.js).
// compendio.js lo usa così: const m = compendioModulo(voce); dlg.append(m.el); …; m.leggi(voce).
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CAR = [['str', 'FOR'], ['dex', 'DES'], ['con', 'COS'], ['int', 'INT'], ['wis', 'SAG'], ['cha', 'CAR']];
  const ABIL = [['acro', 'Acrobazia'], ['anim', 'Addestrare animali'], ['arca', 'Arcano'], ['athl', 'Atletica'], ['dece', 'Inganno'], ['hist', 'Storia'], ['insi', 'Intuizione'], ['inti', 'Intimidire'], ['inve', 'Indagare'], ['medi', 'Medicina'], ['natu', 'Natura'], ['perception', 'Percezione'], ['perf', 'Intrattenere'], ['pers', 'Persuasione'], ['reli', 'Religione'], ['slei', 'Rapidità di mano'], ['stea', 'Furtività'], ['surv', 'Sopravvivenza']];
  const TAGLIE = ['Minuscola', 'Piccola', 'Media', 'Grande', 'Enorme', 'Mastodontica'];
  const SCUOLE = ['Abiurazione', 'Ammaliamento', 'Divinazione', 'Evocazione', 'Illusione', 'Invocazione', 'Necromanzia', 'Trasmutazione'];
  const RARITA = ['Comune', 'Non comune', 'Raro', 'Molto raro', 'Leggendario', 'Artefatto', 'Varia'];
  const TIPI_DANNO = ['Acido', 'Contundente', 'Freddo', 'Fuoco', 'Forza', 'Fulmine', 'Necrotico', 'Perforante', 'Psichico', 'Radioso', 'Tagliente', 'Tuono', 'Veleno'];
  // caselle incantesimo per livello del personaggio (1-20) e per livello d'incantesimo (1-9)
  const SLOT_PIENO = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
  const slotPer = (prog, liv) => {
    if (prog === 'piena') return SLOT_PIENO[liv - 1] || [];
    if (prog === 'mezza') return liv < 2 ? [] : SLOT_PIENO[Math.ceil(liv / 2) - 1] || [];
    if (prog === 'terzo') return liv < 3 ? [] : SLOT_PIENO[Math.ceil(liv / 3) - 1] || [];
    return [];
  };
  const progDa = v => {                                         // la progressione di una classe che c'è già
    const l = (v.livelli || []).map(x => x.incantesimi || {});
    if (!l.length || !l.some(x => x.spell_slots_level_1)) return '';
    const a = +(l[0] || {}).spell_slots_level_1 || 0, b = +(l[1] || {}).spell_slots_level_1 || 0;
    return a ? 'piena' : b ? 'mezza' : 'terzo';
  };

  // ---------- i pezzi del modulo ----------
  // [chiave, tipo, etichetta, aiuto/esempio, extra]
  const MODULI = {
    mostro: [
      ['taglia', 'sel', 'Taglia', '', TAGLIE], ['tipoCreatura', 't', 'Tipo', 'es. Bestia, Non morto, Drago'], ['allineamento', 't', 'Allineamento', 'es. caotico malvagio'],
      ['ca', 'n', 'Classe armatura', 'es. 15'], ['caNota', 't', 'Nota sulla CA', 'es. armatura naturale'], ['pf', 'n', 'Punti ferita', 'es. 45'], ['dadiPf', 't', 'Dadi PF', 'es. 6d10+12'],
      ['velocita', 't', 'Velocità', 'es. 30 ft., volare 60 ft.'], ['car', 'car6', 'Caratteristiche', 'i punteggi (10 = nella media)'],
      ['ts', 'car6b', 'Tiri salvezza', 'il bonus totale, solo quelli con competenza'], ['abilitaTesto', 't', 'Abilità', 'es. Percezione +5, Furtività +4'],
      ['resistenze', 't', 'Resistenze ai danni', 'es. Fuoco, Contundente'], ['immunita', 't', 'Immunità ai danni', 'es. Veleno'], ['vulnerabilita', 't', 'Vulnerabilità ai danni', 'es. Fuoco'], ['immCondizioni', 't', 'Immunità alle condizioni', 'es. Avvelenato, Affascinato'],
      ['sensi', 't', 'Sensi', 'es. Scurovisione 60 ft., Percezione passiva 13'], ['lingue', 't', 'Linguaggi', 'es. Comune, Draconico'], ['gs', 't', 'Grado di sfida', 'es. 3 o 1/4'], ['px', 'n', 'PX', 'es. 700'],
      ['tratti', 'righe', 'Tratti', 'le capacità sempre attive'], ['azioni', 'righe', 'Azioni', 'gli attacchi: scrivi i tiri come [[1d20+5 | Morso]] e [[2d6+3 perforanti]]'], ['azioniBonus', 'righe', 'Azioni bonus', ''],
      ['reazioni', 'righe', 'Reazioni', ''], ['leggendarie', 'righe', 'Azioni leggendarie', '']
    ],
    incantesimo: [
      ['livello', 'n', 'Livello', '0 = trucchetto'], ['scuola', 'sel', 'Scuola', '', SCUOLE], ['tempo', 't', 'Tempo di lancio', 'es. 1 azione'], ['gittata', 't', 'Gittata', 'es. 36 metri, Contatto, Se stesso'],
      ['componenti', 't', 'Componenti', 'es. V, S, M (un pizzico di zolfo)'], ['durata', 't', 'Durata', 'es. Concentrazione, fino a 1 minuto'],
      ['concentrazione', 'check', 'Concentrazione'], ['rituale', 'check', 'Rituale'],
      ['danni', 't', 'Danni', 'es. 8d6 fuoco (diventa un pulsante)'], ['ts', 'sel', 'Tiro salvezza', '', ['', ...CAR.map(c => c[0])]],
      ['classi', 'l', 'Classi', 'separate da virgole: es. Mago, Stregone'], ['superiore', 'area', 'A livelli superiori', 'es. +1d6 per ogni livello sopra il 3°']
    ],
    oggetto: [
      ['categoria', 't', 'Categoria', 'es. Arma, Armatura, Oggetto meraviglioso, Pozione'], ['rarita', 'sel', 'Rarità', '', ['', ...RARITA]], ['sintonia', 'check', 'Richiede sintonia'],
      ['costo', 't', 'Costo', 'es. 50 mo'], ['peso', 'n', 'Peso (lb)', 'es. 3'], ['danno', 't', 'Danni (armi)', 'es. 1d8'], ['tipoDanno', 'sel', 'Tipo di danno', '', ['', ...TIPI_DANNO]],
      ['proprieta', 'l', 'Proprietà', 'separate da virgole: es. Versatile (1d10), Accurata'], ['ca', 'n', 'Classe armatura', 'es. 14'], ['bonus', 'n', 'Bonus magico', 'es. 1 per un\'arma +1']
    ],
    talento: [['categoria', 't', 'Categoria', 'es. Generale, Origine, Stile di combattimento'], ['prerequisiti', 't', 'Prerequisiti', 'es. FOR 13 o 4° livello'], ['aumenti', 'aumenti', 'Aumenti di caratteristica', 'es. +1 FOR']],
    classe: [
      ['dadoVita', 'n', 'Dado vita', 'es. 8 per un d8'], ['ts', 'carSel', 'Tiri salvezza con competenza', 'di solito due'],
      ['competenze', 'l', 'Competenze', 'armi, armature, strumenti, separate da virgole: es. Armature leggere, Armi semplici'],
      ['sceltaAbilita', 'sceltaAb', 'Abilità a scelta', 'quante ne sceglie il giocatore e tra quali'],
      ['equipaggiamento', 'area', 'Equipaggiamento iniziale', 'una cosa per riga'],
      ['incantatore', 'sel', 'Caratteristica da incantatore', 'vuoto se non lancia incantesimi', ['', ...CAR.map(c => c[0])]],
      ['_prog', 'sel', 'Caselle incantesimo', 'quante ne ha a ogni livello', ['', 'piena', 'mezza', 'terzo']],
      ['sottoclassi', 'l', 'Sottoclassi', 'i nomi, separati da virgole'],
      ['_privilegi', 'righeLiv', 'Privilegi per livello', 'ogni privilegio con il livello in cui si ottiene']
    ],
    sottoclasse: [['classe', 'classe', 'Classe', 'la classe a cui appartiene'], ['famiglia', 't', 'Gruppo', 'es. Cammino primordiale, Tradizione arcana'], ['privilegi', 'righeLiv', 'Privilegi per livello', '']],
    specie: [
      ['taglia', 'sel', 'Taglia', '', TAGLIE], ['velocita', 'n', 'Velocità (ft)', 'es. 30'], ['scurovisione', 'n', 'Scurovisione (ft)', '0 se non ce l\'ha, es. 60'],
      ['aumenti', 'aumenti', 'Aumenti di caratteristica fissi', 'regole del 2014: es. +2 DES, +1 SAG'],
      ['aumentiScelta', 'sceltaAum', 'Aumenti a scelta', 'es. +1 a due caratteristiche a scelta'],
      ['abilitaScelta', 'n', 'Abilità a scelta (quante)', 'es. 1'], ['talentoScelta', 'n', 'Talenti a scelta (quanti)', 'es. 1'],
      ['lingue', 'l', 'Linguaggi', 'separati da virgole: es. Comune, Elfico'], ['competenze', 'l', 'Competenze', 'separate da virgole'],
      ['tratti', 'righe', 'Tratti', 'ogni tratto con il suo nome']
    ],
    background: [
      ['abilita', 'abil', 'Abilità con competenza', 'di solito due'], ['caratteristiche', 'carSel', 'Caratteristiche che può aumentare', 'regole del 2024: di solito tre'],
      ['talento', 't', 'Talento di origine', 'regole del 2024: es. Allerta'], ['competenze', 'l', 'Altre competenze', 'strumenti e linguaggi, separati da virgole'],
      ['equipaggiamento', 'area', 'Equipaggiamento', ''], ['privilegio', 'uno', 'Privilegio', 'regole del 2014']
    ],
    condizione: [], regola: []
  };
  window.COMPENDIO_MODULI = MODULI;

  // ---------- disegnare un campo ----------
  const lab = (k, l, aiuto, dentro, cl = '') => `<label class="cm${cl}" data-k="${k}"><span>${esc(tr(l))}</span>${dentro}${aiuto ? `<small>${esc(tr(aiuto))}</small>` : ''}</label>`;
  const blocco = (k, l, aiuto, dentro) => `<fieldset class="cmB" data-k="${k}"><legend>${esc(tr(l))}</legend>${aiuto ? `<small>${esc(tr(aiuto))}</small>` : ''}${dentro}</fieldset>`;
  const riga = (r, conLiv) => `<div class="cmR">${conLiv ? `<input class="cmL" type="number" min="1" max="20" value="${esc(r.livello ?? '')}" placeholder="${esc(tr('Liv.'))}" aria-label="${esc(tr('Livello'))}">` : ''}<input class="cmN" value="${esc(r.nome || '')}" placeholder="${esc(tr('Nome'))}" aria-label="${esc(tr('Nome'))}"><button type="button" class="btn ghost cmVia" title="${esc(tr('Togli'))}" aria-label="${esc(tr('Togli'))}">✕</button><textarea class="cmT" rows="3" placeholder="${esc(tr('Testo'))}" aria-label="${esc(tr('Testo'))}">${esc(r.testo || '')}</textarea></div>`;
  function campo([k, t, l, aiuto, extra], v) {
    const x = v[k];
    switch (t) {
      case 'n': return lab(k, l, aiuto, `<input type="number" step="any" value="${esc(x ?? '')}">`);
      case 'l': return lab(k, l, aiuto, `<input value="${esc(Array.isArray(x) ? x.join(', ') : x ?? '')}">`, ' cmW');
      case 'area': return lab(k, l, aiuto, `<textarea rows="3">${esc(Array.isArray(x) ? x.join('\n') : x ?? '')}</textarea>`, ' cmW');
      case 'check': return `<label class="check cmC" data-k="${k}"><input type="checkbox" ${x ? 'checked' : ''}> ${esc(tr(l))}</label>`;
      case 'sel': {
        const val = k === '_prog' ? progDa(v) : x ?? '';
        const nomi = { piena: tr('Incantatore completo (mago, chierico…)'), mezza: tr('Mezzo incantatore (paladino, ranger)'), terzo: tr('Un terzo (cavaliere mistico…)'), '': '—' };
        const carN = Object.fromEntries(CAR), opz = val !== '' && !extra.map(String).includes(String(val)) ? [...extra, val] : extra;
        return lab(k, l, aiuto, `<select>${opz.map(o => `<option value="${esc(o)}" ${String(o) === String(val) ? 'selected' : ''}>${esc(k === '_prog' ? nomi[o] : carN[o] ? carN[o] : o ? tr(o) : '—')}</option>`).join('')}</select>`);
      }
      case 'classe': {
        const cl = (window.COMPENDIO && COMPENDIO.voci || []).filter(c => c.tipo === 'classe').map(c => c.nome);
        if (x && !cl.includes(x)) cl.unshift(x);
        return lab(k, l, aiuto, `<input list="cmClassi" value="${esc(x ?? '')}"><datalist id="cmClassi">${[...new Set(cl)].map(c => `<option value="${esc(c)}">`).join('')}</datalist>`);
      }
      case 'car6': case 'car6b': return blocco(k, l, aiuto, `<div class="cmCar">${CAR.map(([c, n]) => `<label><span>${n}</span><input type="number" data-c="${c}" value="${esc(x && x[c] != null ? x[c] : '')}" placeholder="${t === 'car6' ? '10' : ''}"></label>`).join('')}</div>`);
      case 'carSel': return blocco(k, l, aiuto, `<div class="cmCheck">${CAR.map(([c, n]) => `<label class="check"><input type="checkbox" data-c="${c}" ${(x || []).includes(c) ? 'checked' : ''}> ${n}</label>`).join('')}</div>`);
      case 'abil': return blocco(k, l, aiuto, `<div class="cmCheck">${ABIL.map(([c, n]) => `<label class="check"><input type="checkbox" data-c="${c}" ${(x || []).includes(c) ? 'checked' : ''}> ${esc(tr(n))}</label>`).join('')}</div>`);
      case 'aumenti': { const m = Object.fromEntries((x || []).map(a => [a.car, a.bonus])); return blocco(k, l, aiuto, `<div class="cmCar">${CAR.map(([c, n]) => `<label><span>${n}</span><input type="number" min="-4" max="4" data-c="${c}" value="${esc(m[c] ?? '')}" placeholder="0"></label>`).join('')}</div>`); }
      case 'sceltaAum': return blocco(k, l, aiuto, `<div class="cmRiga2"><label>${esc(tr('Quante caratteristiche'))}<input type="number" min="0" max="6" data-c="quante" value="${esc(x ? x.quante : '')}" placeholder="0"></label><label>${esc(tr('Di quanto'))}<input type="number" min="1" max="2" data-c="bonus" value="${esc(x ? x.bonus || 1 : '')}" placeholder="1"></label></div>`);
      case 'sceltaAb': { const s = (x || [])[0] || {}; return blocco(k, l, aiuto, `<label class="cmQ">${esc(tr('Quante'))}<input type="number" min="0" max="8" data-c="quante" value="${esc(s.quante ?? '')}" placeholder="0"></label><div class="cmCheck">${ABIL.map(([c, n]) => `<label class="check"><input type="checkbox" data-c="${c}" ${(s.tra || []).includes(c) ? 'checked' : ''}> ${esc(tr(n))}</label>`).join('')}</div>`); }
      case 'uno': return blocco(k, l, aiuto, `<div class="cmRighe">${riga(x || {}, false)}</div>`);
      case 'righe': case 'righeLiv': {
        const conLiv = t === 'righeLiv';
        let righe = x || [];
        if (k === '_privilegi') righe = (v.livelli || []).flatMap(lv => (lv.privilegi || []).map(p => ({ ...p, livello: lv.livello })));
        return blocco(k, l, aiuto, `<div class="cmRighe" data-liv="${conLiv ? 1 : ''}">${righe.map(r => riga(r, conLiv)).join('')}</div><button type="button" class="btn ghost cmPiu">＋ ${esc(tr('Aggiungi'))}</button>`);
      }
      default: return lab(k, l, aiuto, `<input value="${esc(x ?? '')}">`);
    }
  }

  // ---------- leggere un campo ----------
  const num = s => { const t = String(s ?? '').trim().replace(',', '.'); return t === '' || isNaN(+t) ? undefined : +t; };
  const vuoto = x => x == null || x === '' || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);
  const leggiRighe = box => [...box.querySelectorAll(':scope > .cmR')].map(r => ({ livello: r.querySelector('.cmL') ? num(r.querySelector('.cmL').value) : undefined, nome: r.querySelector('.cmN').value.trim(), testo: r.querySelector('.cmT').value.trim() })).filter(r => r.nome || r.testo);
  function leggiCampo([k, t], el, v) {
    if (!el) return;
    const inp = el.querySelector('input, select, textarea');
    let x;
    switch (t) {
      case 'n': x = num(inp.value); break;
      case 'l': x = inp.value.split(/[,;]/).map(s => s.trim()).filter(Boolean); break;
      case 'check': x = inp.checked || undefined; break;
      case 'car6': case 'car6b': x = {}; for (const i of el.querySelectorAll('input[data-c]')) { const n = num(i.value); if (n != null) x[i.dataset.c] = n; } break;
      case 'carSel': case 'abil': x = [...el.querySelectorAll('input[data-c]:checked')].map(i => i.dataset.c); break;
      case 'aumenti': x = [...el.querySelectorAll('input[data-c]')].map(i => ({ car: i.dataset.c, bonus: num(i.value) })).filter(a => a.bonus); break;
      case 'sceltaAum': { const q = num(el.querySelector('[data-c=quante]').value); x = q ? { quante: q, bonus: num(el.querySelector('[data-c=bonus]').value) || 1 } : undefined; break; }
      case 'sceltaAb': { const q = num(el.querySelector('[data-c=quante]').value), tra = [...el.querySelectorAll('.cmCheck input:checked')].map(i => i.dataset.c); x = q ? [{ quante: q, tra: tra.length ? tra : ABIL.map(a => a[0]) }] : undefined; break; }
      case 'uno': { const r = leggiRighe(el.querySelector('.cmRighe'))[0]; x = r ? { nome: r.nome, testo: r.testo } : undefined; break; }
      case 'righe': x = leggiRighe(el.querySelector('.cmRighe')).map(({ nome, testo }) => ({ nome, testo })); break;
      case 'righeLiv': x = leggiRighe(el.querySelector('.cmRighe')).sort((a, b) => (a.livello || 1) - (b.livello || 1)); break;
      default: x = inp.value.trim();
    }
    if (k === '_prog' || k === '_privilegi') { v[k] = x; return; }
    if (vuoto(x)) delete v[k]; else v[k] = x;
  }

  // le righe dei privilegi e le caselle incantesimo diventano i 20 livelli della classe
  function livelliClasse(v, privilegi, prog) {
    const vecchi = v.livelli || [];
    const out = [];
    for (let l = 1; l <= 20; l++) {
      const prima = vecchi.find(x => x.livello === l) || {};
      const lv = { livello: l, competenza: 2 + Math.floor((l - 1) / 4), privilegi: privilegi.filter(p => (p.livello || 1) === l).map(p => ({ nome: p.nome, testo: p.testo })) };
      if (prima.speciali) lv.speciali = prima.speciali;
      if (prog) {
        const s = slotPer(prog, l), inc = { ...(prima.incantesimi || {}) };
        for (let i = 1; i <= 9; i++) inc['spell_slots_level_' + i] = s[i - 1] || 0;
        lv.incantesimi = inc;
      } else if (prima.incantesimi && !v.incantatore) { /* niente incantesimi */ }
      out.push(lv);
    }
    return out;
  }

  /** Il modulo per una voce: { el, cambiaTipo(tipo), leggi(voce) }. */
  window.compendioModulo = function (v) {
    const el = document.createElement('div'); el.className = 'cmModulo';
    let tipo = v.tipo;
    if (v.abilita && typeof v.abilita === 'object' && !Array.isArray(v.abilita) && !v.abilitaTesto)
      v.abilitaTesto = Object.entries(v.abilita).map(([k, n]) => `${k} ${n >= 0 ? '+' : ''}${n}`).join(', ');
    const disegna = () => { el.innerHTML = (MODULI[tipo] || []).map(c => campo(c, v)).join(''); };
    el.addEventListener('click', e => {
      if (e.target.closest('.cmVia')) { e.target.closest('.cmR').remove(); return; }
      const piu = e.target.closest('.cmPiu');
      if (piu) {
        const box = piu.parentElement.querySelector('.cmRighe');
        box.insertAdjacentHTML('beforeend', riga({}, !!box.dataset.liv));
        box.lastElementChild.querySelector('input:not(.cmL), .cmN').focus();
      }
    });
    disegna();
    return {
      el,
      cambiaTipo(t) { tipo = t; v.tipo = t; disegna(); },
      leggi(out) {
        for (const c of MODULI[tipo] || []) leggiCampo(c, el.querySelector(`[data-k="${c[0]}"]`), out);
        if (tipo === 'classe') {
          out.livelli = livelliClasse(out, out._privilegi || [], out.incantatore ? out._prog || '' : '');
          delete out._privilegi; delete out._prog;
        }
        if (tipo === 'mostro' && out.abilitaTesto) {                // «Percezione +5, Furtività +4» → { Percezione: 5, … }
          const ab = {};
          for (const m of out.abilitaTesto.matchAll(/([^,;+\-\d]+?)\s*([+-]\s*\d+)/g)) ab[m[1].trim()] = +m[2].replace(/\s/g, '');
          if (Object.keys(ab).length) out.abilita = ab;
        }
        if (tipo === 'mostro' && !out.abilitaTesto) delete out.abilita;
        delete out.abilitaTesto;
        return out;
      }
    };
  };
})();
