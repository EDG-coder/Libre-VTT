// ---------- ⚙ Avanzate della scheda e il pannello «Risorse e riquadri» ----------
// Tutto sta nei campi della scheda (s.f), come JSON dove serve, così si salva, si esporta e in partita
// arriva agli altri come ogni altro campo:
//   avMod   [{ id, a, v, on, temp, nota }]   bonus e malus: a = atk, dmg, ac, save, save:str, skill, skill:acro, mod:str, init, spcd, spatk, pp
//   avVant  { 'skill:stea': 'dis', 'save:wis': 'adv', … }   vantaggio o svantaggio fisso
//   avStr   [{ id, nome, car, liv }]          strumenti (liv: mezza, comp, maestria)
//   avDif   { res: [], imm: [], vul: [], cond: [] }   difese (tipi di danno, condizioni)
//   avRis   [{ id, nome, cur, max, ric }]     risorse con contatore (ric: breve, lunga, '')
//   avRiq   { cats: [{ id, nome, chiusa }], items: [{ id, cat, tipo, nome, val, formula, max, desc, chat }] }
//   avPunti { on, cur }                       punti incantatore (variante della Guida del DM)
//   avChat  'nome' | 'desc' | 'nulla'         cosa va in chat usando una capacità (predefinito della scheda)
//   vNuoto vVolo vScalata vScavo vLibrarsi, sCieca sTremore sPura   velocità e sensi (testo)
// Le caselle incantesimo usano i campi che c'erano già: sl1t…sl9t (totali) e sl1u…sl9u (spese).
(function () {
  'use strict';
  const tr = window.tr || (s => s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nid = () => Math.random().toString(36).slice(2, 9);
  const J = (s, k, def) => { try { const v = JSON.parse(s.f[k] || ''); return v ?? def; } catch { return def; } };
  const salvaJ = (s, k, v) => { s.f[k] = JSON.stringify(v); cambiata(s); };
  function cambiata(s) {
    if (typeof schedaCambiata === 'function') schedaCambiata(s); else scheduleSheets();
    const w = typeof wins !== 'undefined' && wins.get(s.id);
    if (w && w._body) { recalc(w._body, s); for (const el of w._body.querySelectorAll('[data-f]')) if (el !== document.activeElement && !el.closest('.avPanel')) { if (el.type === 'checkbox') el.checked = !!s.f[el.dataset.f]; else el.value = s.f[el.dataset.f] ?? ''; } disegnaPannello(w, s); }
    if (typeof updateTokenBars === 'function') updateTokenBars();
  }
  const CAR = [['str', 'FOR', 'Forza'], ['dex', 'DES', 'Destrezza'], ['con', 'COS', 'Costituzione'], ['int', 'INT', 'Intelligenza'], ['wis', 'SAG', 'Saggezza'], ['cha', 'CAR', 'Carisma']];
  const ABILITA = () => (typeof SKILLS !== 'undefined' ? SKILLS : []).slice().sort((a, b) => tr(a[1]).localeCompare(tr(b[1])));
  const DANNI = [['acido', 'Acido', /^(acid)/], ['contundente', 'Contundente', /^(contund|bludg)/], ['freddo', 'Freddo', /^(fredd|cold)/], ['fuoco', 'Fuoco', /^(fuoc|fire)/], ['forza', 'Forza', /^(forz|force)/], ['fulmine', 'Fulmine', /^(fulmin|lightn|elettr)/], ['necrotico', 'Necrotico', /^(necro)/], ['perforante', 'Perforante', /^(perfor|pierc)/], ['psichico', 'Psichico', /^(psich|psych)/], ['radioso', 'Radioso', /^(radi)/], ['tagliente', 'Tagliente', /^(taglien|slash)/], ['tuono', 'Tuono', /^(tuon|thund)/], ['veleno', 'Veleno', /^(velen|poison)/]];
  const CONDIZIONI = ['Accecato', 'Affascinato', 'Afferrato', 'Assordato', 'Avvelenato', 'Incapacitato', 'Indebolimento', 'Invisibile', 'Paralizzato', 'Pietrificato', 'Prono', 'Spaventato', 'Stordito', 'Svenuto', 'Trattenuto'];
  // i nomi dei danni nella lingua del gioco (tr() su «Forza» darebbe la caratteristica, non il danno)
  const DANNI_EN = { acido: 'Acid', contundente: 'Bludgeoning', freddo: 'Cold', fuoco: 'Fire', forza: 'Force', fulmine: 'Lightning', necrotico: 'Necrotic', perforante: 'Piercing', psichico: 'Psychic', radioso: 'Radiant', tagliente: 'Slashing', tuono: 'Thunder', veleno: 'Poison' };
  const nomeDanno = k => { const d = DANNI.find(x => x[0] === k); return window.LIBRE_I18N && LIBRE_I18N.lingua === 'en' ? (DANNI_EN[k] || k) : (d ? d[1] : k); };
  const tipoDanno = t => { const n = String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); const d = DANNI.find(x => x[2].test(n)); return d ? d[0] : ''; };
  window.avanzTipoDanno = tipoDanno;

  // ---------- formule: numeri, + − × ÷, parentesi, min max floor ceil round, e i valori della scheda ----------
  // FOR DES COS INT SAG CAR (modificatori, anche STR DEX CON WIS CHA), COMP, LIV, PF, PFMAX, CA,
  // e [Nome riquadro] per il valore di un altro riquadro (o di una risorsa).
  const SIGLE = { FOR: 'str', DES: 'dex', COS: 'con', INT: 'int', SAG: 'wis', CAR: 'cha', STR: 'str', DEX: 'dex', CON: 'con', WIS: 'wis', CHA: 'cha' };
  function valoreNome(s, nome, giro) {
    const n = String(nome).trim().toLowerCase();
    const r = J(s, 'avRiq', { items: [] }).items.find(x => String(x.nome).trim().toLowerCase() === n);
    if (r) return valoreRiq(s, r, giro + 1);
    const ris = J(s, 'avRis', []).find(x => String(x.nome).trim().toLowerCase() === n);
    if (ris) return +ris.cur || 0;
    return 0;
  }
  function formula(s, testo, giro = 0) {
    if (giro > 8) return 0;                                       // riquadri che si citano in cerchio
    let t = String(testo ?? '').trim();
    if (!t) return 0;
    t = t.replace(/\[([^\]]{1,60})\]/g, (_, n) => '(' + valoreNome(s, n, giro) + ')');
    t = t.replace(/\b(FOR|DES|COS|INT|SAG|CAR|STR|DEX|CON|WIS|CHA|COMP|BC|PROF|LIV|PFMAX|PF|CA)\b/g, k => {
      if (SIGLE[k]) return '(' + abMod(s, SIGLE[k]) + ')';
      if (k === 'COMP' || k === 'BC' || k === 'PROF') return '(' + profB(s) + ')';
      if (k === 'LIV') return '(' + (iv(s.f.level) || 1) + ')';
      if (k === 'PF') return '(' + iv(s.f.hp) + ')';
      if (k === 'PFMAX') return '(' + iv(s.f.hpmax) + ')';
      return '(' + iv(s.f.ac) + ')';
    });
    t = t.replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/,/g, '.');
    // un piccolo analizzatore: niente eval
    let i = 0;
    const sp = () => { while (t[i] === ' ') i++; };
    const fn = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, minimo: Math.min, massimo: Math.max, giu: Math.floor, su: Math.ceil };
    function primario() {
      sp();
      if (t[i] === '(') { i++; const v = somma(); sp(); if (t[i] === ')') i++; return v; }
      if (t[i] === '-') { i++; return -primario(); }
      if (t[i] === '+') { i++; return primario(); }
      const m = /^[a-z]+/i.exec(t.slice(i));
      if (m && fn[m[0].toLowerCase()]) {
        i += m[0].length; sp(); const args = [];
        if (t[i] === '(') { i++; do { args.push(somma()); sp(); } while (t[i] === ',' ? ++i : t[i] === ';' ? ++i : false); if (t[i] === ')') i++; }
        return fn[m[0].toLowerCase()](...args);
      }
      const n = /^\d+(\.\d+)?/.exec(t.slice(i));
      if (n) { i += n[0].length; return +n[0]; }
      throw new Error('formula');
    }
    function prodotto() { let v = primario(); for (;;) { sp(); if (t[i] === '*') { i++; v *= primario(); } else if (t[i] === '/') { i++; const d = primario(); v = d ? v / d : 0; } else return v; } }
    function somma() { let v = prodotto(); for (;;) { sp(); if (t[i] === '+') { i++; v += prodotto(); } else if (t[i] === '-') { i++; v -= prodotto(); } else return v; } }
    try { const v = somma(); return Number.isFinite(v) ? Math.floor(v * 100) / 100 : 0; } catch { return 0; }
  }
  window.avanzFormula = formula;
  const valoreRiq = (s, r, giro = 0) => r.formula ? formula(s, r.formula, giro) : r.tipo === 'casella' ? (r.val ? 1 : 0) : +r.val || 0;

  // ---------- modificatori e vantaggi fissi (li usano i calcoli di sheets.js) ----------
  window.avanzBonus = function (s, k) {
    if (!s || !s.f || !s.f.avMod) return 0;
    let tot = 0;
    for (const m of J(s, 'avMod', [])) if (m && m.on !== false && m.a === k) tot += /^[+-]?\d+$/.test(String(m.v).trim()) ? +m.v : formula(s, m.v);
    return Math.trunc(tot);
  };
  window.avanzVantaggio = function (s, key) {
    if (!s || !s.f || !s.f.avVant) return '';
    const v = J(s, 'avVant', {}), [t] = key.split(':');
    const x = v[key] || v[t] || '';
    return x === 'adv' || x === 'dis' ? x : '';
  };

  // ---------- caselle incantesimo e punti incantatore ----------
  const PUNTI_LIV = [4, 6, 14, 17, 27, 32, 38, 44, 57, 64, 64, 64, 73, 73, 83, 83, 94, 107, 114, 123];
  const COSTO = [0, 2, 3, 5, 6, 7, 9, 10, 11, 13];
  const puntiMax = s => PUNTI_LIV[Math.max(0, Math.min(19, (iv(s.f.level) || 1) - 1))];
  const livMaxPunti = s => Math.min(5, Math.ceil((iv(s.f.level) || 1) / 2));     // con i punti, al massimo il 5° livello
  function usaCasella(s, L) {
    const p = J(s, 'avPunti', {});
    if (p.on) {
      const cur = p.cur == null ? puntiMax(s) : +p.cur;
      if (L > livMaxPunti(s)) { alert(tr('Con i punti incantatore si lanciano incantesimi fino al {n}° livello.', { n: livMaxPunti(s) })); return; }
      if (cur < COSTO[L]) { alert(tr('Non bastano i punti: ne servono {c}, ne restano {r}.', { c: COSTO[L], r: cur })); return; }
      p.cur = cur - COSTO[L]; salvaJ(s, 'avPunti', p);
      addChat({ kind: 'rule', title: s.name, text: tr('Lancia un incantesimo di {l}° livello ({c} punti, ne restano {r}).', { l: L, c: COSTO[L], r: p.cur }) });
      return;
    }
    const tot = iv(s.f['sl' + L + 't']), usate = iv(s.f['sl' + L + 'u']);
    if (usate >= tot) { alert(tr('Non restano caselle di {l}° livello.', { l: L })); return; }
    s.f['sl' + L + 'u'] = String(usate + 1); cambiata(s);
    addChat({ kind: 'rule', title: s.name, text: tr('Usa una casella incantesimo di {l}° livello (ne restano {r}).', { l: L, r: tot - usate - 1 }) });
  }
  window.avanzUsaCasella = usaCasella;

  // ---------- riposi ----------
  function riposo(s, lungo) {
    const ris = J(s, 'avRis', []);
    for (const r of ris) if (r.ric === 'breve' || (lungo && r.ric === 'lunga')) r.cur = Math.max(0, Math.round(formula(s, r.max) || +r.max || 0));
    s.f.avRis = JSON.stringify(ris);
    const riq = J(s, 'avRiq', { cats: [], items: [] });
    for (const r of riq.items) if (r.tipo === 'contatore' && (r.ric === 'breve' || (lungo && r.ric === 'lunga'))) r.val = Math.round(r.formula ? formula(s, r.formula) : +r.max || 0);
    s.f.avRiq = JSON.stringify(riq);
    const cose = [];
    if (lungo) {
      if (iv(s.f.hpmax)) { s.f.hp = String(iv(s.f.hpmax)); cose.push(tr('PF al massimo')); }
      s.f.hpt = '';
      const hdt = iv(s.f.hdt) || iv(s.f.level);
      if (iv(s.f.hdu)) { s.f.hdu = String(Math.max(0, iv(s.f.hdu) - Math.max(1, Math.floor(hdt / 2)))); cose.push(tr('recupera metà dei dadi vita')); }
      for (let L = 1; L <= 9; L++) s.f['sl' + L + 'u'] = iv(s.f['sl' + L + 'u']) ? '0' : s.f['sl' + L + 'u'];
      const p = J(s, 'avPunti', {}); if (p.on) { p.cur = puntiMax(s); s.f.avPunti = JSON.stringify(p); }
      cose.push(tr('caselle incantesimo recuperate'));
      // i modificatori temporanei finiscono con il riposo lungo
      const mods = J(s, 'avMod', []); if (mods.some(m => m.temp && m.on !== false)) { for (const m of mods) if (m.temp) m.on = false; s.f.avMod = JSON.stringify(mods); cose.push(tr('modificatori temporanei spenti')); }
    }
    const nr = ris.filter(r => r.ric === 'breve' || (lungo && r.ric === 'lunga')).length;
    if (nr) cose.push(tr('{n} risorse ricaricate', { n: nr }));
    cambiata(s);
    addChat({ kind: 'rule', title: s.name, text: (lungo ? tr('🌙 Riposo lungo') : tr('☕ Riposo breve')) + (cose.length ? ': ' + cose.join(', ') + '.' : '.') });
  }
  window.avanzRiposo = riposo;

  // ---------- usare una capacità: cosa va in chat ----------
  function inChat(s, r, forza) {
    const modo = forza || r.chat || s.f.avChat || 'desc';
    if (modo === 'nulla') return;
    const val = r.tipo === 'contatore' ? ` (${r.val ?? 0}/${r.formula ? formula(s, r.formula) : r.max || 0})` : r.tipo === 'numero' ? ` (${valoreRiq(s, r)})` : '';
    if (modo === 'nome' || !r.desc) addChat({ kind: 'text', text: `${s.name}: ${r.nome}${val}` });
    else addChat({ kind: 'rule', title: `${s.name} · ${r.nome}${val}`, text: r.desc });
  }

  // ---------- il pannello nella finestra della scheda ----------
  const APERTO = 'libre-avpanel-';
  const aperto = id => { try { return localStorage.getItem(APERTO + id) !== '0'; } catch { return true; } };
  function disegnaPannello(w, s) {
    if (!w || !w._body || !s || s.tpl === 'simple') return;
    let p = w._body.querySelector(':scope > .avPanel');
    if (!p) {
      p = document.createElement('details'); p.className = 'avPanel'; p.open = aperto(s.id);
      p.addEventListener('toggle', () => { try { localStorage.setItem(APERTO + s.id, p.open ? '1' : '0'); } catch {} });
      const bar = w._body.querySelector(':scope > .tiroBar');
      if (bar) bar.after(p); else w._body.prepend(p);
      p.addEventListener('click', e => clicPannello(e, w, s));
      p.addEventListener('change', e => cambioPannello(e, s));
      trascina(p, s);
    }
    const ris = J(s, 'avRis', []), riq = J(s, 'avRiq', { cats: [], items: [] }), dif = J(s, 'avDif', {}), punti = J(s, 'avPunti', {});
    const slot = []; for (let L = 1; L <= 9; L++) { const t = iv(s.f['sl' + L + 't']); if (t > 0) slot.push([L, t, Math.min(t, iv(s.f['sl' + L + 'u']))]); }
    const vel = [['speed', ''], ['vNuoto', '🏊'], ['vVolo', '🕊'], ['vScalata', '🧗'], ['vScavo', '⛏'], ['vLibrarsi', '🎈']].filter(([k]) => s.f[k]).map(([k, ic]) => (ic ? ic + ' ' : '🚶 ') + esc(s.f[k]));
    const sensi = [['scuroV', '🌒'], ['sCieca', '🦇'], ['sTremore', '〰'], ['sPura', '👁']].filter(([k]) => s.f[k]).map(([k, ic]) => ic + ' ' + esc(s.f[k]));
    const difesa = [['res', '🛡'], ['imm', '⛔'], ['vul', '💔']].filter(([k]) => (dif[k] || []).length).map(([k, ic]) => `${ic} ${(dif[k] || []).map(x => esc(nomeDanno(x))).join(', ')}`);
    if ((dif.cond || []).length) difesa.push('🚫 ' + dif.cond.map(c => esc(tr(c))).join(', '));
    const mods = J(s, 'avMod', []).filter(m => m.on !== false && m.v);
    const caB = window.avanzBonus(s, 'ac');
    const riga = r => {
      const v = r.formula ? formula(s, r.formula) : null;
      let corpo = '';
      if (r.tipo === 'numero') corpo = r.formula ? `<b class="avNum" title="${esc(r.formula)}">${v}</b>` : `<input type="number" class="avIn" data-riq="${r.id}" value="${esc(r.val ?? '')}">`;
      else if (r.tipo === 'testo') corpo = `<input type="text" class="avIn avTxt" data-riq="${r.id}" value="${esc(r.val ?? '')}">`;
      else if (r.tipo === 'casella') corpo = `<input type="checkbox" class="avIn" data-riq="${r.id}" ${r.val ? 'checked' : ''}>`;
      else if (r.tipo === 'contatore') { const mx = r.formula ? v : +r.max || 0; corpo = `<button type="button" class="btn ghost avPM" data-riq="${r.id}" data-d="-1">−</button><b class="avNum">${+r.val || 0}</b><span class="avMax">/ ${mx}</span><button type="button" class="btn ghost avPM" data-riq="${r.id}" data-d="1">+</button>`; }
      else if (r.tipo === 'tiro') corpo = `<button type="button" class="chipRoll avTiro" data-riq="${r.id}" title="${esc(r.formula || r.val || '')}">🎲 ${esc(r.formula || r.val || '')}</button>`;
      return `<div class="avRiq" draggable="true" data-id="${r.id}" data-cat="${esc(r.cat || '')}"><span class="avGrip" aria-hidden="true">⠿</span><span class="avNome" title="${esc(r.desc || '')}">${esc(r.nome)}</span>${corpo}<button type="button" class="avPing" data-ping="${r.id}" title="${esc(tr('Manda in chat solo questa capacità'))}" aria-label="${esc(tr('Manda in chat'))}">📣</button></div>`;
    };
    const cats = riq.cats.length ? riq.cats : (riq.items.length ? [{ id: '', nome: tr('Riquadri') }] : []);
    p.innerHTML = `<summary><span>⭐ ${esc(tr('Risorse e riquadri'))}</span><span class="avRiposi"><button type="button" class="btn ghost" data-a="breve" title="${esc(tr('Ricarica le risorse che tornano con un riposo breve'))}">☕ ${esc(tr('Riposo breve'))}</button><button type="button" class="btn ghost" data-a="lungo" title="${esc(tr('PF al massimo, metà dei dadi vita, caselle incantesimo e risorse'))}">🌙 ${esc(tr('Riposo lungo'))}</button><button type="button" class="btn ghost" data-a="avanz" title="${esc(tr('Modifica risorse, riquadri, modificatori, difese…'))}">⚙</button></span></summary>
      <div class="avCorpo">
      <div class="avDanni"><span class="avPF">❤ <b>${iv(s.f.hp)}</b>/${iv(s.f.hpmax)}${iv(s.f.hpt) ? ` <small>+${iv(s.f.hpt)}</small>` : ''}</span><input type="number" min="0" class="avIn avDannoN" placeholder="${esc(tr('PF'))}" aria-label="${esc(tr('Quanti punti ferita'))}"><select class="avIn avDannoT" aria-label="${esc(tr('Tipo di danno'))}"><option value="">${esc(tr('tipo…'))}</option>${DANNI.map(([k]) => `<option value="${k}">${esc(nomeDanno(k))}</option>`).join('')}</select><button type="button" class="btn ghost" data-a="subisci">🩸 ${esc(tr('Danni subiti'))}</button><button type="button" class="btn ghost" data-a="cura">💚 ${esc(tr('Cura'))}</button></div>
      ${vel.length || sensi.length ? `<div class="avInfo">${vel.join(' · ')}${vel.length && sensi.length ? ' &nbsp;|&nbsp; ' : ''}${sensi.join(' · ')}</div>` : ''}
      ${difesa.length ? `<div class="avInfo">${difesa.join(' · ')}</div>` : ''}
      ${mods.length || caB ? `<div class="avInfo">✨ ${mods.map(m => `${esc(m.nota || NOMI_BERSAGLI()[m.a] || m.a)} ${/^[+-]/.test(String(m.v).trim()) ? '' : '+'}${esc(m.v)}`).join(' · ')}${caB ? ` · ${esc(tr('CA effettiva'))} ${iv(s.f.ac) + caB}` : ''}</div>` : ''}
      ${ris.length ? `<div class="avGruppo"><h5>${esc(tr('Risorse'))}</h5>${ris.map(r => { const mx = Math.round(formula(s, r.max) || +r.max || 0); return `<div class="avRiq"><span class="avNome">${esc(r.nome)}${r.ric ? ` <small>${r.ric === 'breve' ? '☕' : '🌙'}</small>` : ''}</span><button type="button" class="btn ghost avPM" data-ris="${r.id}" data-d="-1">−</button><b class="avNum">${+r.cur || 0}</b><span class="avMax">/ ${mx}</span><button type="button" class="btn ghost avPM" data-ris="${r.id}" data-d="1">+</button></div>`; }).join('')}</div>` : ''}
      ${slot.length || punti.on ? `<div class="avGruppo"><h5>${esc(tr('Caselle incantesimo'))}${punti.on ? ` · ${esc(tr('Punti incantatore'))} <b>${punti.cur == null ? puntiMax(s) : punti.cur}</b>/${puntiMax(s)}` : ''}</h5>
        ${punti.on ? `<div class="avSlotRiga">${[1, 2, 3, 4, 5].filter(L => L <= livMaxPunti(s)).map(L => `<button type="button" class="btn ghost" data-lancia="${L}">${L}° · ${COSTO[L]} ${esc(tr('punti'))}</button>`).join('')}</div>`
          : slot.map(([L, t, u]) => `<div class="avSlotRiga"><span class="avLiv">${L}°</span>${Array.from({ length: t }, (_, i) => `<button type="button" class="avPip ${i < t - u ? 'on' : ''}" data-pip="${L}" data-i="${i}" aria-label="${esc(tr('Casella {i} di {l}° livello', { i: i + 1, l: L }))}"></button>`).join('')}<button type="button" class="btn ghost avLancia" data-lancia="${L}">${esc(tr('Usa'))}</button></div>`).join('')}</div>` : ''}
      ${cats.map(c => { const items = riq.items.filter(r => (r.cat || '') === (c.id || '') || (!riq.cats.length)); return `<div class="avGruppo avCat ${c.chiusa ? 'chiusa' : ''}" data-cat="${esc(c.id || '')}"><h5><button type="button" class="avCatT" data-cat="${esc(c.id || '')}">${c.chiusa ? '▸' : '▾'} ${esc(c.nome)}</button><button type="button" class="avPing" data-pingcat="${esc(c.id || '')}" title="${esc(tr('Manda in chat tutta la categoria'))}">📣</button></h5>${c.chiusa ? '' : items.map(riga).join('') || `<p class="note">${esc(tr('Trascina qui un riquadro.'))}</p>`}</div>`; }).join('')}
      ${!ris.length && !slot.length && !riq.items.length && !punti.on ? `<p class="note">${esc(tr('Qui compaiono le risorse (Ira, Ispirazione bardica…), le caselle incantesimo e i tuoi riquadri. Aggiungili con ⚙.'))}</p>` : ''}
      </div>`;
  }
  window.avanzPannello = disegnaPannello;

  function clicPannello(e, w, s) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('summary')) e.preventDefault();
    if (b.dataset.a === 'breve') return riposo(s, false);
    if (b.dataset.a === 'lungo') return confirm(tr('Riposo lungo per {n}?', { n: s.name })) && riposo(s, true);
    if (b.dataset.a === 'avanz') return apriAvanzate(w, s, 'risorse');
    if (b.dataset.a === 'subisci' || b.dataset.a === 'cura') {
      const box = b.closest('.avDanni'), n = box.querySelector('.avDannoN').value, t = box.querySelector('.avDannoT').value;
      if (!(+n > 0)) { box.querySelector('.avDannoN').focus(); return; }
      return b.dataset.a === 'cura' ? cura(s, n) : subisci(s, n, t);
    }
    if (b.dataset.lancia) return usaCasella(s, +b.dataset.lancia);
    if (b.dataset.pip) { const L = b.dataset.pip, t = iv(s.f['sl' + L + 't']), libere = t - Math.min(t, iv(s.f['sl' + L + 'u'])); s.f['sl' + L + 'u'] = String(t - (+b.dataset.i < libere ? +b.dataset.i : +b.dataset.i + 1)); cambiata(s); return; }
    if (b.dataset.ris) { const ris = J(s, 'avRis', []), r = ris.find(x => x.id === b.dataset.ris); if (!r) return; const mx = Math.round(formula(s, r.max) || +r.max || 0); r.cur = Math.max(0, Math.min(mx || Infinity, (+r.cur || 0) + +b.dataset.d)); salvaJ(s, 'avRis', ris); if (+b.dataset.d < 0) addChat({ kind: 'text', text: `${s.name}: ${r.nome} (${r.cur}/${mx})` }); return; }
    const riq = J(s, 'avRiq', { cats: [], items: [] });
    if (b.classList.contains('avCatT')) { const c = riq.cats.find(x => x.id === b.dataset.cat); if (c) { c.chiusa = !c.chiusa; salvaJ(s, 'avRiq', riq); } return; }
    if (b.dataset.pingcat != null) { const items = riq.items.filter(r => (r.cat || '') === b.dataset.pingcat || !riq.cats.length); const c = riq.cats.find(x => x.id === b.dataset.pingcat); if (items.length) addChat({ kind: 'rule', title: `${s.name} · ${c ? c.nome : tr('Riquadri')}`, text: items.map(r => `**${r.nome}**${r.tipo === 'numero' || r.tipo === 'contatore' ? ' ' + valoreRiq(s, r) : r.tipo === 'testo' && r.val ? ': ' + r.val : ''}${r.desc ? '\n' + r.desc : ''}`).join('\n\n') }); return; }
    const r = riq.items.find(x => x.id === (b.dataset.riq || b.dataset.ping)); if (!r) return;
    if (b.dataset.ping) return inChat(s, r, r.chat === 'nulla' ? 'desc' : null);
    if (b.classList.contains('avPM')) { const mx = r.formula ? formula(s, r.formula) : +r.max || 0; r.val = Math.max(0, Math.min(mx || Infinity, (+r.val || 0) + +b.dataset.d)); salvaJ(s, 'avRiq', riq); if (+b.dataset.d < 0) inChat(s, r); return; }
    if (b.classList.contains('avTiro')) {
      const ex = conCaratteristiche(s, String(r.formula || r.val || '').replace(/\[([^\]]{1,60})\]/g, (_, n) => String(valoreNome(s, n, 0))));
      if (!rollExpr(ex, `${s.name} · ${r.nome}`)) addChat({ kind: 'text', text: `${s.name}: ${tr('tiro non valido')} («${ex}»)` });
      else if (r.desc && (r.chat || s.f.avChat) === 'desc') addChat({ kind: 'rule', title: `${s.name} · ${r.nome}`, text: r.desc });
    }
  }
  function cambioPannello(e, s) {
    const i = e.target.closest('[data-riq]'); if (!i) return;
    const riq = J(s, 'avRiq', { cats: [], items: [] }), r = riq.items.find(x => x.id === i.dataset.riq); if (!r) return;
    r.val = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? '' : +i.value) : i.value;
    salvaJ(s, 'avRiq', riq);
  }
  // trascinare i riquadri: nell'ordine e da una categoria all'altra
  function trascina(p, s) {
    let preso = null;
    p.addEventListener('dragstart', e => { const r = e.target.closest('.avRiq[data-id]'); if (!r) return; preso = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', preso); r.classList.add('preso'); });
    p.addEventListener('dragend', () => { preso = null; p.querySelectorAll('.preso, .sopra').forEach(x => x.classList.remove('preso', 'sopra')); });
    p.addEventListener('dragover', e => { if (!preso) return; const t = e.target.closest('.avRiq[data-id], .avCat'); if (!t) return; e.preventDefault(); p.querySelectorAll('.sopra').forEach(x => x.classList.remove('sopra')); t.classList.add('sopra'); });
    p.addEventListener('drop', e => {
      if (!preso) return; e.preventDefault();
      const riq = J(s, 'avRiq', { cats: [], items: [] }), i = riq.items.findIndex(x => x.id === preso); if (i < 0) return;
      const [it] = riq.items.splice(i, 1), su = e.target.closest('.avRiq[data-id]'), cat = e.target.closest('.avCat');
      if (cat) it.cat = cat.dataset.cat || '';
      const j = su ? riq.items.findIndex(x => x.id === su.dataset.id) : -1;
      if (j >= 0) riq.items.splice(j, 0, it); else riq.items.push(it);
      salvaJ(s, 'avRiq', riq);
    });
  }

  // ---------- ⚙ Avanzate: tutte le sezioni ----------
  const NOMI_BERSAGLI = () => ({
    atk: tr('Tiri per colpire'), dmg: tr('Danni'), ac: tr('Classe armatura'), save: tr('Tutti i tiri salvezza'), skill: tr('Tutte le abilità'), mod: tr('Tutte le prove di caratteristica'),
    init: tr('Iniziativa'), spcd: tr('CD degli incantesimi'), spatk: tr('Attacco con incantesimi'), pp: tr('Percezione passiva'),
    ...Object.fromEntries(CAR.map(([k, , n]) => ['save:' + k, tr('Tiro salvezza di {c}', { c: tr(n) })])),
    ...Object.fromEntries(CAR.map(([k, , n]) => ['mod:' + k, tr('Prova di {c}', { c: tr(n) })])),
    ...Object.fromEntries(ABILITA().map(([k, n]) => ['skill:' + k, tr(n)]))
  });
  const SEZIONI = [['abilita', 'Abilità'], ['modificatori', 'Modificatori'], ['movimento', 'Movimento e sensi'], ['difese', 'Difese'], ['risorse', 'Risorse'], ['riquadri', 'Riquadri'], ['incantesimi', 'Incantesimi'], ['modelli', 'Modelli'], ['attacchi', 'Attacchi e iniziativa']];
  function apriAvanzate(w, s, sez) {
    const d = document.createElement('dialog'); d.className = 'compDlg avanzDlg avanzTutto temaScheda';
    let cur = sez || 'abilita';
    const opzBers = sel => Object.entries(NOMI_BERSAGLI()).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const corpo = () => {
      const f = s.f;
      if (cur === 'abilita') {
        const strum = J(s, 'avStr', []);
        return `<p class="note">${esc(tr('Per ogni abilità: nessuna competenza, mezza (Tuttofare per una sola abilità), competenza o maestria (doppia competenza).'))}</p>
          <label class="check"><input type="checkbox" data-f="tuttofare"> <b>${esc(tr('Tuttofare'))}</b> <small>${esc(tr('metà competenza a tutte le prove senza competenza e all\'iniziativa'))}</small></label>
          <table class="avTab"><tbody>${ABILITA().map(([k, n, c]) => { const liv = f['ke_' + k] ? 'mae' : f['kp_' + k] ? 'comp' : f['kh_' + k] ? 'mezza' : ''; return `<tr><td>${esc(tr(n))} <small>${esc((CAR.find(x => x[0] === c) || [])[1] || '')}</small></td><td><select data-ab="${k}">${[['', 'Nessuna'], ['mezza', 'Mezza'], ['comp', 'Competenza'], ['mae', 'Maestria']].map(([v, t]) => `<option value="${v}" ${v === liv ? 'selected' : ''}>${esc(tr(t))}</option>`).join('')}</select></td><td class="avVal">${sgn(calcValue(s, 'skill:' + k))}</td></tr>`; }).join('')}</tbody></table>
          <h4>${esc(tr('Strumenti'))}</h4>
          <div class="avLista">${strum.map(t => `<div class="avRigaE" data-str="${t.id}"><input data-k="nome" value="${esc(t.nome)}" placeholder="${esc(tr('es. Arnesi da scasso'))}"><select data-k="car">${CAR.map(([k, a]) => `<option value="${k}" ${k === t.car ? 'selected' : ''}>${a}</option>`).join('')}</select><select data-k="liv">${[['mezza', 'Mezza'], ['comp', 'Competenza'], ['mae', 'Maestria']].map(([v, x]) => `<option value="${v}" ${v === (t.liv || 'comp') ? 'selected' : ''}>${esc(tr(x))}</option>`).join('')}</select><button type="button" class="btn ghost" data-tirastr="${t.id}" title="${esc(tr('Tira'))}">🎲</button><button type="button" class="btn ghost" data-via="avStr" data-id="${t.id}">✕</button></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovo="avStr">＋ ${esc(tr('Strumento'))}</button>`;
      }
      if (cur === 'modificatori') {
        const mods = J(s, 'avMod', []), vant = J(s, 'avVant', {});
        return `<p class="note">${esc(tr('Bonus e malus a tiri, danni, tiri salvezza, CA e abilità. Il valore può essere un numero (+2, −1) o una formula (COMP, FOR, [Nome riquadro]). «Temporaneo» si spegne con il riposo lungo.'))}</p>
          <div class="avLista">${mods.map(m => `<div class="avRigaE" data-mod="${m.id}"><label class="check" title="${esc(tr('Acceso'))}"><input type="checkbox" data-k="on" ${m.on !== false ? 'checked' : ''}></label><select data-k="a">${opzBers(m.a)}</select><input data-k="v" value="${esc(m.v ?? '')}" placeholder="+2" class="avCorto"><input data-k="nota" value="${esc(m.nota || '')}" placeholder="${esc(tr('Nota (es. Benedizione)'))}"><label class="check"><input type="checkbox" data-k="temp" ${m.temp ? 'checked' : ''}> ${esc(tr('Temp.'))}</label><button type="button" class="btn ghost" data-via="avMod" data-id="${m.id}">✕</button></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovo="avMod">＋ ${esc(tr('Modificatore'))}</button>
          <h4>${esc(tr('Vantaggio o svantaggio fisso'))}</h4>
          <div class="avLista">${Object.entries(vant).map(([k, v]) => `<div class="avRigaE" data-vant="${esc(k)}"><select data-k="a">${opzBers(k)}</select><select data-k="m"><option value="adv" ${v === 'adv' ? 'selected' : ''}>${esc(tr('Vantaggio'))}</option><option value="dis" ${v === 'dis' ? 'selected' : ''}>${esc(tr('Svantaggio'))}</option></select><button type="button" class="btn ghost" data-viavant="${esc(k)}">✕</button></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovovant="1">＋ ${esc(tr('Vantaggio o svantaggio'))}</button>`;
      }
      if (cur === 'movimento') {
        const c = (k, l, ph) => `<label>${esc(tr(l))}<input data-f="${k}" placeholder="${esc(ph)}"></label>`;
        return `<div class="avGriglia">${c('speed', 'Camminare', '30 ft')}${c('vNuoto', 'Nuotare', '30 ft')}${c('vVolo', 'Volare', '60 ft')}${c('vScalata', 'Scalare', '30 ft')}${c('vScavo', 'Scavare', '10 ft')}${c('vLibrarsi', 'Librarsi', '')}</div>
          <h4>${esc(tr('Sensi'))}</h4><div class="avGriglia">${c('scuroV', 'Scurovisione', '60 ft')}${c('sCieca', 'Vista cieca', '10 ft')}${c('sTremore', 'Percezione tellurica', '30 ft')}${c('sPura', 'Vista pura', '')}</div>
          <p class="note">${esc(tr('La scurovisione la usa anche la luce della mappa.'))}</p>`;
      }
      if (cur === 'difese') {
        const dif = J(s, 'avDif', {});
        const riga = ([k]) => `<tr><td>${esc(nomeDanno(k))}</td>${['res', 'imm', 'vul'].map(g => `<td><input type="checkbox" data-dif="${g}" data-t="${k}" ${(dif[g] || []).includes(k) ? 'checked' : ''} aria-label="${esc(nomeDanno(k))}"></td>`).join('')}</tr>`;
        return `<p class="note">${esc(tr('«Danni subiti» nel pannello della scheda le usa da solo: resistenza dimezza, immunità annulla, vulnerabilità raddoppia.'))}</p>
          <table class="avTab avDif"><thead><tr><th></th><th>🛡 ${esc(tr('Resistenza'))}</th><th>⛔ ${esc(tr('Immunità'))}</th><th>💔 ${esc(tr('Vulnerabilità'))}</th></tr></thead><tbody>${DANNI.map(riga).join('')}</tbody></table>
          <h4>${esc(tr('Immunità alle condizioni'))}</h4><div class="cmCheck">${CONDIZIONI.map(c => `<label class="check"><input type="checkbox" data-cond="${esc(c)}" ${(dif.cond || []).includes(c) ? 'checked' : ''}> ${esc(tr(c))}</label>`).join('')}</div>`;
      }
      if (cur === 'risorse') {
        const ris = J(s, 'avRis', []);
        return `<p class="note">${esc(tr('Ira, Ispirazione bardica, Punti ki, Incanalare divinità… Il massimo può essere una formula (es. CAR, COMP, max(1;CAR)). Si ricaricano con il riposo indicato.'))}</p>
          <div class="avLista">${ris.map(r => `<div class="avRigaE" data-ris="${r.id}"><input data-k="nome" value="${esc(r.nome)}" placeholder="${esc(tr('Nome'))}"><input data-k="cur" type="number" class="avCorto" value="${esc(r.cur ?? '')}" title="${esc(tr('Adesso'))}"><span>/</span><input data-k="max" class="avCorto" value="${esc(r.max ?? '')}" placeholder="3" title="${esc(tr('Massimo (numero o formula)'))}"><select data-k="ric"><option value="">${esc(tr('Non si ricarica'))}</option><option value="breve" ${r.ric === 'breve' ? 'selected' : ''}>☕ ${esc(tr('Riposo breve'))}</option><option value="lunga" ${r.ric === 'lunga' ? 'selected' : ''}>🌙 ${esc(tr('Riposo lungo'))}</option></select><button type="button" class="btn ghost" data-via="avRis" data-id="${r.id}">✕</button></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovo="avRis">＋ ${esc(tr('Risorsa'))}</button>`;
      }
      if (cur === 'riquadri') {
        const riq = J(s, 'avRiq', { cats: [], items: [] });
        const catSel = c => `<select data-k="cat"><option value="">${esc(tr('(senza categoria)'))}</option>${riq.cats.map(x => `<option value="${esc(x.id)}" ${x.id === c ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>`;
        return `<p class="note">${esc(tr('Riquadri tuoi nella scheda: numero, testo, casella, contatore o tiro. Una formula calcola il valore da altri: FOR, COMP, LIV, [Nome riquadro]. Nel pannello si trascinano per riordinarli o spostarli tra le categorie; 📣 manda in chat una sola capacità.'))}</p>
          <h4>${esc(tr('Categorie'))}</h4>
          <div class="avLista">${riq.cats.map(c => `<div class="avRigaE" data-cat="${c.id}"><input data-k="nome" value="${esc(c.nome)}"><button type="button" class="btn ghost" data-su="${c.id}" title="${esc(tr('Su'))}">↑</button><button type="button" class="btn ghost" data-viacat="${c.id}" title="${esc(tr('Elimina la categoria (i riquadri restano)'))}">✕</button></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovacat="1">＋ ${esc(tr('Categoria'))}</button>
          <h4>${esc(tr('Riquadri'))}</h4>
          <div class="avLista">${riq.items.map(r => `<div class="avRigaE avRiqE" data-riqe="${r.id}"><input data-k="nome" value="${esc(r.nome)}" placeholder="${esc(tr('Nome'))}"><select data-k="tipo">${[['numero', 'Numero'], ['testo', 'Testo'], ['casella', 'Casella'], ['contatore', 'Contatore'], ['tiro', 'Tiro']].map(([v, t]) => `<option value="${v}" ${v === r.tipo ? 'selected' : ''}>${esc(tr(t))}</option>`).join('')}</select>${catSel(r.cat)}
              <input data-k="formula" value="${esc(r.formula || '')}" placeholder="${esc(r.tipo === 'tiro' ? tr('es. 1d8+FOR') : tr('Formula (facoltativa)'))}">${r.tipo === 'contatore' ? `<input data-k="max" class="avCorto" value="${esc(r.max ?? '')}" placeholder="${esc(tr('Max'))}"><select data-k="ric"><option value="">—</option><option value="breve" ${r.ric === 'breve' ? 'selected' : ''}>☕</option><option value="lunga" ${r.ric === 'lunga' ? 'selected' : ''}>🌙</option></select>` : ''}
              <select data-k="chat" title="${esc(tr('Cosa va in chat usandola'))}"><option value="">${esc(tr('Chat: come la scheda'))}</option><option value="nome" ${r.chat === 'nome' ? 'selected' : ''}>${esc(tr('Chat: solo il nome'))}</option><option value="desc" ${r.chat === 'desc' ? 'selected' : ''}>${esc(tr('Chat: nome e descrizione'))}</option><option value="nulla" ${r.chat === 'nulla' ? 'selected' : ''}>${esc(tr('Chat: niente'))}</option></select>
              <button type="button" class="btn ghost" data-via="avRiq" data-id="${r.id}">✕</button><textarea data-k="desc" rows="2" placeholder="${esc(tr('Descrizione (facoltativa)'))}">${esc(r.desc || '')}</textarea></div>`).join('')}</div>
          <button type="button" class="btn ghost" data-nuovo="avRiq">＋ ${esc(tr('Riquadro'))}</button>
          <h4>${esc(tr('In chat'))}</h4>
          <label>${esc(tr('Usando una capacità, in chat va:'))} <select data-f="avChat"><option value="">${esc(tr('Nome e descrizione'))}</option><option value="nome">${esc(tr('Solo il nome'))}</option><option value="nulla">${esc(tr('Niente'))}</option></select></label>`;
      }
      if (cur === 'incantesimi') {
        const p = J(s, 'avPunti', {});
        return `<p class="note">${esc(tr('Le caselle totali e spese di ogni livello (le stesse della scheda). Con i punti incantatore (variante della Guida del DM) le caselle si sostituiscono con un pool di punti.'))}</p>
          <table class="avTab"><thead><tr><th>${esc(tr('Livello'))}</th><th>${esc(tr('Totali'))}</th><th>${esc(tr('Spese'))}</th></tr></thead><tbody>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(L => `<tr><td>${L}°</td><td><input type="number" min="0" max="9" class="avCorto" data-f="sl${L}t"></td><td><input type="number" min="0" max="9" class="avCorto" data-f="sl${L}u"></td></tr>`).join('')}</tbody></table>
          <button type="button" class="btn ghost" data-dallaclasse="1">✨ ${esc(tr('Riempi dalla classe e dal livello'))}</button>
          <label class="check"><input type="checkbox" data-punti="1" ${p.on ? 'checked' : ''}> <b>${esc(tr('Punti incantatore'))}</b> <small>${esc(tr('{n} punti al livello {l}; costo per livello d\'incantesimo: 2, 3, 5, 6, 7 (fino al 5°)', { n: puntiMax(s), l: iv(s.f.level) || 1 }))}</small></label>`;
      }
      if (cur === 'modelli') {
        const m = (typeof settings !== 'undefined' && Array.isArray(settings.modelliScheda)) ? settings.modelliScheda : [];
        return `<p class="note">${esc(tr('Salva risorse, riquadri, categorie e modificatori di questa scheda come modello e usali in altre schede della campagna.'))}</p>
          <div class="avLista">${m.map((x, i) => `<div class="avRigaE"><b>${esc(x.nome)}</b><span style="flex:1"></span><button type="button" class="btn ghost" data-usamod="${i}">${esc(tr('Usa in questa scheda'))}</button><button type="button" class="btn ghost" data-viamod="${i}">✕</button></div>`).join('') || `<p class="note">${esc(tr('Nessun modello salvato.'))}</p>`}</div>
          <button type="button" class="btn ghost" data-salvamod="1">💾 ${esc(tr('Salva questa disposizione come modello…'))}</button>`;
      }
      // attacchi e iniziativa (come nella 3.7.4)
      return `<label>${esc(tr('Critico da'))} <select data-f="critDa">${['', '19', '18', '17', '16', '15'].map(v => `<option value="${v}">${v ? v + '-20' : '20'}</option>`).join('')}</select></label>
        <p class="note">${esc(tr('Da che numero il d20 di un attacco è un critico. Per una sola arma scrivi «19-20» nel suo nome o nel bonus.'))}</p>
        <div class="creaRiga"><label>${esc(tr('Bonus iniziativa'))} <input type="number" data-f="initb" style="width:70px"></label>
        <label>${esc(tr('Sempre con'))} <select data-f="iniVant"><option value="">${esc(tr('Normale'))}</option><option value="adv">${esc(tr('Vantaggio'))}</option><option value="dis">${esc(tr('Svantaggio'))}</option></select></label></div>`;
    };
    const disegna = () => {
      d.innerHTML = `<h3>⚙ ${esc(tr('Avanzate'))} · <span data-noi18n>${esc(s.name)}</span></h3>
        <label class="check avParty"><input type="checkbox" data-party ${s.f.party ? 'checked' : ''}> 🧑‍🤝‍🧑 ${esc(tr('Nel party (il master lo mette in campo con «Piazza il party»)'))}</label>
        <nav class="avSez">${SEZIONI.map(([k, n]) => `<button type="button" class="${k === cur ? 'on' : ''}" data-sez="${k}">${esc(tr(n))}</button>`).join('')}</nav>
        <div class="avSezCorpo">${corpo()}</div>
        <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn" data-a="ok">${esc(tr('Fatto'))}</button></div>`;
      d.querySelectorAll('.avSezCorpo [data-f]').forEach(el => {
        const k = el.dataset.f;
        if (el.type === 'checkbox') el.checked = !!s.f[k]; else el.value = s.f[k] ?? '';
        el.addEventListener('input', () => { s.f[k] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; cambiata(s); });
      });
    };
    // modifiche alle liste (avMod, avRis, avStr, avRiq, avVant…)
    const listaDi = k => k === 'avRiq' ? J(s, 'avRiq', { cats: [], items: [] }) : J(s, k, []);
    d.addEventListener('input', e => {
      const el = e.target; if (el.closest('[data-f]') === el) return;
      const r = el.closest('[data-mod], [data-ris], [data-str], [data-riqe], [data-cat], [data-vant]'); if (!r || !el.dataset.k) return;
      const v = el.type === 'checkbox' ? el.checked : el.value;
      if (r.dataset.vant != null) {
        const vant = J(s, 'avVant', {}), vecchio = r.dataset.vant, m = r.querySelector('[data-k=m]').value, a = r.querySelector('[data-k=a]').value;
        delete vant[vecchio]; vant[a] = m; r.dataset.vant = a; salvaJ(s, 'avVant', vant); return;
      }
      if (r.dataset.cat != null && !r.dataset.riqe) { const riq = listaDi('avRiq'), c = riq.cats.find(x => x.id === r.dataset.cat); if (c) { c[el.dataset.k] = v; salvaJ(s, 'avRiq', riq); } return; }
      const [k, id] = r.dataset.mod ? ['avMod', r.dataset.mod] : r.dataset.ris ? ['avRis', r.dataset.ris] : r.dataset.str ? ['avStr', r.dataset.str] : ['avRiq', r.dataset.riqe];
      const L = listaDi(k), arr = k === 'avRiq' ? L.items : L, o = arr.find(x => x.id === id); if (!o) return;
      o[el.dataset.k] = el.dataset.k === 'cur' ? (v === '' ? '' : +v) : v;
      salvaJ(s, k, L);
      if (k === 'avRiq' && el.dataset.k === 'tipo') disegna();
    });
    d.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.party != null) { if (typeof impostaParty === 'function') impostaParty(s, el.checked); return; }
      if (el.dataset.ab) { const k = el.dataset.ab, v = el.value; s.f['kh_' + k] = v === 'mezza' ? '1' : ''; s.f['kp_' + k] = v === 'comp' || v === 'mae' ? '1' : ''; s.f['ke_' + k] = v === 'mae' ? '1' : ''; cambiata(s); const td = el.closest('tr').querySelector('.avVal'); if (td) td.textContent = sgn(calcValue(s, 'skill:' + k)); return; }
      if (el.dataset.dif) { const dif = J(s, 'avDif', {}), g = el.dataset.dif; dif[g] = (dif[g] || []).filter(x => x !== el.dataset.t); if (el.checked) dif[g].push(el.dataset.t); salvaJ(s, 'avDif', dif); return; }
      if (el.dataset.cond) { const dif = J(s, 'avDif', {}); dif.cond = (dif.cond || []).filter(x => x !== el.dataset.cond); if (el.checked) dif.cond.push(el.dataset.cond); salvaJ(s, 'avDif', dif); return; }
      if (el.dataset.punti) { const p = J(s, 'avPunti', {}); p.on = el.checked; if (p.on && p.cur == null) p.cur = puntiMax(s); salvaJ(s, 'avPunti', p); }
    });
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'ok') return d.close();
      if (b.dataset.sez) { cur = b.dataset.sez; return disegna(); }
      if (b.dataset.nuovo) {
        const k = b.dataset.nuovo, L = listaDi(k);
        const nuovo = { avMod: { id: nid(), a: 'atk', v: '+1', on: true }, avRis: { id: nid(), nome: '', cur: 1, max: '1', ric: 'lunga' }, avStr: { id: nid(), nome: '', car: 'dex', liv: 'comp' }, avRiq: { id: nid(), tipo: 'numero', nome: tr('Nuovo riquadro'), cat: (L.cats && L.cats[0] && L.cats[0].id) || '' } }[k];
        if (k === 'avRiq') L.items.push(nuovo); else L.push(nuovo);
        salvaJ(s, k, L); disegna();
        const campi = d.querySelectorAll('.avLista .avRigaE'); const ult = campi[campi.length - 1]; if (ult) { const i = ult.querySelector('input:not([type=checkbox])'); if (i) i.focus(); }
        return;
      }
      if (b.dataset.via) { const k = b.dataset.via, L = listaDi(k); if (k === 'avRiq') L.items = L.items.filter(x => x.id !== b.dataset.id); else L.splice(L.findIndex(x => x.id === b.dataset.id), 1); salvaJ(s, k, L); return disegna(); }
      if (b.dataset.nuovovant) { const v = J(s, 'avVant', {}); const k = Object.keys(NOMI_BERSAGLI()).find(x => !(x in v) && x.startsWith('skill:')) || 'save'; v[k] = 'adv'; salvaJ(s, 'avVant', v); return disegna(); }
      if (b.dataset.viavant != null) { const v = J(s, 'avVant', {}); delete v[b.dataset.viavant]; salvaJ(s, 'avVant', v); return disegna(); }
      if (b.dataset.nuovacat) { const riq = listaDi('avRiq'); riq.cats.push({ id: nid(), nome: tr('Categoria {n}', { n: riq.cats.length + 1 }) }); salvaJ(s, 'avRiq', riq); return disegna(); }
      if (b.dataset.viacat) { const riq = listaDi('avRiq'); riq.cats = riq.cats.filter(c => c.id !== b.dataset.viacat); for (const r of riq.items) if (r.cat === b.dataset.viacat) r.cat = ''; salvaJ(s, 'avRiq', riq); return disegna(); }
      if (b.dataset.su) { const riq = listaDi('avRiq'), i = riq.cats.findIndex(c => c.id === b.dataset.su); if (i > 0) { [riq.cats[i - 1], riq.cats[i]] = [riq.cats[i], riq.cats[i - 1]]; salvaJ(s, 'avRiq', riq); disegna(); } return; }
      if (b.dataset.tirastr) {
        const t = J(s, 'avStr', []).find(x => x.id === b.dataset.tirastr); if (!t) return;
        const comp = profB(s), bonus = abMod(s, t.car) + (t.liv === 'mae' ? comp * 2 : t.liv === 'mezza' ? Math.floor(comp / 2) : comp) + window.avanzBonus(s, 'mod') + window.avanzBonus(s, 'mod:' + t.car);
        rollExpr('1d20' + sgnE(bonus), `${s.name} · ${t.nome || tr('Strumento')}`); return;
      }
      if (b.dataset.dallaclasse) { riempiCaselle(s); return disegna(); }
      if (b.dataset.salvamod) {
        const nome = prompt(tr('Nome del modello'), s.f.class || s.name); if (!nome) return;
        if (!Array.isArray(settings.modelliScheda)) settings.modelliScheda = [];
        settings.modelliScheda.push({ nome: nome.slice(0, 60), dati: Object.fromEntries(['avRis', 'avRiq', 'avMod', 'avVant', 'avChat', 'avStr'].filter(k => s.f[k]).map(k => [k, s.f[k]])) });
        scheduleBoardSave(); return disegna();
      }
      if (b.dataset.usamod) {
        const m = settings.modelliScheda[+b.dataset.usamod]; if (!m) return;
        if (!confirm(tr('Usare il modello «{n}»? Risorse, riquadri e modificatori di questa scheda vengono sostituiti.', { n: m.nome }))) return;
        for (const [k, v] of Object.entries(m.dati || {})) s.f[k] = v;
        cambiata(s); return disegna();
      }
      if (b.dataset.viamod) { if (!confirm(tr('Eliminare il modello?'))) return; settings.modelliScheda.splice(+b.dataset.viamod, 1); scheduleBoardSave(); return disegna(); }
    });
    d.addEventListener('close', () => { d.remove(); cambiata(s); });
    document.body.appendChild(d);
    disegna();
    d.showModal();
  }
  window.avanzateScheda = apriAvanzate;

  // le caselle dalla classe del compendio e dal livello
  function riempiCaselle(s) {
    const C = window.COMPENDIO;
    const nome = String(s.f.class || '').toLowerCase().split(/[\s/,]+/)[0];
    const cl = C && C.voci && C.voci.find(v => v.tipo === 'classe' && [v.nome, v.en].some(n => n && n.toLowerCase() === nome));
    const l = cl && (cl.livelli || [])[Math.max(0, (iv(s.f.level) || 1) - 1)];
    const inc = l && l.incantesimi;
    if (!inc) { alert(tr('Non trovo la classe «{c}» nel compendio, o non lancia incantesimi.', { c: s.f.class || '' })); return; }
    for (let L = 1; L <= 9; L++) s.f['sl' + L + 't'] = inc['spell_slots_level_' + L] ? String(inc['spell_slots_level_' + L]) : '';
    cambiata(s);
  }

  // ---------- il pannello in ogni finestra di scheda ----------
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                                  // eslint-disable-line no-global-assign
      const w = prima.apply(this, arguments);
      const s = typeof sheets !== 'undefined' && sheets.find(x => x.id === id);
      if (w && s) disegnaPannello(w, s);
      return w;
    };
  }
  // una scheda cambiata da un altro (in partita): si ridisegna il pannello
  addEventListener('libre-scheda-aggiornata', e => { const s = e.detail && sheets.find(x => x.id === e.detail.id); const w = s && wins.get(s.id); if (w) disegnaPannello(w, s); });

  // ---------- Danni subiti e cure, dalla propria scheda ----------
  // I segnalini non hanno PF propri: ognuno scrive nella sua scheda i danni che prende. Con il tipo,
  // resistenza dimezza, immunità annulla, vulnerabilità raddoppia; i PF temporanei si consumano prima.
  // Il messaggio con danni e PF (e quello delle cure) in rete lo leggono solo il master e chi l'ha scritto:
  // agli altri giocatori il server non lo manda proprio (soloMaster).
  function subisci(s, quanti, tipo) {
    const dif = J(s, 'avDif', {}), t = tipoDanno(tipo), nomeT = t ? nomeDanno(t).toLowerCase() : '';
    let n = Math.max(0, Math.floor(+quanti || 0)); const note = [];
    if (!n) return;
    if (t && (dif.imm || []).includes(t)) { n = 0; note.push(tr('immune a {t}', { t: nomeT })); }
    else if (t && (dif.res || []).includes(t)) { n = Math.floor(n / 2); note.push(tr('resiste a {t}', { t: nomeT })); }
    if (t && (dif.vul || []).includes(t)) { n *= 2; note.push(tr('vulnerabile a {t}', { t: nomeT })); }
    let resto = n; const temp = iv(s.f.hpt);
    if (temp > 0) { const via = Math.min(temp, resto); s.f.hpt = temp - via ? String(temp - via) : ''; resto -= via; }
    s.f.hp = String(Math.max(0, iv(s.f.hp) - resto));
    cambiata(s);
    addChat({ kind: 'rule', soloMaster: true, title: `🩸 ${s.name}`, text: tr('Subisce {n} danni{t}{note} → {pf}/{max} PF', { n, t: nomeT ? ' ' + tr('da {t}', { t: nomeT }) : '', note: note.length ? ' (' + note.join(', ') + ')' : '', pf: s.f.hp, max: iv(s.f.hpmax) }) });
  }
  function cura(s, quanti) {
    const n = Math.max(0, Math.floor(+quanti || 0)); if (!n) return;
    const mx = iv(s.f.hpmax), prima = iv(s.f.hp);
    s.f.hp = String(mx ? Math.min(mx, prima + n) : prima + n);
    cambiata(s);
    addChat({ kind: 'rule', soloMaster: true, title: `💚 ${s.name}`, text: tr('Recupera {n} PF → {pf}/{max} PF', { n: iv(s.f.hp) - prima, pf: s.f.hp, max: mx }) });
  }
  window.avanzSubisci = subisci;
  window._avanzate = { formula, riposo, subisci, cura, J };
})();
