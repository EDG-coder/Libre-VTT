// ---------- Creazione guidata del personaggio e «Sali di livello» ----------
// Un percorso a passi che riempie la scheda prendendo tutto dal compendio della campagna (anche
// quello che il master ha importato). Ogni passo si può saltare o riaprire; alla fine resta una
// scheda normale. I passi li decide il sistema (sistema.json → «creazione»); per il 5e:
// specie, classe, background, caratteristiche, competenze, equipaggiamento, incantesimi, riepilogo.
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CAR = [['str', 'FOR', 'Forza'], ['dex', 'DES', 'Destrezza'], ['con', 'COS', 'Costituzione'], ['int', 'INT', 'Intelligenza'], ['wis', 'SAG', 'Saggezza'], ['cha', 'CAR', 'Carisma']];
  const NOMI_AB = { acro: 'Acrobazia', anim: 'Addestrare animali', arca: 'Arcano', athl: 'Atletica', dece: 'Inganno', hist: 'Storia', insi: 'Intuizione', inti: 'Intimidire', inve: 'Indagare', medi: 'Medicina', natu: 'Natura', perception: 'Percezione', perf: 'Intrattenere', pers: 'Persuasione', reli: 'Religione', slei: 'Rapidità di mano', stea: 'Furtività', surv: 'Sopravvivenza' };
  const STANDARD = [15, 14, 13, 12, 10, 8];
  const COSTO = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  const mod = n => Math.floor((n - 10) / 2), sg = n => (n >= 0 ? '+' : '−') + Math.abs(n);
  const voci = t => (window.COMPENDIO && COMPENDIO.voci || []).filter(v => v.tipo === t);
  const D = () => (typeof SISTEMA !== 'undefined' && SISTEMA.dati) || {};
  const anno2024 = () => (D().regole || {}).aumentiDa === 'background';
  const PASSI = { specie: 'Specie', classe: 'Classe e livello', background: 'Background', caratteristiche: 'Caratteristiche', competenze: 'Competenze', equipaggiamento: 'Equipaggiamento', incantesimi: 'Incantesimi', riepilogo: 'Riepilogo' };
  function passi() {
    const d = D();
    if (Array.isArray(d.creazione) && d.creazione.length) return d.creazione.filter(p => PASSI[p]).concat(d.creazione.includes('riepilogo') ? [] : ['riepilogo']);
    const ha = t => voci(t).length > 0;
    return ['specie', 'classe', 'background', 'caratteristiche', 'competenze', 'equipaggiamento', 'incantesimi', 'riepilogo']
      .filter(p => p === 'caratteristiche' || p === 'riepilogo' || (p === 'specie' ? ha('specie') : p === 'classe' || p === 'competenze' || p === 'equipaggiamento' ? ha('classe') : p === 'background' ? ha('background') : p === 'incantesimi' ? ha('incantesimo') && ha('classe') : true));
  }
  const nomeSpecie = () => tr((D().etichette || {}).razza === 'Specie' ? 'Specie' : 'Razza');

  // ---------- i tiri 4d6 (tieni i 3 più alti): li fa il dado del tavolo e li prendiamo dalla chat ----------
  const attesi = new Map();                               // etichetta → callback(totale)
  const primaAdd = window.addChat;
  window.addChat = function (m) {
    const r = primaAdd.apply(this, arguments);
    try { if (m && m.kind === 'roll' && !m.hidden && attesi.has(m.label)) { const f = attesi.get(m.label); attesi.delete(m.label); f(m.total); } } catch {}
    return r;
  };
  const tiraPer = (expr, label) => new Promise(ok => { attesi.set(label, ok); if (!rollExpr(expr, label)) { attesi.delete(label); ok(null); } setTimeout(() => { if (attesi.has(label)) { attesi.delete(label); ok(null); } }, 15000); });

  // ---------- la finestra ----------
  let st = null, dlg = null, passo = 0;
  function nuovoStato(nome) {
    return { nome: nome || tr('Personaggio'), specie: '', sotto: '', classi: [{ id: '', livello: 1, sotto: '' }], bg: '', metodo: 'standard',
      assegna: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, punti: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, tirati: [], aum: { schema: '21', a: '', b: '', c: '' },
      abilita: new Set(), equip: 'pacchetto', monete: '', inc: new Set() };
  }
  const trova = (t, id) => voci(t).find(v => v.id === id);
  const classe0 = () => trova('classe', st.classi[0].id);
  const livTot = () => st.classi.reduce((a, c) => a + (c.id ? +c.livello || 0 : 0), 0) || 1;
  function base() {
    if (st.metodo === 'punti') return { ...st.punti };
    return { ...st.assegna };
  }
  function aumenti() {
    const out = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    if (anno2024()) {
      const a = st.aum;
      if (a.schema === '21') { if (a.a) out[a.a] += 2; if (a.b && a.b !== a.a) out[a.b] += 1; }
      else for (const k of [a.a, a.b, a.c]) if (k) out[k] += 1;
    } else {
      const sp = trova('specie', st.specie);
      for (const x of (sp && sp.aumenti) || []) out[x.car] += x.bonus;
      const so = sp && (sp.sottospecie || []).find(s => s.id === st.sotto);
      for (const x of (so && so.aumenti) || []) out[x.car] += x.bonus;
    }
    return out;
  }
  const finali = () => { const b = base(), a = aumenti(); return Object.fromEntries(CAR.map(([k]) => [k, Math.min(20, (+b[k] || 10) + a[k])])); };

  function apri(nome) {
    st = nuovoStato(nome); passo = 0;
    dlg = document.createElement('dialog'); dlg.className = 'compDlg creaDlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    disegna(); dlg.showModal();
  }
  function disegna() {
    const P = passi(), p = P[passo];
    dlg.innerHTML = `<h3>${esc(tr('Crea passo passo'))} · <span class="creaNome">${esc(st.nome)}</span></h3>
      <nav class="creaPassi">${P.map((x, i) => `<button type="button" data-p="${i}" class="${i === passo ? 'on' : ''}">${i + 1}. ${esc(tr(x === 'specie' ? nomeSpecie() : PASSI[x]))}</button>`).join('')}</nav>
      <div class="creaCorpo">${corpo(p)}</div>
      <p class="err" id="creaErr"></p>
      <div class="dialogBtns"><button type="button" class="btn ghost" data-a="annulla">${esc(tr('Annulla'))}</button><span style="flex:1"></span>
        ${passo ? `<button type="button" class="btn ghost" data-a="indietro">◀ ${esc(tr('Indietro'))}</button>` : ''}
        ${p !== 'riepilogo' ? `<button type="button" class="btn ghost" data-a="salta">${esc(tr('Salta'))}</button><button type="button" class="btn" data-a="avanti">${esc(tr('Avanti'))} ▶</button>` : `<button type="button" class="btn" data-a="crea">${esc(tr('Crea'))}</button>`}</div>`;
    collega(p);
  }
  const opz = (arr, sel, vuoto) => (vuoto ? `<option value="">${esc(vuoto)}</option>` : '') + arr.map(v => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(v.nome)}${v.en && v.en !== v.nome ? ' · ' + esc(v.en) : ''}</option>`).join('');
  const selCar = (nome, val, extra = '') => `<select data-k="${nome}" ${extra}>${'<option value="">—</option>' + CAR.map(([k, s, n]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(tr(n))}</option>`).join('')}</select>`;
  const anteprima = v => v ? `<div class="creaInfo">${(v.testo || '').split('\n').slice(0, 3).map(r => `<p>${esc(r)}</p>`).join('')}${v.tratti ? `<p><b>${esc(tr('Tratti'))}:</b> ${esc(v.tratti.map(t => t.nome).join(', '))}</p>` : ''}</div>` : '';

  function corpo(p) {
    if (p === 'specie') {
      const sp = trova('specie', st.specie), sotto = (sp && sp.sottospecie) || [];
      return `<label>${esc(nomeSpecie())}<select data-k="specie">${opz(voci('specie'), st.specie, tr('— scegli —'))}</select></label>
        ${sotto.length ? `<label>${esc(tr('Variante'))}<select data-k="sotto"><option value="">—</option>${sotto.map(s => `<option value="${esc(s.id)}" ${s.id === st.sotto ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>` : ''}
        ${sp ? `<p class="note">${esc([sp.taglia, sp.velocita ? sp.velocita + ' ft' : '', (sp.aumenti || []).map(a => CAR.find(c => c[0] === a.car)[1] + ' +' + a.bonus).join(', '), (sp.lingue || []).join(', ')].filter(Boolean).join(' · '))}</p>` + anteprima(sp) : ''}`;
    }
    if (p === 'classe') {
      return st.classi.map((c, i) => {
        const cl = trova('classe', c.id), sc = voci('sottoclasse').filter(s => cl && (s.classe === cl.nome || s.classe === cl.en));
        return `<div class="creaRiga"><label>${esc(i ? tr('Altra classe') : tr('Classe'))}<select data-k="classe" data-i="${i}">${opz(voci('classe'), c.id, tr('— scegli —'))}</select></label>
          <label>${esc(tr('Livello'))}<input type="number" min="1" max="20" data-k="livello" data-i="${i}" value="${c.livello}"></label>
          ${sc.length ? `<label>${esc(tr('Sottoclasse'))}<select data-k="sottoc" data-i="${i}"><option value="">—</option>${sc.map(s => `<option value="${esc(s.id)}" ${s.id === c.sotto ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>` : ''}
          ${i ? `<button type="button" class="btn ghost" data-a="viaClasse" data-i="${i}">✕</button>` : ''}</div>
          ${cl ? `<p class="note">${esc(tr('Dado vita d{d} · tiri salvezza {t}', { d: cl.dadoVita, t: (cl.ts || []).map(k => CAR.find(x => x[0] === k)[1]).join(', ') }))}</p>` : ''}`;
      }).join('') + `<button type="button" class="btn ghost" data-a="piuClasse">＋ ${esc(tr('Multiclasse: aggiungi un\'altra classe'))}</button>`;
    }
    if (p === 'background') {
      const b = trova('background', st.bg);
      return `<label>${esc(tr('Background'))}<select data-k="bg">${opz(voci('background'), st.bg, tr('— scegli —'))}</select></label>
        ${b ? `<p class="note">${esc([(b.abilita || []).map(k => NOMI_AB[k]).join(', '), b.talento ? tr('talento: {t}', { t: b.talento }) : ''].filter(Boolean).join(' · '))}</p>` + anteprima(b) : ''}`;
    }
    if (p === 'caratteristiche') {
      const b = base(), a = aumenti(), f = finali();
      let h = `<div class="creaMetodo">${[['standard', 'Serie standard (15, 14, 13, 12, 10, 8)'], ['punti', 'Acquisto a punti (27)'], ['tiro', 'Tira 4d6 (tieni i 3 più alti)']].map(([k, n]) => `<label class="check"><input type="radio" name="met" value="${k}" ${st.metodo === k ? 'checked' : ''}> ${esc(tr(n))}</label>`).join('')}</div>`;
      if (st.metodo === 'punti') {
        const spesi = CAR.reduce((x, [k]) => x + (COSTO[st.punti[k]] ?? 99), 0);
        h += `<p class="note">${esc(tr('Punti spesi: {n} su 27', { n: spesi }))}</p>`;
      }
      if (st.metodo === 'tiro') h += `<p><button type="button" class="btn ghost" data-a="tira">🎲 ${esc(tr(st.tirati.length ? 'Tira di nuovo' : 'Tira le sei caratteristiche'))}</button> <span class="note">${esc(st.tirati.join(', '))}</span></p>`;
      const valori = st.metodo === 'tiro' ? st.tirati : STANDARD;
      h += '<table class="compTab creaCar"><tr><th></th><th>' + esc(tr('Base')) + '</th><th>' + esc(tr('Aumenti')) + '</th><th>' + esc(tr('Totale')) + '</th></tr>' + CAR.map(([k, s, n]) => {
        const cella = st.metodo === 'punti'
          ? `<input type="number" min="8" max="15" data-k="punti" data-c="${k}" value="${st.punti[k]}">`
          : `<select data-k="assegna" data-c="${k}">${valori.map((v, i) => `<option value="${v}|${i}" ${+b[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
        return `<tr><td>${esc(tr(n))}</td><td>${cella}</td><td>${a[k] ? '+' + a[k] : ''}</td><td><b>${f[k]}</b> (${sg(mod(f[k]))})</td></tr>`;
      }).join('') + '</table>';
      if (anno2024()) {
        const bg = trova('background', st.bg), tre = (bg && bg.caratteristiche) || CAR.map(c => c[0]);
        const sel = (n, v) => `<select data-k="aum" data-n="${n}"><option value="">—</option>${tre.map(k => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(tr(CAR.find(c => c[0] === k)[2]))}</option>`).join('')}</select>`;
        h += `<p class="note">${esc(tr('Nel 2024 gli aumenti vengono dal background: +2 a una e +1 a un\'altra, oppure +1 a tre.'))}</p>
          <div class="creaRiga"><label class="check"><input type="radio" name="sch" value="21" ${st.aum.schema === '21' ? 'checked' : ''}> +2 / +1</label><label class="check"><input type="radio" name="sch" value="111" ${st.aum.schema === '111' ? 'checked' : ''}> +1 / +1 / +1</label></div>
          <div class="creaRiga">${sel('a', st.aum.a)}${sel('b', st.aum.b)}${st.aum.schema === '111' ? sel('c', st.aum.c) : ''}</div>`;
      }
      return h;
    }
    if (p === 'competenze') {
      const cl = classe0(), bg = trova('background', st.bg);
      const fisse = new Set((bg && bg.abilita) || []);
      const sc = cl && (cl.sceltaAbilita || [])[0];
      const tra = sc && sc.tra && sc.tra.length ? sc.tra : Object.keys(NOMI_AB);
      const scelte = [...st.abilita].filter(k => !fisse.has(k)).length;
      return `${fisse.size ? `<p class="note">${esc(tr('Dal background: {a}', { a: [...fisse].map(k => NOMI_AB[k]).join(', ') }))}</p>` : ''}
        <p class="note">${esc(sc ? tr('Dalla classe: scegline {n} ({s} scelte)', { n: sc.quante, s: scelte }) : tr('Scegli le abilità in cui sei competente.'))}</p>
        <div class="creaAb">${tra.map(k => `<label class="check"><input type="checkbox" data-k="ab" value="${k}" ${st.abilita.has(k) || fisse.has(k) ? 'checked' : ''} ${fisse.has(k) ? 'disabled' : ''}> ${esc(tr(NOMI_AB[k] || k))}</label>`).join('')}</div>`;
    }
    if (p === 'equipaggiamento') {
      const cl = classe0(), bg = trova('background', st.bg);
      const gp = cl && /(\d+)\s*GP\b(?!.*\d+\s*GP)/i.exec(cl.equipaggiamento || '');
      if (!st.monete && gp) st.monete = gp[1];
      return `<label class="check"><input type="radio" name="eq" value="pacchetto" ${st.equip === 'pacchetto' ? 'checked' : ''}> ${esc(tr('L\'equipaggiamento di classe e background'))}</label>
        <div class="creaInfo">${[cl && cl.equipaggiamento, bg && bg.equipaggiamento].filter(Boolean).map(t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')}</div>
        <label class="check"><input type="radio" name="eq" value="monete" ${st.equip === 'monete' ? 'checked' : ''}> ${esc(tr('Le monete per comprarlo'))}</label>
        <label>${esc(tr('Monete d\'oro'))}<input type="number" min="0" data-k="monete" value="${esc(st.monete)}"></label>`;
    }
    if (p === 'incantesimi') {
      const info = incantatore();
      if (!info) return `<p class="note">${esc(tr('Le classi scelte non lanciano incantesimi a questo livello: puoi andare avanti.'))}</p>`;
      const lista = voci('incantesimo').filter(v => (v.classi || []).some(c => c === info.cl.nome || c === info.cl.en) && (v.livello || 0) <= info.max).sort((a, b) => (a.livello - b.livello) || a.nome.localeCompare(b.nome));
      const tr0 = [...st.inc].filter(id => (trova('incantesimo', id) || {}).livello === 0).length, tr1 = st.inc.size - tr0;
      return `<p class="note">${esc(tr('{c}: trucchetti {a}/{b} · incantesimi {x}{y} · slot fino al {m}° livello', { c: info.cl.nome, a: tr0, b: info.trucchetti ?? '—', x: tr1, y: info.conosciuti ? '/' + info.conosciuti : '', m: info.max }))}</p>
        <input type="search" data-k="cercaInc" placeholder="${esc(tr('Cerca…'))}">
        <div class="creaInc">${lista.map(v => `<label class="check" data-n="${esc(v.nome.toLowerCase() + ' ' + (v.en || '').toLowerCase())}"><input type="checkbox" data-k="inc" value="${esc(v.id)}" ${st.inc.has(v.id) ? 'checked' : ''}> ${esc(v.nome)} <small>${v.livello ? esc(tr('liv. {n}', { n: v.livello })) : esc(tr('trucchetto'))}</small></label>`).join('')}</div>`;
    }
    if (p === 'riepilogo') {
      const s = costruisci(true);
      const f = s.f;
      return `<div class="compTab creaRiep"><div class="cvGriglia">
        ${[['Nome', s.name], [nomeSpecie(), f.race], ['Classe', f.class], ['Livello', f.level], ['Background', f.bg], ['PF', f.hpmax], ['CA (senza armatura)', 10 + mod(+f.dex || 10)], ['Iniziativa', sg(mod(+f.dex || 10))],
          ['Caratteristiche', CAR.map(([k, x]) => `${x} ${f[k]}`).join(' · ')], ['Abilità', Object.keys(NOMI_AB).filter(k => f['kp_' + k]).map(k => NOMI_AB[k]).join(', ')],
          ['Incantesimi', Object.keys(f).filter(k => /^sp\d_\d+$/.test(k)).length || '']].map(([a, b]) => b === '' || b == null ? '' : `<div class="cvR"><span>${esc(tr(a))}</span><b>${esc(b)}</b></div>`).join('')}
      </div></div><p class="note">${esc(tr('Dopo «Crea» resta una scheda normale: puoi cambiare tutto a mano. CA, iniziativa, CD e attacchi li calcolano le formule del sistema.'))}</p>`;
    }
    return '';
  }
  function incantatore() {
    for (const c of st.classi) {
      const cl = trova('classe', c.id); if (!cl || !cl.incantatore) continue;
      const l = (cl.livelli || [])[Math.max(0, (+c.livello || 1) - 1)] || {}, sc = l.incantesimi || {};
      let max = 0; for (let n = 1; n <= 9; n++) if (+sc['spell_slots_level_' + n] > 0) max = n;
      if (!max && !sc.cantrips_known) continue;
      return { cl, livello: +c.livello || 1, max, trucchetti: sc.cantrips_known, conosciuti: sc.spells_known, slot: sc };
    }
    return null;
  }
  function collega(p) {
    const q = s => dlg.querySelectorAll(s);
    q('[data-p]').forEach(b => b.addEventListener('click', () => { passo = +b.dataset.p; disegna(); }));
    const rid = () => disegna();
    dlg.querySelector('[data-a=annulla]').onclick = () => dlg.close();
    const ind = dlg.querySelector('[data-a=indietro]'); if (ind) ind.onclick = () => { passo--; disegna(); };
    const av = dlg.querySelector('[data-a=avanti]'); if (av) av.onclick = () => { if (verifica(p)) { passo++; disegna(); } };
    const sa = dlg.querySelector('[data-a=salta]'); if (sa) sa.onclick = () => { passo++; disegna(); };
    const cr = dlg.querySelector('[data-a=crea]'); if (cr) cr.onclick = crea;
    q('[data-k=specie]').forEach(e => e.onchange = () => { st.specie = e.value; st.sotto = ''; rid(); });
    q('[data-k=sotto]').forEach(e => e.onchange = () => { st.sotto = e.value; rid(); });
    q('[data-k=classe]').forEach(e => e.onchange = () => { st.classi[+e.dataset.i].id = e.value; st.classi[+e.dataset.i].sotto = ''; rid(); });
    q('[data-k=livello]').forEach(e => e.onchange = () => { st.classi[+e.dataset.i].livello = Math.max(1, Math.min(20, +e.value || 1)); rid(); });
    q('[data-k=sottoc]').forEach(e => e.onchange = () => { st.classi[+e.dataset.i].sotto = e.value; });
    const piu = dlg.querySelector('[data-a=piuClasse]'); if (piu) piu.onclick = () => { st.classi.push({ id: '', livello: 1, sotto: '' }); rid(); };
    q('[data-a=viaClasse]').forEach(b => b.onclick = () => { st.classi.splice(+b.dataset.i, 1); rid(); });
    q('[data-k=bg]').forEach(e => e.onchange = () => { st.bg = e.value; rid(); });
    q('input[name=met]').forEach(e => e.onchange = () => { st.metodo = e.value; if (e.value === 'standard') st.assegna = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; if (e.value === 'tiro' && st.tirati.length) { CAR.forEach(([k], i) => { st.assegna[k] = st.tirati[i]; }); } rid(); });
    q('[data-k=punti]').forEach(e => e.onchange = () => { st.punti[e.dataset.c] = Math.max(8, Math.min(15, +e.value || 8)); rid(); });
    q('[data-k=assegna]').forEach(e => e.onchange = () => {
      // scambia: il valore scelto lo cede la caratteristica che ce l'aveva
      const [v] = e.value.split('|').map(Number), k = e.dataset.c, prima = st.assegna[k];
      const altra = CAR.map(c => c[0]).find(x => x !== k && st.assegna[x] === v);
      st.assegna[k] = v; if (altra) st.assegna[altra] = prima; rid();
    });
    const ti = dlg.querySelector('[data-a=tira]'); if (ti) ti.onclick = async () => {
      ti.disabled = true;
      const out = [];
      for (let i = 1; i <= 6; i++) { const t = await tiraPer('4d6kh3', `${st.nome} · ${tr('Caratteristica {n}', { n: i })}`); out.push(t ?? 10); }
      st.tirati = out.sort((a, b) => b - a); CAR.forEach(([k], i) => { st.assegna[k] = st.tirati[i]; }); rid();
    };
    q('input[name=sch]').forEach(e => e.onchange = () => { st.aum.schema = e.value; rid(); });
    q('[data-k=aum]').forEach(e => e.onchange = () => { st.aum[e.dataset.n] = e.value; rid(); });
    q('[data-k=ab]').forEach(e => e.onchange = () => { if (e.checked) st.abilita.add(e.value); else st.abilita.delete(e.value); });
    q('input[name=eq]').forEach(e => e.onchange = () => { st.equip = e.value; });
    q('[data-k=monete]').forEach(e => e.oninput = () => { st.monete = e.value; });
    q('[data-k=inc]').forEach(e => e.onchange = () => { if (e.checked) st.inc.add(e.value); else st.inc.delete(e.value); rid(); });
    const ci = dlg.querySelector('[data-k=cercaInc]'); if (ci) ci.oninput = () => { const t = ci.value.toLowerCase(); q('.creaInc label').forEach(l => { l.hidden = !!t && !l.dataset.n.includes(t); }); };
  }
  function verifica(p) {
    const err = t => { dlg.querySelector('#creaErr').textContent = t; return false; };
    if (p === 'caratteristiche' && st.metodo === 'punti') { const sp = CAR.reduce((x, [k]) => x + COSTO[st.punti[k]], 0); if (sp > 27) return err(tr('Hai speso {n} punti: il massimo è 27.', { n: sp })); }
    if (p === 'competenze') {
      const sc = classe0() && (classe0().sceltaAbilita || [])[0], fisse = new Set(((trova('background', st.bg) || {}).abilita) || []);
      const n = [...st.abilita].filter(k => !fisse.has(k)).length;
      if (sc && n > sc.quante && !confirm(tr('Hai scelto {n} abilità, la classe ne dà {q}. Vai avanti lo stesso?', { n, q: sc.quante }))) return false;
    }
    return true;
  }

  // ---------- dalla scelta alla scheda ----------
  function privilegiFino(cl, liv) {
    const out = [];
    for (const l of (cl.livelli || []).slice(0, liv)) for (const p of l.privilegi || []) out.push(`${p.nome} (${tr('liv. {n}', { n: l.livello })})${p.testo ? '\n' + p.testo : ''}`);
    return out;
  }
  function costruisci(prova) {
    const d = D(), vuoi = Array.isArray(d.schede) ? d.schede : ['standard', 'dnd5e'];
    const tpl = vuoi.find(t => t === 'standard' || t === 'dnd5e' || t === 'generica') || vuoi[0] || 'dnd5e';
    const s = newSheet(st.nome, tpl), f = s.f;
    const sp = trova('specie', st.specie), so = sp && (sp.sottospecie || []).find(x => x.id === st.sotto), bg = trova('background', st.bg);
    const fin = finali();
    for (const [k] of CAR) f[k] = String(fin[k]);
    const cls = st.classi.map(c => ({ ...c, cl: trova('classe', c.id) })).filter(c => c.cl);
    const liv = livTot();
    f.level = String(liv);
    if (cls.length) f.class = cls.length > 1 ? cls.map(c => `${c.cl.nome} ${c.livello}`).join(' / ') : cls[0].cl.nome;
    if (sp) f.race = sp.nome + (so ? ` (${so.nome})` : '');
    if (bg) f.bg = bg.nome;
    if (sp && sp.velocita) f.speed = settings.unit === 'm' ? `${String(sp.velocita * 0.3).replace('.', ',')} m` : `${sp.velocita} ft`;
    if (sp && sp.lingue && sp.lingue.length) f.langs1 = sp.lingue.join(', ');
    // PF: al 1° livello il massimo del dado, poi la media; più Costituzione per livello
    const mc = mod(fin.con);
    let pf = 0, primo = true;
    for (const c of cls) for (let i = 0; i < (+c.livello || 1); i++) { pf += (primo ? c.cl.dadoVita : Math.floor(c.cl.dadoVita / 2) + 1) + mc; primo = false; }
    if (pf) { f.hpmax = String(Math.max(1, pf)); f.hp = f.hpmax; }
    if (cls.length) { f.hd = cls.map(c => 'd' + c.cl.dadoVita).join(' + '); f.hdt = String(liv); }
    for (const k of (cls[0] && cls[0].cl.ts) || []) f['sp_' + k] = '1';
    for (const k of new Set([...st.abilita, ...((bg && bg.abilita) || [])])) f['kp_' + k] = '1';
    if (cls.length) f.prof_text1 = (cls[0].cl.competenze || []).filter(t => !/^Saving Throw|^Skill/.test(t)).join(', ');
    // privilegi
    const priv = [];
    for (const c of cls) {
      priv.push(`— ${c.cl.nome} —`, ...privilegiFino(c.cl, +c.livello || 1));
      const sc = trova('sottoclasse', c.sotto);
      if (sc) { priv.push(`— ${sc.nome} —`); for (const p of sc.privilegi || []) if ((p.livello || 1) <= (+c.livello || 1)) priv.push(`${p.nome} (${tr('liv. {n}', { n: p.livello })})\n${p.testo || ''}`); }
    }
    if (priv.length) f.classf = priv.join('\n\n');
    const razz = [...((sp && sp.tratti) || []), ...((so && so.tratti) || [])].map(t => `${t.nome}\n${t.testo || ''}`);
    if (bg && bg.privilegio) razz.push(`${bg.privilegio.nome}\n${bg.privilegio.testo || ''}`);
    if (razz.length) f.racial = razz.join('\n\n');
    if (bg && bg.talento) f.feats = bg.talento;
    // equipaggiamento
    if (st.equip === 'monete') { if (st.monete) f.mo = String(+st.monete || 0); }
    else {
      // «(A) Leather Armor, 2 Daggers, …, 19 GP; or (B) 90 GP»: il pacchetto è la scelta A, oggetto per oggetto
      const righe = [], oro = { n: 0 };
      for (const r of [cls[0] && cls[0].cl.equipaggiamento, bg && bg.equipaggiamento].filter(Boolean).join('\n').split('\n').map(t => t.trim()).filter(Boolean)) {
        const a = /\(A\)\s*([^;]+?)\s*(?:;\s*or\b|$)/i.exec(r);
        if (!a) { righe.push(r); continue; }
        for (const x of a[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(t => t.trim()).filter(Boolean)) {
          const g = /^(\d+)\s*GP$/i.exec(x);
          if (g) oro.n += +g[1]; else righe.push(x);
        }
      }
      righe.forEach((r, i) => { f['iv' + i + 'n'] = r; });
      if (oro.n) f.mo = String(oro.n);
    }
    // incantesimi
    const info = incantatore();
    if (info) {
      f.sc_class = info.cl.nome; f.sc_ab = (CAR.find(c => c[0] === info.cl.incantatore) || [])[2] || '';
      for (let n = 1; n <= 9; n++) { const x = +info.slot['spell_slots_level_' + n] || 0; if (x) f[`sl${n}t`] = String(x); }
      const per = {};
      for (const id of st.inc) {
        const v = trova('incantesimo', id); if (!v) continue;
        const L = v.livello || 0, i = per[L] = (per[L] ?? -1) + 1;
        f[`sp${L}_${i}`] = v.nome + (v.danni ? ` [[${v.danni} | ${v.nome}]]` : '');
        f[`sp${L}_${i}_d`] = [`${v.tempo || ''} · ${v.gittata || ''} · ${v.componenti || ''} · ${v.durata || ''}`, '', v.testo || ''].join('\n').trim();
        if (L) f[`spk_${L}_${i}`] = '1';
      }
    }
    if (!prova) {
      // nel 2024 il nome si chiama «Specie»: la scheda lo sa già (sistema.js)
    }
    return s;
  }
  function crea() {
    const s = costruisci(false);
    sheets.push(s); renderSheetList(); scheduleSheets();
    if (typeof onSheetCreated === 'function') onSheetCreated(s);
    dlg.close();
    openSheet(s.id);
  }

  // ---------- «Crea passo passo» nella finestra «Nuova scheda» ----------
  const btns = document.querySelector('#sheetForm .dialogBtns');
  if (btns) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost'; b.id = 'sheetGuidata'; b.textContent = tr('🧭 Crea passo passo');
    b.title = tr('Specie, classe, background, caratteristiche, competenze, equipaggiamento e incantesimi, dal compendio');
    b.addEventListener('click', async () => {
      const nome = $('sheetNameIn').value.trim().slice(0, 40) || tr('Personaggio');
      $('sheetDialog').close();
      if (typeof COMPENDIO !== 'undefined' && !COMPENDIO.pronto && typeof ricaricaCompendio === 'function') await ricaricaCompendio();
      apri(nome);
    });
    btns.insertBefore(b, btns.children[1]);
  }
  window.creaPassoPasso = async nome => { if (typeof COMPENDIO !== 'undefined' && !COMPENDIO.pronto) await ricaricaCompendio(); apri(nome); return { st: () => st, dlg: () => dlg, costruisci }; };

  // =================== Sali di livello ===================
  function classiDiScheda(s) {
    const t = String(s.f.class || '').trim(), out = [];
    const tutte = voci('classe');
    for (const parte of t.split('/').map(x => x.trim()).filter(Boolean)) {
      const m = /^(.*?)\s*(\d+)?$/.exec(parte); const nome = m[1].trim().toLowerCase();
      const cl = tutte.find(c => c.nome.toLowerCase() === nome || (c.en || '').toLowerCase() === nome);
      out.push({ nome: m[1].trim(), cl, livello: m[2] ? +m[2] : (t.includes('/') ? 1 : (parseInt(s.f.level, 10) || 1)) });
    }
    return out;
  }
  async function saliDiLivello(s) {
    if (typeof COMPENDIO !== 'undefined' && !COMPENDIO.pronto) await ricaricaCompendio();
    const mie = classiDiScheda(s);
    const d = document.createElement('dialog'); d.className = 'compDlg creaDlg';
    document.body.appendChild(d); d.addEventListener('close', () => d.remove());
    const scelta = { i: mie.findIndex(c => c.cl) >= 0 ? mie.findIndex(c => c.cl) : -1, nuova: '', pf: null, aum: { a: '', b: '' } };
    const disegnaL = () => {
      const c = scelta.i >= 0 ? mie[scelta.i] : { cl: voci('classe').find(x => x.id === scelta.nuova), livello: 0 };
      const cl = c.cl, nuovo = (c.livello || 0) + 1, l = cl && (cl.livelli || [])[nuovo - 1];
      const asi = l && (l.privilegi || []).some(p => /Ability Score Improvement|Aumento dei punteggi/i.test(p.en || p.nome));
      const mc = mod(parseInt(s.f.con, 10) || 10), media = cl ? Math.floor(cl.dadoVita / 2) + 1 : 0;
      d.innerHTML = `<h3>⬆ ${esc(tr('Sali di livello'))} · ${esc(s.name)}</h3>
        <label>${esc(tr('Classe'))}<select data-k="cl">${mie.map((x, i) => `<option value="${i}" ${i === scelta.i ? 'selected' : ''}>${esc(x.nome)} ${x.livello} → ${x.livello + 1}${x.cl ? '' : ' (' + esc(tr('non nel compendio')) + ')'}</option>`).join('')}
          <option value="-1" ${scelta.i < 0 ? 'selected' : ''}>${esc(tr('Un\'altra classe (multiclasse)…'))}</option></select></label>
        ${scelta.i < 0 ? `<label>${esc(tr('Nuova classe'))}<select data-k="nuova">${opz(voci('classe'), scelta.nuova, tr('— scegli —'))}</select></label>` : ''}
        ${cl ? `<h4>${esc(tr('Livello {n} da {c}', { n: nuovo, c: cl.nome }))}</h4>
          <p>${(l && l.privilegi || []).map(p => `<b>${esc(p.nome)}</b>`).join(', ') || esc(tr('Nessun privilegio nuovo.'))}</p>
          <div class="creaRiga"><b>${esc(tr('Punti ferita'))}:</b> <button type="button" class="btn ghost" data-a="tiraPf">🎲 ${esc(tr('Tira d{d}', { d: cl.dadoVita }))}</button> <button type="button" class="btn ghost" data-a="mediaPf">${esc(tr('Media ({n})', { n: media }))}</button>
            <span class="note">${scelta.pf != null ? esc(tr('+{n} PF (con la Costituzione {m})', { n: Math.max(1, scelta.pf + mc), m: sg(mc) })) : ''}</span></div>
          ${asi ? `<p class="note">${esc(tr('A questo livello c\'è l\'aumento delle caratteristiche: +2 a una, oppure +1 a due (o un talento, da scrivere a mano).'))}</p><div class="creaRiga">${selCar('aa', scelta.aum.a)} ${selCar('ab', scelta.aum.b)}</div>` : ''}` : ''}
        <p class="err" id="livErr"></p>
        <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn ghost" data-a="no">${esc(tr('Annulla'))}</button><button type="button" class="btn" data-a="si" ${cl ? '' : 'disabled'}>${esc(tr('Sali di livello'))}</button></div>`;
      d.querySelector('[data-k=cl]').onchange = e => { scelta.i = +e.target.value; scelta.pf = null; disegnaL(); };
      const nv = d.querySelector('[data-k=nuova]'); if (nv) nv.onchange = () => { scelta.nuova = nv.value; disegnaL(); };
      const aa = d.querySelector('[data-k=aa]'), ab = d.querySelector('[data-k=ab]');
      if (aa) aa.onchange = () => { scelta.aum.a = aa.value; }; if (ab) ab.onchange = () => { scelta.aum.b = ab.value; };
      d.querySelector('[data-a=no]').onclick = () => d.close();
      const tp = d.querySelector('[data-a=tiraPf]'); if (tp) tp.onclick = async () => { tp.disabled = true; const t = await tiraPer('1d' + cl.dadoVita, `${s.name} · ${tr('PF livello {n}', { n: livTotS() + 1 })}`); scelta.pf = t ?? media; disegnaL(); };
      const mp = d.querySelector('[data-a=mediaPf]'); if (mp) mp.onclick = () => { scelta.pf = media; disegnaL(); };
      const si = d.querySelector('[data-a=si]'); if (si) si.onclick = () => {
        if (scelta.pf == null) scelta.pf = media;
        const f = s.f;
        const add = Math.max(1, scelta.pf + mc);
        f.hpmax = String((parseInt(f.hpmax, 10) || 0) + add); f.hp = String((parseInt(f.hp, 10) || 0) + add);
        f.level = String(livTotS() + 1); f.hdt = String((parseInt(f.hdt, 10) || 0) + 1);
        if (scelta.i >= 0) mie[scelta.i].livello = nuovo; else mie.push({ nome: cl.nome, cl, livello: 1 });
        f.class = mie.length > 1 ? mie.map(x => `${x.nome} ${x.livello}`).join(' / ') : mie[0].nome;
        if (scelta.i < 0) f.hd = [f.hd, 'd' + cl.dadoVita].filter(Boolean).join(' + ');
        const nuoviP = (l && l.privilegi || []).map(p => `${p.nome} (${cl.nome}, ${tr('liv. {n}', { n: nuovo })})${p.testo ? '\n' + p.testo : ''}`);
        if (nuoviP.length) f.classf = [f.classf, ...nuoviP].filter(Boolean).join('\n\n');
        if (scelta.aum.a) { const x = scelta.aum.b && scelta.aum.b !== scelta.aum.a ? 1 : 2; f[scelta.aum.a] = String(Math.min(20, (parseInt(f[scelta.aum.a], 10) || 10) + x)); if (x === 1) f[scelta.aum.b] = String(Math.min(20, (parseInt(f[scelta.aum.b], 10) || 10) + 1)); }
        const sc = l && l.incantesimi;
        if (sc) for (let n = 1; n <= 9; n++) { const x = +sc['spell_slots_level_' + n] || 0; if (x) f[`sl${n}t`] = String(x); }
        scheduleSheets();
        const w = wins.get(s.id); if (w) { closeWin(w); openSheet(s.id); }
        if (typeof addChat === 'function') addChat({ kind: 'rule', title: `${s.name} · ${tr('Sale di livello')}`, text: tr('{c} {n}: +{pf} PF.', { c: cl.nome, n: nuovo, pf: add }) + (nuoviP.length ? ' ' + tr('Nuovo: {p}.', { p: (l.privilegi || []).map(p => p.nome).join(', ') }) : '') });
        d.close();
      };
    };
    const livTotS = () => parseInt(s.f.level, 10) || mie.reduce((a, x) => a + x.livello, 0) || 1;
    disegnaL(); d.showModal();
  }
  window.saliDiLivello = saliDiLivello;
  window.vociSaliLivello = w => w._sheet && w._sheet.tpl !== 'simple' ? [{ label: '⬆ ' + tr('Sali di livello…'), fn: () => saliDiLivello(w._sheet) }] : [];
  // anche un pulsante in cima alla scheda (accanto ai tiri)
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) {                         // eslint-disable-line no-global-assign
      const w = prima.apply(this, arguments);
      const bar = w && w.querySelector('.tiroBar');
      if (bar && w._sheet && w._sheet.tpl !== 'simple' && !bar.querySelector('.livSu')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost livSu'; b.textContent = '⬆ ' + tr('Livello');
        b.title = tr('Sali di livello'); b.addEventListener('click', () => saliDiLivello(w._sheet)); bar.append(b);
      }
      return w;
    };
  }
})();
