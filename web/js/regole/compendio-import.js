// ---------- Contenuti da fuori: Open5e, homebrew di 5etools, CSV ----------
// Tutto diventa un pacchetto della campagna (come quelli .librepack), con la sua fonte e la licenza.
//   - Open5e (API v2): si cerca e si importano le voci scelte; il pacchetto prende il nome e la
//     licenza del documento da cui vengono (SRD, editori con licenza aperta).
//   - Il JSON dell'homebrew di 5etools: lo sceglie l'utente (niente download automatici dal sito);
//     ogni homebrew ha il suo autore, il pacchetto è segnato «uso personale».
//   - Un CSV semplice per elenchi di oggetti o mostri.
(function () {
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CAR = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha', str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };
  const TAGLIE = { tiny: 'Minuscola', small: 'Piccola', medium: 'Media', large: 'Grande', huge: 'Enorme', gargantuan: 'Mastodontica', T: 'Minuscola', S: 'Piccola', M: 'Media', L: 'Grande', H: 'Enorme', G: 'Mastodontica' };
  const TIPI = { aberration: 'Aberrazione', beast: 'Bestia', celestial: 'Celestiale', construct: 'Costrutto', dragon: 'Drago', elemental: 'Elementale', fey: 'Folletto', fiend: 'Immondo', giant: 'Gigante', humanoid: 'Umanoide', monstrosity: 'Mostruosità', ooze: 'Melma', plant: 'Vegetale', undead: 'Non morto' };
  const SCUOLE = { abjuration: 'Abiurazione', conjuration: 'Evocazione', divination: 'Divinazione', enchantment: 'Ammaliamento', evocation: 'Invocazione', illusion: 'Illusione', necromancy: 'Necromanzia', transmutation: 'Trasmutazione', A: 'Abiurazione', C: 'Evocazione', D: 'Divinazione', E: 'Ammaliamento', V: 'Invocazione', I: 'Illusione', N: 'Necromanzia', T: 'Trasmutazione' };
  const RARITA = { common: 'Comune', uncommon: 'Non comune', rare: 'Raro', 'very rare': 'Molto raro', legendary: 'Leggendario', artifact: 'Artefatto' };
  const DANNI = { acid: 'Acido', bludgeoning: 'Contundente', cold: 'Freddo', fire: 'Fuoco', force: 'Forza', lightning: 'Fulmine', necrotic: 'Necrotico', piercing: 'Perforante', poison: 'Veleno', psychic: 'Psichico', radiant: 'Radioso', slashing: 'Tagliente', thunder: 'Tuono', A: 'Acido', B: 'Contundente', C: 'Freddo', F: 'Fuoco', O: 'Forza', L: 'Fulmine', N: 'Necrotico', P: 'Perforante', I: 'Veleno', Y: 'Psichico', R: 'Radioso', S: 'Tagliente', T: 'Tuono' };
  const gs = cr => cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr ?? '');
  const it = (m, k) => (k && (m[String(k).toLowerCase()] || m[k])) || k || undefined;
  const nomeTraduci = n => {                            // se il nome è nell'SRD che abbiamo già, lo si mette in italiano
    const v = (window.COMPENDIO && COMPENDIO.voci || []).find(x => x.en && x.en.toLowerCase() === String(n).toLowerCase());
    return v ? v.nome : n;
  };

  // =================== Open5e ===================
  const o5 = (percorso, par) => fetch('api/open5e?percorso=' + percorso + '&' + new URLSearchParams(par)).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
  const DADO = (n, d, b) => n && d ? `${n}${String(d).toLowerCase()}${b ? (b > 0 ? '+' : '') + b : ''}` : undefined;
  const ELENCHI = [['creatures/', 'mostro', 'Mostri'], ['spells/', 'incantesimo', 'Incantesimi'], ['magicitems/', 'oggetto', 'Oggetti magici'], ['weapons/', 'oggetto', 'Armi'], ['armor/', 'oggetto', 'Armature'], ['items/', 'oggetto', 'Oggetti'], ['feats/', 'talento', 'Talenti'], ['species/', 'specie', 'Specie'], ['backgrounds/', 'background', 'Background'], ['conditions/', 'condizione', 'Condizioni']];
  function daOpen5e(r, tipo) {
    const doc = r.document || {};
    const base = { id: tipo + ':o5-' + r.key, nome: nomeTraduci(r.name), en: r.name, fonte: 'Open5e · ' + (doc.display_name || doc.name || doc.key || ''), testo: r.desc || '' };
    if (tipo === 'mostro') {
      const az = (r.actions || []);
      const conv = a => {
        const at = (a.attacks || [])[0];
        const o = { nome: nomeTraduci(a.name), testo: a.desc || '' };
        if (at && Number.isFinite(at.to_hit_mod)) o.colpire = at.to_hit_mod;
        const d = [];
        if (at && at.damage_die_count) d.push({ dadi: DADO(at.damage_die_count, at.damage_die_type, at.damage_bonus), tipo: it(DANNI, at.damage_type && at.damage_type.key) || '' });
        if (at && at.extra_damage_die_count) d.push({ dadi: DADO(at.extra_damage_die_count, at.extra_damage_die_type, at.extra_damage_bonus), tipo: it(DANNI, at.extra_damage_type && at.extra_damage_type.key) || '' });
        if (d.length) o.danni = d;
        if (a.usage_limits && a.usage_limits.type) o.uso = a.usage_limits.type === 'PER_DAY' ? `${a.usage_limits.param}/giorno` : a.usage_limits.type === 'RECHARGE_ON_ROLL' ? `Ricarica ${a.usage_limits.param}–6` : String(a.usage_limits.type).toLowerCase();
        return o;
      };
      const sp = r.speed || {}, unita = sp.unit === 'feet' ? 'ft.' : (sp.unit || '');
      const ri = r.resistances_and_immunities || {};
      const sensi = [r.darkvision_range && `Scurovisione ${r.darkvision_range} ft.`, r.blindsight_range && `Vista cieca ${r.blindsight_range} ft.`, r.tremorsense_range && `Percezione tellurica ${r.tremorsense_range} ft.`, r.truesight_range && `Vista pura ${r.truesight_range} ft.`, r.passive_perception && `Percezione passiva ${r.passive_perception}`].filter(Boolean).join(', ');
      const ab = {};
      for (const [k, n] of Object.entries(r.skill_bonuses || {})) ab[k.replace(/_/g, ' ')] = n;
      return { ...base, taglia: it(TAGLIE, r.size && r.size.key), tipoCreatura: it(TIPI, r.type && r.type.key), allineamento: r.alignment, ca: r.armor_class, caNota: r.armor_detail || undefined,
        pf: r.hit_points, dadiPf: r.hit_dice, velocita: Object.entries(sp).filter(([k]) => k !== 'unit').map(([k, n]) => (k === 'walk' ? '' : k + ' ') + n + ' ' + unita).join(', '),
        car: Object.fromEntries(Object.entries(r.ability_scores || {}).map(([k, n]) => [CAR[k], n])),
        ts: Object.keys(r.saving_throws || {}).length ? Object.fromEntries(Object.entries(r.saving_throws).map(([k, n]) => [CAR[k], n])) : undefined,
        abilita: Object.keys(ab).length ? ab : undefined, resistenze: ri.damage_resistances_display || undefined, immunita: ri.damage_immunities_display || undefined,
        vulnerabilita: ri.damage_vulnerabilities_display || undefined, immCondizioni: ri.condition_immunities_display || undefined,
        sensi, lingue: (r.languages && r.languages.as_string) || '—', gs: gs(r.challenge_rating), px: r.experience_points, competenza: r.proficiency_bonus || undefined,
        tratti: (r.traits || []).map(t => ({ nome: t.name, testo: t.desc })), azioni: az.filter(a => a.action_type === 'ACTION' || !a.action_type).map(conv),
        azioniBonus: az.filter(a => a.action_type === 'BONUS_ACTION').map(conv), reazioni: az.filter(a => a.action_type === 'REACTION').map(conv), leggendarie: az.filter(a => a.action_type === 'LEGENDARY_ACTION').map(conv) };
    }
    if (tipo === 'incantesimo') {
      const comp = [r.verbal && 'V', r.somatic && 'S', r.material && 'M'].filter(Boolean).join(', ') + (r.material_specified ? ` (${r.material_specified})` : '');
      return { ...base, livello: r.level ?? 0, scuola: it(SCUOLE, r.school && (r.school.key || r.school.name)), tempo: r.casting_time, gittata: r.range_text || (r.range != null ? r.range + ' ft' : undefined), componenti: comp,
        durata: r.duration, concentrazione: !!r.concentration, rituale: !!r.ritual, classi: (r.classes || []).map(c => nomeTraduci(c.name || c)), danni: r.damage_roll || undefined,
        tipoDanno: (r.damage_types || []).map(d => it(DANNI, d)).join(', ') || undefined, superiore: r.higher_level || undefined };
    }
    if (tipo === 'oggetto') {
      const w = r.weapon || (r.damage_dice ? r : null), a = r.armor || (r.ac_base != null ? r : null);
      return { ...base, categoria: (r.category && r.category.name) || (w ? 'Arma' : a ? 'Armatura' : undefined), rarita: it(RARITA, r.rarity && (r.rarity.key || r.rarity.name)),
        sintonia: r.requires_attunement || undefined, magico: !!(r.rarity && r.rarity.key && r.rarity.key !== 'common') || undefined,
        costo: r.cost != null ? `${r.cost} mo` : undefined, peso: r.weight != null ? +r.weight : undefined,
        arma: w ? true : undefined, danno: w && w.damage_dice, tipoDanno: w && it(DANNI, w.damage_type && (w.damage_type.key || w.damage_type.name)),
        proprieta: w && Array.isArray(w.properties) ? w.properties.map(p => (p.property && p.property.name) || p.name || p) : undefined,
        ca: a ? a.ac_base : undefined, testo: r.desc || '' };
    }
    if (tipo === 'talento') return { ...base, prerequisiti: r.prerequisite || undefined, categoria: r.type || undefined, testo: [r.desc, ...(r.benefits || []).map(b => '- ' + (b.desc || ''))].filter(Boolean).join('\n') };
    if (tipo === 'specie') return { ...base, tratti: (r.traits || []).map(t => ({ nome: t.name, testo: t.desc })), testo: r.desc || '' };
    if (tipo === 'background') return { ...base, testo: [r.desc, ...(r.benefits || []).map(b => `**${b.name}.** ${b.desc}`)].filter(Boolean).join('\n\n') };
    if (tipo === 'condizione') return { ...base, testo: r.desc || (r.descriptions || []).map(d => d.desc).join('\n\n') };
    return base;
  }
  window.apriOpen5e = async function () {
    const dlg = document.createElement('dialog'); dlg.className = 'compDlg compO5';
    dlg.innerHTML = `<h3>${esc(tr('Importa da Open5e'))}</h3>
      <p class="note">${esc(tr('Open5e raccoglie l\'SRD e i contenuti di altri editori con licenza aperta. Serve internet. Ogni pacchetto riporta la licenza del documento da cui viene.'))}</p>
      <div class="compEdG"><label>${esc(tr('Documento'))}<select data-k="doc"><option value="">${esc(tr('Carico…'))}</option></select></label>
      <label>${esc(tr('Tipo'))}<select data-k="elenco">${ELENCHI.map(([p, , n]) => `<option value="${p}">${esc(tr(n))}</option>`).join('')}</select></label>
      <label>${esc(tr('Cerca'))}<input data-k="q" type="search" placeholder="${esc(tr('es. dragon'))}"></label></div>
      <p class="note" data-k="lic"></p>
      <div class="compO5Lista" data-k="lista"></div>
      <p class="err" data-k="err"></p>
      <div class="dialogBtns"><button type="button" class="btn ghost" data-a="tutti">${esc(tr('Seleziona tutti'))}</button><span style="flex:1"></span><button type="button" class="btn ghost" data-a="chiudi">${esc(tr('Chiudi'))}</button><button type="button" class="btn" data-a="importa">${esc(tr('Importa i selezionati'))}</button></div>`;
    document.body.appendChild(dlg); dlg.showModal();
    const $d = k => dlg.querySelector(`[data-k="${k}"]`), err = t => { $d('err').textContent = t || ''; };
    let documenti = [], risultati = [], pag = null;
    dlg.addEventListener('close', () => dlg.remove());
    try {
      const j = await o5('documents/', { limit: 200 });
      documenti = j.results || [];
      $d('doc').innerHTML = documenti.map(d => `<option value="${esc(d.key)}">${esc((d.display_name || d.name) + ' — ' + ((d.publisher && d.publisher.name) || ''))}</option>`).join('');
      const sis = typeof SISTEMA !== 'undefined' && SISTEMA.id;
      const pref = documenti.find(d => d.gamesystem && d.gamesystem.key === (sis === 'dnd5e-2024' ? '5e-2024' : '5e-2014'));
      if (pref) $d('doc').value = pref.key;
    } catch (e) { err(tr('Open5e non risponde: {e}', { e: e.message })); return; }
    const licenza = () => {
      const d = documenti.find(x => x.key === $d('doc').value) || {};
      const l = (d.licenses || []).map(x => x.name || x.key || x).join(', ');
      $d('lic').textContent = tr('Licenza: {l}', { l: l || tr('vedi il documento') }) + (d.permalink ? ' · ' + d.permalink : '');
      return { d, l };
    };
    async function cerca(dopo) {
      err(''); licenza();
      try {
        const par = { limit: 50, document__key: $d('doc').value };
        if ($d('q').value.trim()) par.name__icontains = $d('q').value.trim();
        const j = dopo ? await fetch('api/open5e?percorso=' + $d('elenco').value + '&' + new URL(dopo).searchParams.toString().replace(/(^|&)format=json/, '')).then(r => r.json()) : await o5($d('elenco').value, par);
        const nuovi = j.results || [];
        risultati = dopo ? risultati.concat(nuovi) : nuovi;
        pag = j.next || null;
        $d('lista').innerHTML = risultati.map((r, i) => `<label class="check"><input type="checkbox" data-i="${i}"> ${esc(r.name)}</label>`).join('') +
          (pag ? `<button type="button" class="btn ghost" data-a="altri">${esc(tr('Altri…'))} (${j.count - risultati.length})</button>` : '') + (risultati.length ? '' : `<p class="note">${esc(tr('Niente.'))}</p>`);
      } catch (e) { err(tr('Open5e non risponde: {e}', { e: e.message })); }
    }
    let t = 0;
    $d('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => cerca(), 400); });
    $d('doc').addEventListener('change', () => cerca()); $d('elenco').addEventListener('change', () => cerca());
    dlg.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'chiudi') dlg.close();
      else if (b.dataset.a === 'altri') cerca(pag);
      else if (b.dataset.a === 'tutti') dlg.querySelectorAll('.compO5Lista input').forEach(i => { i.checked = true; });
      else if (b.dataset.a === 'importa') {
        const scelti = [...dlg.querySelectorAll('.compO5Lista input:checked')].map(i => risultati[+i.dataset.i]);
        if (!scelti.length) return err(tr('Scegli almeno una voce.'));
        const tipo = ELENCHI.find(x => x[0] === $d('elenco').value)[1];
        const { d, l } = licenza();
        b.disabled = true;
        try {
          // per i mostri l'elenco ha già tutto; per gli altri pure (Open5e v2 manda le voci complete)
          const voci = { [tipo]: scelti.map(r => daOpen5e(r, tipo)) };
          await compendioSalvaPacchetto({ id: 'open5e-' + d.key, nome: 'Open5e · ' + (d.display_name || d.name || d.key), autore: (d.publisher && d.publisher.name) || '', licenza: tr('Da Open5e (open5e.com). Documento: {n}. Licenza: {l}.', { n: d.name || d.key, l: l || '—' }) + (d.permalink ? ' ' + d.permalink : ''), fonte: 'Open5e · ' + (d.name || d.key), sistema: d.gamesystem && d.gamesystem.key }, voci);
          alert(tr('{n} voci importate da Open5e.', { n: scelti.length }));
        } catch (x) { err(tr('Non sono riuscito a importarle: {e}', { e: x.message })); }
        b.disabled = false;
      }
    });
    cerca();
  };

  // =================== homebrew di 5etools ===================
  // Il testo di 5etools ha dei «tag»: {@hit 4}, {@damage 1d6 + 2}, {@dc 13}, {@spell fireball}…
  function testo5(x) {
    if (x == null) return '';
    if (typeof x === 'string') return tag(x);
    if (Array.isArray(x)) return x.map(testo5).filter(Boolean).join('\n\n');
    if (x.type === 'list') return (x.items || []).map(i => '- ' + (typeof i === 'string' ? tag(i) : (i.name ? `**${i.name}.** ` : '') + testo5(i.entries || i.entry || ''))).join('\n');
    if (x.type === 'table') return (x.caption ? `**${x.caption}**\n` : '') + [x.colLabels || [], ...(x.rows || [])].map(r => '| ' + r.map(c => testo5(c).replace(/\n/g, ' ')).join(' | ') + ' |').join('\n');
    if (x.type === 'entries' || x.type === 'section' || x.type === 'inset' || x.type === 'item') return (x.name ? `**${x.name}.** ` : '') + testo5(x.entries || x.entry || '');
    if (x.entries) return testo5(x.entries);
    return '';
  }
  function tag(s) {
    return String(s).replace(/\{@(\w+)\s*([^}]*)\}/g, (_, t, c) => {
      const [a] = c.split('|');
      if (t === 'hit') return (+a >= 0 ? '+' : '') + a;
      if (t === 'h') return 'Colpito: ';
      if (t === 'dc') return 'CD ' + a;
      if (t === 'atk') return ({ mw: 'Attacco con arma da mischia:', rw: 'Attacco con arma a distanza:', 'mw,rw': 'Attacco con arma da mischia o a distanza:', ms: 'Attacco con incantesimo da mischia:', rs: 'Attacco con incantesimo a distanza:' })[a] || 'Attacco:';
      if (t === 'damage' || t === 'dice') return a.replace(/\s+/g, '');
      if (t === 'recharge') return `(Ricarica ${a || 6}–6)`;
      return a;
    });
  }
  const da5 = s => { const m = /\{@hit\s*([+-]?\d+)\}/.exec(s || ''); return m ? +m[1] : undefined; };
  const danni5 = s => [...String(s || '').matchAll(/\{@damage\s*([^}|]+)\}\)?\s*(\w+)?/g)].map(m => ({ dadi: m[1].replace(/\s+/g, ''), tipo: it(DANNI, (m[2] || '').toLowerCase()) || '' }));
  function daCinque(j) {
    const voci = {};
    const metti = (tipo, v) => { (voci[tipo] = voci[tipo] || []).push(v); };
    const id = (tipo, x) => tipo + ':5e-' + String(x.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (x.source || '').toLowerCase();
    for (const m of j.monster || []) {
      const az = arr => (arr || []).map(a => { const t = JSON.stringify(a.entries || ''); const o = { nome: tag(a.name || ''), testo: testo5(a.entries) }; const c = da5(t); if (c !== undefined) o.colpire = c; const d = danni5(t); if (d.length) o.danni = d; return o; });
      const tipoC = typeof m.type === 'string' ? m.type : m.type && m.type.type;
      const ac = Array.isArray(m.ac) ? m.ac[0] : m.ac;
      metti('mostro', { id: id('mostro', m), nome: m.name, en: m.name, fonte: m.source, taglia: it(TAGLIE, (m.size || [])[0]), tipoCreatura: it(TIPI, typeof tipoC === 'string' ? tipoC : ''),
        allineamento: Array.isArray(m.alignment) ? m.alignment.map(a => typeof a === 'string' ? a : '').join(' ') : m.alignment, ca: typeof ac === 'object' ? ac.ac : ac, caNota: typeof ac === 'object' && ac.from ? tag(ac.from.join(', ')) : undefined,
        pf: m.hp && m.hp.average, dadiPf: m.hp && m.hp.formula && m.hp.formula.replace(/\s+/g, ''), velocita: Object.entries(m.speed || {}).map(([k, x]) => (k === 'walk' ? '' : k + ' ') + (typeof x === 'object' ? x.number : x) + ' ft.').join(', '),
        car: { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha },
        ts: m.save ? Object.fromEntries(Object.entries(m.save).map(([k, x]) => [CAR[k], parseInt(x, 10)])) : undefined,
        abilita: m.skill ? Object.fromEntries(Object.entries(m.skill).map(([k, x]) => [k, parseInt(x, 10)])) : undefined,
        resistenze: m.resist ? m.resist.map(r => typeof r === 'string' ? it(DANNI, r) : '').filter(Boolean).join(', ') : undefined,
        immunita: m.immune ? m.immune.map(r => typeof r === 'string' ? it(DANNI, r) : '').filter(Boolean).join(', ') : undefined,
        sensi: [...(m.senses || []), m.passive != null ? 'Percezione passiva ' + m.passive : ''].filter(Boolean).join(', '), lingue: (m.languages || []).join(', ') || '—',
        gs: typeof m.cr === 'object' ? m.cr.cr : m.cr, tratti: az(m.trait), azioni: az(m.action), azioniBonus: az(m.bonus), reazioni: az(m.reaction), leggendarie: az(m.legendary), testo: m.entries ? testo5(m.entries) : '' });
    }
    for (const s of j.spell || []) {
      const t = (s.time || [])[0] || {}, r = s.range || {}, du = (s.duration || [])[0] || {};
      const c = s.components || {};
      metti('incantesimo', { id: id('incantesimo', s), nome: s.name, en: s.name, fonte: s.source, livello: s.level, scuola: it(SCUOLE, s.school),
        tempo: `${t.number || ''} ${t.unit || ''}`.trim(), gittata: r.distance ? `${r.distance.amount || ''} ${r.distance.type || ''}`.trim() : r.type,
        componenti: [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ') + (typeof c.m === 'string' ? ` (${c.m})` : c.m && c.m.text ? ` (${c.m.text})` : ''),
        durata: du.type === 'timed' && du.duration ? `${du.duration.amount} ${du.duration.type}` : du.type, concentrazione: !!du.concentration, rituale: !!(s.meta && s.meta.ritual),
        classi: ((s.classes && s.classes.fromClassList) || []).map(x => nomeTraduci(x.name)), testo: testo5(s.entries), superiore: s.entriesHigherLevel ? testo5(s.entriesHigherLevel) : undefined,
        danni: (danni5(JSON.stringify(s.entries || ''))[0] || {}).dadi });
    }
    for (const x of [...(j.item || []), ...(j.baseitem || [])]) metti('oggetto', { id: id('oggetto', x), nome: x.name, en: x.name, fonte: x.source, categoria: x.type || undefined, rarita: it(RARITA, x.rarity) !== 'none' ? it(RARITA, x.rarity) : undefined,
      sintonia: !!x.reqAttune || undefined, costo: x.value != null ? `${x.value / 100} mo` : undefined, peso: x.weight, danno: x.dmg1, tipoDanno: it(DANNI, x.dmgType), arma: x.dmg1 ? true : undefined, ca: x.ac, testo: testo5(x.entries) });
    for (const [k, tipo] of [['feat', 'talento'], ['race', 'specie'], ['background', 'background'], ['condition', 'condizione'], ['optionalfeature', 'talento']])
      for (const x of j[k] || []) metti(tipo, { id: id(tipo, x), nome: x.name, en: x.name, fonte: x.source, testo: testo5(x.entries) });
    for (const c of j.class || []) metti('classe', { id: id('classe', c), nome: c.name, en: c.name, fonte: c.source, dadoVita: c.hd && c.hd.faces, ts: (c.proficiency || []).map(p => CAR[p]), testo: testo5(c.fluff || '') });
    for (const c of j.subclass || []) metti('sottoclasse', { id: id('sottoclasse', c), nome: c.name, en: c.name, fonte: c.source, classe: c.className, testo: '' });
    return voci;
  }

  // =================== CSV ===================
  function righeCsv(t) {
    t = t.replace(/^﻿/, '');
    const prima = t.split(/\r?\n/)[0] || '', sep = (prima.match(/;/g) || []).length > (prima.match(/,/g) || []).length ? ';' : prima.includes('\t') ? '\t' : ',';
    const out = []; let r = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; continue; }
      if (ch === '"') q = true; else if (ch === sep) { r.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); out.push(r); r = []; c = ''; } else c += ch;
    }
    if (c || r.length) { r.push(c); out.push(r); }
    return out.filter(x => x.some(y => y.trim()));
  }
  const ALIAS = { tipo: 'tipo', type: 'tipo', nome: 'nome', name: 'nome', costo: 'costo', cost: 'costo', price: 'costo', prezzo: 'costo', peso: 'peso', weight: 'peso', danni: 'danno', danno: 'danno', damage: 'danno', tipodanno: 'tipoDanno', damagetype: 'tipoDanno', categoria: 'categoria', category: 'categoria', rarita: 'rarita', 'rarità': 'rarita', rarity: 'rarita', testo: 'testo', descrizione: 'testo', description: 'testo', desc: 'testo', note: 'testo', ca: 'ca', ac: 'ca', pf: 'pf', hp: 'pf', gs: 'gs', cr: 'gs', taglia: 'taglia', size: 'taglia', velocita: 'velocita', 'velocità': 'velocita', speed: 'velocita', for: 'str', str: 'str', des: 'dex', dex: 'dex', cos: 'con', con: 'con', int: 'int', sag: 'wis', wis: 'wis', car: 'cha', cha: 'cha', livello: 'livello', level: 'livello', scuola: 'scuola', school: 'scuola' };
  function daCsv(t) {
    const R = righeCsv(t); if (R.length < 2) throw new Error(tr('Il CSV è vuoto (serve la riga dei titoli e almeno una riga).'));
    const tit = R[0].map(h => ALIAS[h.trim().toLowerCase()] || null);
    if (!tit.includes('nome')) throw new Error(tr('Nel CSV manca la colonna «nome».'));
    const voci = {};
    for (const r of R.slice(1)) {
      const o = {}; tit.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim() !== '') o[k] = String(r[i]).trim(); });
      if (!o.nome) continue;
      let tipo = (o.tipo || '').toLowerCase();
      tipo = /mostr|monst|creat/.test(tipo) ? 'mostro' : /incant|spell/.test(tipo) ? 'incantesimo' : /ogget|item|arm/.test(tipo) || !tipo ? (o.gs || o.pf ? 'mostro' : 'oggetto') : tipo;
      delete o.tipo;
      const v = { id: tipo + ':csv-' + o.nome.toLowerCase().replace(/[^a-z0-9àèéìòù]+/g, '-'), nome: o.nome, fonte: 'CSV', testo: o.testo || '' };
      if (tipo === 'mostro') {
        Object.assign(v, { ca: o.ca ? +o.ca : undefined, pf: o.pf ? +o.pf : undefined, gs: o.gs, taglia: o.taglia, velocita: o.velocita });
        if (['str', 'dex', 'con', 'int', 'wis', 'cha'].some(k => o[k])) v.car = Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => [k, +o[k] || 10]));
      } else if (tipo === 'incantesimo') Object.assign(v, { livello: +o.livello || 0, scuola: o.scuola, danni: o.danno });
      else Object.assign(v, { categoria: o.categoria, costo: o.costo, peso: o.peso ? +String(o.peso).replace(',', '.') : undefined, danno: o.danno, tipoDanno: o.tipoDanno, arma: o.danno ? true : undefined, rarita: o.rarita, ca: o.ca ? +o.ca : undefined });
      (voci[tipo] = voci[tipo] || []).push(v);
    }
    return voci;
  }

  // =================== da file ===================
  window.importaFileCompendio = async function (f) {
    const t = await f.text();
    let pacchetto, voci, n = 0;
    if (/\.csv$/i.test(f.name)) {
      voci = daCsv(t);
      pacchetto = { id: 'csv-' + f.name.replace(/\.csv$/i, ''), nome: f.name.replace(/\.csv$/i, ''), fonte: 'CSV', licenza: tr('Importato da un file CSV.'), usoPersonale: true };
    } else {
      let j; try { j = JSON.parse(t); } catch { throw new Error(tr('Il file non è un JSON valido.')); }
      if (j.pacchetto && j.voci) { pacchetto = j.pacchetto; voci = j.voci; }                       // un pacchetto di LIBRE VTT in JSON
      else if (j._meta || j.monster || j.spell || j.item || j.feat || j.race || j.background || j.class) {
        voci = daCinque(j);
        const src = (j._meta && j._meta.sources && j._meta.sources[0]) || {};
        pacchetto = { id: '5etools-' + (src.json || f.name.replace(/\.json$/i, '')), nome: src.full || f.name.replace(/\.json$/i, ''), autore: (src.authors || []).join(', '),
          versione: src.version, fonte: '5etools homebrew · ' + (src.abbreviation || src.json || ''), usoPersonale: true,
          licenza: tr('Homebrew della comunità nel formato di 5etools, scelto da te: ha il suo autore e le sue condizioni. Per uso personale.') };
      } else throw new Error(tr('Non riconosco questo JSON (né un pacchetto di LIBRE VTT, né l\'homebrew di 5etools).'));
    }
    for (const a of Object.values(voci)) n += a.length;
    if (!n) throw new Error(tr('Nel file non ho trovato voci.'));
    if (!confirm(tr('Importo {n} voci come pacchetto «{p}»?', { n, p: pacchetto.nome }))) return;
    await compendioSalvaPacchetto(pacchetto, voci);
    alert(tr('Pacchetto «{p}» importato: {n} voci.', { p: pacchetto.nome, n }));
  };
  window._compImportTest = { daCinque, daCsv, daOpen5e, tag };
})();
