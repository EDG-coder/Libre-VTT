#!/usr/bin/env node
// Converte l'SRD (dal progetto 5e-database, licenza MIT; contenuti SRD 5.1/5.2 di Wizards of the
// Coast, CC-BY-4.0) nei pacchetti di base del compendio di LIBRE VTT:
//   sistemi/dnd5e-2014/compendio/srd-5.1/{pacchetto.json, voci/<tipo>.json}
//   sistemi/dnd5e-2024/compendio/srd-5.2/{…}
// I testi restano in inglese (sono quelli ufficiali); i nomi sono tradotti con strumenti/srd/it/*.json
// e l'inglese resta accanto (campo «en») per cercarli.
//
// Uso: node strumenti/srd/converti.js <cartella src di 5e-database>
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.resolve(process.argv[2] || '../5e-bits/5e-database/src');
const RADICE = path.resolve(__dirname, '..', '..');

// ---------- nomi italiani ----------
const IT = {};
for (const f of fs.readdirSync(path.join(__dirname, 'it'))) {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'it', f), 'utf8'));
  IT[f.replace('.json', '')] = new Map(Object.entries(j).map(([k, v]) => [k.toLowerCase(), v]));
}
const nomeIt = (en, ...file) => {
  const k = String(en || '').toLowerCase();
  for (const f of [...file, 'vocab']) if (IT[f] && IT[f].has(k)) return IT[f].get(k);
  return en;
};
const v = s => nomeIt(s, 'vocab');

const TAGLIE = { Tiny: 'Minuscola', Small: 'Piccola', Medium: 'Media', Large: 'Grande', Huge: 'Enorme', Gargantuan: 'Mastodontica', 'Medium or Small': 'Media o Piccola', 'Small or Medium': 'Piccola o Media' };
const TIPI = { aberration: 'Aberrazione', beast: 'Bestia', celestial: 'Celestiale', construct: 'Costrutto', dragon: 'Drago', elemental: 'Elementale', fey: 'Folletto', fiend: 'Immondo', giant: 'Gigante', humanoid: 'Umanoide', monstrosity: 'Mostruosità', ooze: 'Melma', plant: 'Vegetale', undead: 'Non morto', swarm: 'Sciame' };
const RARITA = { Common: 'Comune', Uncommon: 'Non comune', Rare: 'Raro', 'Very Rare': 'Molto raro', Legendary: 'Leggendario', Artifact: 'Artefatto', Varies: 'Varia' };
const MONETE = { cp: 'mr', sp: 'ma', ep: 'me', gp: 'mo', pp: 'mp' };
const CAR = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' };
const ABILITA = { acrobatics: 'acro', 'animal-handling': 'anim', arcana: 'arca', athletics: 'athl', deception: 'dece', history: 'hist', insight: 'insi', intimidation: 'inti', investigation: 'inve', medicine: 'medi', nature: 'natu', perception: 'perception', performance: 'perf', persuasion: 'pers', religion: 'reli', 'sleight-of-hand': 'slei', stealth: 'stea', survival: 'surv' };
const NOME_ABILITA = { Acrobatics: 'Acrobazia', 'Animal Handling': 'Addestrare animali', Arcana: 'Arcano', Athletics: 'Atletica', Deception: 'Inganno', History: 'Storia', Insight: 'Intuizione', Intimidation: 'Intimidire', Investigation: 'Indagare', Medicine: 'Medicina', Nature: 'Natura', Perception: 'Percezione', Performance: 'Intrattenere', Persuasion: 'Persuasione', Religion: 'Religione', 'Sleight of Hand': 'Rapidità di mano', Stealth: 'Furtività', Survival: 'Sopravvivenza' };

const testo = x => Array.isArray(x) ? x.join('\n\n') : String(x || '');
const dsc = o => testo(o.desc !== undefined ? o.desc : o.description);
const metri = s => String(s || '');
const leggi = (ed, f) => { try { return JSON.parse(fs.readFileSync(path.join(SRC, ed, 'en', `5e-SRD-${f}.json`), 'utf8')); } catch { return []; } };
const gs = cr => cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
const segno = n => (n >= 0 ? '+' : '') + n;

