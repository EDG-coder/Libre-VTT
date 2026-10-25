// ---------- Il sistema di gioco della campagna ----------
// Il tavolo (mappa, segnalini, dadi, chat, musica, nebbia) non sa niente di D&D: le regole
// arrivano dal «sistema» della campagna, che il server del tavolo serve da /sistema/…
//   sistema.json   nome, caratteristiche, abilità, valute, condizioni, regole, quali schede usa
//   formule.json   le formule (le legge formule.js, senza eval)
//   compendio/     i pacchetti di base (compendio.js)
// In partita il master lo manda ai giocatori insieme al mondo: tutti usano le sue regole.
//
//   SISTEMA.id, SISTEMA.dati (sistema.json), SISTEMA.formule, SISTEMA.personalizzato
//   evento «libre-sistema» quando arriva o cambia
(function () {
  const tr = window.tr || (s => s);
  const $ = id => document.getElementById(id);
  const conduco = () => typeof isMaster !== 'function' || isMaster();
  const S = window.SISTEMA = { id: null, dati: null, formule: null, personalizzato: false, daRete: false };

  const prendi = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  async function carica() {
    let info = await prendi('api/sistema'), dati = await prendi('sistema/sistema.json'), formule = await prendi('sistema/formule.json');
    if (!dati) {                                   // senza server del tavolo: quello di base del programma
      dati = await prendi('sistemi/dnd5e-2014/sistema.json'); formule = await prendi('sistemi/dnd5e-2014/formule.json');
      info = { id: 'dnd5e-2014', personalizzato: false };
    }
    if (S.daRete) return;                          // nel frattempo è arrivato quello del master
    applica({ id: (info && info.id) || (dati && dati.id) || 'dnd5e-2014', dati, formule, personalizzato: !!(info && info.personalizzato) });
  }
  function applica(x) {
    S.id = x.id; S.dati = x.dati || null; S.formule = x.formule || null; S.personalizzato = !!x.personalizzato;
    if (typeof FORMULE !== 'undefined') { if (!(S.formule && FORMULE.leggi(S.formule))) FORMULE.leggi({ formato: 'libre-vtt-formule', formule: {} }); FORMULE.ricalcola(); }
    modelli(); disegnaSezione(); etichetteAperte();
    dispatchEvent(new CustomEvent('libre-sistema', { detail: S }));
  }
  window.ricaricaSistema = () => { S.daRete = false; return carica(); };

  // ---------- in partita ----------
  S.perRete = () => S.dati ? { id: S.id, dati: S.dati, formule: S.formule, personalizzato: S.personalizzato } : null;
  window.sistemaDalMaster = function (x) {
    if (!x || !x.dati || conduco()) return;
    if (S.daRete && JSON.stringify(S.perRete()) === JSON.stringify(x)) return;
    S.daRete = true;
    applica(x);
  };

  // ---------- quali modelli di scheda ----------
  const NOMI = { standard: 'Standard · scheda italiana D&D 5e (3 pagine)', dnd5e: 'Open · D&D 5ª edizione', simple: 'Open · Semplice (solo testo)', generica: 'Scheda del sistema (caratteristiche e abilità)' };
  function modelli() {
    const fs = document.querySelector('#sheetForm .types'); if (!fs || !S.dati) return;
    const vuoi = Array.isArray(S.dati.schede) && S.dati.schede.length ? S.dati.schede : ['standard', 'dnd5e', 'simple'];
    if (!fs.querySelector('input[value=generica]')) {
      const l = document.createElement('label'); l.className = 'opt';
      l.innerHTML = '<input type="radio" name="tpl" value="generica"> <span></span>';
      fs.append(l);
    }
    fs.querySelector('input[value=generica]').nextElementSibling.textContent = tr('Scheda del sistema «{nome}»', { nome: S.dati.nome || '' });
    let primo = null;
    fs.querySelectorAll('input[name=tpl]').forEach(i => {
      const si = vuoi.includes(i.value);
      i.closest('label').hidden = !si; i.disabled = !si;
      if (si && !primo) primo = i;
    });
    const sel = fs.querySelector('input[name=tpl]:checked');
    if ((!sel || sel.disabled) && primo) primo.checked = true;
  }

  // ---------- etichette (es. «Specie» al posto di «Razza» nel 2024) ----------
  function etichette(root) {
    const e = S.dati && S.dati.etichette; if (!e || !root) return;
    const razza = e.razza;
    if (!razza || razza === 'Razza') return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const cambia = [];
    for (let n; (n = tw.nextNode());) if (/^\s*(Razza|RAZZA|Race|RACE)\s*$/.test(n.nodeValue)) cambia.push(n);
    const nuovo = tr(razza);
    for (const n of cambia) n.nodeValue = n.nodeValue.replace(/RAZZA|RACE/, nuovo.toUpperCase()).replace(/Razza|Race/, nuovo);
  }
  function etichetteAperte() { if (typeof wins !== 'undefined') for (const w of wins.values()) etichette(w._body); }
  if (typeof openSheet === 'function') {
    const prima = openSheet;
    openSheet = function (id) { const w = prima.apply(this, arguments); if (w) etichette(w._body); return w; };   // eslint-disable-line no-global-assign
  }

  // ---------- sfinimento ----------
  // 2014 (tabella): dal 1° livello svantaggio alle prove, dal 3° anche a tiri per colpire e salvezza.
  // 2024: −2 per livello a ogni tiro di d20.
  if (typeof doRoll === 'function') {
    const prima = doRoll;
    doRoll = function (s, key) {                   // eslint-disable-line no-global-assign
      const regola = S.dati && S.dati.regole && S.dati.regole.sfinimento;
      const liv = parseInt(s && s.f && s.f.fatigue, 10) || 0, t = String(key).split(':')[0];
      const d20 = ['mod', 'save', 'skill', 'init', 'atk', 'spatk'].includes(t);
      if (!liv || !d20 || !regola || regola === 'nessuno' || (t === 'atk' && /^\s*(?:CD|DC|TS)/i.test(s.f['ab' + key.split(':')[1]] || ''))) return prima.apply(this, arguments);
      const vero = rollExpr;
      let nota = '', cambio = null;
      if (regola === 'meno2') { cambio = e => e + '-' + (2 * liv); nota = tr(' (sfinimento −{n})', { n: 2 * liv }); }
      else if (regola === 'tabella') {
        const prova = ['mod', 'skill', 'init'].includes(t);
        if (prova || liv >= 3) { cambio = e => e.replace(/^1d20/, '2d20kl1'); nota = tr(' (sfinimento: svantaggio)'); }
      }
      if (!cambio) return prima.apply(this, arguments);
      rollExpr = (e, l) => vero(cambio(String(e)), (l || '') + nota);   // eslint-disable-line no-global-assign
      try { return prima.apply(this, arguments); } finally { rollExpr = vero; }   // eslint-disable-line no-global-assign
    };
  }

  // ---------- impostazioni: «Sistema di gioco» ----------
  function disegnaSezione() {
    if (!$('sisNome') || !S.dati) return;
    $('sisNome').textContent = S.dati.nome || S.id;
    $('sisTipo').textContent = S.personalizzato ? tr('· personalizzato (sta nella campagna)') : tr('· quello che viene con il programma');
    const m = conduco() && !S.daRete;
    document.querySelectorAll('.soloMasterSis').forEach(x => { x.hidden = !m; });
    $('sisModifica').hidden = !S.personalizzato;
    $('sisPersonalizza').hidden = S.personalizzato;
  }
  $('sisPersonalizza') && $('sisPersonalizza').addEventListener('click', async () => {
    if (!confirm(tr('Copio «{nome}» dentro la campagna come sistema personalizzato: da lì lo puoi cambiare. Le altre campagne non cambiano. Continuo?', { nome: S.dati.nome }))) return;
    const r = await fetch('api/sistema/personalizza', { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) { alert(tr('Non ci sono riuscito.')); return; }
    await ricaricaSistema(); spingi();
  });
  $('sisModifica') && $('sisModifica').addEventListener('click', () => apriEditor());
  function spingi() { if (typeof NET !== 'undefined' && NET.on && conduco() && typeof netPushBoard === 'function') netPushBoard(); }

  // ---------- l'editor del sistema personalizzato ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'sistemaDlg';
  document.body.appendChild(dlg);
  function apriEditor() {
    const d = JSON.parse(JSON.stringify(S.dati)), f = JSON.parse(JSON.stringify(S.formule || { formato: 'libre-vtt-formule', versione: 1, formule: {} }));
    d.regole = d.regole || {}; d.etichette = d.etichette || {}; d.unita = d.unita || {};
    const riga = (cls, html) => { const x = document.createElement('div'); x.className = cls; x.innerHTML = html; return x; };
    const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    dlg.innerHTML = `<h3>${esc(tr('Sistema di gioco'))}</h3>
      <div class="sisEd">
        <div class="sisGriglia">
          <label>${tr('Nome')} <input data-k="nome" value="${esc(d.nome)}" maxlength="60"></label>
          <label>${tr('Edizione')} <input data-k="edizione" value="${esc(d.edizione)}" maxlength="20"></label>
          <label>${tr('Autore')} <input data-k="autore" value="${esc(d.autore)}" maxlength="80"></label>
          <label>${tr('Licenza')} <input data-k="licenza" value="${esc(d.licenza)}" maxlength="300"></label>
        </div>
        <h4>${tr('Caratteristiche')}</h4><div class="sisLista" id="sisCar"></div><button type="button" class="btn ghost" id="sisCarPiu">＋ ${tr('Caratteristica')}</button>
        <h4>${tr('Abilità')}</h4><div class="sisLista" id="sisAb"></div><button type="button" class="btn ghost" id="sisAbPiu">＋ ${tr('Abilità')}</button>
        <h4>${tr('Regole')}</h4>
        <div class="sisGriglia">
          <label>${tr('Caratteristica dell\'iniziativa')} <select id="sisIni"></select></label>
          <label>${tr('Sfinimento')} <select id="sisSfin"><option value="nessuno">${tr('Nessuna regola')}</option><option value="tabella">${tr('Tabella a 6 livelli (2014)')}</option><option value="meno2">${tr('−2 per livello ai d20 (2024)')}</option></select></label>
          <label>${tr('Come si chiama la «razza»')} <input id="sisRazza" value="${esc(d.etichette.razza || 'Razza')}" maxlength="20"></label>
          <label>${tr('Unità di distanza')} <select id="sisUnita"><option value="ft">ft</option><option value="m">m</option></select></label>
        </div>
        <label class="sisArea">${tr('Condizioni (una per riga)')} <textarea id="sisCond" rows="4">${esc((d.condizioni || []).join('\n'))}</textarea></label>
        <label class="sisArea">${tr('Tipi di danno (uno per riga)')} <textarea id="sisDanni" rows="3">${esc((d.tipiDanno || []).join('\n'))}</textarea></label>
        <label class="sisArea">${tr('Valute (una per riga: nome, sigla, valore in moneta base)')} <textarea id="sisValute" rows="3">${esc((d.valute || []).map(v => `${v.nome}, ${v.sigla}, ${v.valore}`).join('\n'))}</textarea></label>
        <h4>${tr('Schede')}</h4>
        <div class="sisSchede">${Object.keys(NOMI).map(k => `<label class="check"><input type="checkbox" value="${k}" ${(d.schede || []).includes(k) ? 'checked' : ''}> ${esc(tr(NOMI[k]))}</label>`).join('')}</div>
        <h4>${tr('Formule')}</h4>
        <p class="note">${esc(tr('Numeri, i nomi dichiarati in «usa», + - * / e parentesi; floor, ceil, round, abs, max, min, se(condizione, sì, no).'))}</p>
        <div class="sisLista" id="sisForm"></div><button type="button" class="btn ghost" id="sisFormPiu">＋ ${tr('Formula')}</button>
      </div>
      <p class="err" id="sisErr"></p>
      <div class="dialogBtns"><span style="flex:1"></span><button type="button" class="btn ghost" id="sisAnnulla">${tr('Annulla')}</button><button type="button" class="btn" id="sisSalva">${tr('Salva')}</button></div>`;
    const car = dlg.querySelector('#sisCar'), ab = dlg.querySelector('#sisAb'), fo = dlg.querySelector('#sisForm');
    const opzCar = sel => (d.caratteristiche || []).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    const rCar = c => { const x = riga('sisR', `<input class="cId" value="${esc(c.id)}" placeholder="id" maxlength="16" title="${esc(tr('Chiave interna, senza spazi'))}"><input class="cSig" value="${esc(c.sigla)}" placeholder="${esc(tr('Sigla'))}" maxlength="5"><input class="cNome" value="${esc(c.nome)}" placeholder="${esc(tr('Nome'))}" maxlength="30"><button type="button" class="x" title="${esc(tr('Togli'))}">✕</button>`); x.querySelector('.x').onclick = () => x.remove(); return x; };
    const rAb = a => { const x = riga('sisR', `<input class="aNome" value="${esc(a.nome)}" placeholder="${esc(tr('Nome'))}" maxlength="30"><select class="aCar">${opzCar(a.caratteristica)}</select><input class="aId" type="hidden" value="${esc(a.id)}"><button type="button" class="x" title="${esc(tr('Togli'))}">✕</button>`); x.querySelector('.x').onclick = () => x.remove(); return x; };
    const rFo = (nome, v) => { const x = riga('sisR sisRF', `<input class="fNome" value="${esc(nome)}" placeholder="${esc(tr('Nome'))}" maxlength="30"><input class="fUsa" value="${esc((v.usa || []).join(', '))}" placeholder="usa: a, b"><input class="fTesto" value="${esc(v.formula)}" placeholder="formula"><button type="button" class="x" title="${esc(tr('Togli'))}">✕</button><small class="fErr"></small>`);
      const prova = () => { try { FORMULE.analizza(x.querySelector('.fTesto').value, x.querySelector('.fUsa').value.split(',').map(t => t.trim()).filter(Boolean)); x.querySelector('.fErr').textContent = ''; x.classList.remove('no'); } catch (e) { x.querySelector('.fErr').textContent = e.message; x.classList.add('no'); } };
      x.querySelectorAll('input').forEach(i => i.addEventListener('input', prova)); prova();
      x.querySelector('.x').onclick = () => x.remove(); return x; };
    (d.caratteristiche || []).forEach(c => car.append(rCar(c)));
    (d.abilita || []).forEach(a => ab.append(rAb(a)));
    Object.entries(f.formule || {}).forEach(([n, v]) => fo.append(rFo(n, v)));
    dlg.querySelector('#sisCarPiu').onclick = () => car.append(rCar({ id: 'c' + (car.children.length + 1), sigla: '', nome: '' }));
    dlg.querySelector('#sisAbPiu').onclick = () => ab.append(rAb({ id: '', nome: '', caratteristica: (d.caratteristiche[0] || {}).id }));
    dlg.querySelector('#sisFormPiu').onclick = () => fo.append(rFo('', { usa: [], formula: '' }));
    dlg.querySelector('#sisIni').innerHTML = opzCar(d.regole.caratteristicaIniziativa || 'dex');
    dlg.querySelector('#sisSfin').value = d.regole.sfinimento || 'nessuno';
    dlg.querySelector('#sisUnita').value = d.unita.distanza === 'm' ? 'm' : 'ft';
    dlg.querySelector('#sisAnnulla').onclick = () => dlg.close();
    dlg.querySelector('#sisSalva').onclick = async () => {
      const err = t => { dlg.querySelector('#sisErr').textContent = t; };
      if (dlg.querySelector('.sisRF.no')) return err(tr('C\'è una formula scritta male: correggila o toglila.'));
      const val = k => dlg.querySelector(`[data-k="${k}"]`).value.trim();
      d.nome = val('nome') || tr('Sistema personalizzato'); d.edizione = val('edizione'); d.autore = val('autore'); d.licenza = val('licenza');
      d.caratteristiche = [...car.children].map(x => ({ id: x.querySelector('.cId').value.trim().replace(/\W+/g, '_'), sigla: x.querySelector('.cSig').value.trim(), nome: x.querySelector('.cNome').value.trim() })).filter(c => c.id && c.nome);
      if (new Set(d.caratteristiche.map(c => c.id)).size !== d.caratteristiche.length) return err(tr('Due caratteristiche hanno la stessa chiave.'));
      const usati = new Set();
      d.abilita = [...ab.children].map(x => {
        const nome = x.querySelector('.aNome').value.trim();
        let id = x.querySelector('.aId').value || nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 16) || 'ab';
        while (usati.has(id)) id += '_'; usati.add(id);
        return { id, nome, caratteristica: x.querySelector('.aCar').value };
      }).filter(a => a.nome);
      d.regole.caratteristicaIniziativa = dlg.querySelector('#sisIni').value;
      d.regole.sfinimento = dlg.querySelector('#sisSfin').value;
      d.etichette.razza = dlg.querySelector('#sisRazza').value.trim() || 'Razza';
      d.unita.distanza = dlg.querySelector('#sisUnita').value;
      const righe = id => dlg.querySelector(id).value.split('\n').map(t => t.trim()).filter(Boolean);
      d.condizioni = righe('#sisCond'); d.tipiDanno = righe('#sisDanni');
      d.valute = righe('#sisValute').map(r => { const [nome, sigla, valore] = r.split(',').map(t => t.trim()); return { id: (sigla || nome).toLowerCase(), nome, sigla: sigla || '', valore: +String(valore || 1).replace(',', '.') || 1 }; });
      d.schede = [...dlg.querySelectorAll('.sisSchede input:checked')].map(i => i.value);
      if (!d.schede.length) return err(tr('Scegli almeno un modello di scheda.'));
      f.formule = {};
      for (const x of fo.children) { const n = x.querySelector('.fNome').value.trim(); if (n) f.formule[n] = { usa: x.querySelector('.fUsa').value.split(',').map(t => t.trim()).filter(Boolean), formula: x.querySelector('.fTesto').value.trim() }; }
      f.formato = 'libre-vtt-formule'; f.versione = 1; f.sistema = 'personalizzato'; f.nome = d.nome;
      const put = (file, j) => fetch('api/sistema?file=' + file, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j) }).then(r => r.ok);
      if (!(await put('sistema.json', d)) || !(await put('formule.json', f))) return err(tr('Non sono riuscito a salvarlo.'));
      dlg.close();
      await ricaricaSistema(); spingi();
    };
    dlg.showModal();
  }

  // si parte quando il tavolo ha capito se c'è il server (DOMContentLoaded di script.js)
  addEventListener('DOMContentLoaded', () => setTimeout(carica, 0));
})();
