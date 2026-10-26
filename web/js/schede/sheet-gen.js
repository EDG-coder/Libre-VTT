// ---------- Modello «Scheda del sistema» ----------
// Per i sistemi personalizzati: la scheda si costruisce da sistema.json (le caratteristiche e le
// abilità che il sistema dichiara) e i numeri vengono dalle sue formule (formule.json):
//   modificatore(punteggio)                         → il modificatore di ogni caratteristica
//   competenza(livello, manuale, scritta)           → il bonus di competenza (se il sistema ce l'ha)
//   abilita(mod, competente, maestria, competenza)  → il bonus di ogni abilità
//   iniziativa(modDes, bonus)                       → modDes è il modificatore della caratteristica
//                                                     scelta in regole.caratteristicaIniziativa
// Senza formula: modificatore = (punteggio − 10) / 2 per difetto, abilità = mod (+ competenza).
// Le chiavi dei campi sono gli id delle caratteristiche e «gp_<abilità>» per la competenza.
(function () {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tr = window.tr || (s => s);
  const dati = () => (typeof SISTEMA !== 'undefined' && SISTEMA.dati) || { caratteristiche: [], abilita: [], regole: {}, etichette: {} };
  const num = v => parseInt(v, 10) || 0;
  const R = (nome, v, riserva) => typeof FORMULE !== 'undefined' ? FORMULE.usa(nome, v, riserva) : riserva();
  const segno = n => (n >= 0 ? '+' : '−') + Math.abs(n), espr = n => (n >= 0 ? '+' : '') + n;

  function modDi(s, id) { const p = num(s.f[id]); return R('modificatore', { punteggio: p }, () => Math.floor((p - 10) / 2)); }
  function compDi(s) {
    const scritta = s.f.profb !== undefined && s.f.profb !== '';
    return R('competenza', { livello: num(s.f.level), manuale: num(s.f.profb), scritta: scritta ? 1 : 0 }, () => scritta ? num(s.f.profb) : 0);
  }
  function abDi(s, a) {
    const mod = modDi(s, a.caratteristica), competenza = compDi(s), c = !!s.f['gp_' + a.id], m = !!s.f['ge_' + a.id];
    return R('abilita', { mod, competente: c ? 1 : 0, maestria: m ? 1 : 0, competenza }, () => mod + (m ? competenza * 2 : c ? competenza : 0));
  }
  function iniDi(s) {
    const d = dati(), car = (d.regole && d.regole.caratteristicaIniziativa) || (d.caratteristiche[1] || d.caratteristiche[0] || {}).id;
    const modDes = car ? modDi(s, car) : 0, bonus = num(s.f.initb);
    return R('iniziativa', { modDes, bonus }, () => modDes + bonus);
  }

  window.genericaHtml = function () {
    const d = dati(), razza = (d.etichette && d.etichette.razza) || 'Razza';
    const fld = (label, k, type = 'text') => `<label class="lab">${esc(label)}<input type="${type}" data-f="${esc(k)}"></label>`;
    const car = d.caratteristiche.map(c => `<div class="ab"><b title="${esc(c.nome)}">${esc((c.sigla || c.nome).toUpperCase())}</b><input type="number" data-f="${esc(c.id)}" aria-label="${esc(c.nome)}"><button type="button" class="rb" data-g="car:${esc(c.id)}" title="${esc(tr('Prova di {nome}', { nome: c.nome }))}"></button></div>`).join('');
    const ab = d.abilita.map(a => { const c = d.caratteristiche.find(x => x.id === a.caratteristica) || {};
      return `<div class="rl2"><input type="checkbox" data-f="gp_${esc(a.id)}" title="${esc(tr('Competenza'))}"><span>${esc(a.nome)} <small>(${esc(c.sigla || c.nome || '')})</small></span><button type="button" class="rb" data-g="ab:${esc(a.id)}"></button></div>`; }).join('');
    const atk = typeof rigaAttacco === 'function' ? Array.from({ length: 6 }, (_, i) => rigaAttacco(i)).join('') : '';
    const haComp = typeof FORMULE !== 'undefined' && FORMULE.caricate().includes('competenza');
    const sfin = d.regole && d.regole.sfinimento && d.regole.sfinimento !== 'nessuno';
    return `<div class="sgrid">
      <div class="box full"><div class="hdr">${fld(tr('Classe / ruolo'), 'class')}${fld(tr('Livello'), 'level', 'number')}${fld(tr(razza), 'race')}${fld(tr('Nome giocatore'), 'player')}</div></div>
      ${d.caratteristiche.length ? `<div class="box full"><h5>${esc(tr('Caratteristiche'))}</h5><div class="abil">${car}</div>
        ${haComp ? `<div class="hdr" style="margin-top:8px"><div class="stat"><span class="lab">${esc(tr('Bonus di competenza'))}</span><output data-g="comp"></output></div>${fld(tr('Competenza a mano'), 'profb', 'number')}</div>` : ''}</div>` : ''}
      ${d.abilita.length ? `<div class="box"><h5>${esc(tr('Abilità'))}</h5>${ab}</div>` : ''}
      <div class="box"><h5>${esc(tr('Combattimento'))}</h5>
        <div class="hdr">${fld(tr('Difesa / CA'), 'ac', 'number')}${fld(tr('Velocità'), 'speed')}</div>
        <div class="hdr" style="margin-top:8px">${fld(tr('Bonus iniziativa'), 'initb', 'number')}<div class="stat"><span class="lab">${esc(tr('Iniziativa'))}</span><button type="button" class="rb" data-g="ini"></button></div></div>
        <div class="hp" style="margin-top:8px">${fld(tr('PF massimi'), 'hpmax', 'number')}${fld(tr('PF attuali'), 'hp', 'number')}${fld(tr('PF temporanei'), 'hpt', 'number')}</div>
        ${sfin ? `<div class="hdr" style="margin-top:8px">${fld(tr('Sfinimento'), 'fatigue', 'number')}</div>` : ''}</div>
      <div class="box full"><h5>${esc(tr('Attacchi'))}</h5><div class="oAtk">${atk}</div></div>
      ${area(tr('Capacità e privilegi'), 'features', tr('Es. Colpo poderoso [[2d6 | Danni]]'))}
      ${area(tr('Equipaggiamento'), 'equip')}
      <div class="box full"><h5>${esc(tr('Appunti'))}</h5><textarea data-f="notes" style="min-height:120px"></textarea></div>
    </div>`;
  };

  window.genericaSetup = function (w, root, s) {
    const d = dati();
    const ricalcola = () => {
      root.querySelectorAll('[data-g]').forEach(o => {
        const [t, k] = o.dataset.g.split(':');
        let v = 0;
        if (t === 'car') v = modDi(s, k);
        else if (t === 'ab') { const a = d.abilita.find(x => x.id === k); v = a ? abDi(s, a) : 0; }
        else if (t === 'ini') v = iniDi(s);
        else if (t === 'comp') v = compDi(s);
        o.textContent = segno(v);
      });
    };
    ricalcola();
    root.addEventListener('input', ricalcola);
    root.addEventListener('click', e => {
      const b = e.target.closest('button[data-g]'); if (!b) return;
      const [t, k] = b.dataset.g.split(':');
      let v, nome;
      if (t === 'car') { const c = d.caratteristiche.find(x => x.id === k); v = modDi(s, k); nome = tr('Prova di {nome}', { nome: c ? c.nome : k }); }
      else if (t === 'ab') { const a = d.abilita.find(x => x.id === k); if (!a) return; v = abDi(s, a); nome = a.nome; }
      else if (t === 'ini') { v = iniDi(s); nome = tr('Iniziativa'); }
      else return;
      if (!rollExpr('1d20' + espr(v), `${s.name} · ${nome}`)) addChat({ kind: 'text', text: tr('Tiro non valido') });
    });
    addEventListener('libre-sistema', ricalcola);
  };
})();