function converti(ed, idSis, idPack, nomePack, fonte) {
  const L = f => leggi(ed, f);
  const voci = {};
  const metti = (tipo, x) => { (voci[tipo] = voci[tipo] || []).push({ id: tipo + ':' + x.index, tipo, fonte, ...x.corpo }); };

  // incantesimi
  for (const s of L('Spells')) {
    const dmg = s.damage || {};
    const scala = dmg.damage_at_slot_level || dmg.damage_at_character_level || {};
    const primo = Object.values(scala)[0];
    metti('incantesimo', { index: s.index, corpo: {
      nome: nomeIt(s.name, 'incantesimi'), en: s.name, livello: s.level, scuola: v(s.school && s.school.name),
      tempo: s.casting_time, gittata: s.range, componenti: (s.components || []).join(', ') + (s.material ? ` (${s.material})` : ''),
      durata: s.duration, concentrazione: !!s.concentration, rituale: !!s.ritual,
      classi: (s.classes || []).map(c => v(c.name)),
      danni: primo ? String(primo).replace(/\s+/g, '') : undefined, tipoDanno: dmg.damage_type ? v(dmg.damage_type.name) : undefined,
      scalaDanni: Object.keys(scala).length ? scala : undefined, cura: s.heal_at_slot_level || undefined,
      ts: s.dc && s.dc.dc_type ? CAR[s.dc.dc_type.name] || CAR[s.dc.dc_type.index] : undefined,
      testo: dsc(s), superiore: testo(s.higher_level) || undefined
    } });
  }
  // mostri
  for (const m of L('Monsters')) {
    const ca = (m.armor_class || [])[0] || {};
    const prof = m.proficiencies || [];
    const ts = {}, ab = {};
    for (const p of prof) {
      const n = p.proficiency && p.proficiency.name || '';
      let r;
      if ((r = /^Saving Throw: (\w+)/.exec(n))) ts[CAR[r[1]]] = p.value;
      else if ((r = /^Skill: (.+)$/.exec(n))) ab[NOME_ABILITA[r[1]] || r[1]] = p.value;
    }
    const azione = a => {
      const out = { nome: nomeIt(a.name, 'oggetti', 'tratti', 'privilegi', 'incantesimi'), testo: testo(a.desc) };
      if (Number.isFinite(a.attack_bonus)) out.colpire = a.attack_bonus;
      const dd = (Array.isArray(a.damage) ? a.damage : []).filter(x => x && x.damage_dice).map(x => ({ dadi: String(x.damage_dice).replace(/\s+/g, ''), tipo: x.damage_type ? v(x.damage_type.name) : '' }));
      if (dd.length) out.danni = dd;
      if (a.dc && a.dc.dc_value) out.cd = { valore: a.dc.dc_value, car: CAR[a.dc.dc_type && (a.dc.dc_type.name || a.dc.dc_type.index)] };
      if (a.usage) out.uso = a.usage.type === 'recharge on roll' ? `Ricarica ${a.usage.min_value}–6` : a.usage.times ? `${a.usage.times}/${a.usage.type === 'per day' ? 'giorno' : a.usage.type}` : undefined;
      return out;
    };
    const sensi = Object.entries(m.senses || {}).map(([k, x]) => k === 'passive_perception' ? `Percezione passiva ${x}` : `${({ darkvision: 'Scurovisione', blindsight: 'Vista cieca', tremorsense: 'Percezione tellurica', truesight: 'Vista pura' })[k] || k} ${x}`).join(', ');
    const vel = Object.entries(m.speed || {}).map(([k, x]) => (k === 'walk' ? '' : ({ fly: 'volare ', swim: 'nuotare ', climb: 'scalare ', burrow: 'scavare ', hover: '' })[k] || k + ' ') + (x === true ? '(fluttuare)' : x)).join(', ');
    const tipo = String(m.type || '').toLowerCase();
    metti('mostro', { index: m.index, corpo: {
      nome: nomeIt(m.name, 'mostri'), en: m.name, taglia: TAGLIE[m.size] || m.size, tipoCreatura: TIPI[tipo.split(' ')[0]] || m.type, sottotipo: m.subtype || undefined, allineamento: m.alignment,
      ca: ca.value, caNota: ca.type && ca.type !== 'natural' && ca.type !== 'dex' ? ca.type : ca.type === 'natural' ? 'armatura naturale' : undefined,
      pf: m.hit_points, dadiPf: m.hit_points_roll || m.hit_dice, velocita: vel,
      car: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
      ts: Object.keys(ts).length ? ts : undefined, abilita: Object.keys(ab).length ? ab : undefined,
      vulnerabilita: (m.damage_vulnerabilities || []).map(v).join(', ') || undefined, resistenze: (m.damage_resistances || []).map(v).join(', ') || undefined,
      immunita: (m.damage_immunities || []).map(v).join(', ') || undefined, immCondizioni: (m.condition_immunities || []).map(c => v(c.name || c)).join(', ') || undefined,
      sensi, lingue: m.languages || '—', gs: gs(m.challenge_rating), px: m.xp, competenza: m.proficiency_bonus,
      tratti: (m.special_abilities || []).map(azione), azioni: (m.actions || []).map(azione),
      azioniBonus: (m.bonus_actions || []).map(azione), reazioni: (m.reactions || []).map(azione),
      leggendarie: (m.legendary_actions || []).map(azione)
    } });
  }
  // equipaggiamento (armi, armature, attrezzi…) e oggetti magici
  for (const e of L('Equipment')) {
    const cats = e.equipment_categories || (e.equipment_category ? [e.equipment_category] : []);
    const cat = cats.map(c => c.index);
    const arma = cat.some(c => /weapon/.test(c)), armatura = cat.some(c => /armor|shield/.test(c));
    metti('oggetto', { index: e.index, corpo: {
      nome: nomeIt(e.name, 'oggetti'), en: e.name, categoria: v((cats[0] || {}).name || ''),
      sottocategoria: e.weapon_category ? (e.weapon_category === 'Martial' ? 'Da guerra' : 'Semplice') + (e.weapon_range ? (e.weapon_range === 'Melee' ? ', mischia' : ', a distanza') : '') : e.armor_category ? v(e.armor_category + ' Armor') : (e.gear_category && v(e.gear_category.name)) || undefined,
      costo: e.cost ? `${e.cost.quantity} ${MONETE[e.cost.unit] || e.cost.unit}` : undefined, peso: e.weight, arma: arma || undefined, armatura: armatura || undefined,
      danno: e.damage ? String(e.damage.damage_dice || '') : undefined, tipoDanno: e.damage && e.damage.damage_type ? v(e.damage.damage_type.name) : undefined,
      dueMani: e.two_handed_damage ? e.two_handed_damage.damage_dice : undefined,
      gittata: e.range && e.range.long ? `${e.range.normal}/${e.range.long} ft` : undefined, portata: e.range && !e.range.long && e.range.normal > 5 ? `${e.range.normal} ft` : undefined,
      proprieta: (e.properties || []).map(p => v(p.name)), maestria: e.mastery ? v(e.mastery.name) : undefined,
      lancio: e.throw_range ? `${e.throw_range.normal}/${e.throw_range.long} ft` : undefined,
      ca: e.armor_class ? e.armor_class.base : undefined, caDes: e.armor_class ? (e.armor_class.dex_bonus ? (e.armor_class.max_bonus ? `max ${e.armor_class.max_bonus}` : 'sì') : 'no') : undefined,
      forzaMin: e.str_minimum || undefined, svantaggioFurtivita: e.stealth_disadvantage || undefined,
      testo: dsc(e) || undefined, contenuto: (e.contents || []).map(c => `${c.quantity} × ${nomeIt(c.item.name, 'oggetti')}`).join(', ') || undefined
    } });
  }
  for (const m of L('Magic-Items')) {
    const t = dsc(m), sint = /requires attunement/i.test(t.split('\n')[0] || '');
    metti('oggetto', { index: 'magico-' + m.index, corpo: {
      nome: nomeIt(m.name, 'oggetti-magici'), en: m.name, categoria: v((m.equipment_category || {}).name || 'Wondrous Items'), magico: true,
      rarita: m.rarity ? RARITA[m.rarity.name] || m.rarity.name : undefined, sintonia: sint || undefined,
      varianti: m.variants && m.variants.length ? m.variants.map(x => nomeIt(x.name, 'oggetti-magici')) : undefined, testo: t
    } });
  }
  // talenti, condizioni, regole, veleni
  for (const f of L('Feats')) metti('talento', { index: f.index, corpo: { nome: nomeIt(f.name, 'vocab'), en: f.name, categoria: f.type ? ({ origin: 'Origine', general: 'Generale', 'fighting-style': 'Stile di combattimento', 'epic-boon': 'Dono epico' })[f.type] || f.type : undefined, prerequisiti: prerequisiti(f.prerequisites), testo: dsc(f) } });
  for (const c of L('Conditions')) metti('condizione', { index: c.index, corpo: { nome: ed === '2024' && c.name === 'Exhaustion' ? 'Sfinimento' : nomeIt(c.name), en: c.name, testo: dsc(c) } });
  for (const r of L('Rule-Sections')) metti('regola', { index: r.index, corpo: { nome: nomeIt(r.name), en: r.name, testo: dsc(r) } });
  for (const p of L('Poisons')) metti('oggetto', { index: 'veleno-' + p.index, corpo: { nome: nomeIt(p.name), en: p.name, categoria: 'Veleno', costo: p.cost ? `${p.cost.quantity} ${MONETE[p.cost.unit] || p.cost.unit}` : undefined, testo: dsc(p) } });

  // tratti e privilegi (servono a specie, classi e sottoclassi)
  const tratti = new Map(L('Traits').map(t => [t.index, t]));
  const priv = L('Features');
  const tratto = r => { const t = tratti.get(r.index) || r; return { nome: nomeIt(t.name, 'tratti'), en: t.name, testo: dsc(t) }; };
  // specie (razze nel 2014) con sottospecie
  const sotto = [...L('Subraces'), ...L('Subspecies')];
  for (const r of [...L('Races'), ...L('Species')]) {
    const mie = sotto.filter(s => (s.race || s.species || {}).index === r.index);
    metti('specie', { index: r.index, corpo: {
      nome: nomeIt(r.name), en: r.name, taglia: TAGLIE[r.size] || r.size, velocita: r.speed, tipoCreatura: r.type ? TIPI[String(r.type).toLowerCase()] || r.type : undefined,
      aumenti: (r.ability_bonuses || []).map(b => ({ car: CAR[b.ability_score.index], bonus: b.bonus })),
      lingue: (r.languages || []).map(l => v(l.name)), scurovisione: (r.traits || []).some(t => /darkvision/.test(t.index)) || undefined,
      competenze: (r.starting_proficiencies || []).map(p => p.name), tratti: (r.traits || []).map(tratto),
      testo: [r.age, r.alignment, r.size_description, r.language_desc].filter(Boolean).join('\n\n') || undefined,
      sottospecie: mie.map(s => ({ id: s.index, nome: nomeIt(s.name), en: s.name, aumenti: (s.ability_bonuses || []).map(b => ({ car: CAR[b.ability_score.index], bonus: b.bonus })), tratti: (s.racial_traits || s.traits || []).map(tratto), testo: dsc(s) || undefined }))
    } });
  }
  // background
  for (const b of L('Backgrounds')) {
    const comp = (b.starting_proficiencies || b.proficiencies || []).map(p => p.name);
    metti('background', { index: b.index, corpo: {
      nome: nomeIt(b.name), en: b.name,
      abilita: comp.map(n => (/^Skill: (.+)$/.exec(n) || [])[1]).filter(Boolean).map(n => ABILITA[n.toLowerCase().replace(/ /g, '-')]).filter(Boolean),
      competenze: comp,
      caratteristiche: (b.ability_scores || []).map(a => CAR[a.index]), talento: b.feat ? nomeIt(b.feat.name) + (b.feat.note ? ` (${nomeIt(b.feat.note)})` : '') : undefined,
      equipaggiamento: (b.equipment_options || b.starting_equipment_options || []).map(o => o.desc).filter(Boolean).join('\n') || (b.starting_equipment || []).map(e => `${e.quantity} × ${nomeIt(e.equipment.name, 'oggetti')}`).join(', ') || undefined,
      privilegio: b.feature ? { nome: b.feature.name, testo: testo(b.feature.desc) } : undefined, testo: dsc(b) || undefined
    } });
  }
  // classi, con i livelli e i privilegi
  const livelli = L('Levels');
  const sottoclassi = L('Subclasses');
  for (const c of L('Classes')) {
    const lv = livelli.filter(l => l.class && l.class.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const pf = (l, n) => priv.find(f => f.index === n.index) || n;
    const scelte = (c.proficiency_choices || []).map(p => p.desc || `Scegli ${p.choose}`);
    metti('classe', { index: c.index, corpo: {
      nome: nomeIt(c.name), en: c.name, dadoVita: c.hit_die, ts: (c.saving_throws || []).map(s => CAR[s.index]),
      caratteristicaPrimaria: c.primary_ability ? c.primary_ability.desc : undefined,
      competenze: (c.proficiencies || []).map(p => p.name), sceltaAbilita: (c.proficiency_choices || []).map(p => ({ quante: p.choose, testo: p.desc, tra: ((p.from && p.from.options) || []).map(o => o.item && o.item.index).filter(Boolean).map(i => ABILITA[i.replace(/^skill-/, '')]).filter(Boolean) })),
      equipaggiamento: [...(c.starting_equipment || []).map(e => `${e.quantity} × ${nomeIt(e.equipment.name, 'oggetti')}`), ...(c.starting_equipment_options || []).map(o => o.desc)].filter(Boolean).join('\n'),
      incantatore: c.spellcasting ? CAR[c.spellcasting.spellcasting_ability.index] : undefined,
      sottoclassi: (c.subclasses || []).map(s => nomeIt(s.name)),
      livelli: lv.map(l => ({ livello: l.level, competenza: l.prof_bonus, privilegi: (l.features || []).map(f => { const x = pf(l, f); return { nome: nomeIt(x.name, 'privilegi'), en: x.name, testo: dsc(x) }; }), incantesimi: l.spellcasting || undefined, speciali: l.class_specific || undefined })),
      testo: scelte.join('\n') || undefined
    } });
  }
  for (const s of sottoclassi) {
    const lv = livelli.filter(l => l.subclass && l.subclass.index === s.index).sort((a, b) => a.level - b.level);
    const suoi = priv.filter(f => f.subclass && f.subclass.index === s.index);
    metti('sottoclasse', { index: s.index, corpo: {
      nome: nomeIt(s.name), en: s.name, classe: nomeIt(s.class.name), tipo: s.subclass_flavor ? nomeIt(s.subclass_flavor, 'privilegi') : undefined,
      testo: dsc(s), privilegi: suoi.sort((a, b) => ((a.level && a.level.level) || a.level || 0) - ((b.level && b.level.level) || b.level || 0)).map(f => ({ livello: (f.level && f.level.level) || f.level, nome: nomeIt(f.name, 'privilegi'), en: f.name, testo: dsc(f) })),
      livelli: lv.length ? lv.map(l => ({ livello: l.level, privilegi: (l.features || []).map(f => nomeIt(f.name, 'privilegi')) })) : undefined
    } });
  }
  // proprietà delle armi e maestrie: anche loro voci (si cercano dalla scheda dell'arma)
  for (const p of L('Weapon-Properties')) metti('regola', { index: 'proprieta-' + p.index, corpo: { nome: tr2('Proprietà: ', v(p.name)), en: p.name, testo: dsc(p) } });
  for (const p of L('Weapon-Mastery-Properties')) metti('regola', { index: 'maestria-' + p.index, corpo: { nome: tr2('Maestria: ', v(p.name)), en: p.name, testo: dsc(p) } });

  // ---------- scrittura ----------
  const dest = path.join(RADICE, 'sistemi', idSis, 'compendio', idPack);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'voci'), { recursive: true });
  const pulisci = o => JSON.parse(JSON.stringify(o));               // via gli undefined
  const conta = {};
  for (const [tipo, arr] of Object.entries(voci)) {
    arr.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    conta[tipo] = arr.length;
    fs.writeFileSync(path.join(dest, 'voci', tipo + '.json'), JSON.stringify(pulisci(arr)));
  }
  fs.writeFileSync(path.join(dest, 'pacchetto.json'), JSON.stringify({
    formato: 'libre-vtt-pacchetto', versione: 1, id: idPack, nome: nomePack, edizione: '1', autore: 'Wizards of the Coast',
    licenza: `Questo pacchetto contiene materiale del System Reference Document ${fonte.replace('SRD ', '')} di Wizards of the Coast LLC, disponibile con licenza Creative Commons Attribution 4.0 International (CC-BY-4.0): https://creativecommons.org/licenses/by/4.0/legalcode. Testi originali in inglese; nomi tradotti in italiano da LIBRE VTT. Dati JSON dal progetto 5e-database (licenza MIT).`,
    fonte, sistema: idSis, base: true, visibile: 'tutti', voci: conta
  }, null, 2));
  console.log(idPack, conta);
}
function tr2(a, b) { return a + b; }
function prerequisiti(p) {
  if (!p) return undefined;
  if (Array.isArray(p)) return p.map(x => x.ability_score ? `${x.ability_score.name} ${x.minimum_score}` : x.type || '').filter(Boolean).join(', ') || undefined;
  const out = [];
  if (p.minimum_level) out.push(`livello ${p.minimum_level}+`);
  if (p.feature_named) out.push(`privilegio «${nomeIt(p.feature_named, 'privilegi')}»`);
  return out.join(', ') || undefined;
}

converti('2014', 'dnd5e-2014', 'srd-5.1', 'SRD 5.1 (D&D 2014)', 'SRD 5.1');
converti('2024', 'dnd5e-2024', 'srd-5.2', 'SRD 5.2 (D&D 2024)', 'SRD 5.2');
